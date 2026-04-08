import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess, printWarning } from "../utils/helpers";

async function main() {
  try {
    printHeader("REGISTRATION: Asset Setup");
    
    const [signer] = await hre.ethers.getSigners();
    
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    
    const addresses = loadDeploymentAddresses();
    const registry = new hre.ethers.Contract(addresses.registry, registryJson.abi, signer);
    
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
    
    const existingAsset = await registry.assets(assetId);
    if (existingAsset.exists) {
      printWarning("Asset already registered");
    } else {
      const tx = await registry.registerAsset(assetId, commitment);
      console.log("Transaction hash:", tx.hash);
      await tx.wait();
      printSuccess("Asset registered!");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);