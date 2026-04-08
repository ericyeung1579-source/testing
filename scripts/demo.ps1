# ZK Asset Demo - PowerShell Version (Windows)
# Uses modular workflow: setup → prove → full-demo
$ErrorActionPreference = "Stop"

Write-Host "=== ZK Asset Demo - Modular Workflow v16 ===" -ForegroundColor Green
Write-Host "This demo performs the following steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy contracts" -ForegroundColor Cyan
Write-Host "  2. Register asset" -ForegroundColor Cyan
Write-Host "  3. Generate ZK proof" -ForegroundColor Cyan
Write-Host "  4. Prove ownership and mint tokens" -ForegroundColor Cyan
Write-Host "  5. Display final results" -ForegroundColor Cyan
Write-Host ""

# Compile circom circuit
Write-Host "Step 0: Preparing ZK circuit..." -ForegroundColor Yellow

# Only regenerate circuit artifacts if they don't exist
if (-not (Test-Path "circuits/AssetOwnership_0001.zkey") -or -not (Test-Path "contracts/Verifier.sol")) {
    Write-Host "Compiling circom circuit..." -ForegroundColor Yellow
    circom circuits/AssetOwnership.circom --r1cs --wasm -o circuits -l node_modules

    # Setup powers of tau
    Write-Host "Setting up powers of tau..." -ForegroundColor Yellow
    snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
    snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="demo" -v
    snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v

    # Groth16 setup
    Write-Host "Groth16 setup..." -ForegroundColor Yellow
    snarkjs groth16 setup circuits/AssetOwnership.r1cs pot12_final.ptau circuits/AssetOwnership_0000.zkey
    snarkjs zkey contribute circuits/AssetOwnership_0000.zkey circuits/AssetOwnership_0001.zkey --name="demo" -v
    snarkjs zkey export verificationkey circuits/AssetOwnership_0001.zkey circuits/verification_key.json

    # Export Solidity verifier
    Write-Host "Exporting Solidity verifier..." -ForegroundColor Yellow
    snarkjs zkey export solidityverifier circuits/AssetOwnership_0001.zkey contracts/Verifier.sol
    
    Write-Host "✓ ZK circuit prepared" -ForegroundColor Green
} else {
    Write-Host "✓ Using existing circuit artifacts" -ForegroundColor Green
}
Write-Host ""

# Start Hardhat node
Write-Host "Starting Hardhat node..." -ForegroundColor Yellow
$nodeJob = Start-Job -ScriptBlock {
    cd d:\demo2
    npx hardhat node 2>&1 | Out-Null
}

# Give node time to start
Start-Sleep -Seconds 10

try {
    Write-Host "Compiling contracts..." -ForegroundColor Yellow
    npx hardhat compile
    
    # ============================================================
    # STEP 1: Deploy Contracts
    # ============================================================
    Write-Host ""
    Write-Host "Step 1: Deploying contracts..." -ForegroundColor Yellow
    npx hardhat run scripts/1-setup/deploy-contracts.ts --network localhost
    if ($LASTEXITCODE -ne 0) { throw "Deployment failed" }
    Write-Host "✓ Contracts deployed" -ForegroundColor Green
    Write-Host ""
    
    # ============================================================
    # STEP 2: Generate Proof (must be before registration)
    # ============================================================
    Write-Host "Step 2: Generating ZK proof..." -ForegroundColor Yellow
    $ASSET_ID = 42
    $SECRET = 123456789
    & .\scripts\2-prove\generate_proof.ps1 $ASSET_ID $SECRET
    if ($LASTEXITCODE -ne 0) { throw "Proof generation failed" }
    Write-Host "✓ Proof generated" -ForegroundColor Green
    Write-Host ""
    
    # ============================================================
    # STEP 3: Register Asset
    # ============================================================
    Write-Host "Step 3: Registering asset..." -ForegroundColor Yellow
    npx hardhat run scripts/2-prove/register-asset.ts --network localhost
    if ($LASTEXITCODE -ne 0) { throw "Asset registration failed" }
    Write-Host "✓ Asset registered" -ForegroundColor Green
    Write-Host ""
    
    # ============================================================
    # STEP 4: Prove Ownership and Mint Tokens
    # ============================================================
    Write-Host "Step 4: Proving ownership and minting tokens..." -ForegroundColor Yellow
    npx hardhat run scripts/2-prove/prove-ownership.ts --network localhost
    if ($LASTEXITCODE -ne 0) { throw "Proof verification failed" }
    Write-Host "✓ Proof submitted and tokens minted" -ForegroundColor Green
    Write-Host ""
    
    # ============================================================
    # STEP 5: Display Results
    # ============================================================
    Write-Host "Step 5: Running full workflow orchestrator..." -ForegroundColor Yellow
    npx hardhat run scripts/3-full-demo/full-workflow.ts --network localhost
    if ($LASTEXITCODE -ne 0) { throw "Orchestrator failed" }
    Write-Host ""
    Write-Host "=== DEMO COMPLETE ===" -ForegroundColor Green
    
} catch {
    Write-Host "Error during demo: $_" -ForegroundColor Red
    exit 1
} finally {
    Write-Host ""
    Write-Host "Cleaning up..." -ForegroundColor Yellow
    Stop-Job -Job $nodeJob -ErrorAction SilentlyContinue
    Remove-Job -Job $nodeJob -ErrorAction SilentlyContinue
    Write-Host "✓ Hardhat node stopped" -ForegroundColor Green
}
