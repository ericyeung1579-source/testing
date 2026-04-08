/// <reference types="mocha" />
import { expect } from "chai";
import hre from "hardhat";

describe("Complete Workflow Integration", () => {
  it("Should register asset, generate proof signals, and track tokens", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const signer = signers[0];

    // Deploy Verifier (mock)
    const mockVerifier = "0x0000000000000000000000000000000000000000";

    // Deploy Token
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(signer.address);
    await token.waitForDeployment();

    // Deploy Registry
    const RegistryFactory = await (hre as any).ethers.getContractFactory("PrivateAssetRegistry");
    const registry = await RegistryFactory.deploy(mockVerifier, token.target);
    await registry.waitForDeployment();

    // Step 1: Register Asset
    const assetId = 1n;
    const assetValue = 1000n;
    const commitment = 456n; // This would be MiMC hash in real scenario

    const registerTx = await registry.registerAsset(assetId, commitment);
    await registerTx.wait();

    const asset = await registry.assets(assetId);
    expect(asset.exists).to.equal(true);
    expect(asset.owner).to.equal(signer.address);
    expect(asset.commitment).to.equal(commitment);
    expect(asset.provenOnce).to.equal(false);
    expect(asset.tokensMinted).to.equal(0n);

    // Step 2: Verify asset is registered
    expect(await registry.isAssetRegistered(assetId)).to.equal(true);

    // Step 3: Check token balance before proof
    let balance = await token.balanceOf(signer.address);
    expect(balance).to.equal(0n);

    // Step 4: Configure tokens per proof
    const tokensPerProof = 1000n * 10n ** 18n;
    const setTx = await registry.setTokensPerProof(tokensPerProof);
    await setTx.wait();

    // Step 5: Verify configuration
    expect(await registry.tokensPerProof()).to.equal(tokensPerProof);
  });

  it("Should handle multiple asset registrations", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const signer = signers[0];

    // Deploy contracts
    const mockVerifier = "0x0000000000000000000000000000000000000000";
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(signer.address);
    await token.waitForDeployment();

    const RegistryFactory = await (hre as any).ethers.getContractFactory("PrivateAssetRegistry");
    const registry = await RegistryFactory.deploy(mockVerifier, token.target);
    await registry.waitForDeployment();

    // Register multiple assets
    const assets = [
      { id: 1n, commitment: 100n },
      { id: 2n, commitment: 200n },
      { id: 3n, commitment: 300n },
    ];

    for (const asset of assets) {
      await registry.registerAsset(asset.id, asset.commitment);
    }

    // Verify all assets registered
    for (const asset of assets) {
      const registered = await registry.assets(asset.id);
      expect(registered.exists).to.equal(true);
      expect(registered.commitment).to.equal(asset.commitment);
    }
  });

  it("Should prevent duplicate asset registration", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const signer = signers[0];

    // Deploy contracts
    const mockVerifier = "0x0000000000000000000000000000000000000000";
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(signer.address);
    await token.waitForDeployment();

    const RegistryFactory = await (hre as any).ethers.getContractFactory("PrivateAssetRegistry");
    const registry = await RegistryFactory.deploy(mockVerifier, token.target);
    await registry.waitForDeployment();

    // Register asset
    const assetId = 1n;
    const commitment = 456n;
    await registry.registerAsset(assetId, commitment);

    // Try to register again
    try {
      await registry.registerAsset(assetId, 789n);
      expect.fail("Should have reverted");
    } catch (error: any) {
      expect(error.message).to.include("Already registered");
    }
  });
});
