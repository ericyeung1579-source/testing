import { createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess, printWarning } from "../utils/helpers.js";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

async function main() {
  try {
    printHeader("BATCH REGISTRATION: Register Multiple Assets");

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

    // Verify contract exists
    const code = await publicClient.getBytecode({ address: addresses.registry as `0x${string}` });
    if (!code || code === "0x") {
      throw new Error(`No code found at registry address ${addresses.registry}. Did the node restart?`);
    }

    // Read batch registration data from file
    const batchDataPath = path.join(process.cwd(), "data", "batch-assets.json");

    if (!fs.existsSync(batchDataPath)) {
      printWarning("data/batch-assets.json not found");
      console.log("\nCreate a batch-assets.json file with the following format:");
      console.log(JSON.stringify({
        assets: [
          { assetId: "42", commitment: "12345678901234567890" },
          { assetId: "43", commitment: "12345678901234567891" },
        ],
      }, null, 2));
      return;
    }

    const batchData = JSON.parse(fs.readFileSync(batchDataPath, "utf-8"));

    if (!batchData.assets || batchData.assets.length === 0) {
      printWarning("No assets in batch-assets.json");
      return;
    }

    console.log(`\nRegistering ${batchData.assets.length} assets...`);

    const allAssetIds: bigint[] = [];
    const allCommitments: bigint[] = [];

    for (const asset of batchData.assets) {
      allAssetIds.push(BigInt(asset.assetId));
      allCommitments.push(BigInt(asset.commitment));
      console.log(`  Asset ID: ${asset.assetId}, Commitment: ${asset.commitment}`);
    }

    // Check which assets are already registered and filter them out
    const assetIds: bigint[] = [];
    const commitments: bigint[] = [];

    for (let i = 0; i < allAssetIds.length; i++) {
      const existingAsset = await publicClient.readContract({
        address: addresses.registry as `0x${string}`,
        abi: registryJson.abi,
        functionName: "assets",
        args: [allAssetIds[i]],
      }) as any;

      if (existingAsset.exists) {
        printWarning(`Asset ${allAssetIds[i]} already registered - will skip`);
      } else {
        assetIds.push(allAssetIds[i]);
        commitments.push(allCommitments[i]);
      }
    }

    if (assetIds.length === 0) {
      printWarning("All assets already registered");
      return;
    }

    console.log(`\nSubmitting batch registration for ${assetIds.length} assets...`);

    const hash = await walletClient.writeContract({
      address: addresses.registry as `0x${string}`,
      abi: registryJson.abi,
      functionName: "registerAssetsBatch",
      args: [assetIds, commitments],
    });
    console.log("Transaction hash:", hash);
    await publicClient.waitForTransactionReceipt({ hash });

    printSuccess(`${assetIds.length} assets registered successfully!`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
