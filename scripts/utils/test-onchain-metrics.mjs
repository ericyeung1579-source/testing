#!/usr/bin/env node

/**
 * On-Chain Performance Test
 * Measures gas costs and transaction times for registration and proof submission
 * Tests both single and batch modes
 */

import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { buildPoseidon } from "circomlibjs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

class OnChainTestSuite {
  constructor() {
    this.publicClient = null;
    this.walletClient = null;
    this.registry = null;
    this.results = {};
  }

  async initialize() {
    console.log("🔧 Initializing on-chain test suite...\n");

    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
    });

    const walletClient = createWalletClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
      account,
    });

    this.publicClient = publicClient;
    this.walletClient = walletClient;

    const addresses = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployment-addresses.json"), "utf-8"));
    const registryJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"),
        "utf-8"
      )
    );

    this.registry = getContract({
      address: addresses.registry,
      abi: registryJson.abi,
      client: { public: publicClient, wallet: walletClient },
    });

    console.log(`✓ Connected to registry at ${addresses.registry}\n`);
  }

  /**
   * Test registration - 5 assets (batch mode)
   */
  async testRegistrationBatch() {
    console.log("📝 TEST 1: Register 5 Assets (Batch Mode)");
    console.log("=".repeat(50));

    // Use assets from the test batch file
    const assets = [
      { assetId: "8001", secret: "123456789" },
      { assetId: "8002", secret: "987654321" },
      { assetId: "8003", secret: "111111111" },
      { assetId: "8004", secret: "222222222" },
      { assetId: "8005", secret: "333333333" },
    ];

    try {
      const poseidon = await buildPoseidon();
      const assetIds = assets.map(a => BigInt(a.assetId));
      const commitments = assets.map(a => {
        const commitment = poseidon([BigInt(a.secret), BigInt(a.assetId)]);
        return BigInt(poseidon.F.toString(commitment));
      });

      const txStart = performance.now();
      const hash = await this.walletClient.writeContract({
        address: this.registry.address,
        abi: this.registry.abi,
        functionName: "registerAssetsBatch",
        args: [assetIds, commitments],
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      const txTime = performance.now() - txStart;

      const gasUsed = Number(receipt.gasUsed);
      const gasPerAsset = Math.round(gasUsed / assets.length);

      console.log(`Assets:       ${assets.length}`);
      console.log(`TX Time:      ${txTime.toFixed(2)}ms`);
      console.log(`Total Gas:    ${gasUsed.toLocaleString()}`);
      console.log(`Gas/Asset:    ${gasPerAsset.toLocaleString()}`);
      console.log(`TX Hash:      ${hash}`);
      console.log();

      this.results.registrationBatch = {
        assets: assets.length,
        txTime: txTime.toFixed(2),
        totalGas: gasUsed,
        gasPerAsset: gasPerAsset,
      };

      return gasUsed;
    } catch (error) {
      console.error(`✗ Error: ${error.message}\n`);
      return null;
    }
  }

  /**
   * Test proof submission - 5 assets (batch mode)
   */
  async testProofSubmissionBatch() {
    console.log("📝 TEST 2: Submit 5 Proofs (Batch Mode)");
    console.log("=".repeat(50));

    try {
      // For this test, we'll use proofs that must be pre-generated
      // The assets registered above should match the proofs generated
      
      const proofsPath = path.join(process.cwd(), "circuits/batch-proofs/batch-proofs-parallel.json");
      const publicsPath = path.join(process.cwd(), "circuits/batch-proofs/batch-public-parallel.json");

      if (!fs.existsSync(proofsPath) || !fs.existsSync(publicsPath)) {
        console.log("⚠️  Proofs not found. Generate proofs first with:");
        console.log("   cp data/batch-assets-5.json data/batch-assets.json");
        console.log("   node scripts/2-prove/generate-proofs-parallel.mjs");
        console.log();
        return null;
      }

      console.log("Using pre-generated proofs...");
      const proofsData = JSON.parse(fs.readFileSync(proofsPath, "utf-8"));
      const publicsData = JSON.parse(fs.readFileSync(publicsPath, "utf-8"));

      // Only use first 5 proofs
      const proofDataArray = proofsData.proofs.slice(0, 5).map((p, i) => {
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

      console.log(`Submitting ${proofDataArray.length} proofs...`);

      const txStart = performance.now();
      const hash = await this.walletClient.writeContract({
        address: this.registry.address,
        abi: this.registry.abi,
        functionName: "proveOwnershipBatch",
        args: [proofDataArray],
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      const txTime = performance.now() - txStart;

      const gasUsed = Number(receipt.gasUsed);
      const gasPerProof = Math.round(gasUsed / proofDataArray.length);

      console.log(`Proofs:       ${proofDataArray.length}`);
      console.log(`TX Time:      ${txTime.toFixed(2)}ms`);
      console.log(`Total Gas:    ${gasUsed.toLocaleString()}`);
      console.log(`Gas/Proof:    ${gasPerProof.toLocaleString()}`);
      console.log(`TX Hash:      ${hash}`);
      console.log();

      this.results.proofSubmissionBatch = {
        proofs: proofDataArray.length,
        txTime: txTime.toFixed(2),
        totalGas: gasUsed,
        gasPerProof: gasPerProof,
      };

      return gasUsed;
    } catch (error) {
      console.error(`✗ Error: ${error.message}\n`);
      return null;
    }
  }

  /**
   * Summary report
   */
  printSummary() {
    console.log("\n" + "=".repeat(70));
    console.log("📊 ON-CHAIN PERFORMANCE SUMMARY");
    console.log("=".repeat(70) + "\n");

    console.log("Registration (Batch - 5 Assets):");
    if (this.results.registrationBatch) {
      const r = this.results.registrationBatch;
      console.log(`  Time:       ${r.txTime}ms`);
      console.log(`  Total Gas:  ${r.totalGas.toLocaleString()}`);
      console.log(`  Gas/Asset:  ${r.gasPerAsset.toLocaleString()}`);
    }

    console.log("\nProof Submission (Batch - 5 Proofs):");
    if (this.results.proofSubmissionBatch) {
      const r = this.results.proofSubmissionBatch;
      console.log(`  Time:       ${r.txTime}ms`);
      console.log(`  Total Gas:  ${r.totalGas.toLocaleString()}`);
      console.log(`  Gas/Proof:  ${r.gasPerProof.toLocaleString()}`);
    }

    console.log("\nTotal Flow (5 Assets → Proofs → Mint):");
    if (this.results.registrationBatch && this.results.proofSubmissionBatch) {
      const totalGas = this.results.registrationBatch.totalGas + this.results.proofSubmissionBatch.totalGas;
      const totalTime = parseFloat(this.results.registrationBatch.txTime) + parseFloat(this.results.proofSubmissionBatch.txTime);
      console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Total Gas:  ${totalGas.toLocaleString()}`);
      console.log(`  Per Asset:  ${(totalGas / 5).toLocaleString()} gas`);
    }

    console.log();
  }
}

// Run tests
async function main() {
  const suite = new OnChainTestSuite();
  await suite.initialize();

  await suite.testRegistrationBatch();
  await suite.testProofSubmissionBatch();

  suite.printSummary();
}

main().catch(console.error);
