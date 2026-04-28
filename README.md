# Private Asset Tokenization with Full ZK‑Verified Cross‑Chain Bridge

This repository contains the implementation of a privacy‑preserving asset tokenization system using Zero‑Knowledge Proofs (ZK‑SNARKs with MiMC hashing) and a decentralised cross‑chain bridge. The bridge uses an external validator network that **re‑verifies the Groth16 proof off‑chain** before minting tokens on the destination chain.

## Features

- **Private asset registration & tokenization** – Prove ownership of an asset without revealing the secret (ZK‑SNARKs).
- **Cross‑chain bridge with full ZK re‑verification**:
  - Source chain: `SourceLock.sol` locks tokens and emits the proof.
  - Destination chain: `DestMint.sol` mints tokens after a threshold of validator signatures.
  - Off‑chain validators (3 nodes) independently verify the Groth16 proof using `snarkjs`.
  - Relayer aggregates signatures and submits the mint transaction.
  - Replay protection via nonces and `usedMessages` mapping.
- **Comparative analysis** of MiMC vs. Poseidon2 (optional, in separate branch).

## Repository Structure (Core files)
```text
.
├── contracts/ # Solidity contracts
│ ├── AssetToken.sol
│ ├── PrivateAssetRegistry.sol
│ ├── Verifier.sol # Groth16 verifier (auto‑generated)
│ ├── SourceLock.sol # Cross‑chain source contract
│ └── DestMint.sol # Cross‑chain destination contract
├── circuits/ # ZK circuit (AssetOwnership.circom) and proving keys
├── scripts/ # Deployment and test scripts
│ ├── deploy-chainA.ts
│ ├── deploy-chainB.ts
│ └── test-crosschain.ts
├── offchain/ # Off‑chain components
│ ├── relayer.js # Signature aggregator
│ ├── validator.js # Validator script (copy for 3 validators)
│ └── package.json # Dependencies (ethers, snarkjs, axios, express)
├── hardhat.config.ts # Hardhat configuration (two local chains)
└── README.md
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Hardhat
- Snarkjs (install globally: `npm install -g snarkjs`)

## Setup

1. **Clone the repository** (or switch to the branch `Full_ZK_CrossChainBridge`):
```bash
git clone <repo-url>
cd <repo-folder>
git checkout Full_ZK_CrossChainBridge
```

2. **Install root dependencies**:
```bash
npm install
```

3. **Install off‑chain dependencies**:
```bash
cd offchain
npm install
cd ..
```

4. **Compile contracts**:
```bash
npx hardhat compile
```

5. **Generate the ZK proof (if not already present)**:
```bash
powershell scripts/2-prove/generate_proof.ps1 42 123456789   # Windows, Only for demo: Asset ID:42 Secret:123456789
```

**Running the Cross‑Chain Bridge (Local Testnet)**

**Step 1: Start two Hardhat nodes (two terminals)**
Terminal 1 – Chain A (source): 
```bash
npx hardhat node --port 8545
```

Terminal 2 – Chain B (destination):
```bash
npx hardhat node --port 8546
```

**Step 2: Deploy contracts to both chains**: 
```bash
npx hardhat run scripts/deploy-chainA.ts --network chainA
npx hardhat run scripts/deploy-chainB.ts --network chainB
```

This creates deployment-chainA.json and deployment-chainB.json in the project root.

**Step 3: Start off‑chain components (three terminals)**
Terminal 3 – Relayer: 
```bash
cd offchain
node relayer.js
```

Terminal 4 – Validator #1:
```bash
cd offchain
node validator.js   # uses first Hardhat account private key
```
Terminal 5 – Validator #2:
```bash
cd offchain
node validator2.js   # uses second Hardhat account private key
```
Terminal 6 – Validator #3:
```bash
cd offchain
node validator3.js   # uses third Hardhat account private key
```
Note: Private keys for the default Hardhat accounts can be found in the Hardhat node startup logs. Use the first three accounts.

**Step 4: Run the end‑to‑end test**
```bash
npx hardhat run scripts/test-crosschain.ts
```

Expected output:
```text
Balance on Chain A: 1000.0 ASSET
Locking 500.0 ASSET ...
Balance on Chain B after cross‑chain: 500.0 ASSET
✅ Cross-chain transfer successful!
```
Validator terminals will show [INFO] snarkJS: OK! and Signature sent to relayer.
Relayer terminal will show Relayer: minted successfully! Tx hash: 0x....

# Code Highlights
- **Full ZK re‑verification in validator** – `offchain/validator.js` constructs the proof, calls `snarkjs groth16 verify`, and signs only if successful.
- **Coordinate swapping** – The validator unswaps `b` coordinates because Solidity emits them in swapped order.
- **Replay protection** – `usedNonces` on source, `usedMessages` on destination.

# Troubleshooting

Invalid validator error – Ensure DestMint.sol uses the Ethereum prefix in recoverSigner. Our implementation uses the corrected version.

Proof verification failed – Check that the validator script unswaps b correctly and adds the extra "1" and protocol/curve fields.

Cannot find deployment-*.json – Run the deployment scripts from the root folder, then ensure validators/relayer are executed from the offchain directory.

# License
MIT

# Acknowledgements
Built with Hardhat, Ethers.js, Snarkjs, Circom.

Inspired by zkBridge and PolyHedra research papers.