import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying to Chain A (source) with account:", deployer.address);

  // Deploy AssetToken
  const AssetToken = await hre.ethers.getContractFactory("AssetToken");
  const token = await AssetToken.deploy("0x0000000000000000000000000000000000000000");
  await token.deployed();
  console.log("AssetToken on Chain A:", token.address);

  // Deploy Verifier (assuming you have Groth16Verifier contract)
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log("Verifier on Chain A:", verifier.address);

  // Deploy PrivateAssetRegistry
  const Registry = await hre.ethers.getContractFactory("PrivateAssetRegistry");
  const registry = await Registry.deploy(verifier.address, token.address);
  await registry.deployed();
  console.log("PrivateAssetRegistry on Chain A:", registry.address);

  // Set registry in token
  await token.setRegistry(registry.address);
  console.log("AssetToken registry set to PrivateAssetRegistry");

  // Deploy SourceLock
  const SourceLock = await hre.ethers.getContractFactory("SourceLock");
  const sourceLock = await SourceLock.deploy(token.address);
  await sourceLock.deployed();
  console.log("SourceLock on Chain A:", sourceLock.address);

  // Save addresses to a file specific to chainA
  const addresses = {
    token: token.address,
    verifier: verifier.address,
    registry: registry.address,
    sourceLock: sourceLock.address,
    chain: "chainA",
    timestamp: Date.now()
  };
  fs.writeFileSync("deployment-chainA.json", JSON.stringify(addresses, null, 2));
  console.log("Addresses saved to deployment-chainA.json");
}

main().catch(console.error);