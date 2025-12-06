# Private Asset Registry - Zero-Knowledge Proof Demo

A complete zero-knowledge (ZK) proof system for private asset ownership verification built with Hardhat, Circom, and snarkjs.

## Project Overview

This project demonstrates a privacy-preserving asset registry where users can prove ownership of an asset without revealing their secret. It combines:

- **Circom circuits** - Define ZK proof logic for asset commitment verification
- **snarkjs** - Generate and verify cryptographic proofs
- **Solidity smart contracts** - On-chain proof verification using Groth16
- **Hardhat** - Smart contract development and testing framework

## Architecture

### Smart Contracts

**`PrivateAssetRegistry.sol`**
- Manages asset registration with commitment hashes
- Verifies ZK proofs to prove asset ownership
- Automatically mints tokens on successful proof verification
- Emits events on successful proof verification

**`AssetToken.sol`** 
- ERC20 token implementation for ownership rewards
- Registry-only minting and burning
- Transfers ownership proof to token ownership
- 18 decimals, 1000 tokens per proof

**`Groth16Verifier.sol`** 
- Verifies Groth16 zero-knowledge proofs on-chain
- Uses elliptic curve pairings for efficient verification

### ZK Circuit

**`AssetOwnership.circom`**
- Takes secret, assetId, and commitment as inputs
- Uses MiMC hash function to verify commitment
- Generates Groth16 proofs that asset is owned without revealing the secret

### Project Structure (Modular Organization)

```
├── contracts/
│   ├── PrivateAssetRegistry.sol      # Main registry with auto-minting
│   ├── AssetToken.sol                # ERC20 reward token
│   ├── Verifier.sol                  # Groth16 verifier (auto-generated)
│   └── Counter.t.sol                 # Solidity tests (forge)
├── circuits/
│   ├── AssetOwnership.circom         # ZK circuit definition
│   └── AssetOwnership_js/            # Compiled circuit artifacts
├── scripts/
│   ├── demo.ps1                      # Full demo automation (Windows)
│   ├── 1-setup/
│   │   └── deploy-contracts.ts       # Deploy all contracts
│   ├── 2-prove/
│   │   ├── register-asset.ts         # Register asset with commitment
│   │   ├── prove-ownership.ts        # Submit proof and mint tokens
│   │   └── generate_proof.ps1        # Off-chain proof generation
│   ├── 3-full-demo/
│   │   └── full-workflow.ts          # Complete end-to-end orchestration
│   └── utils/                        # Shared utilities (utilities here)
├── test/
│   ├── unit/
│   │   ├── Registry.test.ts          # Registry unit tests
│   │   └── Token.test.ts             # Token unit tests
│   └── integration/
│       ├── AssetTokenization.test.ts # Asset registration integration
│       ├── TokenMinting.test.ts      # Token minting integration
│       └── RegisterAndProve.test.ts  # Full workflow integration
└── ignition/
    └── modules/Counter.ts             # Deployment module
```

## Quick Start

### 1. Full Demo (Automated Workflow)

```powershell
.\scripts\demo.ps1
```

This completely automates the entire workflow:
- **Step 0:** Compile Circom circuit and generate ZK keys (powers of tau)
- **Step 1:** Deploy all contracts (Verifier → Token → Registry)
- **Step 2:** Register asset with commitment hash
- **Step 3:** Generate ZK proof of ownership
- **Step 4:** Submit proof and automatically mint tokens
- **Step 5:** Display final results and token balance

### 2. Run Individual Steps (For Learning or Debugging)

**Terminal 1 - Start Hardhat Network:**
```powershell
npx hardhat node
```

**Terminal 2 - Run Individual Steps:**

Step 1 - Deploy Contracts:
```powershell
npx hardhat run scripts/1-setup/deploy-contracts.ts --network localhost
```

Step 2 - Register Asset:
```powershell
npx hardhat run scripts/2-prove/register-asset.ts --network localhost
```

Step 3 - Generate Proof (Windows):
```powershell
.\scripts\2-prove\generate_proof.ps1 42 123456789
```

Step 4 - Prove Ownership:
```powershell
npx hardhat run scripts/2-prove/prove-ownership.ts --network localhost
```

### 3. Run Complete Workflow Orchestrator

```powershell
npx hardhat node  # Terminal 1

# Terminal 2
npx hardhat run scripts/3-full-demo/full-workflow.ts --network localhost
```

This runs all steps (register, generate proof, prove) in sequence with formatted output.

### 4. Run Tests

```powershell
# Unit tests (individual contracts)
npx hardhat test test/unit/

# Integration tests (complete workflows)
npx hardhat test test/integration/

# All tests
npx hardhat test
```

## Modular Script Architecture

The scripts are organized into phases for clarity and flexibility:

### Phase 1: Setup (`scripts/1-setup/`)
- **`deploy-contracts.ts`** - Deploys Verifier → Token → Registry contracts
  - Creates deployment-addresses.json with all contract addresses
  - Suitable for standalone use or integration into CI/CD pipelines

### Phase 2: Prove (`scripts/2-prove/`)
- **`register-asset.ts`** - Register asset with commitment hash
  - Reads addresses from deployment-addresses.json
  - Can be run independently
  
