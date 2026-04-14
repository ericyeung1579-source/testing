#!/usr/bin/env node
import { buildPoseidon } from 'circomlibjs';


const secret = process.argv[2];
const assetId = process.argv[3];
if (!secret || !assetId) process.exit(1);


(async () => {
  const poseidon = await buildPoseidon();
  const hash = poseidon([BigInt(secret), BigInt(assetId)]);
  console.log(poseidon.F.toString(hash));
})();