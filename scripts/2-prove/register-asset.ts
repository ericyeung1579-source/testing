import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess, printWarning } from "../utils/helpers.js";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

async function main() {
  try {
    printHeader("REGISTRATION: Asset Setup");

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

    // Get public signals (written by proof generation)
    const pubPath = path.join(process.cwd(), "circuits/AssetOwnership_js/public.json");

    if (!fs.existsSync(pubPath)) {
      printWarning("Proof not yet generated. Skipping registration.");
      printWarning("Run: .\\scripts\\2-prove\\generate_proof.ps1 42 123456789");
      return;
    }

    const pub = JSON.parse(fs.readFileSync(pubPath, "utf-8"));
    const assetId = BigInt(pub[0]);
    const commitment = BigInt(pub[1]);

    console.log("Asset ID:   ", assetId.toString());
    console.log("Commitment: ", commitment.toString());

    // Check if already registered
    console.log(`Checking if Asset ID ${assetId} is already registered...`);
    const existingAsset = await publicClient.readContract({
      address: addresses.registry as `0x${string}`,
      abi: registryJson.abi,
      functionName: "assets",
      args: [assetId],
    }) as any;

    if (existingAsset.exists) {
      printWarning("Asset already registered");
    } else {
      const hash = await walletClient.writeContract({
        address: addresses.registry as `0x${string}`,
        abi: registryJson.abi,
        functionName: "registerAsset",
        args: [assetId, commitment],
      });
      console.log("Transaction hash:", hash);
      await publicClient.waitForTransactionReceipt({ hash });
      printSuccess("Asset registered!");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
