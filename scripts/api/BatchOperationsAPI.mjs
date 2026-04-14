/**
 * Batch Operations API Service
 * 
 * Provides flexible API for frontend to:
 * - Register multiple assets
 * - Generate proofs
 * - Verify and mint tokens
 * - Monitor status
 * 
 * No hardcoding - all parameters come from frontend
 */

import { createPublicClient, createWalletClient, http, getContract, parseAbi } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardhat default account private key
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);

// Configuration from environment or defaults
const CONFIG = {
  PROVIDER_URL: process.env.PROVIDER_URL || "http://127.0.0.1:8545",
  REGISTRY_ADDRESS: process.env.REGISTRY_ADDRESS || "", // Will be loaded from deployment
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(process.cwd(), "circuits/batch-proofs"),
  CIRCUIT_PATH: process.env.CIRCUIT_PATH || path.join(process.cwd(), "circuits/AssetOwnership_js"),
};

class BatchOperationsAPI {
  constructor() {
    this.publicClient = null;
    this.walletClient = null;
    this.registry = null;
  }

  /**
   * Initialize the API with provider and contracts
   */
  async initialize() {
    try {
      // Create public and wallet clients for viem
      const publicClient = createPublicClient({
        chain: hardhat,
        transport: http(CONFIG.PROVIDER_URL),
      });

      const walletClient = createWalletClient({
        chain: hardhat,
        transport: http(CONFIG.PROVIDER_URL),
        account,
      });

      this.publicClient = publicClient;
      this.walletClient = walletClient;

      // Load registry address and ABI
      const addresses = this.loadDeploymentAddresses();
      const registryJson = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"),
          "utf-8"
        )
      );

      this.registry = getContract({
        address: addresses.registry,
        abi: registryJson.abi,
        client: { public: publicClient, wallet: walletClient },
      });

      const [address] = await walletClient.getAddresses();

