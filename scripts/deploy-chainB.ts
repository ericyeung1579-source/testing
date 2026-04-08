import hre from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying to Chain B (destination) with account:", deployer.address);

  // Deploy AssetToken (separate instance on Chain B)
  const AssetToken = await hre.ethers.getContractFactory("AssetToken");
  const tokenB = await AssetToken.deploy("0x0000000000000000000000000000000000000000");
  await tokenB.deployed();
  console.log("AssetToken on Chain B:", tokenB.address);

  // Validator addresses (use first 3 Hardhat accounts)
  const validators = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // account #0
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // account #1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // account #2
  ];
  const threshold = 2;

  // Deploy DestMint
  const DestMint = await hre.ethers.getContractFactory("DestMint");
  const destMint = await DestMint.deploy(tokenB.address, validators, threshold);
  await destMint.deployed();
  console.log("DestMint on Chain B:", destMint.address);

  // Set DestMint as the minter (registry) for AssetToken on Chain B
  await tokenB.setRegistry(destMint.address);
  console.log("DestMint is now the minter on Chain B");

  // Save addresses
  const addresses = {
    token: tokenB.address,
    destMint: destMint.address,
    chain: "chainB",
    timestamp: Date.now()
  };
  fs.writeFileSync("deployment-chainB.json", JSON.stringify(addresses, null, 2));
  console.log("Addresses saved to deployment-chainB.json");
}

main().catch(console.error);