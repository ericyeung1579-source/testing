import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { loadDeploymentAddresses, formatTokenAmount, printHeader, printSuccess } from "../utils/helpers";

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
    console.log(`  Verifier:       ${addresses.verifier}`);
    console.log(`  Token:          ${addresses.token}`);
    console.log(`  Registry:       ${addresses.registry}`);
    console.log(`  Bridge:         ${addresses.bridge}`);

    // Step 2: Generate Proof
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
    
    const [signer] = await hre.ethers.getSigners();
    
    const tokenJson = JSON.parse(fs.readFileSync("artifacts/contracts/AssetToken.sol/AssetToken.json", "utf-8"));
    const token = new hre.ethers.Contract(addresses.token, tokenJson.abi, signer);
    
    const balance = await token.balanceOf(await signer.getAddress());
    const formattedBalance = formatTokenAmount(balance);
    console.log(`\nUser balance: ${formattedBalance} ASSET tokens`);
    printSuccess("Tokens successfully minted!");

    // ====================== STEP 6: CROSS-CHAIN BRIDGE DEMO ======================
    console.log("\n\n🌉 STEP 6: Cross-chain Bridge Demo (Lock + Claim)...");
    console.log("-".repeat(60));

    const bridgeJson = JSON.parse(fs.readFileSync("artifacts/contracts/CrossChainBridge.sol/CrossChainBridge.json", "utf-8"));
    const bridge = new hre.ethers.Contract(addresses.bridge, bridgeJson.abi, signer);

    const bridgeAmount = 500n * 10n ** 18n; // 500 ASSET in wei (assuming 18 decimals);

    console.log(`Locking ${formatTokenAmount(bridgeAmount)} ASSET for cross-chain...`);

    const approveTx = await token.approve(addresses.bridge, bridgeAmount);
    await approveTx.wait();

    const lockTx = await bridge.lockTokens(bridgeAmount, 137, await signer.getAddress());
    await lockTx.wait();
    printSuccess("Tokens locked on source chain!");

    const claimTx = await bridge.claimTokens(bridgeAmount);
    await claimTx.wait();
    printSuccess("Tokens claimed on destination! (demo simulation)");

    const finalBalance = await token.balanceOf(await signer.getAddress());
    console.log(`\nFinal user balance after bridge demo: ${formatTokenAmount(finalBalance)} ASSET`);

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
    console.log("  ✓ Locked & claimed via CrossChainBridge (demo)");
    console.log("\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);