      return {
        status: "initialized",
        address: address,
        registryAddress: addresses.registry,
      };
    } catch (error) {
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * Load deployment addresses from file
   */
  loadDeploymentAddresses() {
    const filePath = path.join(process.cwd(), "deployment-addresses.json");
    if (!fs.existsSync(filePath)) {
      throw new Error("deployment-addresses.json not found");
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  /**
   * Register multiple assets
   * 
   * @param {Array} assets - Array of {assetId, secret}
   * @returns {Object} Transaction result with status
   */
  async registerAssets(assets) {
    if (!Array.isArray(assets) || assets.length === 0) {
      throw new Error("Assets must be a non-empty array");
    }

    try {
      const assetIds = assets.map(a => BigInt(a.assetId));
      const commitments = assets.map(a => this.calculateCommitment(a.secret, a.assetId));

      console.log(`Registering ${assets.length} assets...`);

      const hash = await this.walletClient.writeContract({
        address: this.registry.address,
        abi: this.registry.abi,
        functionName: "registerAssetsBatch",
        args: [assetIds, commitments],
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      return {
        status: "success",
        action: "register",
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        assetsRegistered: assets.length,
        gasUsed: receipt.gasUsed.toString(),
        assets: assets.map((a, i) => ({
          assetId: a.assetId,
          commitment: commitments[i].toString(),
        })),
      };
    } catch (error) {
      return {
        status: "error",
        action: "register",
        error: error.reason || error.message,
      };
    }
  }

  /**
   * Generate proofs for multiple assets
   * 
   * @param {Array} assets - Array of {assetId, secret}
   * @returns {Object} Generation status and proof file locations
   */
  async generateProofs(assets) {
    if (!Array.isArray(assets) || assets.length === 0) {
      throw new Error("Assets must be a non-empty array");
    }

    try {
      // Ensure output directory exists
      if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
      }

      const proofs = [];
      const publics = [];
      const details = [];

      console.log(`Generating proofs for ${assets.length} assets...`);

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        console.log(`[${i + 1}/${assets.length}] Asset ${asset.assetId}`);

        try {
          // Calculate commitment
          const commitment = this.calculateCommitment(asset.secret, asset.assetId);

          // Create input.json
          const inputJson = {
            secret: asset.secret,
            assetId: asset.assetId,
            commitment: commitment.toString(),
            ownerPublicKey: "1",
          };

          const inputPath = path.join(CONFIG.CIRCUIT_PATH, "input.json");
          fs.writeFileSync(inputPath, JSON.stringify(inputJson));

          // Generate witness
          execSync(
            "snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns",
            { cwd: CONFIG.CIRCUIT_PATH, stdio: ["pipe", "pipe", "pipe"] }
          );

          // Generate proof
          execSync(
            "snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json",
            { cwd: CONFIG.CIRCUIT_PATH, stdio: ["pipe", "pipe", "pipe"] }
          );

          // Read generated files
          const proofPath = path.join(CONFIG.CIRCUIT_PATH, "proof.json");
          const publicPath = path.join(CONFIG.CIRCUIT_PATH, "public.json");

          if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
            throw new Error("Proof files not created");
          }

          const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
          const pub = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

          proofs.push({ assetId: asset.assetId, proof });
          publics.push({ assetId: asset.assetId, public: pub });
          details.push({
            assetId: asset.assetId,
            commitment: commitment.toString(),
            status: "generated",
          });

        } catch (error) {
          details.push({
            assetId: asset.assetId,
            status: "error",
            error: error.message,
          });
          throw error;
        }
      }

      // Save batch files
      const timestamp = new Date().toISOString();
      const batchProofsPath = path.join(CONFIG.OUTPUT_DIR, "batch-proofs.json");
      const batchPublicsPath = path.join(CONFIG.OUTPUT_DIR, "batch-public.json");

      fs.writeFileSync(
        batchProofsPath,
        JSON.stringify({ timestamp, assetCount: assets.length, proofs }, null, 2)
      );

      fs.writeFileSync(
        batchPublicsPath,
        JSON.stringify({ timestamp, assetCount: assets.length, publics }, null, 2)
      );

      return {
        status: "success",
        action: "generate",
        proofsGenerated: assets.length,
        proofFile: batchProofsPath,
        publicFile: batchPublicsPath,
        details,
      };
    } catch (error) {
      return {
        status: "error",
        action: "generate",
        error: error.message,
        details,
      };
    }
  }

  /**
   * Submit and verify proofs
   * 
   * @param {string} proofFile - Path to batch-proofs.json
   * @param {string} publicFile - Path to batch-public.json
   * @returns {Object} Verification result
   */
  async submitProofs(proofFile, publicFile) {
    try {
      // Use provided paths or defaults
      const proofPath = proofFile || path.join(CONFIG.OUTPUT_DIR, "batch-proofs.json");
      const publicPath = publicFile || path.join(CONFIG.OUTPUT_DIR, "batch-public.json");

      if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
        throw new Error("Proof files not found. Generate proofs first.");
      }

      const batchProofs = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      const batchPublics = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

      console.log(`Submitting ${batchProofs.assetCount} proofs...`);

      // Build proof data array
      const proofDataArray = batchProofs.proofs.map((proofData, index) => {
        const proof = proofData.proof;
        const pub = batchPublics.publics[index].public;

        return {
          a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
          b: [
            [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
            [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
          ],
          c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
          assetId: BigInt(proofData.assetId),
          commitment: BigInt(pub[1]),
        };
      });

      // Submit to blockchain
      const hash = await this.walletClient.writeContract({
        address: this.registry.address,
        abi: this.registry.abi,
        functionName: "proveOwnershipBatch",
        args: [proofDataArray],
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      // Parse Transfer events from logs
      let tokensMinted = BigInt(0);
      for (const log of receipt.logs) {
        // Check for Transfer event (0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef)
        if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
          // This is a Transfer event, check if it's a mint (from = zero address)
          const fromTopic = log.topics[1];
          if (fromTopic && fromTopic.endsWith("0000000000000000000000000000000000000000")) {
            // Extract amount from data (last 32 bytes)
            tokensMinted = BigInt(log.data);
          }
        }
      }

      return {
        status: "success",
        action: "submit",
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        proofsVerified: batchProofs.assetCount,
        tokensMinted: (tokensMinted / BigInt(10) ** BigInt(18)).toString(),
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      return {
        status: "error",
        action: "submit",
        error: error.reason || error.message,
      };
    }
  }

  /**
   * Calculate commitment hash
   */
  calculateCommitment(secret, assetId) {
    // This should match the contract's commitment calculation
    // Using simple hash for now - adjust to match your actual implementation
    return BigInt(secret) * BigInt(assetId);
  }
}

export default BatchOperationsAPI;
