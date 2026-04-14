#!/usr/bin/env node

/**
 * Proof System Analysis & Benchmark
 * Shows current setup and rapidsnark potential
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

const PROVIDER_URL = "http://127.0.0.1:8545";

async function benchmarkExistingProofs() {
  console.log("\n=== PROOF VERIFICATION (ON-CHAIN) ===\n");

  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const signer = await provider.getSigner();
    const addressesJson = JSON.parse(fs.readFileSync("deployment-addresses.json", "utf-8"));
    const registryJson = JSON.parse(
      fs.readFileSync("artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json", "utf-8")
    );

    const registry = new ethers.Contract(addressesJson.registry, registryJson.abi, signer);
    const circuitPath = path.join(process.cwd(), "circuits", "AssetOwnership_js");

    // Use pre-generated test proof
    const proofPath = path.join(circuitPath, "test_proof.json");
    const publicPath = path.join(circuitPath, "test_public.json");

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
      console.log("Skipping verification benchmark - test proofs not found");
      return { skipped: true };
    }

    const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const pub = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    const assetId = pub[0];
    const commitment = pub[1];

    console.log(`Asset ID: ${assetId}`);
    console.log(`Commitment: ${commitment}`);
    console.log(`Proof size: ${JSON.stringify(proof).length} bytes\n`);

    // Register asset first if needed
    try {
      await registry.registerAsset(BigInt(assetId), BigInt(commitment));
      console.log("Asset registered for proof verification");
    } catch (e) {
      // Asset might already be registered
    }

    // Format proof for contract
    const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const pi_b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ];
    const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

    // Measure verification gas
    const gasUsages = [];
    console.log("Measuring verification gas (5 trials)...\n");

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const tx = await registry.proveOwnership(pi_a, pi_b, pi_c, assetId, commitment);
      const receipt = await tx.wait();
      const elapsed = performance.now() - start;

      gasUsages.push(receipt.gasUsed.toNumber());
      console.log(`  Trial ${i + 1}: ${receipt.gasUsed} gas | ${elapsed.toFixed(2)}ms`);
    }

    const avgGas = gasUsages.reduce((a, b) => a + b) / gasUsages.length;

    console.log(`\n  📊 Average gas: ${avgGas.toFixed(0)}`);

    return {
      gasUsages: gasUsages,
      avgGas: parseFloat(avgGas.toFixed(0)),
      proofSize: JSON.stringify(proof).length,
    };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { failed: true, error: error.message };
  }
}

async function main() {
  console.log("=== PROOF SYSTEM PERFORMANCE ANALYSIS ===");
  console.log("Current: snarkjs (JavaScript)");
  console.log("Potential: rapidsnark (C++ - 10-100x faster)\n");

  // Get verification results
  const verifyResults = await benchmarkExistingProofs();

  // Show proof generation analysis
  console.log("\n=== PROVING SYSTEM ANALYSIS ===\n");
  console.log("Current Setup: snarkjs");
  console.log("-  Language: JavaScript");
  console.log("  Performance: ~200-500ms per proof (depends on circuit complexity)");
  console.log("  Throughput: ~2-5 proofs/second");

  console.log("\nUpgrade Option: rapidsnark");
  console.log("  Language: C++ (compiled)");
  console.log("  Performance: ~10-50ms per proof (10-50x faster)");
  console.log("  Throughput: ~20-100 proofs/second");
  console.log("  Reference: https://github.com/iden3/rapidsnark");

  // Project impact
  console.log("\n=== IMPACT ON YOUR SYSTEM ===\n");

  // Calculate based on typical batch sizes
  const snarkjsTimePerProof = 300; // milliseconds (estimate for AssetOwnership circuit)
  const rapidsnarkTimePerProof = snarkjsTimePerProof / 25; // 25x speedup estimate

  const batch100Snarkjs = (snarkjsTimePerProof * 100) / 1000;
  const batch100Rapidsnark = (rapidsnarkTimePerProof * 100) / 1000;

  console.log("For 100-proof batch:");
  console.log(`  snarkjs: ~${batch100Snarkjs.toFixed(1)}s`);
  console.log(`  rapidsnark: ~${batch100Rapidsnark.toFixed(1)}s`);
  console.log(`  Time saved: ${(batch100Snarkjs - batch100Rapidsnark).toFixed(1)}s`);

  const batch1000Snarkjs = (snarkjsTimePerProof * 1000) / 1000;
  const batch1000Rapidsnark = (rapidsnarkTimePerProof * 1000) / 1000;

  console.log("\nFor 1000-proof batch:");
  console.log(`  snarkjs: ~${batch1000Snarkjs.toFixed(1)}s`);
  console.log(`  rapidsnark: ~${batch1000Rapidsnark.toFixed(1)}s`);
  console.log(`  Time saved: ${(batch1000Snarkjs - batch1000Rapidsnark).toFixed(1)}s`);

  // On-chain verification (same regardless of proving library)
  if (!verifyResults.failed && !verifyResults.skipped) {
    console.log("\n=== ON-CHAIN VERIFICATION (Unchanged) ===\n");
    console.log(`Average gas per verification: ${verifyResults.avgGas.toFixed(0)}`);
    console.log("Note: Gas cost is determined by circuit and Groth16 verifier, not the proving library");
  }

  console.log("\n=== IMPLEMENTATION STEPS ===\n");
  console.log("1. Install rapidsnark:");
  console.log("   npm install -g @iden3/rapidsnark");
  console.log("\n2. Update proving scripts (scripts/2-prove/*.mjs):");
  console.log("   Change: snarkjs groth16 prove");
  console.log("   To: rapidsnark");
  console.log("\n3. Update batch generation (scripts/2-prove/generate-proofs-batch.mjs):");
  console.log("   Replace snarkjs command with rapidsnark");
  console.log("\n4. Performance gain: 10-50x speedup on proof generation");
  console.log("   No changes needed for verification or gas costs");

  // Save analysis
  const analysis = {
    timestamp: new Date().toISOString(),
    currentSetup: {
      library: "snarkjs",
      language: "JavaScript",
      estimatedTimePerProof: "200-500ms",
      throughput: "2-5 proofs/sec",
    },
    proposedUpgrade: {
      library: "rapidsnark",
      language: "C++",
      estimatedTimePerProof: "10-50ms",
      throughput: "20-100 proofs/sec",
      speedupMultiplier: "10-50x",
    },
    verificationGas: verifyResults.avgGas || "N/A",
    projectedSavingsPer1000Proofs: {
      timeSeconds: (batch1000Snarkjs - batch1000Rapidsnark).toFixed(1),
    },
  };

  fs.writeFileSync("proof-system-analysis.json", JSON.stringify(analysis, null, 2));
  console.log("\n💾 Analysis saved to: proof-system-analysis.json");
}

main();
