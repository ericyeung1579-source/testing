# Generate ZK Proof - PowerShell Version
param(
    [Parameter(Mandatory=$true)] [string]$ASSET_ID,
    [Parameter(Mandatory=$true)] [string]$SECRET
)

$ErrorActionPreference = "Stop"

if (-not $ASSET_ID -or -not $SECRET) {
    Write-Host "Usage: .\scripts\2-prove\generate_proof.ps1 ASSET_ID SECRET" -ForegroundColor Yellow
    Write-Host "Example: .\scripts\2-prove\generate_proof.ps1 42 123456789" -ForegroundColor Yellow
    exit 1
}

Write-Host "Generating proof for asset $ASSET_ID..." -ForegroundColor Yellow

# Calculate commitment (using calc_commitment.mjs from parent directory)
$COMMITMENT = & node "$PSScriptRoot\..\calc_commitment.mjs" $SECRET $ASSET_ID
Write-Host "Commitment = $COMMITMENT"

# Create input.json in circuits/AssetOwnership_js
$circuitPath = "circuits/AssetOwnership_js"
if (-not (Test-Path $circuitPath)) {
    Write-Host "Error: $circuitPath not found" -ForegroundColor Red
    exit 1
}

$inputJson = @"
{
  "secret": "$SECRET",
  "assetId": "$ASSET_ID",
  "commitment": "$COMMITMENT",
  "ownerPublicKey": "1"
}
"@

Set-Content -Path "$circuitPath/input.json" -Value $inputJson

# Generate witness
Write-Host "Calculating witness..." -ForegroundColor Yellow
Push-Location $circuitPath
try {
    snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns
    
    if (-not (Test-Path "witness.wtns")) {
        Write-Host "Error: witness.wtns not created" -ForegroundColor Red
        exit 1
    }
    
    # Generate proof
    Write-Host "Generating proof..." -ForegroundColor Yellow
    snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json
    
    if (-not (Test-Path "proof.json")) {
        Write-Host "Error: proof.json not created" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✓ Proof ready: proof.json" -ForegroundColor Green
} finally {
    Pop-Location
}
