import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { loadDeploymentAddresses, printHeader, printSuccess } from "../utils/helpers.js";

async function main() {
  try {
    printHeader("PROOF: Ownership Verification & Token Minting");
    
    // Connect to Hardhat node
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const signer = await provider.getSigner();
    
    // Read proof and public signals
    const proof = JSON.parse(fs.readFileSync(path.join(process.cwd(), "circuits/AssetOwnership_js/proof.json"), "utf-8"));
    const pub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "circuits/AssetOwnership_js/public.json"), "utf-8"));
    
    // Read registry ABI
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    
    // Get registry address
    const addresses = loadDeploymentAddresses();
    const registry = new ethers.Contract(addresses.registry, registryJson.abi, signer);
    
    const assetId = pub[0];
    const commitment = pub[1];
    
    console.log("Proof data:");
    console.log("  pi_a:      ", proof.pi_a);
    console.log("  pi_c:      ", proof.pi_c);
    console.log("  assetId:   ", assetId);
    console.log("  commitment:", commitment);
    
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
      await registry.proveOwnership.estimateGas(pi_a, pi_b, pi_c, assetId, commitment);
    } catch (estimateError: any) {
      console.error("Gas estimation failed. Trying to get revert reason...");
      try {
        await registry.proveOwnership.staticCall(pi_a, pi_b, pi_c, assetId, commitment);
      } catch (staticError: any) {
        console.error("Contract revert reason:", staticError.message);
        throw staticError;
      }
      throw estimateError;
    }
    
    const tx = await registry.proveOwnership(pi_a, pi_b, pi_c, assetId, commitment);
    console.log("Transaction hash:", tx.hash);
    
    const receipt = await tx.wait();
    printSuccess("Proof verified and tokens minted!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
