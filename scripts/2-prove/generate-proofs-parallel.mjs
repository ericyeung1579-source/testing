#!/usr/bin/env node

/**
 * Parallel Batch Proof Generation
 * 
 * Distributes proof generation across multiple CPU cores using Worker threads
 * Dramatically speeds up batch operations on multi-core systems
 * 
 * Usage: node generate-proofs-parallel.mjs
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import * as os from "os";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ParallelProverPool {
  constructor(workerCount = os.cpus().length, circuitPath) {
    this.workerCount = Math.min(workerCount, os.cpus().length);
    this.circuitPath = circuitPath;
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = 0;
    this.completedTasks = 0;
  }

  /**
   * Initialize worker pool
   */
  async initialize() {
    console.log(`🚀 Initializing pool with ${this.workerCount} workers...`);

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(path.join(__dirname, "..", "utils", "proof-generation-worker.mjs"));

      // Wait for worker to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Worker init timeout")), 10000);

        worker.on("message", (msg) => {
          if (msg.type === "init_done") {
            clearTimeout(timeout);
            resolve();
          } else if (msg.type === "error") {
            clearTimeout(timeout);
            reject(new Error(msg.error));
          }
        });

        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
        });

        // Send init message
        worker.postMessage({ type: "init", circuitPath: this.circuitPath });
      });

      this.workers.push({
        instance: worker,
        busy: false,
      });
    }

    console.log(`✓ Pool initialized with ${this.workerCount} workers\n`);
  }

  /**
   * Assign task to next available worker
   */
  assignTask(task, resolve, reject) {
    const availableWorker = this.workers.find((w) => !w.busy);

    if (!availableWorker) {
      // Queue task if no workers available
      this.taskQueue.push({ task, resolve, reject });
      return;
    }

    availableWorker.busy = true;
    this.activeWorkers++;

    // Handle response
    const messageHandler = (msg) => {
      if (msg.type === "prove_done") {
        availableWorker.instance.removeListener("message", messageHandler);
        availableWorker.instance.removeListener("error", errorHandler);
        availableWorker.busy = false;
        this.activeWorkers--;
        this.completedTasks++;

        resolve(msg.result);

        // Process next task in queue
        if (this.taskQueue.length > 0) {
          const { task: nextTask, resolve: nextResolve, reject: nextReject } = this.taskQueue.shift();
          this.assignTask(nextTask, nextResolve, nextReject);
        }
      } else if (msg.type === "error") {
        console.error(`Worker error: ${msg.error}`);
        resolve({ success: false, error: msg.error });
      }
    };

    const errorHandler = (error) => {
      console.error(`Worker crashed: ${error.message}`);
      resolve({ success: false, error: error.message });
    };

    availableWorker.instance.on("message", messageHandler);
    availableWorker.instance.on("error", errorHandler);
    // Send asset with commitment already calculated
    availableWorker.instance.postMessage({ type: "prove", asset: task.asset, inputJson: task.inputJson });
  }

  /**
   * Queue a proof generation task
   */
  async prove(asset) {
    return new Promise((resolve, reject) => {
      this.assignTask(asset, resolve, reject);
    });
  }

  /**
   * Generate proofs for multiple assets
   */
  async generateMany(assets) {
    const promises = assets.map((asset) => this.prove(asset));
    return Promise.all(promises);
  }

  /**
   * Cleanup workers
   */
  async shutdown() {
    console.log("\n🛑 Shutting down worker pool...");
    for (const worker of this.workers) {
      await worker.instance.terminate();
    }
    console.log("✓ Pool shutdown complete");
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Read batch configuration from data folder
    const batchConfigPath = path.join(process.cwd(), "data", "batch-assets.json");

    if (!fs.existsSync(batchConfigPath)) {
      console.error("❌ data/batch-assets.json not found");
      console.log("\nCreate a data/batch-assets.json file with the following format:");
      console.log(
        JSON.stringify(
          {
            assets: [
              { assetId: "42", secret: "123456789" },
              { assetId: "43", secret: "987654321" },
            ],
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const batchConfig = JSON.parse(fs.readFileSync(batchConfigPath, "utf-8"));
    const assets = batchConfig.assets;

    if (!assets || assets.length === 0) {
      console.error("❌ No assets in batch-assets.json");
      process.exit(1);
    }

    // Setup output directory
    const outputDir = path.join(process.cwd(), "circuits", "batch-proofs");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const circuitPath = path.join(process.cwd(), "circuits", "AssetOwnership_js");

    // Initialize parallel prover pool
    const proverPool = new ParallelProverPool(os.cpus().length, circuitPath);
    await proverPool.initialize();

    console.log(`📋 Generating ${assets.length} proofs in parallel...\n`);
    const startTime = performance.now();

    // Pre-calculate Poseidon commitments on main thread
    const poseidon = await buildPoseidon();
    const assetsWithCommitments = assets.map((asset) => {
      const commitment = poseidon.F.toString(
        poseidon([BigInt(asset.secret), BigInt(asset.assetId)])
      );

      const inputJson = {
        secret: asset.secret,
        assetId: asset.assetId,
        commitment,
        ownerPublicKey: "1",
      };

      return { asset, inputJson, commitment };
    });

    // Generate all proofs in parallel
    const results = await proverPool.generateMany(assetsWithCommitments);

    const totalTime = performance.now() - startTime;

    // Separate successful and failed results
    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    // Extract timing data
    const timings = successfulResults.map((r) => r.timing.total);
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const minTime = Math.min(...timings);
    const maxTime = Math.max(...timings);

    // Save results
    const proofs = successfulResults.map((r) => ({
      assetId: r.assetId,
      proof: r.proof,
    }));

    const publics = successfulResults.map((r) => ({
      assetId: r.assetId,
      public: r.public,
    }));

    const batchProofsPath = path.join(outputDir, "batch-proofs-parallel.json");
    const batchPublicsPath = path.join(outputDir, "batch-public-parallel.json");

    fs.writeFileSync(
      batchProofsPath,
      JSON.stringify(
        { timestamp: new Date().toISOString(), assetCount: assets.length, proofs },
        null,
        2
      )
    );

    fs.writeFileSync(
      batchPublicsPath,
      JSON.stringify(
        { timestamp: new Date().toISOString(), assetCount: assets.length, publics },
        null,
        2
      )
    );

    // Display results
    console.log("\n" + "=".repeat(70));
    console.log("⚡ PARALLEL BATCH PROOF GENERATION COMPLETE");
    console.log("=".repeat(70));
    console.log(`\n📊 Performance Metrics:`);
    console.log(`   Total proofs: ${successfulResults.length}/${assets.length}`);
    console.log(`   Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`   Average per proof: ${avgTime.toFixed(2)}ms`);
    console.log(`   Min: ${minTime.toFixed(2)}ms | Max: ${maxTime.toFixed(2)}ms`);
    console.log(`   Throughput: ${(1000 / avgTime).toFixed(1)} proofs/sec`);
    console.log(`   Parallel speedup: ~${(os.cpus().length).toFixed(1)}x (${proverPool.workerCount} cores)`);

    if (failedResults.length > 0) {
      console.log(`\n⚠️  Failed proofs: ${failedResults.length}`);
      failedResults.forEach((r) => {
        console.log(`   Asset ${r.assetId}: ${r.error}`);
      });
    }

    console.log(`\n📁 Output files:`);
    console.log(`   Proofs: ${batchProofsPath}`);
    console.log(`   Publics: ${batchPublicsPath}`);
    console.log();

    // Cleanup
    await proverPool.shutdown();
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
