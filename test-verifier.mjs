import { readFileSync } from 'fs';
import { ethers } from 'ethers';

// Read proof and public signals
const proof = JSON.parse(readFileSync('./circuits/AssetOwnership_js/proof.json', 'utf-8'));
const pub = JSON.parse(readFileSync('./circuits/AssetOwnership_js/public.json', 'utf-8'));

console.log('Proof pi_b structure:', JSON.stringify(proof.pi_b, null, 2));
console.log('\nPublic signals:', pub);

// Connect to local node
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const verifierJson = JSON.parse(readFileSync('./artifacts/contracts/Verifier.sol/Groth16Verifier.json', 'utf-8'));
const addresses = JSON.parse(readFileSync('./deployment-addresses.json', 'utf-8'));

const verifier = new ethers.Contract(addresses.verifier, verifierJson.abi, provider);

// Format proof - pi_b needs coordinate swap
const pi_a = [proof.pi_a[0], proof.pi_a[1]];
const pi_b = [
  [proof.pi_b[0][1], proof.pi_b[0][0]],  // Swap coordinates
  [proof.pi_b[1][1], proof.pi_b[1][0]]   // Swap coordinates
];
const pi_c = [proof.pi_c[0], proof.pi_c[1]];
const publicSignals = [pub[0], pub[1], pub[2]];

console.log('\n=== Testing Verifier Contract ===');
console.log('pi_a:', pi_a);
console.log('pi_b:', pi_b);
console.log('pi_c:', pi_c);
console.log('public:', publicSignals);

try {
  const result = await verifier.verifyProof(pi_a, pi_b, pi_c, publicSignals);
  console.log('\n✓ Verification result:', result);
} catch (error) {
  console.error('\n✗ Verification failed:');
  console.error(error.message);
  console.error('\nError details:', error);
}
