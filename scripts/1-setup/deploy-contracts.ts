import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { saveDeploymentAddresses, printHeader, printStep, printSuccess } from "../utils/helpers";

async function main() {
  try {
    printHeader("DEPLOYMENT: Contracts Setup");
   
    const [signer] = await hre.ethers.getSigners();
    console.log("Deploying with:", signer.address);

    // Read ABIs
    const verifierJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/Verifier.sol/Groth16Verifier.json"), "utf-8"));
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    const tokenJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/AssetToken.sol/AssetToken.json"), "utf-8"));

    printStep(1, "Deploying Verifier");
    const verifierFactory = new hre.ethers.ContractFactory(verifierJson.abi, verifierJson.bytecode, signer);
    const verifier = await verifierFactory.deploy();
    await verifier.deployed();
    printSuccess(`Verifier deployed at ${verifier.address}`);

    printStep(2, "Deploying AssetToken");
    const tokenFactory = new hre.ethers.ContractFactory(tokenJson.abi, tokenJson.bytecode, signer);
    const token = await tokenFactory.deploy("0x0000000000000000000000000000000000000000");
    await token.deployed();
    printSuccess(`AssetToken deployed at ${token.address}`);

    printStep(3, "Deploying PrivateAssetRegistry");
    const registryFactory = new hre.ethers.ContractFactory(registryJson.abi, registryJson.bytecode, signer);
    const registry = await registryFactory.deploy(verifier.address, token.address);
    await registry.deployed();
    printSuccess(`PrivateAssetRegistry deployed at ${registry.address}`);

    printStep(4, "Initializing AssetToken registry link");
    await (token as any).setRegistry(registry.address);
    printSuccess("AssetToken registry set");

    // ==================== SIMPLE CROSS-CHAIN BRIDGE ====================
    printStep(5, "Deploying CrossChainBridge (simple lock + claim)");
    const bridgeJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/CrossChainBridge.sol/CrossChainBridge.json"), "utf-8"));
    const bridgeFactory = new hre.ethers.ContractFactory(bridgeJson.abi, bridgeJson.bytecode, signer);
    const bridge = await bridgeFactory.deploy(token.address);
    await bridge.deployed();
    printSuccess(`CrossChainBridge deployed at ${bridge.address}`);
    // =====================================================================

    console.log("\n========== Deployment Summary ==========");
    console.log("Verifier:       ", verifier.address);
    console.log("AssetToken:     ", token.address);
    console.log("Registry:       ", registry.address);
    console.log("CrossChainBridge:", bridge.address);
    console.log("=========================================\n");

    const addresses = {
      verifier: verifier.address as string,
      token: token.address as string,
      registry: registry.address as string,
      bridge: bridge.address as string,
      timestamp: Date.now()
    };
   
    saveDeploymentAddresses(addresses);
    printSuccess("Deployment addresses saved!");

  } catch (error) {
    console.error("Deployment error:", error);
    process.exit(1);
  }
}

main().catch(console.error);