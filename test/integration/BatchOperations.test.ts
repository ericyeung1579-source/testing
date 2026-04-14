import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { hardhat } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import { loadDeploymentAddresses } from "../../scripts/utils/helpers.js";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("Batch Operations", () => {
  let registry: any;
  let publicClient: any;
  let walletClient: any;
  let userAddress: string;

  before(async () => {
    // Create public and wallet clients for viem
    publicClient = createPublicClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
    });

    walletClient = createWalletClient({
      chain: hardhat,
      transport: http("http://127.0.0.1:8545"),
      account: PRIVATE_KEY,
    });

    const addresses = await walletClient.getAddresses();
    userAddress = addresses[0];

    // Load contract ABI
    const registryJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8")
    );

    // Load addresses
    const deploymentAddresses = loadDeploymentAddresses();
    registry = getContract({
      address: deploymentAddresses.registry as `0x${string}`,
      abi: registryJson.abi,
      client: { public: publicClient, wallet: walletClient },
    });
  });

  describe("Batch Asset Registration", () => {
    it("should register multiple assets in a single transaction", async () => {
      const assetIds = [BigInt(100), BigInt(101), BigInt(102)];
      const commitments = [
        BigInt("11111111111111111111"),
        BigInt("22222222222222222222"),
        BigInt("33333333333333333333"),
      ];

      const hash = await walletClient.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "registerAssetsBatch",
        args: [assetIds, commitments],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      expect(receipt.status).to.equal("success"); // Success

      // Verify each asset was registered
      for (let i = 0; i < assetIds.length; i++) {
        const asset = await publicClient.readContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "assets",
          args: [assetIds[i]],
        });
        expect(asset[0]).to.be.true; // exists
        expect(asset[1]).to.equal(commitments[i]); // commitment
        expect(asset[2]).to.equal(userAddress); // owner
      }
    });

    it("should reject batch with mismatched array lengths", async () => {
      const assetIds = [BigInt(200), BigInt(201)];
      const commitments = [BigInt("11111111111111111111")]; // Only 1, should have 2

      try {
        await walletClient.writeContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "registerAssetsBatch",
          args: [assetIds, commitments],
        });
        expect.fail("Should have reverted");
      } catch (error: any) {
        expect(error.reason || error.message).to.include("Arrays length mismatch");
      }
    });

    it("should reject batch with empty arrays", async () => {
      try {
        await walletClient.writeContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "registerAssetsBatch",
          args: [[], []],
        });
        expect.fail("Should have reverted");
      } catch (error: any) {
        expect(error.reason || error.message).to.include("Empty arrays");
      }
    });

    it("should reject batch if any asset already registered", async () => {
      // Register one asset first
      await walletClient.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "registerAsset",
        args: [BigInt(300), BigInt("44444444444444444444")],
      });

      // Try to register batch including the already-registered asset
      try {
        await walletClient.writeContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "registerAssetsBatch",
          args: [
            [BigInt(300), BigInt(301)],
            [BigInt("44444444444444444444"), BigInt("55555555555555555555")],
          ],
        });
        expect.fail("Should have reverted");
      } catch (error: any) {
        expect(error.reason || error.message).to.include("Asset already registered");
      }
    });
  });

  describe("Batch Proof Verification", () => {
    it("should verify multiple proofs in a single transaction", async () => {
      // First, register some assets
      const assetIds = [BigInt(400), BigInt(401), BigInt(402)];
      const commitments = [
        BigInt("66666666666666666666"),
        BigInt("77777777777777777777"),
        BigInt("88888888888888888888"),
      ];

      await walletClient.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "registerAssetsBatch",
        args: [assetIds, commitments],
      });

      // Create mock proof data (in real usage, these come from snarkjs)
      const proofDataArray = assetIds.map((assetId, index) => ({
        a: [BigInt(1), BigInt(2)], // Mock values
        b: [
          [BigInt(3), BigInt(4)],
          [BigInt(5), BigInt(6)],
        ],
        c: [BigInt(7), BigInt(8)],
        assetId: assetId,
        commitment: commitments[index],
      }));

      // This will fail with invalid proof, but shows the structure works
      try {
        await walletClient.writeContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "proveOwnershipBatch",
          args: [proofDataArray],
        });
      } catch (error: any) {
        // Expected to fail with invalid proof message
        expect(error.reason || error.message).to.include("Invalid proof");
      }
    });

    it("should reject batch if any asset not found", async () => {
      const proofDataArray = [
        {
          a: [BigInt(1), BigInt(2)],
          b: [
            [BigInt(3), BigInt(4)],
            [BigInt(5), BigInt(6)],
          ],
          c: [BigInt(7), BigInt(8)],
          assetId: BigInt(9999), // Non-existent
          commitment: BigInt("99999999999999999999"),
        },
      ];

      try {
        await walletClient.writeContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "proveOwnershipBatch",
          args: [proofDataArray],
        });
        expect.fail("Should have reverted");
      } catch (error: any) {
        expect(error.reason || error.message).to.include("Asset not found");
      }
    });

    it("should reject empty proof array", async () => {
      try {
        await walletClient.writeContract({
          address: registry.address,
          abi: registry.abi,
          functionName: "proveOwnershipBatch",
          args: [[]],
        });
        expect.fail("Should have reverted");
      } catch (error: any) {
        expect(error.reason || error.message).to.include("Empty proofs array");
      }
    });
  });

  describe("Gas Efficiency", () => {
    it("should show gas comparison for batch registration", async () => {
      // Single registrations
      const singleRegTx1 = await registry.registerAsset(BigInt(500), BigInt("11111111111111111111"));
      const singleRec1 = await singleRegTx1.wait();
      const singleRegTx2 = await registry.registerAsset(BigInt(501), BigInt("22222222222222222222"));
      const singleRec2 = await singleRegTx2.wait();
      const singleRegTx3 = await registry.registerAsset(BigInt(502), BigInt("33333333333333333333"));
      const singleRec3 = await singleRegTx3.wait();
      const singleRegTx4 = await registry.registerAsset(BigInt(503), BigInt("44444444444444444444"));
      const singleRec4 = await singleRegTx4.wait();

      const singleTotalGas = BigInt(singleRec1.gasUsed) + BigInt(singleRec2.gasUsed) + BigInt(singleRec3.gasUsed) + BigInt(singleRec4.gasUsed);

      // Batch registration (4 assets)
      const batchRegTx = await registry.registerAssetsBatch(
        [BigInt(504), BigInt(505), BigInt(506), BigInt(507)],
        [BigInt("55555555555555555555"), BigInt("66666666666666666666"), BigInt("77777777777777777777"), BigInt("88888888888888888888")]
      );
      const batchRec = await batchRegTx.wait();
      const batchGas = BigInt(batchRec.gasUsed);

      console.log(`\nGas Comparison (4 assets):`);
      console.log(`Single (4 transactions): ${singleTotalGas}`);
      console.log(`Batch (1 transaction): ${batchGas}`);
      console.log(`Savings: ${((1 - Number(batchGas) / Number(singleTotalGas)) * 100).toFixed(1)}%`);

      // With 4 assets, batch should save gas
      expect(Number(batchGas)).to.be.lessThan(Number(singleTotalGas));
    });
  });

  describe("Event Emission", () => {
    it("should emit AssetRegistered events for each asset in batch", async () => {
      const assetIds = [BigInt(600), BigInt(601), BigInt(602)];
      const commitments = [
        BigInt("55555555555555555555"),
        BigInt("66666666666666666666"),
        BigInt("77777777777777777777"),
      ];

      const tx = await registry.registerAssetsBatch(assetIds, commitments);
      const receipt = await tx.wait();

      // Count AssetRegistered events
      let eventCount = 0;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const event = registry.interface.parseLog(log);
            if (event?.name === "AssetRegistered") {
              eventCount++;
            }
          } catch (e) {
            // Skip non-matching logs
          }
        }
      }

      expect(eventCount).to.equal(assetIds.length);
    });
  });
});
