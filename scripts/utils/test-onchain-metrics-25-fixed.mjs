#!/usr/bin/env node

/**
 * On-Chain Performance Test - 25 Assets (Fixed)
 */

import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { buildPoseidon } from "circomlibjs";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

async function test25Assets() {
  console.log("🔧 Testing 25-Asset On-Chain Performance\n");

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http("http://127.0.0.1:8545"),
  });

  const walletClient = createWalletClient({
    chain: hardhat,
    transport: http("http://127.0.0.1:8545"),
    account,
  });

  const addresses = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployment-addresses.json"), "utf-8"));
  const registryJson = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"),
      "utf-8"
    )
  );

  const registry = getContract({
    address: addresses.registry,
    abi: registryJson.abi,
    client: { public: publicClient, wallet: walletClient },
  });

  // Test registration for 25 assets
  console.log("📝 TEST 1: Register 25 Assets (Batch Mode)");
  console.log("=".repeat(50));

  const batchConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/batch-assets-25.json"), "utf-8"));
  const assets = batchConfig.assets;
  const poseidon = await buildPoseidon();

  const assetIds = assets.map(a => BigInt(a.assetId));
  const commitments = assets.map(a => {
    const commitment = poseidon([BigInt(a.secret), BigInt(a.assetId)]);
    return BigInt(poseidon.F.toString(commitment));
  });

  // First estimate gas
  const gasEstimate1 = await publicClient.estimateContractGas({
    address: registry.address,
    abi: registry.abi,
    functionName: "registerAssetsBatch",
    args: [assetIds, commitments],
    account,
  });

  console.log(`Estimated Gas: ${gasEstimate1.toString()}`);

  const txStart1 = performance.now();
  try {
    const hash1 = await walletClient.writeContract({
      address: registry.address,
      abi: registry.abi,
      functionName: "registerAssetsBatch",
      args: [assetIds, commitments],
      gas: gasEstimate1,
    });
    console.log(`TX Hash: ${hash1}`);
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    const txTime1 = performance.now() - txStart1;

    const gasUsed1 = Number(receipt1.gasUsed);
    const gasPerAsset1 = Math.round(gasUsed1 / assets.length);

    console.log(`Assets:       ${assets.length}`);
    console.log(`TX Time:      ${txTime1.toFixed(2)}ms`);
    console.log(`Total Gas:    ${gasUsed1.toLocaleString()}`);
    console.log(`Gas/Asset:    ${gasPerAsset1.toLocaleString()}`);
    console.log();

    // Test proof submission for 25 proofs
    console.log("📝 TEST 2: Submit 25 Proofs (Batch Mode)");
    console.log("=".repeat(50));

    const proofsPath = path.join(process.cwd(), "circuits/batch-proofs/batch-proofs-parallel.json");
    const publicsPath = path.join(process.cwd(), "circuits/batch-proofs/batch-public-parallel.json");

    const proofsData = JSON.parse(fs.readFileSync(proofsPath, "utf-8"));
    const publicsData = JSON.parse(fs.readFileSync(publicsPath, "utf-8"));

    const proofDataArray = proofsData.proofs.map((p, i) => {
      const proof = p.proof;
      const pub = publicsData.publics[i].public;

      return {
        a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
        b: [
          [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
          [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
        ],
        c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
        assetId: BigInt(pub[0]),
        commitment: BigInt(pub[1]),
      };
    });

    // Limit to first 25 proofs if more exist
    const proofsToSubmit = proofDataArray.slice(0, 25);

    // Estimate gas for proof submission
    const gasEstimate2 = await publicClient.estimateContractGas({
      address: registry.address,
      abi: registry.abi,
      functionName: "proveOwnershipBatch",
      args: [proofsToSubmit],
      account,
    });

    console.log(`Estimated Gas: ${gasEstimate2.toString()}`);

    const txStart2 = performance.now();
    try {
      const hash2 = await walletClient.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "proveOwnershipBatch",
        args: [proofsToSubmit],
        gas: gasEstimate2,
      });
      console.log(`TX Hash: ${hash2}`);
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
      const txTime2 = performance.now() - txStart2;

      const gasUsed2 = Number(receipt2.gasUsed);
      const gasPerProof2 = Math.round(gasUsed2 / proofsToSubmit.length);

      console.log(`Proofs:       ${proofsToSubmit.length}`);
      console.log(`TX Time:      ${txTime2.toFixed(2)}ms`);
      console.log(`Total Gas:    ${gasUsed2.toLocaleString()}`);
      console.log(`Gas/Proof:    ${gasPerProof2.toLocaleString()}`);
      console.log();

      // Summary
      console.log("\n" + "=".repeat(70));
      console.log("📊 25-ASSET ON-CHAIN PERFORMANCE SUMMARY");
      console.log("=".repeat(70) + "\n");

      console.log("Registration (25 Assets):");
      console.log(`  TX Time:     ${txTime1.toFixed(2)}ms`);
      console.log(`  Total Gas:   ${gasUsed1.toLocaleString()}`);
      console.log(`  Gas/Asset:   ${gasPerAsset1.toLocaleString()}`);

      console.log("\nProof Submission (25 Proofs):");
      console.log(`  TX Time:     ${txTime2.toFixed(2)}ms`);
      console.log(`  Total Gas:   ${gasUsed2.toLocaleString()}`);
      console.log(`  Gas/Proof:   ${gasPerProof2.toLocaleString()}`);

      const totalGas = gasUsed1 + gasUsed2;
      const totalTime = txTime1 + txTime2;
      console.log("\nTotal Flow (25 Assets → Registration + Proofs):");
      console.log(`  Total Time:  ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(3)}s)`);
      console.log(`  Total Gas:   ${totalGas.toLocaleString()}`);
      console.log(`  Per Asset:   ${(totalGas / 25).toLocaleString()} gas`);

      console.log();
    } catch (err) {
      console.error("Error during proof submission:", err.message);
      process.exit(1);
    }
  } catch (err) {
    console.error("Error during registration:", err.message);
    process.exit(1);
  }
}

test25Assets().catch(console.error);
