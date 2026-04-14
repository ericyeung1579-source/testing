#!/usr/bin/env node
/**
 * Comprehensive Workflow Cost Analyzer
 * Measures 5 key stages: Compilation, Witness, Proof, Verification, Gas
 * Run with: npm run analyze:costs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import { execSync, spawnSync } from "child_process";
import { circuitConfig, getPaths } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(process.cwd(), circuitConfig.report.file);
const paths = getPaths();

/**
 * Stage 1: Measure circuit compilation time
 */
async function measureCircuitCompilation() {
  try {
    const circuitPath = path.join(process.cwd(), "circuits");
    const circomFile = path.join(circuitPath, "AssetOwnership.circom");

    if (!fs.existsSync(circomFile)) {
      console.warn(`  ⚠️  Circuit file not found at ${circomFile}`);
      return null;
    }

    // Check if already compiled
    const wasmOutput = path.join(circuitPath, "AssetOwnership_js");
    if (fs.existsSync(wasmOutput)) {
      // Circuit already compiled, but we can still time a re-compile for measurement
      // Or skip if we just want to measure new compilations
      // For now, skip since compilation is one-time operation
      console.warn(`  ⚠️  Circuit already compiled (skipping re-compile to avoid conflicts)`);
      return null;
    }

    // Time the compilation
    const startTime = performance.now();
    try {
      execSync(
        `circom ${circomFile} --r1cs --wasm --sym -o ${circuitPath}`,
        { stdio: "pipe", cwd: circuitPath }
      );
    } catch (e) {
      console.warn(`  ⚠️  circom compilation failed: ${e.message}`);
      return null;
    }
    const endTime = performance.now();

    const compilationTime = endTime - startTime;
    return compilationTime;
  } catch (err) {
    console.warn(`  ⚠️  Circuit compilation error: ${err.message}`);
    return null;
  }
}

/**
 * Stage 2: Measure witness generation time
 */
async function measureWitnessGeneration() {
  try {
    // Create test input from config
    fs.writeFileSync(paths.inputJson, JSON.stringify(circuitConfig.testInput));

    const startTime = performance.now();
    
    try {
      // Use snarkjs wtns calculate - runs from the wasm directory
      execSync(
        `snarkjs wtns calculate AssetOwnership.wasm test_input.json ${circuitConfig.outputs.witness}`,
        {
          cwd: paths.wasmDir,
          stdio: "pipe",
          timeout: 30000,
          shell: true,
          windowsHide: true
        }
      );
    } catch (e) {
      // Even if execSync throws, the file might have been created
      if (!fs.existsSync(paths.witness)) {
        return null;
      }
    }
    
    const endTime = performance.now();

    if (!fs.existsSync(paths.witness)) {
      return null;
    }

    const witnessTime = endTime - startTime;
    return witnessTime;
  } catch (err) {
    return null;
  }
}

/**
 * Stage 3: Measure proof generation time
 */
async function measureProofGeneration() {
  try {
    // Witness should be in wasm directory
    let useWitness = paths.witness;
    if (!fs.existsSync(useWitness)) {
      console.warn(`  ⚠️  No witness file found`);
      return null;
    }

    if (!fs.existsSync(paths.zkey)) {
      console.warn(`  ⚠️  zkey not found at ${paths.zkey}`);
      return null;
    }

    const startTime = performance.now();
    try {
      execSync(
        `snarkjs groth16 prove ${paths.zkey} ${useWitness} ${paths.proof} ${paths.public}`,
        { stdio: "pipe" }
      );
    } catch (e) {
      console.warn(`  ⚠️  snarkjs groth16 prove failed: ${e.message}`);
      return null;
    }
    const endTime = performance.now();

    const proofTime = endTime - startTime;
    return proofTime;
  } catch (err) {
    console.warn(`  ⚠️  Proof generation error: ${err.message}`);
    return null;
  }
}

/**
 * Stage 4: Measure verification time
 */
async function measureVerification() {
  try {
    if (!fs.existsSync(paths.vkey)) {
      console.warn(`  ⚠️  verification_key.json not found`);
      return null;
    }

    if (!fs.existsSync(paths.proof) || !fs.existsSync(paths.public)) {
      console.warn(`  ⚠️  Proof or public file not found`);
      return null;
    }

    const startTime = performance.now();
    try {
      execSync(
        `snarkjs groth16 verify ${paths.vkey} ${paths.public} ${paths.proof}`,
        { stdio: "pipe" }
      );
    } catch (e) {
      console.warn(`  ⚠️  snarkjs groth16 verify failed: ${e.message}`);
      return null;
    }
    const endTime = performance.now();

    const verifyTime = endTime - startTime;
    return verifyTime;
  } catch (err) {
    console.warn(`  ⚠️  Verification error: ${err.message}`);
    return null;
  }
}

