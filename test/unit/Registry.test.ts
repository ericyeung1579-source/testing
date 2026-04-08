/// <reference types="mocha" />
import { expect } from "chai";
import hre from "hardhat";

describe("PrivateAssetRegistry - Unit Tests", () => {
  it("Should register an asset", async () => {
    const { registry, owner } = await deployFixture();

    // Register asset
    const tx = await registry.registerAsset(1n, 456n);
    await tx.wait();

    // Read asset
    const asset = await registry.assets(1n);
    expect(asset.owner).to.equal(owner.address);
    expect(asset.assetId).to.equal(1n);
    expect(asset.commitment).to.equal(456n);
  });

  it("Should prevent duplicate registration", async () => {
    const { registry } = await deployFixture();

    await registry.registerAsset(1n, 456n);
    
    try {
      await registry.registerAsset(1n, 789n);
      expect.fail("Should have reverted");
    } catch (error: any) {
      expect(error.message).to.include("Already registered");
    }
  });
});

async function deployFixture() {
  const signers: any = await (hre as any).ethers.getSigners();
  const signer = signers[0];
 
  // Deploy Verifier (mock)
  const mockVerifier = "0x0000000000000000000000000000000000000000";
  const mockToken = "0x0000000000000000000000000000000000000001";
 
  // Deploy Registry
  const RegistryFactory = await (hre as any).ethers.getContractFactory("PrivateAssetRegistry");
  const registry = await RegistryFactory.deploy(mockVerifier, mockToken);
  await registry.waitForDeployment();
 
  return { registry, owner: signer };
}
