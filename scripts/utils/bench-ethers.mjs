#!/usr/bin/env node

/**
 * ethers.js Performance Baseline
 * 
 * Measures current ethers.js operations:
 * - Register assets (contract write)
 * - Register batch (contract write)
 * - Proof submission (contract write)
 * - Asset lookup (contract read)
 * 
 * Run with: npm run bench:ethers
 * Or: node scripts/utils/bench-ethers.mjs
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function measureAsync(label, fn) {
  const start = performance.now();
  try {
    await fn();
    const ms = performance.now() - start;
    console.log(`  ✓ ${label.padEnd(35)} ${ms.toFixed(2)}ms`);
    return ms;
  } catch (error) {
    const ms = performance.now() - start;
    console.log(`  ✗ ${label.padEnd(35)} ${ms.toFixed(2)}ms - ${error.message}`);
    return null;
  }
}

function stats(times) {
  const valid = times.filter((t) => t !== null);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: valid.reduce((a, b) => a + b, 0) / valid.length,
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
}

async function main() {
  log("\n" + "=".repeat(70), "bold");
  log("  ETHERS.JS PERFORMANCE BASELINE", "bold");
  log("=".repeat(70) + "\n", "bold");

  const PROVIDER_URL = "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);

  // Check connection
  log("🔍 Checking blockchain connection...", "cyan");
  try {
    const blockNumber = await provider.getBlockNumber();
    log(`✓ Connected to local node (block ${blockNumber})\n`, "green");
  } catch (error) {
    log("❌ Cannot connect to blockchain on " + PROVIDER_URL, "red");
    log("\n💡 Start Hardhat node first:", "yellow");
    log("   npx hardhat node\n", "yellow");
    process.exit(1);
  }

  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();

  log("📝 Configuration:", "cyan");
  log(`  Signer:     ${signerAddress}`, "cyan");
  log(`  Provider:   ${PROVIDER_URL}`, "cyan");
  log(`  Library:    ethers.js v${ethers.version}\n`, "cyan");

  // Load deployment addresses
  log("📦 Loading contract artifacts...", "cyan");
  let registryAddress, registryABI;

  try {
    const deploymentFile = path.join(
      process.cwd(),
      "deployment-addresses.json"
    );
    if (!fs.existsSync(deploymentFile)) {
      throw new Error("deployment-addresses.json not found");
    }

    const addresses = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
    registryAddress = addresses.registry;

    const registryJson = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"
        ),
        "utf-8"
      )
    );
    registryABI = registryJson.abi;

    log(`✓ Registry at: ${registryAddress}\n`, "green");
  } catch (error) {
    log(`❌ Failed to load contracts: ${error.message}`, "red");
    log("\n💡 Deploy contracts first:", "yellow");
    log("   npx hardhat run scripts/1-setup/deploy-contracts.ts --network localhost\n", "yellow");
    process.exit(1);
  }

  const registry = new ethers.Contract(registryAddress, registryABI, signer);

  // Benchmark 1: Single register operations
  log("━".repeat(70), "magenta");
  log("OPERATION 1: registerAsset (single write)", "magenta");
  log("━".repeat(70) + "\n", "magenta");

  const singleRegisterTimes = [];
  for (let i = 1; i <= 5; i++) {
    const assetId = BigInt(1000000 + i); // Use numeric IDs
    const commitment = ethers.toBeHex(
      BigInt(Math.random() * 1e18),
      32
    );
    const ms = await measureAsync(
      `Iteration ${i}`,
      () =>
        registry.registerAsset(assetId, commitment).then((tx) => tx.wait())
    );
    if (ms) singleRegisterTimes.push(ms);
  }

  const singleStats = stats(singleRegisterTimes);
  if (singleStats) {
    log(`\n  Summary:`, "magenta");
    log(`    Avg:  ${singleStats.avg.toFixed(2)}ms`, "green");
    log(`    Min:  ${singleStats.min.toFixed(2)}ms`, "cyan");
    log(`    Max:  ${singleStats.max.toFixed(2)}ms`, "cyan");
    log(`    P95:  ${singleStats.p95.toFixed(2)}ms\n`, "cyan");
  }

  // Benchmark 2: Batch register operations
  log("━".repeat(70), "magenta");
  log("OPERATION 2: registerAssetsBatch (batch write)", "magenta");
  log("━".repeat(70) + "\n", "magenta");

  const batchSizes = [5, 10, 20];
  const batchResults = {};

  for (const batchSize of batchSizes) {
    log(`Testing with ${batchSize} assets:\n`, "cyan");

    const batchTimes = [];

    for (let trial = 1; trial <= 3; trial++) {
      const assetIds = [];
      const commitments = [];

      for (let i = 0; i < batchSize; i++) {
        assetIds.push(BigInt(2000000 + trial * 1000 + i)); // Use numeric IDs
        commitments.push(
          ethers.toBeHex(BigInt(Math.random() * 1e18), 32)
        );
      }

      const ms = await measureAsync(
        `Trial ${trial}`,
        () =>
          registry.registerAssetsBatch(assetIds, commitments).then((tx) =>
            tx.wait()
          )
      );

      if (ms) batchTimes.push(ms);
    }

    const batchStats = stats(batchTimes);
    if (batchStats) {
      log(`\n  Summary (${batchSize} assets):`, "magenta");
      log(`    Avg per batch: ${batchStats.avg.toFixed(2)}ms`, "green");
      log(`    Avg per asset: ${(batchStats.avg / batchSize).toFixed(2)}ms`, "green");
      log(`    Throughput:    ${(batchSize / (batchStats.avg / 1000)).toFixed(0)} assets/sec\n`, "green");

      batchResults[batchSize] = {
        stats: batchStats,
        perAsset: batchStats.avg / batchSize,
        throughput: (batchSize / (batchStats.avg / 1000)),
      };
    }
  }

  // Benchmark 3: Read operations
  log("━".repeat(70), "magenta");
  log("OPERATION 3: assets lookup (read + contract call)", "magenta");
  log("━".repeat(70) + "\n", "magenta");

  const readTimes = [];

  // First register an asset to read
  const testAssetId = BigInt(3000000); // Use numeric ID
  const testCommitment = ethers.toBeHex(BigInt(Math.random() * 1e18), 32);

  log("Setting up test asset...", "cyan");
  await registry.registerAsset(testAssetId, testCommitment);
  log("✓ Ready\n", "green");

  for (let i = 1; i <= 10; i++) {
    const ms = await measureAsync(
      `Read iteration ${i}`,
      () => registry.assets(testAssetId)
    );
    if (ms) readTimes.push(ms);
  }

  const readStats = stats(readTimes);
  if (readStats) {
    log(`\n  Summary:`, "magenta");
    log(`    Avg:  ${readStats.avg.toFixed(2)}ms`, "green");
    log(`    Min:  ${readStats.min.toFixed(2)}ms`, "cyan");
    log(`    Max:  ${readStats.max.toFixed(2)}ms`, "cyan");
    log(`    P95:  ${readStats.p95.toFixed(2)}ms\n`, "cyan");
  }

  // Save baseline
  log("━".repeat(70), "bold");
  const baselineFile = "ethers-baseline.json";
  const baseline = {
    library: "ethers.js",
    version: ethers.version,
    timestamp: new Date().toISOString(),
    operations: {
      singleRegister: singleStats,
      batchRegister: batchResults,
      assetLookup: readStats,
    },
  };

  fs.writeFileSync(baselineFile, JSON.stringify(baseline, null, 2));
  log(`\n💾 Baseline saved to ${baselineFile}\n`, "green");

  // Summary
  log("📊 ETHERS.JS PERFORMANCE SUMMARY", "bold");
  log("━".repeat(70) + "\n", "bold");

  log("Single Register:", "cyan");
  log(`  ${singleStats.avg.toFixed(2)}ms per operation\n`, "green");

  log("Batch Register (your main use case):", "cyan");
  for (const [size, result] of Object.entries(batchResults)) {
    log(
      `  ${size} assets: ${result.stats.avg.toFixed(2)}ms (${result.throughput.toFixed(0)} assets/sec)`,
      "green"
    );
  }

  log("\nAsset Lookup (reads):", "cyan");
  log(`  ${readStats.avg.toFixed(2)}ms per read\n`, "green");

  log("Next: Run same tests with viem and compare\n", "yellow");
}

main().catch((err) => {
  log(`\n❌ Error: ${err.message}`, "red");
  process.exit(1);
});
