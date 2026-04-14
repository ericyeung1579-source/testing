#!/usr/bin/env node

/**
 * Proof System Performance Benchmark
 * Measures: snarkjs vs rapidsnark, proof generation time, verification gas costs
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { ethers } from "ethers";

const CIRCUIT_PATH = path.join(process.cwd(), "circuits", "AssetOwnership_js");
const PROVIDER_URL = "http://127.0.0.1:8545";

async function benchmarkSnarkjs() {
  console.log("\n=== SNARKJS PROOF GENERATION ===\n");

  const times = [];
  const gasUsed = [];

  // Generate 5 test proofs
  for (let trial = 0; trial < 5; trial++) {
    const secretBase = 111111 + trial;
    const assetId = 10001 + trial;
    const secret = secretBase.toString();

    try {
      // Calculate commitment
      const commitment = execSync(
        `node scripts/calc_commitment.mjs ${secret} ${assetId}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      // Create input.json
      const inputJson = {
        secret: secret,
        assetId: assetId.toString(),
        commitment: commitment,
        ownerPublicKey: "1",
      };

      const inputPath = path.join(CIRCUIT_PATH, "bench-input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputJson));

      // Time witness calculation
      const wtStart = performance.now();
      execSync(
        `snarkjs wtns calculate AssetOwnership.wasm bench-input.json bench-witness.wtns`,
        {
          cwd: CIRCUIT_PATH,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      const wtElapsed = performance.now() - wtStart;

      // Time proof generation (primary benchmark)
      const proofStart = performance.now();
      execSync(
        `snarkjs groth16 prove AssetOwnership_0001.zkey bench-witness.wtns bench-proof.json bench-public.json`,
        {
          cwd: CIRCUIT_PATH,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      const proofElapsed = performance.now() - proofStart;
      const totalElapsed = wtElapsed + proofElapsed;

      times.push(totalElapsed);

      console.log(
        `  Trial ${trial + 1}: ${totalElapsed.toFixed(2)}ms (witness: ${wtElapsed.toFixed(2)}ms, proof: ${proofElapsed.toFixed(2)}ms)`
      );

      // Read proof for verification gas calculation
      const proofPath = path.join(CIRCUIT_PATH, "bench-proof.json");
      const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      
      // Record proof size (affects gas)
      const proofSize = JSON.stringify(proof).length;
      gasUsed.push(proofSize);

      // Clean up
      fs.unlinkSync(inputPath);
      fs.unlinkSync(path.join(CIRCUIT_PATH, "bench-witness.wtns"));
      fs.unlinkSync(proofPath);
      fs.unlinkSync(path.join(CIRCUIT_PATH, "bench-public.json"));
    } catch (e) {
      console.error(`  Trial ${trial + 1}: Error - ${e.message}`);
      return { failed: true };
    }
  }

  const avgTime = times.reduce((a, b) => a + b) / times.length;
  const avgProofSize = gasUsed.reduce((a, b) => a + b) / gasUsed.length;

  console.log(`\n  📊 Average time: ${avgTime.toFixed(2)}ms`);
  console.log(`  📊 Average proof size: ${avgProofSize.toFixed(0)} bytes`);

  return {
    library: "snarkjs",
    times: times.map(t => parseFloat(t.toFixed(2))),
    avgTime: parseFloat(avgTime.toFixed(2)),
    avgProofSize: parseFloat(avgProofSize.toFixed(0)),
  };
}

async function benchmarkRapidsnark() {
  console.log("\n=== RAPIDSNARK PROOF GENERATION ===\n");

  // Check if rapidsnark is installed
  try {
    execSync("rapidsnark --version", { stdio: "pipe" });
  } catch (e) {
    console.log("⚠️  rapidsnark not installed");
    console.log("\nTo install rapidsnark:");
    console.log("  npm install -g @iden3/rapidsnark");
    console.log("\nOr build from source:");
    console.log("  https://github.com/iden3/rapidsnark");
    return { failed: true, reason: "not_installed" };
  }

  const times = [];
  const gasUsed = [];

  // Generate 5 test proofs with rapidsnark
  for (let trial = 0; trial < 5; trial++) {
    const secretBase = 211111 + trial;
    const assetId = 20001 + trial;
    const secret = secretBase.toString();

    try {
      // Calculate commitment
      const commitment = execSync(
        `node scripts/calc_commitment.mjs ${secret} ${assetId}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      // Create input.json
      const inputJson = {
        secret: secret,
        assetId: assetId.toString(),
        commitment: commitment,
        ownerPublicKey: "1",
      };

      const inputPath = path.join(CIRCUIT_PATH, "bench-input.json");
      fs.writeFileSync(inputPath, JSON.stringify(inputJson));

      // Time witness calculation
      const wtStart = performance.now();
      execSync(
        `snarkjs wtns calculate AssetOwnership.wasm bench-input.json bench-witness.wtns`,
        {
          cwd: CIRCUIT_PATH,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      const wtElapsed = performance.now() - wtStart;

      // Time rapidsnark proof generation
      const proofStart = performance.now();
      execSync(
        `rapidsnark AssetOwnership_0001.zkey bench-witness.wtns bench-proof.json bench-public.json`,
        {
          cwd: CIRCUIT_PATH,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      const proofElapsed = performance.now() - proofStart;
      const totalElapsed = wtElapsed + proofElapsed;

      times.push(totalElapsed);

      console.log(
        `  Trial ${trial + 1}: ${totalElapsed.toFixed(2)}ms (witness: ${wtElapsed.toFixed(2)}ms, proof: ${proofElapsed.toFixed(2)}ms)`
      );

      // Read proof for verification gas calculation
      const proofPath = path.join(CIRCUIT_PATH, "bench-proof.json");
      const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      const proofSize = JSON.stringify(proof).length;
      gasUsed.push(proofSize);

      // Clean up
      fs.unlinkSync(inputPath);
      fs.unlinkSync(path.join(CIRCUIT_PATH, "bench-witness.wtns"));
      fs.unlinkSync(proofPath);
      fs.unlinkSync(path.join(CIRCUIT_PATH, "bench-public.json"));
    } catch (e) {
      console.error(`  Trial ${trial + 1}: Error - ${e.message}`);
      return { failed: true, reason: "execution_error", error: e.message };
    }
  }

  const avgTime = times.reduce((a, b) => a + b) / times.length;
  const avgProofSize = gasUsed.reduce((a, b) => a + b) / gasUsed.length;

  console.log(`\n  📊 Average time: ${avgTime.toFixed(2)}ms`);
  console.log(`  📊 Average proof size: ${avgProofSize.toFixed(0)} bytes`);

  return {
    library: "rapidsnark",
    times: times.map(t => parseFloat(t.toFixed(2))),
    avgTime: parseFloat(avgTime.toFixed(2)),
    avgProofSize: parseFloat(avgProofSize.toFixed(0)),
  };
}

async function benchmarkVerificationGas() {
  console.log("\n=== PROOF VERIFICATION GAS COSTS ===\n");

  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const signer = await provider.getSigner();
    const addressesJson = JSON.parse(
      fs.readFileSync("deployment-addresses.json", "utf-8")
    );
    const registryJson = JSON.parse(
      fs.readFileSync(
        "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json",
        "utf-8"
      )
    );

    const registry = new ethers.Contract(
      addressesJson.registry,
      registryJson.abi,
      signer
    );

    // Generate a test proof
    const testAsset = { assetId: "3001", secret: "311111" };
    const commitment = execSync(
      `node scripts/calc_commitment.mjs ${testAsset.secret} ${testAsset.assetId}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    const inputJson = {
      secret: testAsset.secret,
      assetId: testAsset.assetId,
      commitment: commitment,
      ownerPublicKey: "1",
    };

    const inputPath = path.join(CIRCUIT_PATH, "bench-verify-input.json");
    fs.writeFileSync(inputPath, JSON.stringify(inputJson));

    // Generate witness and proof
    execSync(
      `snarkjs wtns calculate AssetOwnership.wasm bench-verify-input.json bench-verify-witness.wtns`,
      {
        cwd: CIRCUIT_PATH,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    execSync(
      `snarkjs groth16 prove AssetOwnership_0001.zkey bench-verify-witness.wtns bench-verify-proof.json bench-verify-public.json`,
      {
        cwd: CIRCUIT_PATH,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const proofPath = path.join(CIRCUIT_PATH, "bench-verify-proof.json");
    const publicPath = path.join(CIRCUIT_PATH, "bench-verify-public.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
    const pub = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

    // Register asset first
    await registry.registerAsset(BigInt(testAsset.assetId), BigInt(commitment));

    // Format proof for contract
    const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const pi_b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ];
    const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

    // Measure verification gas
    console.log("Measuring single proof verification gas...");
    const tx = await registry.proveOwnership(
      pi_a,
      pi_b,
      pi_c,
      testAsset.assetId,
      commitment
    );
    const receipt = await tx.wait();

    console.log(`  ✓ Gas used: ${receipt.gasUsed}`);
    console.log(`  ✓ Transaction hash: ${tx.hash}`);

    // Clean up
    fs.unlinkSync(inputPath);
    fs.unlinkSync(path.join(CIRCUIT_PATH, "bench-verify-witness.wtns"));
    fs.unlinkSync(proofPath);
    fs.unlinkSync(publicPath);

    return {
      verificationGas: receipt.gasUsed.toString(),
      proofSize: JSON.stringify(proof).length,
    };
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { failed: true, error: e.message };
  }
}

async function main() {
  console.log("=== PROOF SYSTEM PERFORMANCE BENCHMARK ===");
  console.log(
    "Comparing: snarkjs vs rapidsnark proof generation performance"
  );

  try {
    const snarkjsResults = await benchmarkSnarkjs();
    const rapidsnarkResults = await benchmarkRapidsnark();
    const gasResults = await benchmarkVerificationGas();

    // Comparison
    if (!snarkjsResults.failed && !rapidsnarkResults.failed) {
      console.log("\n=== COMPARISON SUMMARY ===\n");

      const speedup =
        (snarkjsResults.avgTime - rapidsnarkResults.avgTime) /
        snarkjsResults.avgTime;
      const speedupPercent = (speedup * 100).toFixed(1);

      console.log("Proof Generation Performance:");
      console.log(
        `  snarkjs:   ${snarkjsResults.avgTime.toFixed(2)}ms (avg of 5 trials)`
      );
      console.log(
        `  rapidsnark: ${rapidsnarkResults.avgTime.toFixed(2)}ms (avg of 5 trials)`
      );
      console.log(`  📈 Speedup: ${speedupPercent}% faster with rapidsnark`);

      console.log("\nProof Verification (On-Chain):");
      console.log(`  Gas per verification: ${gasResults.verificationGas}`);
      console.log(`  Proof size: ${gasResults.proofSize} bytes`);
    } else {
      console.log("\n⚠️  Could not complete full comparison");
      if (!rapidsnarkResults.failed) {
        console.log("Please install rapidsnark to see the speedup");
      }
    }

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      snarkjs: snarkjsResults,
      rapidsnark: rapidsnarkResults,
      verification: gasResults,
    };

    fs.writeFileSync(
      "proof-system-benchmark.json",
      JSON.stringify(results, null, 2)
    );
    console.log("\n💾 Results saved to: proof-system-benchmark.json");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
