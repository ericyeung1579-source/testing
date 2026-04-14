import { createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { buildPoseidon } from "circomlibjs";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);
const RPC_URL = "http://127.0.0.1:8545";
const CIRCUIT_PATH = path.join(process.cwd(), "circuits", "AssetOwnership_js");

function pad(s: string, n: number) { return s.padEnd(n); }
function fmt(n: bigint) { return n.toLocaleString(); }

/** Generate a single proof for (secret, assetId) and return proof + public signals */
async function generateProof(poseidon: any, secret: string, assetId: string) {
  const commitment = poseidon.F.toString(poseidon([BigInt(secret), BigInt(assetId)]));
  const inputJson = { secret, assetId, commitment, ownerPublicKey: "1" };
  fs.writeFileSync(path.join(CIRCUIT_PATH, "input.json"), JSON.stringify(inputJson));
  execSync("snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns", { cwd: CIRCUIT_PATH, stdio: "pipe" });
  execSync("snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json", { cwd: CIRCUIT_PATH, stdio: "pipe" });
  const proof = JSON.parse(fs.readFileSync(path.join(CIRCUIT_PATH, "proof.json"), "utf-8"));
  const pub   = JSON.parse(fs.readFileSync(path.join(CIRCUIT_PATH, "public.json"), "utf-8"));
  return { proof, pub, commitment };
}

/** Convert snarkjs proof object to Solidity-ready [pi_a, pi_b, pi_c] */
function proofToArgs(proof: any) {
  const pi_a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint];
  const pi_b = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ] as [[bigint, bigint], [bigint, bigint]];
  const pi_c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint];
  return { pi_a, pi_b, pi_c };
}

async function main() {
  const pub = createPublicClient({ chain: hardhat, transport: http(RPC_URL) });
  const wal = createWalletClient({ chain: hardhat, transport: http(RPC_URL), account });

  const vJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/Verifier.sol/Groth16Verifier.json"), "utf-8"));
  const tJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/AssetToken.sol/AssetToken.json"), "utf-8"));
  const rJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json"), "utf-8"));

  const gasReport: Record<string, bigint> = {};

  // ── Deploy contracts ────────────────────────────────────────────────────────
  let h = await wal.deployContract({ abi: vJson.abi, bytecode: vJson.bytecode });
  let r = await pub.waitForTransactionReceipt({ hash: h });
  const verifierAddr = r.contractAddress!;
  gasReport["Deploy Verifier"] = r.gasUsed;

  h = await wal.deployContract({ abi: tJson.abi, bytecode: tJson.bytecode, args: ["0x0000000000000000000000000000000000000000"] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  const tokenAddr = r.contractAddress!;
  gasReport["Deploy AssetToken"] = r.gasUsed;

  h = await wal.deployContract({ abi: rJson.abi, bytecode: rJson.bytecode, args: [verifierAddr, tokenAddr] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  const regAddr = r.contractAddress!;
  gasReport["Deploy PrivateAssetRegistry"] = r.gasUsed;

  h = await wal.writeContract({ address: tokenAddr, abi: tJson.abi, functionName: "setRegistry", args: [regAddr] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  gasReport["AssetToken.setRegistry"] = r.gasUsed;

  // ── Single asset: register + prove ─────────────────────────────────────────
  console.log("Generating single proof (asset 42)...");
  const poseidon = await buildPoseidon();
  const single = await generateProof(poseidon, "123456789", "42");
  const singleArgs = proofToArgs(single.proof);
  const singleId = BigInt(single.pub[0]);
  const singleCommit = BigInt(single.pub[1]);

  h = await wal.writeContract({ address: regAddr, abi: rJson.abi, functionName: "registerAsset", args: [singleId, singleCommit] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  gasReport["registerAsset (single)"] = r.gasUsed;

  h = await wal.writeContract({ address: regAddr, abi: rJson.abi, functionName: "proveOwnership", args: [singleArgs.pi_a, singleArgs.pi_b, singleArgs.pi_c, singleId, singleCommit] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  gasReport["proveOwnership (ZK verify + mint)"] = r.gasUsed;

  // ── Batch (5 assets): register + prove ─────────────────────────────────────
  const batchAssets = [
    { assetId: "6001", secret: "123456789" },
    { assetId: "6002", secret: "987654321" },
    { assetId: "6003", secret: "111111111" },
    { assetId: "6004", secret: "222222222" },
    { assetId: "6005", secret: "333333333" },
  ];
  const N = batchAssets.length;

  console.log(`Generating ${N} proofs for batch...`);
  const batchResults = [];
  for (const asset of batchAssets) {
    batchResults.push(await generateProof(poseidon, asset.secret, asset.assetId));
  }

  // registerAssetsBatch
  const batchIds  = batchResults.map(r2 => BigInt(r2.pub[0]));
  const batchComs = batchResults.map(r2 => BigInt(r2.pub[1]));
  h = await wal.writeContract({ address: regAddr, abi: rJson.abi, functionName: "registerAssetsBatch", args: [batchIds, batchComs] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  gasReport[`registerAssetsBatch (${N} assets)`] = r.gasUsed;

  // proveOwnershipBatch
  const proofDataArray = batchResults.map(res => {
    const { pi_a, pi_b, pi_c } = proofToArgs(res.proof);
    return { a: pi_a, b: pi_b, c: pi_c, assetId: BigInt(res.pub[0]), commitment: BigInt(res.pub[1]) };
  });
  h = await wal.writeContract({ address: regAddr, abi: rJson.abi, functionName: "proveOwnershipBatch", args: [proofDataArray] });
  r = await pub.waitForTransactionReceipt({ hash: h });
  gasReport[`proveOwnershipBatch (${N} proofs)`] = r.gasUsed;

  // ── Print table ─────────────────────────────────────────────────────────────
  const ETH = 2000;
  const GWEI = 10;

  console.log("\n╔══════════════════════════════════════════════════════╦══════════════╦══════════╗");
  console.log(  "║  Operation                                           ║   Gas Used   ║   Cost   ║");
  console.log(  "╠══════════════════════════════════════════════════════╬══════════════╬══════════╣");
  for (const [op, gas] of Object.entries(gasReport)) {
    const usd = (Number(gas) * GWEI * 1e-9 * ETH).toFixed(4);
    console.log(`║  ${pad(op, 52)}║  ${fmt(gas).padStart(10)}  ║  $${usd.padStart(6)}  ║`);
  }
  console.log(  "╚══════════════════════════════════════════════════════╩══════════════╩══════════╝");
  console.log(`\n  Assumptions: ETH = $${ETH},  gas price = ${GWEI} gwei`);

  // ── Per-asset comparison ────────────────────────────────────────────────────
  const singleTotal  = gasReport["registerAsset (single)"] + gasReport["proveOwnership (ZK verify + mint)"];
  const batchRegGas  = gasReport[`registerAssetsBatch (${N} assets)`];
  const batchProveGas = gasReport[`proveOwnershipBatch (${N} proofs)`];
  const batchTotal   = batchRegGas + batchProveGas;
  const singleNTotal = singleTotal * BigInt(N);
  const saving = Number(singleNTotal - batchTotal) * 100 / Number(singleNTotal);

  console.log(`\n  Per-asset comparison (${N} assets):`);
  console.log(`    ${N}× single (register + prove): ${fmt(singleNTotal)} gas`);
  console.log(`    Batch   (register + prove):    ${fmt(batchTotal)} gas`);
  console.log(`    Gas saved by batching:         ${saving.toFixed(1)}%`);
}

main().catch(e => { console.error(e); process.exit(1); });
