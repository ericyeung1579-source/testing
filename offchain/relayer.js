const express = require("express");
const { ethers } = require("ethers");
const fs = require("fs");

const app = express();
app.use(express.json());

// Load deployed addresses from chain B
const chainBDeploy = JSON.parse(fs.readFileSync("../deployment-chainB.json"));
const DEST_MINT_ADDRESS = chainBDeploy.destMint;
const CHAIN_B_RPC = "http://127.0.0.1:8546";

// Relayer uses its own wallet (e.g., account #0) to send the mint transaction
const RELAYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const providerB = new ethers.providers.JsonRpcProvider(CHAIN_B_RPC);
const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, providerB);

// Updated ABI
const destMintABI = [
  "function mintWithSignatures(bytes32 lockId, uint256 assetId, uint256 amount, address recipient, uint256 nonce, uint256 sourceChainId, bytes[] calldata signatures) external"
];

const destMint = new ethers.Contract(DEST_MINT_ADDRESS, destMintABI, wallet);

const pending = new Map(); // messageHash -> { signatures, lockId, assetId, amount, recipient, nonce, sourceChainId, submitted }
const THRESHOLD = 2;

app.post("/signature", async (req, res) => {
  const { lockId, assetId, amount, recipient, nonce, sourceChainId, signature, validator, messageHash } = req.body;

  if (!pending.has(messageHash)) {
    pending.set(messageHash, {
      signatures: [],
      lockId,
      assetId,
      amount,
      recipient,
      nonce,
      sourceChainId,
      submitted: false
    });
  }

  const entry = pending.get(messageHash);
  // Avoid duplicate signatures from same validator
  const alreadyExists = entry.signatures.some(sig => sig.validator === validator);
  if (!alreadyExists) {
    entry.signatures.push({ signature, validator });
    console.log(`Relayer: collected ${entry.signatures.length} signatures for ${messageHash.slice(0,10)}...`);
  }

  // Check if threshold reached and not yet submitted
  if (entry.signatures.length >= THRESHOLD && !entry.submitted) {
    entry.submitted = true;
    const sigs = entry.signatures.map(s => s.signature);
    console.log(`Relayer: threshold reached, submitting mint tx for ${entry.recipient} amount ${entry.amount}`);
    try {
      const tx = await destMint.mintWithSignatures(
        entry.lockId,
        BigInt(entry.assetId),
        BigInt(entry.amount),
        entry.recipient,
        BigInt(entry.nonce),
        BigInt(entry.sourceChainId),
        sigs
      );
      await tx.wait();
      console.log(`Relayer: minted successfully! Tx hash: ${tx.hash}`);
      pending.delete(messageHash);
    } catch (err) {
      console.error(`Relayer: mint failed:`, err.message);
      entry.submitted = false;
    }
  }

  res.json({ status: "ok" });
});

app.listen(3000, () => console.log("Relayer listening on port 3000"));