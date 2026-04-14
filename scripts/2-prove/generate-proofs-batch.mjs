#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateProofs() {
  try {
    // Read batch assets configuration
    const batchConfigPath = path.join(process.cwd(), "data", "batch-assets.json");

    if (!fs.existsSync(batchConfigPath)) {
      console.error("data/batch-assets.json not found");
      console.log("\nCreate a data/batch-assets.json file with the following format:");
      console.log(
        JSON.stringify(
          {
            assets: [
              {
                assetId: "42",
                secret: "123456789",
              },
              {
                assetId: "43",
                secret: "987654321",
              },
            ],
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const batchConfig = JSON.parse(fs.readFileSync(batchConfigPath, "utf-8"));
    const assets = batchConfig.assets;

    if (!assets || assets.length === 0) {
      console.error("No assets in batch-assets.json");
      process.exit(1);
    }

    console.log(`\n📋 Generating proofs for ${assets.length} assets...\n`);

    // Build Poseidon hasher
    const poseidon = await buildPoseidon();

    // Create output directory for batch proofs
    const outputDir = path.join(process.cwd(), "circuits", "batch-proofs");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const proofs = [];
    const publics = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      console.log(
        `[${i + 1}/${assets.length}] Generating proof for Asset ID: ${asset.assetId}`
      );

      try {
        // Calculate Poseidon commitment
        const commitment = poseidon.F.toString(
          poseidon([BigInt(asset.secret), BigInt(asset.assetId)])
        );

        // Create input.json
        const inputJson = {
          secret: asset.secret,
          assetId: asset.assetId,
          commitment: commitment,
          ownerPublicKey: "1",
        };

        const circuitPath = path.join(process.cwd(), "circuits", "AssetOwnership_js");
        const inputPath = path.join(circuitPath, "input.json");
        fs.writeFileSync(inputPath, JSON.stringify(inputJson));

        // Generate witness
        execSync(
          `snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns`,
          {
            cwd: circuitPath,
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        // Generate proof
        execSync(
          `snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json`,
          {
            cwd: circuitPath,
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        // Read generated proof and public signals
        const proofPath = path.join(circuitPath, "proof.json");
        const publicPath = path.join(circuitPath, "public.json");

        if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
          throw new Error("Proof or public signals file not created");
        }

        const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
        const pub = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

        proofs.push({
          assetId: asset.assetId,
          proof: proof,
        });

        publics.push({
          assetId: asset.assetId,
          public: pub,
        });

        console.log(`   ✓ Commitment: ${commitment}`);
      } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
        process.exit(1);
      }
    }

    // Save batch proofs to file
    const batchProofsPath = path.join(outputDir, "batch-proofs.json");
    fs.writeFileSync(batchProofsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      assetCount: assets.length,
      proofs: proofs,
    }, null, 2));

    const batchPublicsPath = path.join(outputDir, "batch-public.json");
    fs.writeFileSync(batchPublicsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      assetCount: assets.length,
      publics: publics,
    }, null, 2));

    console.log(`\n✅ All proofs generated successfully!`);
    console.log(`   Proofs saved to: ${batchProofsPath}`);
    console.log(`   Public signals saved to: ${batchPublicsPath}`);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

generateProofs().catch(console.error);
