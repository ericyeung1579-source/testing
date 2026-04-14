#!/usr/bin/env node

/**
 * Rapidsnark Performance Demonstration
 * 
 * Tests actual snarkjs performance and projects rapidsnark speedup
 * based on measured 25x improvement from benchmarks.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { buildPoseidon } from "circomlibjs";

const CIRCUIT_PATH = path.join(process.cwd(), "circuits", "AssetOwnership_js");
const OUTPUT_DIR = path.join(process.cwd(), "circuits", "batch-proofs");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateProofWithSnarkjs(trialNum, assetId, secret, poseidon) {
  // Calculate Poseidon commitment
  const secretBn = BigInt(secret);
  const assetIdBn = BigInt(assetId);
  const commitment = poseidon.F.toString(poseidon([secretBn, assetIdBn]));

  const inputJson = {
    secret: secret,
    assetId: assetId.toString(),
    commitment: commitment,
    ownerPublicKey: "1",
  };

  // Write input
  fs.writeFileSync(
    path.join(CIRCUIT_PATH, "input.json"),
    JSON.stringify(inputJson)
  );

  // Time witness calculation
  const wtStart = performance.now();
  execSync(
    `snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns`,
    {
      cwd: CIRCUIT_PATH,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  const wtElapsed = performance.now() - wtStart;

  // Time proof generation
  const proofStart = performance.now();
  execSync(
    `snarkjs groth16 prove ${path.join(process.cwd(), 'circuits', 'AssetOwnership_0001.zkey')} ${path.join(CIRCUIT_PATH, 'witness.wtns')} ${path.join(CIRCUIT_PATH, 'proof.json')} ${path.join(CIRCUIT_PATH, 'public.json')}`,
    {
      cwd: CIRCUIT_PATH,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  const proofElapsed = performance.now() - proofStart;

  const totalElapsed = wtElapsed + proofElapsed;

  // Read proof for storage
  const proof = JSON.parse(
    fs.readFileSync(path.join(CIRCUIT_PATH, "proof.json"), "utf-8")
  );

  return {
    trial: trialNum,
    assetId,
    witness: parseFloat(wtElapsed.toFixed(2)),
    proof: parseFloat(proofElapsed.toFixed(2)),
    total: parseFloat(totalElapsed.toFixed(2)),
    proofData: proof,
  };
}

async function main() {
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║  RAPIDSNARK vs SNARKJS PERFORMANCE COMPARISON TEST  ║");
  console.log("╚" + "═".repeat(58) + "╝\n");

  // Build Poseidon
  console.log("🔧 Initializing...");
  const poseidon = await buildPoseidon();

  // Generate 5 actual snarkjs proofs
  console.log("📚 Testing actual snarkjs performance (5 proofs)...\n");

  const snarkjsResults = [];
  const snarkjsTimes = [];

  for (let i = 1; i <= 5; i++) {
    const assetId = 5000 + i;
    const secret = (500000 + i).toString();

    process.stdout.write(`  [${i}/5] Asset ${assetId}... `);
    const start = performance.now();

    try {
      const result = await generateProofWithSnarkjs(i, assetId, secret, poseidon);
      snarkjsResults.push(result);
      snarkjsTimes.push(result.total);

      const elapsed = performance.now() - start;
      console.log(`✓ ${result.total.toFixed(0)}ms`);
    } catch (e) {
      console.error(`✗ Error: ${e.message}`);
      process.exit(1);
    }
  }

  // Calculate statistics
  const avgSnarkjs = snarkjsTimes.reduce((a, b) => a + b) / snarkjsTimes.length;
  const minSnarkjs = Math.min(...snarkjsTimes);
  const maxSnarkjs = Math.max(...snarkjsTimes);

  console.log("\n" + "═".repeat(60));
  console.log("📊 SNARKJS RESULTS (Measured - 5 Proofs)");
  console.log("═".repeat(60));
  console.log(
    `\nAverage time: ${avgSnarkjs.toFixed(2)}ms per proof`
  );
  console.log(`Min: ${minSnarkjs.toFixed(2)}ms | Max: ${maxSnarkjs.toFixed(2)}ms`);
  console.log(`Throughput: ${(1000 / avgSnarkjs).toFixed(2)} proofs/second`);

  // Project rapidsnark performance (25x speedup)
  const RAPIDSNARK_SPEEDUP = 25;
  const avgRapidsnark = avgSnarkjs / RAPIDSNARK_SPEEDUP;

  console.log("\n" + "═".repeat(60));
  console.log("⚡ RAPIDSNARK PROJECTIONS (25x Speedup)");
  console.log("═".repeat(60));
  console.log(
    `\nProjected average: ${avgRapidsnark.toFixed(2)}ms per proof`
  );
  console.log(
    `Min: ${(minSnarkjs / RAPIDSNARK_SPEEDUP).toFixed(2)}ms | Max: ${(maxSnarkjs / RAPIDSNARK_SPEEDUP).toFixed(2)}ms`
  );
  console.log(`Projected throughput: ${(1000 / avgRapidsnark).toFixed(2)} proofs/second`);

  // Batch performance comparison
  console.log("\n" + "═".repeat(60));
  console.log("📈 BATCH SCALING COMPARISON");
  console.log("═".repeat(60) + "\n");

  const batchSizes = [10, 50, 100, 500, 1000, 5000];

  console.log("Proofs | snarkjs (actual) | rapidsnark (est) | Time Saved");
  console.log("-------|------------------|-----------------|----------");

  for (const batchSize of batchSizes) {
    const snarkjsTime = avgSnarkjs * batchSize;
    const rapidsnarkTime = avgRapidsnark * batchSize;
    const timeSaved = snarkjsTime - rapidsnarkTime;

    const snarkjsStr =
      snarkjsTime < 60000
        ? `${(snarkjsTime / 1000).toFixed(1)}s`.padStart(15)
        : `${(snarkjsTime / 60000).toFixed(1)}m`.padStart(15);

    const rapidsnarkStr =
      rapidsnarkTime < 60000
        ? `${(rapidsnarkTime / 1000).toFixed(1)}s`.padStart(15)
        : `${(rapidsnarkTime / 60000).toFixed(1)}m`.padStart(15);

    const savedStr =
      timeSaved < 60000
        ? `${(timeSaved / 1000).toFixed(1)}s`.padStart(9)
        : `${(timeSaved / 60000).toFixed(1)}m`.padStart(9);

    console.log(
      `${batchSize.toString().padStart(5)} | ${snarkjsStr} | ${rapidsnarkStr} | ${savedStr}`
    );
  }

  // System impact
  console.log("\n" + "═".repeat(60));
  console.log("🎯 SYSTEM PERFORMANCE IMPACT");
  console.log("═".repeat(60) + "\n");

  const operationTime = 40; // ~40ms for viem batch (from benchmarks)

  const scenarios = [
    { name: "Single Proof", proofs: 1, ops: 1 },
    { name: "Batch 10", proofs: 10, ops: 1 },
    { name: "Batch 100", proofs: 100, ops: 1 },
    { name: "Batch 1000", proofs: 1000, ops: 100 },
  ];

  console.log("Scenario      | snarkjs Total | rapidsnark Total | Speedup");
  console.log("--------------|---------------|------------------|--------");

  for (const scenario of scenarios) {
    const snarkjs = operationTime * scenario.ops + avgSnarkjs * scenario.proofs;
    const rapidsnark =
      operationTime * scenario.ops + avgRapidsnark * scenario.proofs;
    const speedup = (snarkjs / rapidsnark).toFixed(1);

    const snarkjsStr =
      snarkjs < 60000
        ? `${(snarkjs / 1000).toFixed(2)}s`.padEnd(12)
        : `${(snarkjs / 60000).toFixed(2)}m`.padEnd(12);

    const rapidsnarkStr =
      rapidsnark < 60000
        ? `${(rapidsnark / 1000).toFixed(2)}s`.padEnd(15)
        : `${(rapidsnark / 60000).toFixed(2)}m`.padEnd(15);

    console.log(
      `${scenario.name.padEnd(13)} | ${snarkjsStr} | ${rapidsnarkStr} | ${speedup}x`
    );
  }

  // Save comparison to file
  const comparison = {
    timestamp: new Date().toISOString(),
    testType: "Rapidsnark vs Snarkjs Comparison",
    snarkjs: {
      measured: {
        proofs: snarkjsResults.length,
        avgTime: avgSnarkjs,
        minTime: minSnarkjs,
        maxTime: maxSnarkjs,
        throughput: 1000 / avgSnarkjs,
        trials: snarkjsResults,
      },
    },
    rapidsnark: {
      projected: {
        speedupMultiplier: RAPIDSNARK_SPEEDUP,
        avgTime: avgRapidsnark,
        minTime: minSnarkjs / RAPIDSNARK_SPEEDUP,
        maxTime: maxSnarkjs / RAPIDSNARK_SPEEDUP,
        throughput: 1000 / avgRapidsnark,
        basis: "25x speedup from benchmark data",
      },
    },
    batchComparison: batchSizes.map((size) => ({
      size,
      snarkjs: (avgSnarkjs * size) / 1000,
      rapidsnark: (avgRapidsnark * size) / 1000,
      timesSaved: ((avgSnarkjs * size - avgRapidsnark * size) / 1000).toFixed(2),
    })),
  };

  const reportPath = path.join(process.cwd(), "rapidsnark-comparison-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(comparison, null, 2));

  console.log("\n" + "═".repeat(60));
  console.log("✅ TEST COMPLETE");
  console.log("═".repeat(60));
  console.log(`\nReport saved: ${reportPath}`);
  console.log("\n💡 To build and use rapidsnark:");
  console.log("   1. cd rapidsnark-build");
  console.log("   2. git submodule update --init --recursive");
  console.log("   3. ./build_gmp.sh host && make host");
  console.log("   4. Set: export USE_RAPIDSNARK=true");
  console.log("   5. Run: node scripts/2-prove/generate-proofs-batch-v2.mjs\n");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
