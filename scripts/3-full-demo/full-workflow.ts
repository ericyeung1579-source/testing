import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { loadDeploymentAddresses, formatTokenAmount, printHeader, printSuccess } from "../utils/helpers.js";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

async function runCommand(command: string, args: string[] = [], cwd: string = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd, shell: true, stdio: "inherit" });
    process.on("close", (code) => {
      if (code !== 0) reject(new Error(`Command failed: ${command} ${args.join(" ")}`));
      else resolve("done");
    });
  });
}

async function main() {
  try {
    printHeader("ZK ASSET REGISTRY - FULL WORKFLOW DEMO");

    // Step 1: Deploy Contracts
    console.log("\n📦 STEP 1: Deploying Contracts...");
    console.log("-".repeat(60));
    await runCommand("npx hardhat run scripts/1-setup/deploy-contracts.ts --network localhost");

    // Read deployed addresses
    const addresses = loadDeploymentAddresses();
    console.log("\n✓ Contracts deployed:");
    console.log(`  Verifier:  ${addresses.verifier}`);
    console.log(`  Token:     ${addresses.token}`);
    console.log(`  Registry:  ${addresses.registry}`);

    // Step 2: Generate Proof (must be before registration)
    console.log("\n\n🔐 STEP 2: Generating ZK Proof...");
    console.log("-".repeat(60));
    await runCommand("powershell.exe", ["scripts/2-prove/generate_proof.ps1", "42", "123456789"]);

    // Step 3: Register Asset
    console.log("\n\n📝 STEP 3: Registering Asset...");
    console.log("-".repeat(60));
    await runCommand("npx hardhat run scripts/2-prove/register-asset.ts --network localhost");

    // Step 4: Prove Ownership
    console.log("\n\n✅ STEP 4: Proving Ownership & Minting Tokens...");
    console.log("-".repeat(60));
    await runCommand("npx hardhat run scripts/2-prove/prove-ownership.ts --network localhost");

    // Step 5: Show Results
    console.log("\n\n📊 STEP 5: Checking Results...");
    console.log("-".repeat(60));
    
    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
    });

    const walletClient = createWalletClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
      account,
    });
    
    const tokenJson = JSON.parse(fs.readFileSync("artifacts/contracts/AssetToken.sol/AssetToken.json", "utf-8"));
    const token = getContract({
      address: addresses.token as `0x${string}`,
      abi: tokenJson.abi,
      client: { public: publicClient, wallet: walletClient },
    });
    
    const userAddress = account.address;
    const balance = (await publicClient.readContract({
      address: addresses.token as `0x${string}`,
      abi: tokenJson.abi,
      functionName: "balanceOf",
      args: [userAddress],
    })) as bigint;
    const formattedBalance = formatTokenAmount(balance);
    console.log(`\nUser balance: ${formattedBalance} ASSET tokens`);
    printSuccess("Tokens successfully minted!");

    console.log("\n" + "=".repeat(60));
    console.log("              ✨ WORKFLOW COMPLETE ✨");
    console.log("=".repeat(60) + "\n");
    console.log("Summary:");
    console.log("  ✓ Compiled circuit");
    console.log("  ✓ Generated proof keys");
    console.log("  ✓ Deployed contracts");
    console.log("  ✓ Registered asset");
    console.log("  ✓ Generated ZK proof");
    console.log("  ✓ Verified proof on-chain");
    console.log("  ✓ Minted reward tokens");
    console.log("\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
