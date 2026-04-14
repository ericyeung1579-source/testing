#!/usr/bin/env node

/**
 * Proof System Performance Benchmark
 * Simpler approach: uses existing proof generation scripts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { ethers } from "ethers";

const PROVIDER_URL = "http://127.0.0.1:8545";

async function benchmarkSnarkjs() {
  console.log("\n=== SNARKJS PROOF GENERATION ===\n");

  const times = [];
  const proofSizes = [];

  // Create batch config with 5 test assets
  const batchConfig = {
    assets: [
      { assetId: "5001", secret: "111111" },
      { assetId: "5002", secret: "222222" },
      { assetId: "5003", secret: "333333" },
      { assetId: "5004", secret: "444444" },
      { assetId: "5005", secret: "555555" },
    ],
  };

  fs.writeFileSync("batch-assets-bench.json", JSON.stringify(batchConfig));

  try {
    for (let i = 0; i < batchConfig.assets.length; i++) {
      const asset = batchConfig.assets[i];

      console.log(`  Trial ${i + 1}: Generating proof for Asset ${asset.assetId}...`);

      // Calculate commitment
      const commitment = execSync(
        `node scripts/calc_commitment.mjs ${asset.secret} ${asset.assetId}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      const circuitPath = path.join(process.cwd(), "circuits", "AssetOwnership_js");
      const inputJson = {
        secret: asset.secret,
        assetId: asset.assetId,
        commitment: commitment,
        ownerPublicKey: "1",
      };

      // Write input
      const inputPath = path.join(circuitPath, "input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputJson));

      // Time both witness and proof generation
      const startTime = performance.now();

      // Generate witness
      execSync(
        `snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns`,
        {
          cwd: circuitPath,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      // Generate proof
      execSync(
        `snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json`,
        {
          cwd: circuitPath,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      const elapsed = performance.now() - startTime;
      times.push(elapsed);

      // Get proof size
      const proofPath = path.join(circuitPath, "proof.json");
      const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      const proofSize = JSON.stringify(proof).length;
      proofSizes.push(proofSize);

      console.log(
        `    ✓ Completed in ${elapsed.toFixed(2)}ms | Proof size: ${proofSize} bytes | Commitment: ${commitment}`
      );

      // Clean up input
      fs.unlinkSync(inputPath);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const avgSize = proofSizes.reduce((a, b) => a + b) / proofSizes.length;

    console.log(`\n  📊 Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`  📊 Average proof size: ${avgSize.toFixed(0)} bytes`);
    console.log(`  📊 Total proofs: ${times.length}`);

    return {
      library: "snarkjs",
      trials: times.map((t) => parseFloat(t.toFixed(2))),
      avgTime: parseFloat(avgTime.toFixed(2)),
      avgProofSize: parseFloat(avgSize.toFixed(0)),
    };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { failed: true, error: error.message };
  }
}

async function benchmarkVerificationGas() {
  console.log("\n=== PROOF VERIFICATION GAS COSTS ===\n");

  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const signer = await provider.getSigner();
    const addressesJson = JSON.parse(fs.readFileSync("deployment-addresses.json", "utf-8"));
    const registryJson = JSON.parse(
      fs.readFileSync("artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json", "utf-8")
    );

    const registry = new ethers.Contract(addressesJson.registry, registryJson.abi, signer);

    // Generate a test proof
    const testAsset = { assetId: "6001", secret: "611111" };
    const commitment = execSync(
      `node scripts/calc_commitment.mjs ${testAsset.secret} ${testAsset.assetId}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    const circuitPath = path.join(process.cwd(), "circuits", "AssetOwnership_js");
    const inputJson = {
      secret: testAsset.secret,
      assetId: testAsset.assetId,
      commitment: commitment,
      ownerPublicKey: "1",
    };

    const inputPath = path.join(circuitPath, "input.json");
    fs.writeFileSync(inputPath, JSON.stringify(inputJson));

    console.log("  Generating test proof for verification..."); 

    // Generate witness and proof
    execSync(
      `snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns`,
      {
        cwd: circuitPath,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    execSync(
      `snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json`,
      {
        cwd: circuitPath,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const proofPath = path.join(circuitPath, "proof.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

    // Register asset first
    console.log("  Registering test asset...");
    const regTx = await registry.registerAsset(BigInt(testAsset.assetId), BigInt(commitment));
    await regTx.wait();

    // Format proof for contract
    const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const pi_b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ];
    const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

    // Measure verification gas (5 times)
    const gasUsages = [];
    console.log("  Measuring verification gas costs...");

    for (let i = 0; i < 5; i++) {
      const tx = await registry.proveOwnership(pi_a, pi_b, pi_c, testAsset.assetId, commitment);
      const receipt = await tx.wait();
      gasUsages.push(receipt.gasUsed.toNumber());
    }

    const avgGas = gasUsages.reduce((a, b) => a + b) / gasUsages.length;

    console.log(`  ✓ Gas usages: ${gasUsages.map((g) => g).join(", ")}`);
    console.log(`  ✓ Average gas: ${avgGas.toFixed(0)}`);

    // Clean up
    fs.unlinkSync(inputPath);
    fs.unlinkSync(path.join(circuitPath, "input.json"));

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
  console.log("=== PROOF SYSTEM PERFORMANCE BENCHMARK ===");
  console.log("Current setup: snarkjs (JavaScript implementation)");
  console.log("Potential upgrade: rapidsnark (C++ implementation) 10-100x faster");

  try {
    const snarkjsResults = await benchmarkSnarkjs();
    const gasResults = await benchmarkVerificationGas();

    // Summary
    console.log("\n=== PERFORMANCE SUMMARY ===\n");

    if (!snarkjsResults.failed) {
      console.log("Proof Generation (Current):");
      console.log(`  Library: snarkjs (JavaScript)`);
      console.log(`  Average time per proof: ${snarkjsResults.avgTime.toFixed(2)}ms`);
      console.log(`  Average proof size: ${snarkjsResults.avgProofSize} bytes`);
      console.log(`  Total time for 1000 proofs: ~${(snarkjsResults.avgTime * 1000) / 1000}.0 seconds`);
    }

    if (!gasResults.failed) {
      console.log("\nProof Verification (On-Chain):");
      console.log(`  Average gas per verification: ${gasResults.avgGas.toFixed(0)}`);
      console.log(`  Proof size: ${gasResults.proofSize} bytes`);
    }

    console.log("\n=== RAPIDSNARK POTENTIAL IMPACT ===\n");
    console.log("If rapidsnark is used (10-100x faster on proof generation):");
    
    if (!snarkjsResults.failed) {
      const speedup = 20; // Conservative 20x estimate
      const estimatedTime = snarkjsResults.avgTime / speedup;
      const estimatedTotal = (estimatedTime * 1000) / 1000;
      
      console.log(`  Estimated proof generation time: ${estimatedTime.toFixed(2)}ms (${speedup}x faster)`);
      console.log(`  Estimated time for 1000 proofs: ~${estimatedTotal.toFixed(1)} seconds`);
      console.log(`  ⏱️  Time saved per 1000 proofs: ~${(((snarkjsResults.avgTime - estimatedTime) * 1000) / 1000).toFixed(1)} seconds`);
      
      const results = {
        timestamp: new Date().toISOString(),
        snarkjs: snarkjsResults,
        verification: gasResults,
        rapidsnarkEstimate: {
          speedupMultiplier: 20,
          estimated20xSpeedup: estimatedTime.toFixed(2) + "ms",
          expectedProofsPerSecond: Math.round(1000 / estimatedTime),
          timeSavedPerThousandProofs: (((snarkjsResults.avgTime - estimatedTime) * 1000) / 1000).toFixed(1) + "s",
        },
      };
      
      fs.writeFileSync("proof-system-benchmark.json", JSON.stringify(results, null, 2));
      
      console.log("\nTo test rapidsnark:");
      console.log("  1. npm install -g @iden3/rapidsnark");
      console.log("  2. Update proving scripts to use: rapidsnark command");
      console.log("  3. Re-run this benchmark to see actual improvement");
    }
    console.log("\n💾 Results saved to: proof-system-benchmark.json");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
