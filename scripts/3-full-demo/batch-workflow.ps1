# Batch Workflow Demo

This script demonstrates the complete batch workflow for multiple assets.

# Configuration
$assets = @(
    @{ assetId = "42"; secret = "123456789" },
    @{ assetId = "43"; secret = "987654321" },
    @{ assetId = "44"; secret = "555666777" }
)

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         PRIVATE ASSET REGISTRY - BATCH WORKFLOW             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Step 0: Create batch-assets.json
Write-Host "`n📝 Step 0: Creating batch-assets.json..." -ForegroundColor Yellow

$batchJson = @{
    assets = $assets
} | ConvertTo-Json

Set-Content -Path "batch-assets.json" -Value $batchJson
Write-Host "✓ batch-assets.json created with $($assets.Count) assets" -ForegroundColor Green

# Step 1: Register Assets
Write-Host "`n📋 Step 1: Registering Multiple Assets..." -ForegroundColor Yellow
Write-Host "Running: npx ts-node scripts/2-prove/register-assets-batch.ts" -ForegroundColor Gray

npx ts-node scripts/2-prove/register-assets-batch.ts

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Registration failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Assets registered successfully" -ForegroundColor Green

# Step 2: Generate Proofs
Write-Host "`n🔐 Step 2: Generating ZK Proofs..." -ForegroundColor Yellow
Write-Host "Running: node scripts/2-prove/generate-proofs-batch.mjs" -ForegroundColor Gray

node scripts/2-prove/generate-proofs-batch.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Proof generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Proofs generated successfully" -ForegroundColor Green

# Step 3: Submit Proofs
Write-Host "`n✅ Step 3: Submitting Proofs..." -ForegroundColor Yellow
Write-Host "Running: npx ts-node scripts/2-prove/prove-ownership-batch.ts" -ForegroundColor Gray

npx ts-node scripts/2-prove/prove-ownership-batch.ts

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Proof submission failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Proofs submitted successfully" -ForegroundColor Green

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                  BATCH WORKFLOW COMPLETED!                   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n📊 Summary:" -ForegroundColor Yellow
Write-Host "  • Assets Registered: $($assets.Count)" -ForegroundColor Green
Write-Host "  • Proofs Generated: $($assets.Count)" -ForegroundColor Green
Write-Host "  • Proofs Verified: $($assets.Count)" -ForegroundColor Green
Write-Host "  • Tokens Minted: $(($assets.Count) * 1000)" -ForegroundColor Green

Write-Host "`n💾 Files Generated:" -ForegroundColor Yellow
Write-Host "  • circuits/batch-proofs/batch-proofs.json" -ForegroundColor Cyan
Write-Host "  • circuits/batch-proofs/batch-public.json" -ForegroundColor Cyan
Write-Host "  • batch-assets.json" -ForegroundColor Cyan

Write-Host "`n📖 For detailed information, see: BATCH_OPERATIONS.md" -ForegroundColor Gray
