# Private Asset Registry - Zero-Knowledge Proof System

A **complete zero-knowledge (ZK) proof system** for private asset ownership verification with batch registration and batch proof submission. Built with Hardhat, Circom, snarkjs, Solidity, Express API, and React.

---

**📦 FYP Final Submission Materials**  
This repository contains two branches: `main` (ZK system with Frontend) and `Full_ZK_CrossChainBridge` (advanced cross‑chain bridge).  
For a **single‑file download** containing **both branches**, please visit our [GitHub Releases](https://github.com/ericyeung1579source/testing/releases/tag/v1.1-final-fyp) and download.  
After extraction, you will find a folder structure with separate README files for each component.

## 🚀 Quick Start – React Frontend (User‑Tested Workflow)

### Prerequisites

- Node.js 18+
- npm or yarn
- Circom 2.2.x ([Install](https://docs.circom.io/getting-started/installation/))
- Snarkjs (global) – `npm install -g snarkjs`
- PowerShell (Windows) or bash (Linux/macOS)

### Start the System Together with Frontend

### 1. Clone and Install Dependencies (First time only)
```bash
git clone <repo-url>
cd <repo-folder>
npm install
cd frontend
npm install --legacy-peer-deps
cd ..
```

### 2. Compile Circuit & Generate ZK Keys (First time only)
Windows (PowerShell):
```powershell
.\scripts\demo.ps1
```

Linux/macOS (manual):
```bash
# Compile circuit
circom circuits/AssetOwnership.circom --r1cs --wasm -o circuits -l node_modules

# Powers of Tau
snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="demo" -v
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v

# Groth16 setup
snarkjs groth16 setup circuits/AssetOwnership.r1cs pot12_final.ptau circuits/AssetOwnership_0000.zkey
snarkjs zkey contribute circuits/AssetOwnership_0000.zkey circuits/AssetOwnership_0001.zkey --name="demo" -v
snarkjs zkey export verificationkey circuits/AssetOwnership_0001.zkey circuits/verification_key.json
snarkjs zkey export solidityverifier circuits/AssetOwnership_0001.zkey contracts/Verifier.sol
```

### 3 Copy ZK Artifacts to Frontend
```bash
# Copy .zkey to frontend
copy circuits\AssetOwnership_0001.zkey frontend\public\circuits\        # Windows
cp circuits/AssetOwnership_0001.zkey frontend/public/circuits/         # Linux/macOS

# (The .wasm file is already in frontend/circuits)
```

### 4. Start Hardhat Node (Terminal 1)
Ensure in the correct <repo-folder>
```bash
npx hardhat node
```

### 5. Deploy Contracts (Terminal 2)
Ensure in the correct <repo-folder>
```bash
npx hardhat run scripts/1-setup/deploy-contracts.ts --network localhost
```
This creates deployment-addresses.json in the project root. Copy it to the frontend:
```bash
copy deployment-addresses.json frontend\public\        # Windows
cp deployment-addresses.json frontend/public/         # Linux/macOS
```

### 6. Start React Frontend (Terminal 2, after deploy)
```bash
cd frontend
npm start
```
Open http://localhost:3000.

### Using the dApp
1. Add assets – Enter an asset ID, enter or generate the Secret, click “Add Asset”.

2. Register All – Registers all unregistered assets in one batch transaction (gas saving).

3. Prove All – Generates ZK proofs for all registered but unproven assets, then submits them in one batch transaction.

4. Individual buttons – Also supports per‑asset registration/proving.

After a successful proof, you automatically receive 1000 ASSET tokens per asset (minted only once per asset).

## Architecture
```
┌─────────────────────────────────────────────────────────┐
│             REACT FRONTEND (Direct to Hardhat)          │
│              ethers.js + snarkjs + circomlibjs          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (localhost:8545)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    HARDHAT NODE (local)                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 SMART CONTRACTS (Solidity)               │
│  PrivateAssetRegistry.sol + AssetToken.sol + Verifier.sol│
└─────────────────────────────────────────────────────────┘
```
Optional REST API Server
An Express API server (scripts/api/server.mjs) is also provided for applications that prefer REST over direct RPC. See the API Reference section.

## Smart Contracts

**`PrivateAssetRegistry.sol`** - Main Registry
- `registerAsset()` - Register single asset
- `registerAssetsBatch()` - **Register multiple assets in ONE transaction**
- `proveOwnership()` - Verify single proof
- `proveOwnershipBatch()` - **Verify multiple proofs atomically**
- Auto-mints tokens on successful proof verification

**`AssetToken.sol`** - ERC20 Token
- ERC20 implementation for ownership rewards
- Registry-only minting and burning
- 18 decimals, 1000 tokens per proof

**`Verifier.sol`** - Groth16 Verification
- Verifies Groth16 zero-knowledge proofs on-chain
- Uses elliptic curve pairings

## ZK Circuit

**`AssetOwnership.circom`**
- Takes: secret, assetId, commitment
- Uses: MiMC hash function for commitment verification
- Proves: Asset ownership without revealing the secret

## Project Overview
```
├── contracts/                     # Solidity contracts
│   ├── PrivateAssetRegistry.sol
│   ├── AssetToken.sol
│   └── Verifier.sol
├── circuits/                      # Circom circuit + generated artifacts
│   ├── AssetOwnership.circom
│   ├── AssetOwnership_js/         # Compiled .wasm, witness calculator
│   └── *.zkey, *.ptau
├── frontend/                      # React dApp
│   ├── public/
│   │   ├── circuits/              # .wasm and .zkey served to browser
│   │   └── deployment-addresses.json
│   ├── src/
│   │   ├── utils/web3.ts          # Ethers setup, ABIs, helpers
│   │   ├── App.tsx                # Main UI + proof logic
│   │   └── types/                 # Type declarations
│   └── package.json
├── scripts/
│   ├── 1-setup/                   # Deployment script
│   ├── 2-prove/                   # Proof generation and submission scripts
│   ├── 3-full-demo/               # Demo automation
│   ├── api/                       # Optional Express server (see API section)
│   └── utils/                     # Helpers
├── test/                          # Unit & integration tests
├── hardhat.config.ts
├── deployment-addresses.json      # Auto‑generated contract addresses
└── README.md
```

## 📊 Performance Metrics (Batch vs Single)

| Metric | Single (5 assets) | Batch (5 assets) | Savings |
|--------|------------------|-----------------|---------|
| **Transactions** | 5 | 1 | 80% |
| **Gas Used** | ~1.55M | ~865k | 44% |
| **Time** | ~290s | ~70s | 77% |
| **Gas/Registration** | 60k | 36k | 40% |
| **Gas/Proof** | 250k | 137.5k | 45% |

## API Reference (Optional REST Server)
If you prefer REST over direct RPC, start the API server:
```bash
node scripts/api/server.mjs
```
Base URL: http://localhost:3000

### 1. Health Check
http
GET /health

*Response:*
json
{
  "status": "ready",
  "timestamp": "2026-02-18T10:00:00.000Z"
}

### 2. Register Multiple Assets
http
POST /register
Content-Type: application/json

{
  "assets": [
    { "assetId": "1001", "secret": "secret1" },
    { "assetId": "1002", "secret": "secret2" }
  ]
}

*Response:*
json
{
  "status": "success",
  "action": "register",
  "transactionHash": "0x...",
  "blockNumber": 12345,
  "assetsRegistered": 2,
  "gasUsed": "108000",
  "assets": [
    { "assetId": "1001", "commitment": "..." }
  ]
}

### 3. Generate Proofs
http
POST /generate
Content-Type: application/json

{
  "assets": [
    { "assetId": "1001", "secret": "secret1" },
    { "assetId": "1002", "secret": "secret2" }
  ]
}

*Response:*
json
{
  "status": "success",
  "action": "generate",
  "proofsGenerated": 2,
  "proofFile": "/path/to/batch-proofs.json",
  "publicFile": "/path/to/batch-public.json",
  "details": [
    { "assetId": "1001", "status": "generated" }
  ]
}


### 4. Submit Proofs
http
POST /submit
Content-Type: application/json

{
  "proofFile": "/path/to/batch-proofs.json",
  "publicFile": "/path/to/batch-public.json"
}

Note: Both fields optional - uses defaults if not provided

*Response:*
json
{
  "status": "success",
  "action": "submit",
  "transactionHash": "0x...",
  "blockNumber": 12346,
  "proofsVerified": 2,
  "tokensMinted": "2000.0",
  "gasUsed": "412500"
}

### 5. Complete Workflow (Register → Generate → Submit)
http
POST /workflow
Content-Type: application/json

{
  "assets": [
    { "assetId": "1001", "secret": "secret1" },
    { "assetId": "1002", "secret": "secret2" }
  ]
}

*Response:*
json
{
  "status": "success",
  "workflow": "register-generate-submit",
  "steps": [
    { "status": "success", "action": "register", ... },
    { "status": "success", "action": "generate", ... },
    { "status": "success", "action": "submit", ... }
  ]
}

### Error Responses
All endpoints return errors in consistent format:
json
{
  "status": "error",
  "action": "register",
  "error": "Assets must be a non-empty array"
}

See scripts/api/test-api.mjs for a complete test suite.

## 🛠️ Troubleshooting
### "Cannot connect to API"
- Ensure blockchain is running: `npx hardhat node`
- Ensure API is running: `node scripts/api/server.mjs`
- Check port 3000 is not in use

### "Contracts not deployed"
- Run: `npx hardhat run scripts/1-setup/deploy-contracts.ts --network localhost`
- Check `deployment-addresses.json` exists

### "Proxy error from frontend"
- Ensure API has CORS enabled (already configured in `server.mjs`)
- Check frontend is calling `http://localhost:3000` (not localhost:8545)

### "Out of funds" error
- Hardhat node provides unlimited funds to default accounts
- Check using: `npx hardhat console --network localhost`
### circom: command not found	
- Install Circom from docs.circom.io

### snarkjs: command not found 
- npm install -g snarkjs

### Frontend can't load .wasm or .zkey 
- Ensure both files are in frontend/public/circuits/

### deployment-addresses.json not found 
- Copy it from project root to frontend/public/

### TypeScript error 130n 
- Use BigInt(130) (already fixed in code)

## ✅What's Included

- ✅ **Full zero-knowledge circuit** (Poseidon hash)
- ✅ **Groth16 setup and Solidity verifier**
- ✅ **Batch registration and batch proof submission** (smart contract level)
- ✅ **React frontend with single & batch workflows**
- ✅ **Token minting upon proof verification**
- ✅ **TypeScript support**
- ✅ **Optional REST API server**
- ✅ **Unit and integration tests**

## 🔒 Security Features

- ✅ **Input Validation** - All inputs validated server-side
- ✅ **Error Handling** - Clear, non-revealing error messages
- ✅ **No Secret Logging** - Sensitive data never exposed
- ✅ **Environment Variables** - Configuration externalized
- ✅ **CORS Configuration** - Restricted origins (configure as needed)
- ✅ **Atomic Operations** - Batch operations succeed/fail together

## 📖 Additional Resources

- **Smart Contract Source:** `contracts/PrivateAssetRegistry.sol`
- **Frontend Logic** `frontend/src/App.tsx`, `frontend/src/utils/web3.ts`
- **Deployment Script:** `scripts/1-setup/delopy-contracts.ts`
- **API Server:** `scripts/api/server.mjs`, `scripts/api/BatchOperationsAPI.mjs`
- **Tests:** `scripts/api/test-api.mjs`, `test/integration/BatchOperations.test.ts`

**Status:** ✅ Production ready (local Hardhat network)  
**Last Updated:** May 2026  
**Version:** 2.0 (React + Batch + Operations API)
