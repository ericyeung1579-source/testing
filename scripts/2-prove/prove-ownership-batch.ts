import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess } from "../utils/helpers.js";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

async function main() {
  try {
    printHeader("BATCH PROOF: Submit Multiple Ownership Proofs");
    
    // Create public and wallet clients for viem
    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
    });

    const walletClient = createWalletClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
      account,
    });
    
    // Read registry ABI
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    
    // Get registry address
    const addresses = loadDeploymentAddresses();
    const registry = getContract({
      address: addresses.registry as `0x${string}`,
      abi: registryJson.abi,
      client: { public: publicClient, wallet: walletClient },
    });
    
    // Read batch proofs
    const batchProofsPath = path.join(process.cwd(), "circuits/batch-proofs/batch-proofs.json");
    const batchPublicsPath = path.join(process.cwd(), "circuits/batch-proofs/batch-public.json");
    
    if (!fs.existsSync(batchProofsPath) || !fs.existsSync(batchPublicsPath)) {
      console.error("Batch proofs not found!");
      console.log(`Generate them using: node scripts/2-prove/generate-proofs-batch.mjs`);
      process.exit(1);
    }
    
    const batchProofsData = JSON.parse(fs.readFileSync(batchProofsPath, "utf-8"));
    const batchPublicsData = JSON.parse(fs.readFileSync(batchPublicsPath, "utf-8"));
    
    const proofs = batchProofsData.proofs;
    const publics = batchPublicsData.publics;
    
    if (proofs.length === 0) {
      console.error("No proofs found");
      process.exit(1);
    }
    
    console.log(`\nSubmitting ${proofs.length} proofs...\n`);
    
    // Build proof data array for batch submission
    const proofDataArray: any[] = [];
    
    for (let i = 0; i < proofs.length; i++) {
      const proof = proofs[i].proof;
      const pub = publics[i].public;
      const assetId = proofs[i].assetId;
      
      console.log(`[${i + 1}/${proofs.length}] Asset ID: ${assetId}`);
      
      // Verify this is the correct asset
      if (proofs[i].assetId !== publics[i].assetId) {
        throw new Error(`Asset ID mismatch in batch data at index ${i}`);
      }
      
      // Convert proof arrays to proper format for Solidity
      const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
      const pi_b = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
      ];
      const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
      
      const commitment = BigInt(pub[1]);
      const assetIdBn = BigInt(assetId);
      
      proofDataArray.push({
        a: pi_a,
        b: pi_b,
        c: pi_c,
        assetId: assetIdBn,
        commitment: commitment
      });
    }
    
    console.log(`\n\nSubmitting batch to smart contract...`);
    
    // Try to estimate gas first to get better error messages
    try {
      const gasEstimate = await publicClient.estimateContractGas({
        address: addresses.registry as `0x${string}`,
        abi: registryJson.abi,
        functionName: "proveOwnershipBatch",
        args: [proofDataArray],
        account: account.address,
      });
    } catch (estimateError: any) {
      console.error("Batch proof failed!");
      console.error("Gas estimation failed. Trying to get revert reason...");
      console.error("Contract revert reason:", estimateError.message);
      throw estimateError;
    }
    
    const hash = await walletClient.writeContract({
      address: addresses.registry as `0x${string}`,
      abi: registryJson.abi,
      functionName: "proveOwnershipBatch",
      args: [proofDataArray],
    });
    console.log("Transaction hash:", hash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Batch proofs verified!");

    // Parse Transfer events from logs to calculate total tokens minted
    let totalTokensMinted = BigInt(0);
    
    if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
            // Check for Transfer event (0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef)
            // and check if it's a mint (from = zero address)
            if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
                const fromTopic = log.topics[1];
                if (fromTopic && fromTopic.endsWith("0000000000000000000000000000000000000000")) {
                    totalTokensMinted += BigInt(log.data);
                }
            }
        }
    }

    if (totalTokensMinted > 0n) {
        const formattedTokens = (totalTokensMinted / BigInt(10) ** BigInt(18)).toString();
        console.log(`\nTokens minted: ${formattedTokens} tokens`);
    } else {
        console.log("\nNo new tokens minted (already minted previously)");
    }

    printSuccess("Batch proof submission completed!");

  } catch (error: any) {
    console.error("Error:", error?.message || error);
    process.exit(1);
  }
}

main().catch(console.error);
