import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load deployed addresses
  const chainA = JSON.parse(fs.readFileSync("deployment-chainA.json", "utf-8"));
  const chainB = JSON.parse(fs.readFileSync("deployment-chainB.json", "utf-8"));

  // Connect to Chain A (source)
  const providerA = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  const signerA = providerA.getSigner(0);

  // Load full ABIs from artifacts
  const tokenABI = JSON.parse(fs.readFileSync("artifacts/contracts/AssetToken.sol/AssetToken.json", "utf-8")).abi;
  const registryABI = JSON.parse(fs.readFileSync("artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json", "utf-8")).abi;
  const sourceLockABI = JSON.parse(fs.readFileSync("artifacts/contracts/SourceLock.sol/SourceLock.json", "utf-8")).abi;

  const tokenA = new ethers.Contract(chainA.token, tokenABI, signerA);
  const registry = new ethers.Contract(chainA.registry, registryABI, signerA);
  const sourceLock = new ethers.Contract(chainA.sourceLock, sourceLockABI, signerA);

  // Connect to Chain B (destination)
  const providerB = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8546");
  const signerB = providerB.getSigner(0);
  const tokenB = new ethers.Contract(chainB.token, tokenABI, signerB);

  // Asset details (must match the proof you generated)
  const assetId = 42;
  const commitment = "19901327418630699502827137530539466900862196354022596230613155759924107829804";

  // Check if asset already registered
  const asset = await registry.assets(assetId);
  if (!asset.exists) {
    console.log("Registering asset...");
    const tx = await registry.registerAsset(assetId, commitment);
    await tx.wait();
    console.log("Asset registered");
  } else {
    console.log("Asset already registered");
  }

  // Load the pre‑generated proof (from circuits/AssetOwnership_js/)
  const proofPath = path.join(process.cwd(), "circuits/AssetOwnership_js/proof.json");
  const publicPath = path.join(process.cwd(), "circuits/AssetOwnership_js/public.json");
  if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
    console.error("Proof files not found. Please generate proof first using:");
    console.error('  powershell scripts/2-prove/generate_proof.ps1 42 123456789');
    process.exit(1);
  }
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
  const pub = JSON.parse(fs.readFileSync(publicPath, "utf-8"));

  // Format proof for the verifier (same as in prove-ownership.ts)
  const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const pi_b = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
  ];
  const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  const pubSignals = [BigInt(pub[0]), BigInt(pub[1]), BigInt(pub[2])]; // assetId, commitment, 1

  console.log("Proving ownership and minting tokens on Chain A...");
  const proveTx = await registry.proveOwnership(pi_a, pi_b, pi_c, assetId, commitment);
  await proveTx.wait();
  console.log("Proof verified, tokens minted.");

  const balanceA = await tokenA.balanceOf(await signerA.getAddress());
  console.log(`Balance on Chain A: ${ethers.utils.formatEther(balanceA)} ASSET`);

  // Lock tokens for cross‑chain transfer, passing the proof
  const lockAmount = ethers.utils.parseEther("500");
  const recipientOnB = await signerB.getAddress();
  const nonce = Date.now();

  console.log(`Approving ${ethers.utils.formatEther(lockAmount)} ASSET for lock...`);
  const approveTx = await tokenA.approve(sourceLock.address, lockAmount);
  await approveTx.wait();

  console.log(`Locking ${ethers.utils.formatEther(lockAmount)} ASSET to ${recipientOnB} with proof...`);
  const lockTx = await sourceLock.lock(
    assetId,
    lockAmount,
    recipientOnB,
    nonce,
    pi_a,
    pi_b,
    pi_c,
    pubSignals
  );
  await lockTx.wait();
  console.log("Locked! Waiting for validators and relayer (15 seconds)...");

  // Wait for off‑chain components
  await new Promise(resolve => setTimeout(resolve, 15000));

  const balanceB = await tokenB.balanceOf(recipientOnB);
  console.log(`Balance on Chain B after cross‑chain: ${ethers.utils.formatEther(balanceB)} ASSET`);

  if (balanceB.eq(lockAmount)) {
    console.log("✅ Cross-chain transfer successful!");
  } else {
    console.log("⚠️ Balance on Chain B does not match locked amount. Check validator/relayer logs.");
  }
}

main().catch(console.error);