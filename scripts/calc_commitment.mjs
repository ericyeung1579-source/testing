#!/usr/bin/env node
import { buildMimcSponge } from 'circomlibjs';


const secret = process.argv[2];
const assetId = process.argv[3];
if (!secret || !assetId) process.exit(1);


(async () => {
  const mimc = await buildMimcSponge();
  const hash = mimc.multiHash([BigInt(secret)], BigInt(assetId));
  console.log(mimc.F.toString(hash));
})();