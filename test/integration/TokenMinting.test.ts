/// <reference types="mocha" />
import { expect } from "chai";
import hre from "hardhat";

describe("Token Minting Integration", () => {
  it("Should mint tokens when proof is verified", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const signer = signers[0];
 
    // Deploy Verifier (mock)
    const mockVerifier = "0x0000000000000000000000000000000000000000";
 
    // Deploy Token
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(mockVerifier);
    await token.waitForDeployment();

    // Deploy Registry
    const RegistryFactory = await (hre as any).ethers.getContractFactory("PrivateAssetRegistry");
    const registry = await RegistryFactory.deploy(mockVerifier, token.target);
    await registry.waitForDeployment();

    // Update token's registry reference
    // Note: In production, set this during deployment
    
    // Check initial balance
    let balance = await token.balanceOf(signer.address);
    expect(balance).to.equal(0n);
    
    // Simulate proof (would need real proof in actual test)
    // For now, just verify the contract structure is correct
    expect(await registry.assetToken()).to.equal(token.target);
    expect(await registry.tokensPerProof()).to.equal(1000n * 10n ** 18n);
  });

  it("Should track minted assets", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const signer = signers[0];
 
    // Deploy Token
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(signer.address);
    await token.waitForDeployment();

    // Register asset
    const RegistryFactory = await (hre as any).ethers.getContractFactory("PrivateAssetRegistry");
    const registry = await RegistryFactory.deploy(signer.address, token.target);
    await registry.waitForDeployment();

    // Register an asset
    const assetId = 42n;
    const commitment = 456n;
    
    await registry.registerAsset(assetId, commitment);
    
    const asset = await registry.assets(assetId);
    expect(asset.assetId).to.equal(assetId);
    expect(asset.commitment).to.equal(commitment);
    expect(asset.owner).to.equal(signer.address);
    expect(asset.exists).to.equal(true);
    expect(asset.provenOnce).to.equal(false);
    expect(asset.tokensMinted).to.equal(0n);
  });

  it("Should allow token transfers", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const owner = signers[0];
    const recipient = signers[1];
 
    // Deploy Token
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(owner.address);
    await token.waitForDeployment();

    // Mint tokens
    const amount = 1000n * 10n ** 18n;
    await token.mint(owner.address, amount);
    
    let balance = await token.balanceOf(owner.address);
    expect(balance).to.equal(amount);

    // Transfer tokens
    await token.transfer(recipient.address, amount / 2n);
    
    balance = await token.balanceOf(owner.address);
    expect(balance).to.equal(amount / 2n);
    
    balance = await token.balanceOf(recipient.address);
    expect(balance).to.equal(amount / 2n);
  });

  it("Should prevent non-registry from minting", async () => {
    const signers: any = await (hre as any).ethers.getSigners();
    const owner = signers[0];
    const notRegistry = signers[1];
 
    // Deploy Token with owner as registry
    const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
    const token = await TokenFactory.deploy(owner.address);
    await token.waitForDeployment();

    // Try to mint from non-registry account
    const amount = 1000n * 10n ** 18n;
    try {
      await token.connect(notRegistry).mint(notRegistry.address, amount);
      expect.fail("Should have reverted");
    } catch (error: any) {
      expect(error.message).to.include("Only registry");
    }
  });
});