- **`prove-ownership.ts`** - Submit ZK proof and mint tokens
  - Triggers auto-minting of 1000 ASSET tokens
  - Can be run multiple times (minting only happens on first proof)
  
- **`generate_proof.ps1`** - Generate ZK proof off-chain (Windows PowerShell)
  - Takes Asset ID and Secret as parameters
  - Creates proof.json with proof and public inputs

### Phase 3: Full Demo (`scripts/3-full-demo/`)
- **`full-workflow.ts`** - Orchestrates complete workflow
  - Runs all phases (register → generate proof → prove) in sequence
  - Shows formatted progress with step counters
  - Displays final token balance

### Benefits of Modular Approach
  
  **Debugging** - Test individual components in isolation  
  **Flexible** - Use individual scripts in custom workflows  
  **Maintainable** - Each script has single responsibility  
  **Testable** - Easy to create unit and integration tests  
  **Extensible** - Add new steps or modify existing ones easily

The registry now automatically mints ERC20 tokens when a ZK proof is successfully verified!

### How It Works

1. **Register Asset** - Owner registers asset with commitment hash
2. **Generate Proof** - Generate ZK proof of ownership
3. **Verify Proof** - Submit proof to `proveOwnership()`
4. **Mint Tokens** - 1000 ASSET tokens automatically minted to owner's address
5. **Trade/Transfer** - Use tokens to prove ownership or trade

### Token Configuration

- **Token Name:** Asset Token (ASSET)
- **Decimals:** 18
- **Mint Amount:** 1000 tokens per proof (configurable)
- **Minting:** Only happens once per asset on first successful proof

### Example Commands

Deploy with minting enabled:
```powershell
npx hardhat run scripts/deploy.ts --network localhost
```

Run proof and receive tokens:
```powershell
npx hardhat run scripts/prove-and-mint.ts --network localhost
```

Check token balance:
```powershell
npx hardhat console --network localhost
> const token = await ethers.getContractAt("AssetToken", "0x...")
> const balance = await token.balanceOf("0x...")
> ethers.formatEther(balance)
```

### Test Token Minting

```powershell
npx hardhat test TokenMinting.test.ts
```

### Example Flow

#### Using Complete Demo Script
```powershell
# Run entire workflow end-to-end with single command
.\scripts\demo.ps1

# This runs:
# 1. Setup → Deploys contracts
# 2. Register → Registers asset
# 3. Prove → Generates proof and proves ownership
# 4. Mint → Auto-mints 1000 ASSET tokens
# 5. Display → Shows final balances and addresses
```

#### Using Individual Scripts (For Learning)

**Asset Information:**
- Asset ID: `42`
- Secret: `123456789` (kept private)
- Commitment: `MiMC(secret, assetId)` (stored on-chain)

**1. Register Asset**
```powershell
npx hardhat run scripts/2-prove/register-asset.ts

# Output:
# Asset ID: 42
# Commitment: 456789012...
# Owner: 0x1234...
# ✓ Asset registered successfully
```

**2. Generate Proof (Off-Chain)**
```powershell
.\scripts\2-prove\generate_proof.ps1 42 123456789

# Output:
# ✓ Proof generated successfully
# Proof: { "pi_a": [...], "pi_b": [...], "pi_c": [...], "protocol": "groth16" }
# Public: [42, 456789012...]
```

**3. Verify On-Chain & Mint Tokens**
```powershell
npx hardhat run scripts/2-prove/prove-ownership.ts

# Output:
# ✓ Proof verified
# ✓ 1000 ASSET tokens minted to 0x1234...
# Transaction: 0xabcd...
```

**4. Check Token Balance**
```powershell
npx hardhat console --network localhost
> const token = await ethers.getContractAt("AssetToken", "0x...")
> const balance = await token.balanceOf("0x...")
> ethers.formatEther(balance)
'1000.0'  # 1000 ASSET tokens
```

## Key Technologies

- **Circom** - DSL for creating zero-knowledge circuits
- **snarkjs** - JavaScript library for proof generation/verification
- **Groth16** - Efficient ZK-SNARK proving system
- **Solidity** - Smart contract language
- **Hardhat** - Ethereum development environment
- **ethers.js** - Blockchain interaction library
- **MiMC** - Hashing function optimized for circuits

## Testing

The project includes comprehensive tests:

- **Solidity tests** (`*.t.sol`) - Unit tests for circuit logic
- **TypeScript tests** (`*.test.ts`) - Integration tests for contracts
- Both test types verify asset registration and proof generation

## Deployment

Deploy to Sepolia testnet:

```powershell
$env:SEPOLIA_PRIVATE_KEY = "your-private-key"
npx hardhat run scripts/deploy.ts --network sepolia
```

## Security Notes

- The demo uses hardcoded secrets for educational purposes
- In production, use secure key management
- Always audit ZK circuits and verifiers before production use
- Keep secrets truly private - never expose them

## Learn More

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs GitHub](https://github.com/iden3/snarkjs)
- [Hardhat Documentation](https://hardhat.org/)
- [Zero-Knowledge Proofs Primer](https://blog.cryptographyengineering.com/2014/11/27/zero-knowledge-proofs-illustrated-primer/)

## Next Steps

- Extend the circuit with additional constraints
- Add more complex asset metadata
- Implement multi-party proofs
- Deploy verification oracle to mainnet
- Add admin/governance functions for token management
