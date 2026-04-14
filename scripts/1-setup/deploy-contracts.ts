import { createPublicClient, createWalletClient, http, parseAbi, encodeDeployData, decodeEventLog } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { saveDeploymentAddresses, printHeader, printStep, printSuccess } from "../utils/helpers.js";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);
const RPC_URL = "http://127.0.0.1:8545";

async function deployContract(
  walletClient: any,
  publicClient: any,
  abi: any[],
  bytecode: `0x${string}`,
  args: any[] = []
): Promise<`0x${string}`> {
  const hash = await walletClient.deployContract({ abi, bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Deployment failed: no contract address in receipt");
  return receipt.contractAddress;
}

async function main() {
  try {
    printHeader("DEPLOYMENT: Contracts Setup");

    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http(RPC_URL),
    });

    const walletClient = createWalletClient({
      chain: hardhat,
      transport: http(RPC_URL),
      account,
    });

    const deployer = account.address;
    console.log("Deploying with:", deployer);

    // Read ABI and bytecode files
    const verifierJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/Verifier.sol/Groth16Verifier.json"), "utf-8"));
    const registryJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));
    const tokenJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/AssetToken.sol/AssetToken.json"), "utf-8"));

    printStep(1, "Deploying Verifier");
    const verifierAddress = await deployContract(walletClient, publicClient, verifierJson.abi, verifierJson.bytecode);
    printSuccess(`Verifier deployed at ${verifierAddress}`);

    printStep(2, "Deploying AssetToken");
    const tokenAddress = await deployContract(walletClient, publicClient, tokenJson.abi, tokenJson.bytecode, ["0x0000000000000000000000000000000000000000"]);
    printSuccess(`AssetToken deployed at ${tokenAddress}`);

    printStep(3, "Deploying PrivateAssetRegistry");
    const registryAddress = await deployContract(walletClient, publicClient, registryJson.abi, registryJson.bytecode, [verifierAddress, tokenAddress]);
    printSuccess(`PrivateAssetRegistry deployed at ${registryAddress}`);

    printStep(4, "Initializing AssetToken registry link");
    const setRegistryHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: tokenJson.abi,
      functionName: "setRegistry",
      args: [registryAddress],
    });
    await publicClient.waitForTransactionReceipt({ hash: setRegistryHash });
    printSuccess("AssetToken registry set");

    console.log("\n========== Deployment Summary ==========");
    console.log("Verifier:           ", verifierAddress);
    console.log("AssetToken:         ", tokenAddress);
    console.log("Registry:           ", registryAddress);
    console.log("=========================================\n");

    const addresses = {
      verifier: verifierAddress,
      token: tokenAddress,
      registry: registryAddress,
      timestamp: Date.now(),
    };

    saveDeploymentAddresses(addresses);
    printSuccess("Deployment addresses saved to deployment-addresses.json");
  } catch (error) {
    console.error("Deployment error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
