/// <reference types="mocha" />
import { expect } from "chai";
import hre from "hardhat";

describe("Asset Tokenization Integration", () => {
  it("Should register an asset and track it", async () => {
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

    // Register asset
    const assetId = 1n;
    const commitment = 456n;
    
    await registry.registerAsset(assetId, commitment);
    
    const asset = await registry.assets(assetId);
    expect(asset.assetId).to.equal(assetId);
    expect(asset.commitment).to.equal(commitment);
    expect(asset.owner).to.equal(signer.address);
    expect(asset.exists).to.equal(true);
  });
});
