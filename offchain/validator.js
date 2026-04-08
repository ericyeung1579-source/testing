// Validator private key – change per instance
// const VALIDATOR_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");

// Load deployed addresses
const chainADeploy = JSON.parse(fs.readFileSync("../deployment-chainA.json"));
const SOURCE_LOCK_ADDRESS = chainADeploy.sourceLock;
const CHAIN_A_RPC = "http://127.0.0.1:8545";
const RELAYER_URL = "http://localhost:3000/signature";

// Validator private key
const VALIDATOR_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const providerA = new ethers.providers.JsonRpcProvider(CHAIN_A_RPC);
const wallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, providerA);

// ABI for Locked event
const sourceLockABI = [
  "event Locked(bytes32 indexed lockId, uint256 indexed assetId, uint256 amount, address indexed recipientOnDest, uint256 nonce, uint256 sourceChainId, uint[2] a, uint[2][2] b, uint[2] c, uint[3] pubSignals)"
];

const sourceLock = new ethers.Contract(SOURCE_LOCK_ADDRESS, sourceLockABI, providerA);

// Path to verification key
const VK_PATH = "../circuits/verification_key.json";

sourceLock.on("Locked", async (lockId, assetId, amount, recipientOnDest, nonce, sourceChainId, a, b, c, pubSignals, event) => {
  console.log(`[Validator ${wallet.address.slice(0,6)}] New lock event: lockId=${lockId.slice(0,10)}... assetId=${assetId}`);

  try {
    // Construct proof with unswapped b
    const proof = {
      pi_a: [a[0].toString(), a[1].toString()],
      pi_b: [[b[0][1].toString(), b[0][0].toString()], [b[1][1].toString(), b[1][0].toString()]],
      pi_c: [c[0].toString(), c[1].toString()]
    };
    const publicSignals = pubSignals.map(x => x.toString());

    // Create proof file in the exact format snarkjs expects
    const proofForFile = {
      pi_a: [proof.pi_a[0], proof.pi_a[1], "1"],
      pi_b: [
        [proof.pi_b[0][0], proof.pi_b[0][1]],
        [proof.pi_b[1][0], proof.pi_b[1][1]]
      ],
      pi_c: [proof.pi_c[0], proof.pi_c[1], "1"],
      protocol: "groth16",
      curve: "bn128"
    };
    const pubForFile = publicSignals; // flat array of strings

    // Write temporary files
    const proofFile = `temp_proof_${Date.now()}.json`;
    const pubFile = `temp_pub_${Date.now()}.json`;
    fs.writeFileSync(proofFile, JSON.stringify(proofForFile, null, 2));
    fs.writeFileSync(pubFile, JSON.stringify(pubForFile));

    const cmd = `snarkjs groth16 verify ${VK_PATH} ${pubFile} ${proofFile}`;
    console.log(`[Validator ${wallet.address.slice(0,6)}] Running: ${cmd}`);

    let cliValid = false;
    try {
      const result = execSync(cmd, { encoding: 'utf8' });
      console.log(`[Validator ${wallet.address.slice(0,6)}] CLI result: ${result.trim()}`);
      cliValid = result.includes('OK');
    } catch (err) {
      console.log(`[Validator ${wallet.address.slice(0,6)}] CLI error: ${err.message}`);
      if (err.stderr) console.log(`stderr: ${err.stderr}`);
      if (err.stdout) console.log(`stdout: ${err.stdout}`);
    } finally {
      fs.unlinkSync(proofFile);
      fs.unlinkSync(pubFile);
    }

    if (!cliValid) {
      console.log(`[Validator ${wallet.address.slice(0,6)}] Proof verification failed – skipping sign`);
      return;
    }
    console.log(`[Validator ${wallet.address.slice(0,6)}] Proof verified successfully`);
  } catch (err) {
    console.error(`[Validator ${wallet.address.slice(0,6)}] Error:`, err.message);
    return;
  }

  // Build message hash and sign
  const messageHash = ethers.utils.solidityKeccak256(
    ["bytes32", "uint256", "uint256", "address", "uint256", "uint256"],
    [lockId, assetId, amount, recipientOnDest, nonce, sourceChainId]
  );
  const signature = await wallet.signMessage(ethers.utils.arrayify(messageHash));
  console.log(`[Validator ${wallet.address.slice(0,6)}] Signature: ${signature.slice(0,10)}...`);

  // Send to relayer
  try {
    await axios.post(RELAYER_URL, {
      lockId: lockId,
      assetId: assetId.toString(),
      amount: amount.toString(),
      recipient: recipientOnDest,
      nonce: nonce.toString(),
      sourceChainId: sourceChainId.toString(),
      signature: signature,
      validator: wallet.address,
      messageHash: messageHash,
    });
    console.log(`[Validator ${wallet.address.slice(0,6)}] Signature sent to relayer`);
  } catch (err) {
    console.error(`[Validator ${wallet.address.slice(0,6)}] Failed to send signature:`, err.message);
  }
});

console.log(`Validator ${wallet.address} listening for Locked events on Chain A...`);