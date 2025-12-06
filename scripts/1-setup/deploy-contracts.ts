import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { saveDeploymentAddresses, printHeader, printStep, printSuccess } from "../utils/helpers.js";

async function main() {
  try {
    printHeader("DEPLOYMENT: Contracts Setup");
    
    console.log("Getting signer...");
    
    // Connect to Hardhat's default local network
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // Get accounts from the node
    const accounts = await provider.listAccounts();
    if (!accounts || accounts.length === 0) {
      console.error("No accounts available from Hardhat node");
      return;
    }
    
    // Use the first account (which has funds in Hardhat)
    const signer = accounts[0];
    console.log("Deploying with:", signer);

    // Read ABI files
    const verifierJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/Verifier.sol/Groth16Verifier.json"), "utf-8"));
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    const tokenJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/AssetToken.sol/AssetToken.json"), "utf-8"));

    printStep(1, "Deploying Verifier");
    const verifierFactory = new ethers.ContractFactory(verifierJson.abi, verifierJson.bytecode, await provider.getSigner());
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();
    printSuccess(`Verifier deployed at ${verifier.target}`);

    printStep(2, "Deploying AssetToken");
    const tokenFactory = new ethers.ContractFactory(tokenJson.abi, tokenJson.bytecode, await provider.getSigner());
    const token = await tokenFactory.deploy("0x0000000000000000000000000000000000000000");
    await token.waitForDeployment();
    printSuccess(`AssetToken deployed at ${token.target}`);

    printStep(3, "Deploying PrivateAssetRegistry");
    const registryFactory = new ethers.ContractFactory(registryJson.abi, registryJson.bytecode, await provider.getSigner());
    const registry = await registryFactory.deploy(verifier.target, token.target);
    await registry.waitForDeployment();
    printSuccess(`PrivateAssetRegistry deployed at ${registry.target}`);

    printStep(4, "Initializing AssetToken registry link");
    const setRegistryTx = await (token as ethers.Contract).setRegistry(registry.target);
    await setRegistryTx.wait();
    printSuccess("AssetToken registry set");

    console.log("\n========== Deployment Summary ==========");
    console.log("Verifier:           ", verifier.target);
    console.log("AssetToken:         ", token.target);
    console.log("Registry:           ", registry.target);
    console.log("=========================================\n");

    // Write addresses to a JSON file for scripts to use
    const addresses = {
      verifier: verifier.target as string,
      token: token.target as string,
      registry: registry.target as string,
      timestamp: Date.now()
    };
    
    saveDeploymentAddresses(addresses);
    printSuccess("Deployment addresses saved to deployment-addresses.json");
  } catch (error) {
    console.error("Deployment error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
