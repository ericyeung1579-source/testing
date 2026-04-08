import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess } from "../utils/helpers";

async function main() {
  try {
    printHeader("PROOF: Ownership Verification & Token Minting");
    
    const [signer] = await hre.ethers.getSigners();
    
    const proof = JSON.parse(fs.readFileSync(path.join(process.cwd(), "circuits/AssetOwnership_js/proof.json"), "utf-8"));
    const pub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "circuits/AssetOwnership_js/public.json"), "utf-8"));
    
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    
    const addresses = loadDeploymentAddresses();
    const registry = new hre.ethers.Contract(addresses.registry, registryJson.abi, signer);
    
    const assetId = pub[0];
    const commitment = pub[1];
    
    console.log("Proof data:");
    console.log("  pi_a:      ", proof.pi_a);
    console.log("  pi_c:      ", proof.pi_c);
    console.log("  assetId:   ", assetId);
    console.log("  commitment:", commitment);
    
    const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const pi_b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
    ];
    const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
    
    console.log("\nSubmitting proof...");
    
    const tx = await registry.proveOwnership(pi_a, pi_b, pi_c, assetId, commitment);
    console.log("Transaction hash:", tx.hash);
    
    await tx.wait();
    printSuccess("Proof verified and tokens minted!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);