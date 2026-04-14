#!/usr/bin/env node

/**
 * Real Proof Generation Benchmark - snarkjs
 * Generates multiple proofs and measures actual times
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { buildPoseidon } from "circomlibjs";

const CIRCUIT_PATH = path.join(process.cwd(), "circuits", "AssetOwnership_js");

async function generateProof(trialNum, assetId, secret, poseidon) {
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

  return {
    trial: trialNum,
    assetId,
    witness: parseFloat(wtElapsed.toFixed(2)),
    proof: parseFloat(proofElapsed.toFixed(2)),
    total: parseFloat(totalElapsed.toFixed(2)),
    commitment: commitment.substring(0, 20) + "...",
  };
}

async function main() {
  console.log("=== SNARKJS PROOF GENERATION BENCHMARK ===\n");
  console.log("Test setup: Measuring actual witness + proof generation times");
  console.log("Circuit: AssetOwnership (with Poseidon hash)\n");

  // Build Poseidon for commitment calculation
  const poseidon = await buildPoseidon();

  const results = [];
  const proofTimes = [];
  const witnessTimes = [];

  // Generate 10 proofs with different assets
  for (let i = 1; i <= 10; i++) {
    const assetId = 7000 + i;
    const secret = (111111 + i).toString();

    try {
      console.log(`[${i}/10] Generating proof for Asset ${assetId}...`);
      const result = await generateProof(i, assetId, secret, poseidon);
      results.push(result);
      proofTimes.push(result.proof);
      witnessTimes.push(result.witness);

      console.log(
        `        ✓ Witness: ${result.witness}ms | Proof: ${result.proof}ms | Total: ${result.total}ms`
      );
    } catch (e) {
      console.error(`        ✗ Error: ${e.message}`);
    }
  }

  if (results.length === 0) {
    console.error("No proofs generated successfully");
    process.exit(1);
  }

  // Calculate statistics
  const avgWitness = witnessTimes.reduce((a, b) => a + b) / witnessTimes.length;
  const avgProof =
    proofTimes.reduce((a, b) => a + b) / proofTimes.length;
  const avgTotal = avgWitness + avgProof;
  const minProof = Math.min(...proofTimes);
  const maxProof = Math.max(...proofTimes);

  console.log("\n=== SNARKJS STATISTICS ===\n");
  console.log(`Total proofs generated: ${results.length}`);
  console.log(`\nWitness Calculation:`);
  console.log(`  Average: ${avgWitness.toFixed(2)}ms`);
  console.log(`\nProof Generation:`);
  console.log(`  Average: ${avgProof.toFixed(2)}ms`);
  console.log(`  Min: ${minProof.toFixed(2)}ms`);
  console.log(`  Max: ${maxProof.toFixed(2)}ms`);
  console.log(`  Range: ${(maxProof - minProof).toFixed(2)}ms`);
  console.log(`\nTotal (Witness + Proof):`);
  console.log(`  Average: ${avgTotal.toFixed(2)}ms per proof`);
  console.log(`  Throughput: ${(1000 / avgTotal).toFixed(1)} proofs/second`);

  // Project scaling
  console.log("\n=== SCALING PROJECTIONS ===\n");
  const batch100 = avgTotal * 100;
  const batch1000 = avgTotal * 1000;
  const batch10000 = avgTotal * 10000;

  console.log("Time to generate batches (snarkjs):");
  console.log(`  100 proofs: ${(batch100 / 1000).toFixed(1)}s`);
  console.log(`  1,000 proofs: ${(batch1000 / 1000).toFixed(1)}s`);
  console.log(
    `  10,000 proofs: ${(batch10000 / 1000).toFixed(1)}s (${(batch10000 / 60000).toFixed(1)} minutes)`
  );

  // Rapidsnark projections (25x typical)
  console.log("\n=== RAPIDSNARK PROJECTIONS (25x speedup) ===\n");
  const rapidsnarkTime = avgTotal / 25;
  console.log(`Estimated time per proof: ${rapidsnarkTime.toFixed(2)}ms`);
  console.log(`Estimated throughput: ${(1000 / rapidsnarkTime).toFixed(0)} proofs/second`);
  console.log("\nTime to generate batches (rapidsnark estimated):");
  console.log(`  100 proofs: ${((batch100 / 25) / 1000).toFixed(2)}s`);
  console.log(`  1,000 proofs: ${((batch1000 / 25) / 1000).toFixed(2)}s`);
  console.log(
    `  10,000 proofs: ${((batch10000 / 25) / 1000).toFixed(2)}s`
  );

  console.log("\n=== TIME SAVINGS ===\n");
  console.log(
    `100 proofs: Save ${((batch100 - batch100 / 25) / 1000).toFixed(1)}s`
  );
  console.log(
    `1,000 proofs: Save ${((batch1000 - batch1000 / 25) / 1000).toFixed(1)}s`
  );
  console.log(
    `10,000 proofs: Save ${((batch10000 - batch10000 / 25) / 1000).toFixed(1)}s (${(((batch10000 - batch10000 / 25) / 1000) / 60).toFixed(1)} minutes)`
  );

  // Save detailed results
  const benchmark = {
    timestamp: new Date().toISOString(),
    setup: {
      library: "snarkjs",
      circuit: "AssetOwnership",
      trialsCount: results.length,
    },
    timing: {
      witness: {
        avg: parseFloat(avgWitness.toFixed(2)),
      },
      proof: {
        avg: parseFloat(avgProof.toFixed(2)),
        min: parseFloat(minProof.toFixed(2)),
        max: parseFloat(maxProof.toFixed(2)),
      },
      total: {
        avg: parseFloat(avgTotal.toFixed(2)),
      },
      throughput: parseFloat((1000 / avgTotal).toFixed(1)),
    },
    trials: results,
    scaling: {
      snarkjs: {
        proofs100: parseFloat((batch100 / 1000).toFixed(1)),
        proofs1000: parseFloat((batch1000 / 1000).toFixed(1)),
        proofs10000: parseFloat(((batch10000 / 1000) / 60).toFixed(2)),
      },
      rapidsnark25x: {
        proofs100: parseFloat(((batch100 / 25) / 1000).toFixed(3)),
        proofs1000: parseFloat(((batch1000 / 25) / 1000).toFixed(2)),
        proofs10000: parseFloat((((batch10000 / 25) / 1000) / 60).toFixed(2)),
        speedupMultiplier: 25,
      },
      savings: {
        proofs100: parseFloat(((batch100 - batch100 / 25) / 1000).toFixed(1)),
        proofs1000: parseFloat(((batch1000 - batch1000 / 25) / 1000).toFixed(1)),
        proofs10000Minutes: parseFloat(((((batch10000 - batch10000 / 25) / 1000) / 60)).toFixed(1)),
      },
    },
  };

  fs.writeFileSync("proof-benchmark-measured.json", JSON.stringify(benchmark, null, 2));
  console.log("\n💾 Detailed results saved to: proof-benchmark-measured.json");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
