#!/usr/bin/env node

/**
 * Complete Clean Benchmark Comparison
 * ethers.js vs viem with fresh asset ID ranges
 */

import { ethers } from "ethers";
import { createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import * as fs from "fs";
import { performance } from "perf_hooks";

const PROVIDER_URL = "http://127.0.0.1:8545";

// Track asset IDs separately to avoid conflicts
let ethersNextId = 2000000;
let viemNextId = 2050000;

async function benchmarkEthersJs() {
  console.log("\n=== ETHERS.JS PERFORMANCE ===\n");

  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const signer = await provider.getSigner();
  const addresses = JSON.parse(fs.readFileSync("deployment-addresses.json"));
  const registryJson = JSON.parse(
    fs.readFileSync("artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json")
  );

  const registry = new ethers.Contract(addresses.registry, registryJson.abi, signer);

  // Test 1: Single register
  console.log("TEST 1: Single registerAsset\n");
  const singleTimes = [];
  const singleGas = [];

  for (let i = 0; i < 5; i++) {
    const assetId = BigInt(ethersNextId++);
    const commitment = ethers.toBeHex(BigInt(Math.random() * 1e18), 32);

    const start = performance.now();
    const tx = await registry.registerAsset(assetId, commitment);
    const receipt = await tx.wait();
    const elapsed = performance.now() - start;

    singleTimes.push(elapsed);
    singleGas.push(receipt.gasUsed.toString());
    console.log(`  Trial ${i + 1}: ${elapsed.toFixed(2)}ms | Gas: ${receipt.gasUsed}`);
  }

  const singleAvg = singleTimes.reduce((a, b) => a + b) / singleTimes.length;
  console.log(`  📊 Average: ${singleAvg.toFixed(2)}ms\n`);

  // Test 2: Batch register
  console.log("TEST 2: Batch registerAssetsBatch (10 assets)\n");
  const batchTimes = [];
  const batchGas = [];

  for (let trial = 0; trial < 5; trial++) {
    const assetIds = [];
    const commitments = [];

    for (let i = 0; i < 10; i++) {
      assetIds.push(BigInt(ethersNextId++));
      commitments.push(ethers.toBeHex(BigInt(Math.random() * 1e18), 32));
    }

    const start = performance.now();
    const tx = await registry.registerAssetsBatch(assetIds, commitments);
    const receipt = await tx.wait();
    const elapsed = performance.now() - start;

    batchTimes.push(elapsed);
    batchGas.push(receipt.gasUsed.toString());
    console.log(`  Trial ${trial + 1}: ${elapsed.toFixed(2)}ms (${(elapsed / 10).toFixed(2)}ms/asset) | Gas: ${receipt.gasUsed}`);
  }

  const batchAvg = batchTimes.reduce((a, b) => a + b) / batchTimes.length;
  console.log(`  📊 Average: ${batchAvg.toFixed(2)}ms (${(batchAvg / 10).toFixed(2)}ms per asset)`);
  console.log(`  📊 Throughput: ${(10000 / batchAvg).toFixed(0)} assets/sec\n`);

  // Test 3: Read operations
  console.log("TEST 3: Asset lookup (read)\n");
  const readTimes = [];

  for (let trial = 0; trial < 10; trial++) {
    const testAssetId = BigInt(2000000 + trial);

    const start = performance.now();
    await registry.assets(testAssetId);
    const elapsed = performance.now() - start;

    readTimes.push(elapsed);
    console.log(`  Trial ${trial + 1}: ${elapsed.toFixed(2)}ms`);
  }

  const readAvg = readTimes.reduce((a, b) => a + b) / readTimes.length;
  console.log(`  📊 Average: ${readAvg.toFixed(2)}ms\n`);

  return {
    library: "ethers.js",
    singleRegister: { 
      trials: singleTimes.map(t => parseFloat(t.toFixed(2))),
      gas: singleGas.map(g => g),
      avg: parseFloat(singleAvg.toFixed(2)),
      avgGas: (singleGas.reduce((a, b) => BigInt(a) + BigInt(b)) / BigInt(singleGas.length)).toString()
    },
    batchRegister10: {
      trials: batchTimes.map(t => parseFloat(t.toFixed(2))),
      gas: batchGas.map(g => g),
      avg: parseFloat(batchAvg.toFixed(2)),
      perItem: parseFloat((batchAvg / 10).toFixed(2)),
      throughput: parseFloat((10000 / batchAvg).toFixed(0)),
      avgGas: (batchGas.reduce((a, b) => BigInt(a) + BigInt(b)) / BigInt(batchGas.length)).toString(),
      avgGasPerItem: ((batchGas.reduce((a, b) => BigInt(a) + BigInt(b)) / BigInt(batchGas.length)) / BigInt(10)).toString()
    },
    assetLookup: { 
      trials: readTimes.map(t => parseFloat(t.toFixed(2))),
      avg: parseFloat(readAvg.toFixed(2)) 
    }
  };
}

async function benchmarkViem() {
  console.log("\n=== VIEM PERFORMANCE ===\n");

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(PROVIDER_URL),
  });

  const walletClient = createWalletClient({
    chain: hardhat,
    transport: http(PROVIDER_URL),
  });

  const accounts = await walletClient.getAddresses();
  const signer = accounts[0];
  const addresses = JSON.parse(fs.readFileSync("deployment-addresses.json"));
  const registryJson = JSON.parse(
    fs.readFileSync("artifacts/contracts/PrivateAssetRegistry.sol/PrivateAssetRegistry.json")
  );

  // Test 1: Single register
  console.log("TEST 1: Single registerAsset\n");
  const singleTimes = [];
  const singleGas = [];

  for (let i = 0; i < 5; i++) {
    const assetId = BigInt(viemNextId++);
    const commitment = BigInt(Math.floor(Math.random() * 1e18));

    const start = performance.now();
    const hash = await walletClient.writeContract({
      address: addresses.registry,
      abi: registryJson.abi,
      functionName: "registerAsset",
      args: [assetId, commitment],
      account: signer,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const elapsed = performance.now() - start;

    singleTimes.push(elapsed);
    singleGas.push(receipt.gasUsed.toString());
    console.log(`  Trial ${i + 1}: ${elapsed.toFixed(2)}ms | Gas: ${receipt.gasUsed}`);
  }

  const singleAvg = singleTimes.reduce((a, b) => a + b) / singleTimes.length;
  console.log(`  📊 Average: ${singleAvg.toFixed(2)}ms\n`);

  // Test 2: Batch register
  console.log("TEST 2: Batch registerAssetsBatch (10 assets)\n");
  const batchTimes = [];
  const batchGas = [];

  for (let trial = 0; trial < 5; trial++) {
    const assetIds = [];
    const commitments = [];

    for (let i = 0; i < 10; i++) {
      assetIds.push(BigInt(viemNextId++));
      // Generate random integer for commitment
      commitments.push(BigInt(Math.floor(Math.random() * 1e18)));
    }

    const start = performance.now();
    const hash = await walletClient.writeContract({
      address: addresses.registry,
      abi: registryJson.abi,
      functionName: "registerAssetsBatch",
      args: [assetIds, commitments],
      account: signer,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const elapsed = performance.now() - start;

    batchTimes.push(elapsed);
    batchGas.push(receipt.gasUsed.toString());
    console.log(`  Trial ${trial + 1}: ${elapsed.toFixed(2)}ms (${(elapsed / 10).toFixed(2)}ms/asset) | Gas: ${receipt.gasUsed}`);
  }

  const batchAvg = batchTimes.reduce((a, b) => a + b) / batchTimes.length;
  console.log(`  📊 Average: ${batchAvg.toFixed(2)}ms (${(batchAvg / 10).toFixed(2)}ms per asset)`);
  console.log(`  📊 Throughput: ${(10000 / batchAvg).toFixed(0)} assets/sec\n`);

  // Test 3: Read operations
  console.log("TEST 3: Asset lookup (read)\n");
  const readTimes = [];

  for (let trial = 0; trial < 10; trial++) {
    const testAssetId = BigInt(2050000 + trial);

    const start = performance.now();
    await publicClient.readContract({
      address: addresses.registry,
      abi: registryJson.abi,
      functionName: "assets",
      args: [testAssetId],
    });
    const elapsed = performance.now() - start;

    readTimes.push(elapsed);
    console.log(`  Trial ${trial + 1}: ${elapsed.toFixed(2)}ms`);
  }

  const readAvg = readTimes.reduce((a, b) => a + b) / readTimes.length;
  console.log(`  📊 Average: ${readAvg.toFixed(2)}ms\n`);

  return {
    library: "viem",
    singleRegister: { 
      trials: singleTimes.map(t => parseFloat(t.toFixed(2))),
      gas: singleGas.map(g => g),
      avg: parseFloat(singleAvg.toFixed(2)),
      avgGas: (singleGas.reduce((a, b) => BigInt(a) + BigInt(b)) / BigInt(singleGas.length)).toString()
    },
    batchRegister10: {
      trials: batchTimes.map(t => parseFloat(t.toFixed(2))),
      gas: batchGas.map(g => g),
      avg: parseFloat(batchAvg.toFixed(2)),
      perItem: parseFloat((batchAvg / 10).toFixed(2)),
      throughput: parseFloat((10000 / batchAvg).toFixed(0)),
      avgGas: (batchGas.reduce((a, b) => BigInt(a) + BigInt(b)) / BigInt(batchGas.length)).toString(),
      avgGasPerItem: ((batchGas.reduce((a, b) => BigInt(a) + BigInt(b)) / BigInt(batchGas.length)) / BigInt(10)).toString()
    },
    assetLookup: { 
      trials: readTimes.map(t => parseFloat(t.toFixed(2))),
      avg: parseFloat(readAvg.toFixed(2)) 
    }
  };
}

async function main() {
  console.log("=== CLEAN PERFORMANCE BENCHMARK: ethers.js vs viem ===");

  const ethersResults = await benchmarkEthersJs();
  const viemResults = await benchmarkViem();

  // Comparison
  console.log("\n=== COMPARISON SUMMARY ===\n");
  
  const singleDiff = ((viemResults.singleRegister.avg - ethersResults.singleRegister.avg) / ethersResults.singleRegister.avg) * 100;
  const batchDiff = ((viemResults.batchRegister10.avg - ethersResults.batchRegister10.avg) / ethersResults.batchRegister10.avg) * 100;
  const readDiff = ((viemResults.assetLookup.avg - ethersResults.assetLookup.avg) / ethersResults.assetLookup.avg) * 100;

  console.log("Single Register:");
  console.log(`  ethers.js: ${ethersResults.singleRegister.avg.toFixed(2)}ms`);
  console.log(`  viem:      ${viemResults.singleRegister.avg.toFixed(2)}ms`);
  console.log(`  📈 viem is ${Math.abs(singleDiff).toFixed(1)}% ${singleDiff < 0 ? "faster" : "slower"}`);

  console.log("\nBatch Register (10 items):");
  console.log(`  ethers.js: ${ethersResults.batchRegister10.avg.toFixed(2)}ms (${ethersResults.batchRegister10.throughput} assets/sec)`);
  console.log(`  viem:      ${viemResults.batchRegister10.avg.toFixed(2)}ms (${viemResults.batchRegister10.throughput} assets/sec)`);
  console.log(`  📈 viem is ${Math.abs(batchDiff).toFixed(1)}% ${batchDiff < 0 ? "faster" : "slower"}`);

  console.log("\nRead Operation:");
  console.log(`  ethers.js: ${ethersResults.assetLookup.avg.toFixed(2)}ms`);
  console.log(`  viem:      ${viemResults.assetLookup.avg.toFixed(2)}ms`);
  console.log(`  📈 viem is ${Math.abs(readDiff).toFixed(1)}% ${readDiff < 0 ? "faster" : "slower"}`);

  // Calculate average improvement
  const avgImprovement = (Math.abs(singleDiff) + Math.abs(batchDiff) + Math.abs(readDiff)) / 3;
  console.log(`\n🎯 Average improvement with viem: ${avgImprovement.toFixed(1)}%`);

  // Save detailed results
  const results = {
    timestamp: new Date().toISOString(),
    ethers: ethersResults,
    viem: viemResults,
    comparison: {
      singleRegisterDiff: parseFloat(singleDiff.toFixed(1)),
      batchRegisterDiff: parseFloat(batchDiff.toFixed(1)),
      assetLookupDiff: parseFloat(readDiff.toFixed(1)),
      averageImprovement: parseFloat(avgImprovement.toFixed(1))
    }
  };

  fs.writeFileSync("library-benchmark-clean.json", JSON.stringify(results, null, 2));
  console.log("\n💾 Full results saved to: library-benchmark-clean.json");
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