/**
 * Stage 5: Measure gas consumption
 */
function measureGasConsumption() {
  try {
    const buildInfoPath = path.join(process.cwd(), "artifacts/build-info");

    if (!fs.existsSync(buildInfoPath)) {
      return null;
    }

    const files = fs.readdirSync(buildInfoPath);
    const outputFile = files.find((f) => f.endsWith(".output.json"));

    if (!outputFile) {
      return null;
    }

    const content = fs.readFileSync(path.join(buildInfoPath, outputFile), "utf-8");
    const buildInfo = JSON.parse(content);

    // Navigate to contracts: buildInfo.output.contracts
    const contracts = buildInfo.output?.contracts || {};
    let totalBytes = 0;

    for (const file of Object.values(contracts)) {
      for (const contract of Object.values(file)) {
        const c = contract;
        if (c.evm?.bytecode?.object) {
          const bytecodeSize = (c.evm.bytecode.object.length - 2) / 2;
          totalBytes += bytecodeSize;
        }
      }
    }

    if (totalBytes > 0) {
      // Approximate: 4 gas per bytecode byte + overhead
      const estimatedGas = Math.floor(totalBytes * 4 + 150000);
      return estimatedGas;
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Generates comprehensive cost report (10 runs measuring workflow stages)
 * Uses last 5 runs for statistics to exclude warmup
 * Skips compilation since it's a one-time cost
 */
async function generateCostReport() {
  console.log("\n🚀 Measuring Workflow Stages (10 trials, averaging last 5)...\n");

  const NUM_RUNS = 10;
  const WARMUP_RUNS = 5; // Exclude first 5 trials, use last 5 for stats
  const stages = {
    witness: [],
    proof: [],
    verification: [],
    gas: [],
  };

  // Run measurements 10 times for all stages (skip compilation)
  for (let run = 1; run <= NUM_RUNS; run++) {
    console.log(`\n━━━ Trial ${run}/${NUM_RUNS} ━━━`);

    const witnessTime = await measureWitnessGeneration();
    if (witnessTime !== null) {
      stages.witness.push(witnessTime);
      console.log(`  ① Witness: ${witnessTime.toFixed(0)}ms`);
    } else {
      console.log(`  ① Witness: skipped`);
    }

    const proofTime = await measureProofGeneration();
    if (proofTime !== null) {
      stages.proof.push(proofTime);
      console.log(`  ② Proof: ${proofTime.toFixed(0)}ms`);
    } else {
      console.log(`  ② Proof: skipped`);
    }

    const verifyTime = await measureVerification();
    if (verifyTime !== null) {
      stages.verification.push(verifyTime);
      console.log(`  ③ Verification: ${verifyTime.toFixed(0)}ms`);
    } else {
      console.log(`  ③ Verification: skipped`);
    }

    const gasUsage = measureGasConsumption();
    if (gasUsage !== null) {
      stages.gas.push(gasUsage);
      console.log(`  ④ Gas: ${gasUsage.toLocaleString()} gas`);
    } else {
      console.log(`  ④ Gas: skipped`);
    }
  }

  console.log(`\n✅ Analysis complete\n`);

  // Calculate statistics for each stage - using last 5 trials only
  const stats = {
    witness: calculateStats(stages.witness.slice(WARMUP_RUNS)),
    proof: calculateStats(stages.proof.slice(WARMUP_RUNS)),
    verification: calculateStats(stages.verification.slice(WARMUP_RUNS)),
    gas: calculateStats(stages.gas.slice(WARMUP_RUNS)),
  };

  const metrics = {
    timestamp: new Date().toISOString(),
    measurementMetadata: {
      totalTrials: NUM_RUNS,
      warmupTrials: WARMUP_RUNS,
      statisticsTrials: NUM_RUNS - WARMUP_RUNS,
      note: "Statistics calculated from last 5 trials to exclude warmup period"
    },
    workflowStages: {
      witness: {
        name: "Witness Generation",
        description: "Time to compute witness from circuit and inputs",
        unit: "milliseconds",
        data: stages.witness.map((t, i) => ({
          trial: i + 1,
          value: parseFloat(t.toFixed(0)),
          warmup: i < WARMUP_RUNS
        })),
        stats: stats.witness,
      },
      proof: {
        name: "Proof Generation",
        description: "Time to generate Groth16 proof from witness",
        unit: "milliseconds",
        data: stages.proof.map((t, i) => ({
          trial: i + 1,
          value: parseFloat(t.toFixed(0)),
          warmup: i < WARMUP_RUNS
        })),
        stats: stats.proof,
      },
      verification: {
        name: "Verification (snarkjs)",
        description: "Time to verify proof using snarkjs",
        unit: "milliseconds",
        data: stages.verification.map((t, i) => ({
          trial: i + 1,
          value: parseFloat(t.toFixed(0)),
          warmup: i < WARMUP_RUNS
        })),
        stats: stats.verification,
      },
      gas: {
        name: "Gas Consumption",
        description: "Estimated gas for on-chain verification",
        unit: "gas",
        data: stages.gas.map((t, i) => ({
          trial: i + 1,
          value: parseFloat(t.toFixed(0)),
          warmup: i < WARMUP_RUNS
        })),
        stats: stats.gas,
      },
    },
  };

  return metrics;
}

/**
 * Calculate statistics for a set of measurements
 */
function calculateStats(values) {
  if (values.length === 0) {
    return { available: false };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance =
    values.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  return {
    available: true,
    count: values.length,
    min: parseFloat(sorted[0].toFixed(0)),
    max: parseFloat(sorted[sorted.length - 1].toFixed(0)),
    mean: parseFloat(mean.toFixed(0)),
    median: parseFloat(sorted[Math.floor(sorted.length / 2)].toFixed(0)),
    stddev: parseFloat(stddev.toFixed(0)),
    range: parseFloat((sorted[sorted.length - 1] - sorted[0]).toFixed(0)),
  };
}

/**
 * Prints formatted workflow cost report
 */
function printReport(metrics) {
  const div = "─".repeat(70);
  const box = "=".repeat(70);

  console.log("\n" + box);
  console.log("          📊 WORKFLOW COST ANALYSIS REPORT 📊");
  console.log(box + "\n");

  console.log("Generated:", metrics.timestamp);
  console.log(`Stages Measured: 4 | Total Trials: 10 | Stats from Trials 6-10\n`);
  console.log("Note: Trials 1-5 excluded as warmup period\n");

  // Print each stage (skip compilation)
  const stages = metrics.workflowStages;
  const stageOrder = ["witness", "proof", "verification", "gas"];
  const stageNumbers = { witness: "①", proof: "②", verification: "③", gas: "④" };

  for (const key of stageOrder) {
    const stage = stages[key];
    if (!stage) continue;
    
    console.log(div);
    console.log(`${stageNumbers[key]} ${stage.name.toUpperCase()}`);
    console.log(div);
    console.log(stage.description);
    console.log(`Unit: ${stage.unit}\n`);

    // Show all trials with warmup indicator
    console.log("Trial │ Value  │ Phase");
    console.log("──────┼────────┼──────────────");
    for (const run of stage.data) {
      const phase = run.warmup ? "⚙️  Warmup" : "📊 Measured";
      console.log(
        `  ${String(run.trial).padEnd(2)}  │ ${String(run.value).padStart(6)} │ ${phase}`
      );
    }

    // Show statistics
    if (stage.stats.available) {
      console.log("──────┼────────┼──────────────");
      console.log(`Min   │ ${String(stage.stats.min).padStart(6)} │ (trials 6-10)`);
      console.log(`Max   │ ${String(stage.stats.max).padStart(6)} │ (trials 6-10)`);
      console.log(`Mean  │ ${String(stage.stats.mean).padStart(6)} │ (trials 6-10)`);
      console.log(`StdDv │ ${String(stage.stats.stddev).padStart(6)} │ (trials 6-10)`);
      console.log(`Range │ ${String(stage.stats.range).padStart(6)} │ (trials 6-10)`);
    } else {
      console.log("⚠️  Data not available for this stage");
    }
    console.log();
  }

  console.log(div);
  console.log("📈 SUMMARY (from trials 6-10)");
  console.log(div);

  const avgWitness = stages.witness.stats.available
    ? stages.witness.stats.mean
    : "N/A";
  const avgProof = stages.proof.stats.available ? stages.proof.stats.mean : "N/A";
  const avgVerify = stages.verification.stats.available
    ? stages.verification.stats.mean
    : "N/A";
  const avgGas = stages.gas.stats.available ? stages.gas.stats.mean : "N/A";

  console.log(`Witness avg:       ${avgWitness}`);
  console.log(`Proof avg:         ${avgProof}`);
  console.log(`Verification avg:  ${avgVerify}`);
  console.log(`Gas avg:           ${avgGas}`);

  // Total estimate
  let total = 0;
  if (stages.witness.stats.available) total += stages.witness.stats.mean;
  if (stages.proof.stats.available) total += stages.proof.stats.mean;
  if (stages.verification.stats.available)
    total += stages.verification.stats.mean;

  if (total > 0) {
    console.log(
      `\n⏱️  Total workflow time (Witness+Proof+Verify): ~${total.toFixed(0)}ms per proof`
    );
  }

  console.log("\n" + box + "\n");
}

/**
 * Main execution
 */
async function main() {
  try {
    const metrics = await generateCostReport();

    // Print to console
    printReport(metrics);

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(metrics, null, 2));
    console.log(`📁 JSON Report saved: ${OUTPUT_FILE}\n`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error generating cost report:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
