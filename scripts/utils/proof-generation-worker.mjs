/**
 * Proof Generation Worker Thread
 * 
 * Runs in a separate Node.js Worker thread to enable parallel proof generation
 * Receives proof tasks from the main thread and returns completed proofs
 */

import { parentPort, threadId } from "worker_threads";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

let circuitPath = null;
let workerID = threadId;

/**
 * Generate proof for a single asset
 */
function generateProof(asset, inputJson, circuitPath) {
  try {
    const { assetId } = asset;
    const startTime = performance.now();

    // Use unique filenames per worker to avoid conflicts
    const inputPath = path.join(circuitPath, `input_${workerID}.json`);
    const witnessPath = path.join(circuitPath, `witness_${workerID}.wtns`);
    const proofPath = path.join(circuitPath, `proof_${workerID}.json`);
    const publicPath = path.join(circuitPath, `public_${workerID}.json`);

    fs.writeFileSync(inputPath, JSON.stringify(inputJson));

    // Generate witness
    const witnessStart = performance.now();
    execSync(`snarkjs wtns calculate AssetOwnership.wasm input_${workerID}.json witness_${workerID}.wtns`, {
      cwd: circuitPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const witnessTime = performance.now() - witnessStart;

    // Generate proof
    const proofStart = performance.now();
    execSync(
      `snarkjs groth16 prove ../AssetOwnership_0001.zkey witness_${workerID}.wtns proof_${workerID}.json public_${workerID}.json`,
      {
        cwd: circuitPath,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    const proofTime = performance.now() - proofStart;

    // Read results
    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
      throw new Error("Proof files not created");
    }

    const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const pub = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    const totalTime = performance.now() - startTime;

    // Cleanup temporary files
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(witnessPath);
      fs.unlinkSync(proofPath);
      fs.unlinkSync(publicPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    return {
      success: true,
      assetId,
      proof,
      public: pub,
      commitment: inputJson.commitment,
      timing: {
        witness: witnessTime,
        proof: proofTime,
        total: totalTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      assetId: asset.assetId,
      error: error.message,
    };
  }
}

// Listen for messages from main thread
parentPort.on("message", (message) => {
  try {
    if (message.type === "init") {
      // Initialize worker
      circuitPath = message.circuitPath;
      parentPort.postMessage({ type: "init_done" });
    } else if (message.type === "prove") {
      // Generate proof for asset
      const result = generateProof(message.asset, message.inputJson, circuitPath);
      parentPort.postMessage({ type: "prove_done", result });
    }
  } catch (error) {
    parentPort.postMessage({ type: "error", error: error.message });
  }
});
