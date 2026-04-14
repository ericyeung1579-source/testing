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
    printHeader("PROOF: Ownership Verification & Token Minting");
    
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
    
    // Read proof and public signals
    const proof = JSON.parse(fs.readFileSync(path.join(process.cwd(), "circuits/AssetOwnership_js/proof.json"), "utf-8"));
    const pub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "circuits/AssetOwnership_js/public.json"), "utf-8"));
    
    // Read registry ABI
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    
    // Get registry address
    const addresses = loadDeploymentAddresses();
    const registry = getContract({
      address: addresses.registry as `0x${string}`,
      abi: registryJson.abi,
      client: { public: publicClient, wallet: walletClient },
    });
    
    const assetId = pub[0];
    const commitment = pub[1];
    
    console.log("Asset ID:   ", assetId);
    console.log("Commitment: ", commitment);
    
    // Convert proof arrays to proper format for Solidity
    // - Take only first 2 elements from pi_a and pi_c (ignore projective coordinate "1")
    // - Take only first 2 pairs from pi_b (ignore projective coordinate pair [1,0])
    // - Swap coordinates within each pi_b pair to match snarkjs generatecall output
    const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const pi_b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
    ];
    const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
    
    console.log("\nSubmitting proof...");
    
    // Try to estimate gas first to get better error messages
    try {
      const gasEstimate = await publicClient.estimateContractGas({
        address: addresses.registry as `0x${string}`,
        abi: registryJson.abi,
        functionName: "proveOwnership",
        args: [pi_a, pi_b, pi_c, assetId, commitment],
        account: account.address,
      });
    } catch (estimateError: any) {
      console.error("Proof failed!");
      console.error("Gas estimation failed. Trying to get revert reason...");
      console.error("Contract revert reason:", estimateError.message);
      throw estimateError;
    }
    
    const hash = await walletClient.writeContract({
      address: addresses.registry as `0x${string}`,
      abi: registryJson.abi,
      functionName: "proveOwnership",
      args: [pi_a, pi_b, pi_c, assetId, commitment],
    });
    console.log("Transaction hash:", hash);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Proof verified!");

    console.log("\nChecking if previous tokens minted...");
    
    let newTokensMinted = BigInt(0);
    if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
            // Check for Transfer event (0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef)
            // and check if it's a mint (from = zero address)
            if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
                const fromTopic = log.topics[1];
                if (fromTopic && fromTopic.endsWith("0000000000000000000000000000000000000000")) {
                    newTokensMinted = BigInt(log.data);
                    break;
                }
            }
        }
    }

    if (newTokensMinted > 0n) {
        const formattedTokens = (newTokensMinted / BigInt(10) ** BigInt(18)).toString();
        console.log("NewTokens minted:", formattedTokens);
    } else {
        console.log("Tokens have already minted");
    }

  } catch (error: any) {
    console.error("Error:", error?.message || error);
    process.exit(1);
  }
}

main().catch(console.error);
