#!/usr/bin/env node
/**
 * Circuit Compilation Time Measurement
 * Measures the time to compile Circom circuit to WASM and R1CS
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import { execSync } from "child_process";
import { circuitConfig, getPaths } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const paths = getPaths();

/**
 * Measure circuit compilation time
 */
async function measureCompilation() {
  try {
    const circuitPath = path.join(process.cwd(), circuitConfig.basePath);
    const circomFile = paths.circuit;
    const wasmOutput = paths.wasm;

    if (!fs.existsSync(circomFile)) {
      console.error("❌ Circuit file not found:", circomFile);
      process.exit(1);
    }

    // Check if already compiled
    if (fs.existsSync(wasmOutput)) {
      console.log("⚠️  Circuit already compiled at:", wasmOutput);
      console.log("🗑️  Deleting compiled artifacts to recompile...\n");
      
      try {
        // Remove entire directory recursively
        fs.rmSync(wasmOutput, { recursive: true, force: true });
        console.log("✅ Deleted:", wasmOutput);
      } catch (e) {
        console.error("❌ Failed to delete directory:", e.message);
        process.exit(1);
      }
    }

    console.log("🚀 Compiling Circom circuit...\n");
    console.log("Input:  ", circomFile);
    console.log("Output: ", circuitPath);
    console.log("");

    // Run 5 compilations with warmup exclusion
    const NUM_RUNS = 5;
    const compilations = [];

    for (let run = 1; run <= NUM_RUNS; run++) {
      console.log(`Trial ${run}/${NUM_RUNS}...`);

      // Re-delete for each run to ensure fresh compilation
      if (fs.existsSync(wasmOutput)) {
        fs.rmSync(wasmOutput, { recursive: true, force: true });
      }

      const startTime = performance.now();
      try {
        // Use -l flag to include node_modules (parent of circomlib)
        const nodeModulesPath = path.join(process.cwd(), "node_modules");
        execSync(
          `circom ${circomFile} --r1cs --wasm --sym -l ${nodeModulesPath} -o ${circuitPath}`,
          {
            stdio: "pipe",
            cwd: circuitPath,
            timeout: 120000
          }
        );
      } catch (e) {
        console.error(`❌ Compilation failed on trial ${run}:`, e.message);
        process.exit(1);
      }
      const endTime = performance.now();

      const compilationTime = endTime - startTime;
      compilations.push(compilationTime);

      console.log(`  ✅ Compiled in ${compilationTime.toFixed(0)}ms`);

      // Verify outputs
      const ricsFile = path.join(circuitPath, "AssetOwnership.r1cs");
      const wasmFile = path.join(wasmOutput, "AssetOwnership.wasm");
      if (!fs.existsSync(ricsFile) || !fs.existsSync(wasmFile)) {
        console.error("❌ Compilation output files not found");
        process.exit(1);
      }
    }

    // Calculate statistics (use all 5, no warmup exclusion for compilation)
    const stats = calculateStats(compilations);

    console.log("\n" + "=".repeat(70));
    console.log("📊 CIRCOM CIRCUIT COMPILATION RESULTS");
    console.log("=".repeat(70));
    console.log("");
    console.log("Trial │ Time (ms)");
    console.log("──────┼──────────");
    for (let i = 0; i < compilations.length; i++) {
      console.log(`  ${i + 1}   │ ${compilations[i].toFixed(0).padStart(8)}`);
    }
    console.log("──────┼──────────");
    console.log(`Min   │ ${stats.min.toFixed(0).padStart(8)}`);
    console.log(`Max   │ ${stats.max.toFixed(0).padStart(8)}`);
    console.log(`Mean  │ ${stats.mean.toFixed(0).padStart(8)}`);
    console.log(`Median│ ${stats.median.toFixed(0).padStart(8)}`);
    console.log(`StdDv │ ${stats.stddev.toFixed(0).padStart(8)}`);
    console.log(`Range │ ${stats.range.toFixed(0).padStart(8)}`);
    console.log("");
    console.log("=".repeat(70));

    // Save result
    const resultFile = path.join(process.cwd(), "compilation-benchmark.json");
    const result = {
      timestamp: new Date().toISOString(),
      circuit: "AssetOwnership.circom",
      trials: compilations.length,
      measurements: compilations.map((t, i) => ({ trial: i + 1, ms: parseFloat(t.toFixed(0)) })),
      stats: {
        min: parseFloat(stats.min.toFixed(0)),
        max: parseFloat(stats.max.toFixed(0)),
        mean: parseFloat(stats.mean.toFixed(0)),
        median: parseFloat(stats.median.toFixed(0)),
        stddev: parseFloat(stats.stddev.toFixed(0)),
        range: parseFloat(stats.range.toFixed(0))
      }
    };

    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(`\n📁 Results saved: ${resultFile}\n`);

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

/**
 * Calculate statistics
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
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mean,
    median: sorted[Math.floor(sorted.length / 2)],
    stddev: stddev,
    range: sorted[sorted.length - 1] - sorted[0]
  };
}

measureCompilation();
