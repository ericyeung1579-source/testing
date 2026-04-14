#!/usr/bin/env node
/**
 * Generate valid test input with Poseidon commitment
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateTestInput() {
  try {
    console.log("🔐 Calculating Poseidon commitment...\n");

    // Build Poseidon
    const poseidon = await buildPoseidon();
    
    const secret = BigInt(123456789);
    const assetId = BigInt(1000);
    
    // Calculate Poseidon(secret, assetId)
    const commitment = poseidon.F.toString(poseidon([secret, assetId]));

    console.log("Secret:      ", secret.toString());
    console.log("Asset ID:    ", assetId.toString());
    console.log("Commitment:  ", commitment);

    const testInput = {
      secret: secret.toString(),
      assetId: assetId.toString(),
      commitment: commitment,
      ownerPublicKey: "1"
    };

    // Save test input to both locations
    const circuitPath = path.join(process.cwd(), "circuits", "AssetOwnership_js");
    const inputPath = path.join(circuitPath, "test_input.json");
    
    fs.writeFileSync(inputPath, JSON.stringify(testInput, null, 2));
    console.log("\n✅ Saved to:", inputPath);
    console.log("\n" + JSON.stringify(testInput, null, 2));

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

generateTestInput();
