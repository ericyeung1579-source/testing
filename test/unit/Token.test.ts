/// <reference types="mocha" />
import { expect } from "chai";
import hre from "hardhat";

describe("AssetToken - Unit Tests", () => {
  it("Should initialize with correct name, symbol, and decimals", async () => {
    const { token } = await deployFixture();

    expect(await token.name()).to.equal("AssetToken");
    expect(await token.symbol()).to.equal("ASSET");
    expect(await token.decimals()).to.equal(18n);
  });

  it("Should restrict minting to registry only", async () => {
    const { token, owner, other } = await deployFixture();

    try {
      await token.connect(other).mint(other.address, hre.ethers.parseEther("100"));
      expect.fail("Should have reverted");
    } catch (error: any) {
      expect(error.message).to.include("Only registry");
    }
  });

  it("Should restrict burning to registry only", async () => {
    const { token, owner, other } = await deployFixture();

    try {
      await token.connect(other).burn(other.address, hre.ethers.parseEther("100"));
      expect.fail("Should have reverted");
    } catch (error: any) {
      expect(error.message).to.include("Only registry");
    }
  });
});

async function deployFixture() {
  const signers: any = await (hre as any).ethers.getSigners();
  const owner = signers[0];
  const other = signers[1];

  const TokenFactory = await (hre as any).ethers.getContractFactory("AssetToken");
  const token = await TokenFactory.deploy(owner.address);
  await token.waitForDeployment();

  return { token, owner, other };
}
