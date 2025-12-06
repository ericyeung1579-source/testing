import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess, printWarning } from "../utils/helpers.js";

async function main() {
  try {
    printHeader("REGISTRATION: Asset Setup");
    
    // Connect to Hardhat node
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const signer = await provider.getSigner();
    
    // Read registry ABI
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    
    // Get registry address
    const addresses = loadDeploymentAddresses();
    const registry = new ethers.Contract(addresses.registry, registryJson.abi, signer);
    
    // Verify contract exists
    const code = await provider.getCode(addresses.registry);
    if (code === "0x") {
      throw new Error(`No code found at registry address ${addresses.registry}. Did the node restart?`);
    }

    // Get public signals (proof will be generated later)
    const pubPath = path.join(process.cwd(), "circuits/AssetOwnership_js/public.json");
    
    if (!fs.existsSync(pubPath)) {
      printWarning("Proof not yet generated. Skipping registration.");
      printWarning("Run: .\\scripts\\2-prove\\generate_proof.ps1 42 123456789");
      return;
    }
    
    const pub = JSON.parse(fs.readFileSync(pubPath, "utf-8"));
    const assetId = pub[0];
    const commitment = pub[1];
    
    console.log("Asset ID:   ", assetId);
    console.log("Commitment: ", commitment);
    
    // Check if already registered
    const existingAsset = await registry.assets(assetId);
    if (existingAsset.exists) {
      printWarning("Asset already registered");
    } else {
      const tx = await registry.registerAsset(assetId, commitment);
      console.log("Transaction hash:", tx.hash);
      const receipt = await tx.wait();
      printSuccess("Asset registered!");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
