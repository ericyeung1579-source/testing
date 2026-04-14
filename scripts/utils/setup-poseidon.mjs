#!/usr/bin/env node
/**
 * Regenerate Trusted Setup for Poseidon Circuit
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitPath = path.join(process.cwd(), "circuits");

async function setupTrustedSetup() {
  try {
    console.log("🔐 Setting up Poseidon Trusted Setup...\n");

    // Check if r1cs exists
    const r1csPath = path.join(circuitPath, "AssetOwnership.r1cs");
    if (!fs.existsSync(r1csPath)) {
      console.error("❌ AssetOwnership.r1cs not found");
      process.exit(1);
    }
    console.log("✅ Found R1CS file");

    // Check for ptau file
    let ptauPath = path.join(process.cwd(), "pot12_final.ptau");
    
    if (!fs.existsSync(ptauPath)) {
      console.log("\n⚠️  Powers of tau file not found locally");
      console.log("📥 Downloading pot12_final.ptau (200MB)...");
      
      try {
        execSync(
          `curl -o ${ptauPath} https://hermez.s3-eu-west-1.amazonaws.com/pot12_final.ptau`,
          { stdio: "inherit", timeout: 600000 }
        );
        console.log("✅ Downloaded");
      } catch (e) {
        console.error("❌ Failed to download ptau file");
        console.log("Please manually download from: https://hermez.s3-eu-west-1.amazonaws.com/pot12_final.ptau");
        process.exit(1);
      }
    } else {
      console.log("✅ Found pot12_final.ptau file");
    }

    // Generate zkey files
    console.log("\n🔧 Generating Groth16 setup...");
    
    execSync(
      `snarkjs groth16 setup ${r1csPath} ${ptauPath} ${path.join(circuitPath, "AssetOwnership_0000.zkey")}`,
      { stdio: "inherit" }
    );
    console.log("✅ Generated 0000.zkey");

    console.log("\n🔧 Contributing to zkey...");
    execSync(
      `snarkjs zkey contribute ${path.join(circuitPath, "AssetOwnership_0000.zkey")} ${path.join(circuitPath, "AssetOwnership_0001.zkey")} --name="poseidon" -v`,
      { stdio: "inherit" }
    );
    console.log("✅ Generated 0001.zkey");

    console.log("\n🔧 Exporting verification key...");
    execSync(
      `snarkjs zkey export verificationkey ${path.join(circuitPath, "AssetOwnership_0001.zkey")} ${path.join(circuitPath, "verification_key.json")}`,
      { stdio: "inherit" }
    );
    console.log("✅ Exported verification_key.json");

    console.log("\n🔧 Exporting Solidity verifier...");
    execSync(
      `snarkjs zkey export solidityverifier ${path.join(circuitPath, "AssetOwnership_0001.zkey")} ${path.join(process.cwd(), "contracts", "Verifier.sol")}`,
      { stdio: "inherit" }
    );
    console.log("✅ Exported Verifier.sol");

    console.log("\n" + "=".repeat(70));
    console.log("✅ Trusted setup complete!");
    console.log("=".repeat(70) + "\n");

  } catch (err) {
    console.error("❌ Setup failed:", err.message);
    process.exit(1);
  }
}

setupTrustedSetup();
