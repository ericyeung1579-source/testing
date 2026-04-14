#!/usr/bin/env node

/**
 * On-Chain Performance Test - 1 Asset (Single Mode)
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { buildPoseidon } from "circomlibjs";
import { execSync } from "child_process";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

async function test1Asset() {
  console.log("🔧 Testing Single-Asset On-Chain Performance\n");

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
  const abi = registryJson.abi;
  const registryAddress = addresses.registry;

  const singleConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/single-asset.json"), "utf-8"));
  const asset = singleConfig.assets[0];
  const poseidon = await buildPoseidon();

  const assetId = BigInt(asset.assetId);
  const commitment = BigInt(poseidon.F.toString(poseidon([BigInt(asset.secret), assetId])));

  // TEST 1: Register 1 asset (single mode)
  console.log("📝 TEST 1: Register 1 Asset (Single Mode)");
  console.log("=".repeat(50));

  const gasEstimate1 = await publicClient.estimateContractGas({
    address: registryAddress,
    abi,
    functionName: "registerAsset",
    args: [assetId, commitment],
    account,
  });

  const txStart1 = performance.now();
  const hash1 = await walletClient.writeContract({
    address: registryAddress,
    abi,
    functionName: "registerAsset",
    args: [assetId, commitment],
    gas: gasEstimate1,
  });
  const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
  const txTime1 = performance.now() - txStart1;

  const gasUsed1 = Number(receipt1.gasUsed);
  console.log(`TX Time:   ${txTime1.toFixed(2)}ms`);
  console.log(`Gas Used:  ${gasUsed1.toLocaleString()}`);
  console.log(`TX Hash:   ${hash1}`);
  console.log();

  // TEST 2: Generate proof for 1 asset
  console.log("📝 TEST 2: Generate Proof (Single Mode)");
  console.log("=".repeat(50));

  const circuitDir = path.join(process.cwd(), "circuits/AssetOwnership_js");
  const zkeyPath = path.join(process.cwd(), "circuits/AssetOwnership_0001.zkey");

  const input = { secret: asset.secret, assetId: asset.assetId, commitment: commitment.toString(), ownerPublicKey: "1" };
  fs.writeFileSync(path.join(circuitDir, "input_single.json"), JSON.stringify(input));

  const genStart = performance.now();
  execSync(
    `snarkjs wtns calculate AssetOwnership.wasm input_single.json witness_single.wtns`,
    { cwd: circuitDir, stdio: "pipe" }
  );
  execSync(
    `snarkjs groth16 prove ${zkeyPath} ${path.join(circuitDir, "witness_single.wtns")} ${path.join(circuitDir, "proof_single.json")} ${path.join(circuitDir, "public_single.json")}`,
    { stdio: "pipe" }
  );
  const genTime = performance.now() - genStart;

  const proofData = JSON.parse(fs.readFileSync(path.join(circuitDir, "proof_single.json"), "utf-8"));
  const publicData = JSON.parse(fs.readFileSync(path.join(circuitDir, "public_single.json"), "utf-8"));

  console.log(`Proof Gen Time: ${genTime.toFixed(2)}ms`);
  console.log();

  // TEST 3: Submit 1 proof (single mode)
  console.log("📝 TEST 3: Submit 1 Proof (Single Mode)");
  console.log("=".repeat(50));

  const a = [BigInt(proofData.pi_a[0]), BigInt(proofData.pi_a[1])];
  const b = [
    [BigInt(proofData.pi_b[0][1]), BigInt(proofData.pi_b[0][0])],
    [BigInt(proofData.pi_b[1][1]), BigInt(proofData.pi_b[1][0])],
  ];
  const c = [BigInt(proofData.pi_c[0]), BigInt(proofData.pi_c[1])];
  const proofAssetId = BigInt(publicData[0]);
  const proofCommitment = BigInt(publicData[1]);

  const gasEstimate2 = await publicClient.estimateContractGas({
    address: registryAddress,
    abi,
    functionName: "proveOwnership",
    args: [a, b, c, proofAssetId, proofCommitment],
    account,
  });

  const txStart2 = performance.now();
  const hash2 = await walletClient.writeContract({
    address: registryAddress,
    abi,
    functionName: "proveOwnership",
    args: [a, b, c, proofAssetId, proofCommitment],
    gas: gasEstimate2,
  });
  const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
  const txTime2 = performance.now() - txStart2;

  const gasUsed2 = Number(receipt2.gasUsed);
  console.log(`TX Time:   ${txTime2.toFixed(2)}ms`);
  console.log(`Gas Used:  ${gasUsed2.toLocaleString()}`);
  console.log(`TX Hash:   ${hash2}`);
  console.log();

  // Summary
  console.log("=".repeat(70));
  console.log("📊 SINGLE-ASSET ON-CHAIN PERFORMANCE SUMMARY");
  console.log("=".repeat(70) + "\n");

  console.log("Registration (1 Asset):");
  console.log(`  TX Time:   ${txTime1.toFixed(2)}ms`);
  console.log(`  Gas Used:  ${gasUsed1.toLocaleString()}`);

  console.log("\nProof Generation (1 Proof, off-chain):");
  console.log(`  Time:      ${genTime.toFixed(2)}ms`);

  console.log("\nProof Submission (1 Proof):");
  console.log(`  TX Time:   ${txTime2.toFixed(2)}ms`);
  console.log(`  Gas Used:  ${gasUsed2.toLocaleString()}`);

  const totalGas = gasUsed1 + gasUsed2;
  const totalOnChainTime = txTime1 + txTime2;
  console.log("\nTotal:");
  console.log(`  On-chain Time:  ${totalOnChainTime.toFixed(2)}ms`);
  console.log(`  On-chain Gas:   ${totalGas.toLocaleString()}`);
  console.log(`  Full Workflow:  ${((genTime + totalOnChainTime) / 1000).toFixed(3)}s (proof gen + on-chain)`);
  console.log();

  // Cleanup temp files
  for (const f of ["input_single.json", "witness_single.wtns", "proof_single.json", "public_single.json"]) {
    try { fs.unlinkSync(path.join(circuitDir, f)); } catch (_) {}
  }
}

test1Asset().catch(console.error);
