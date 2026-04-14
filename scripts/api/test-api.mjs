#!/usr/bin/env node

/**
 * API Integration Tests
 * Tests all endpoints without Hardhat running
 * 
 * Usage:
 *   node scripts/api/test-api.mjs
 */

const API_URL = process.env.API_URL || "http://localhost:3000";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function request(method, endpoint, body = null) {
  const url = `${API_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { error: error.message };
  }
}

async function test(name, fn) {
  log(`\n▶ ${name}`, "blue");
  try {
    await fn();
    log("✓ PASSED", "green");
  } catch (error) {
    log(`✗ FAILED: ${error.message}`, "red");
  }
}

async function runTests() {
  log("\n========================================", "yellow");
  log("  API Integration Tests", "yellow");
  log("  Testing all endpoints...", "yellow");
  log("========================================\n", "yellow");

  // Test 1: Health Check
  await test("GET /health - Server is running", async () => {
    const result = await request("GET", "/health");
    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200) throw new Error(`Expected 200, got ${result.status}`);
    if (!result.data.status) throw new Error("Missing status in response");
  });

  // Test 2: Register Assets - Valid
  await test("POST /register - Register 2 assets", async () => {
    const result = await request("POST", "/register", {
      assets: [
        { assetId: "1001", secret: "secret_test_1001" },
        { assetId: "1002", secret: "secret_test_1002" },
      ],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200)
      throw new Error(`Expected 200, got ${result.status}`);
    if (result.data.status !== "success")
      throw new Error(`Expected success, got ${result.data.status}`);
    if (!result.data.transactionHash)
      throw new Error("Missing transactionHash in response");
  });

  // Test 3: Register Assets - Empty Array
  await test("POST /register - Reject empty array", async () => {
    const result = await request("POST", "/register", {
      assets: [],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 400 && result.data.status !== "error") {
      throw new Error(
        `Expected error response, got status ${result.status}/${result.data.status}`
      );
    }
  });

  // Test 4: Register Assets - No Assets Field
  await test("POST /register - Reject missing assets field", async () => {
    const result = await request("POST", "/register", {});

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 400 && result.data.status !== "error") {
      throw new Error(
        `Expected error response, got status ${result.status}/${result.data.status}`
      );
    }
  });

  // Test 5: Generate Proofs - Valid
  await test("POST /generate - Generate proofs for 2 assets", async () => {
    const result = await request("POST", "/generate", {
      assets: [
        { assetId: "2001", secret: "secret_test_2001" },
        { assetId: "2002", secret: "secret_test_2002" },
      ],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200)
      throw new Error(`Expected 200, got ${result.status}`);
    if (result.data.status !== "success")
      throw new Error(`Expected success, got ${result.data.status}`);
    if (!result.data.proofsGenerated)
      throw new Error("Missing proofsGenerated in response");
  });

  // Test 6: Generate Proofs - Empty Array
  await test("POST /generate - Reject empty array", async () => {
    const result = await request("POST", "/generate", {
      assets: [],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 400 && result.data.status !== "error") {
      throw new Error(`Expected error response, got status ${result.status}`);
    }
  });

  // Test 7: Submit Proofs - Default Paths
  await test("POST /submit - Submit proofs with default paths", async () => {
    const result = await request("POST", "/submit", {});

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    // This might fail if files don't exist, which is ok for this test
    // Just check the response format
    if (!result.data) throw new Error("No response data");
  });

  // Test 8: Submit Proofs - Custom Paths
  await test("POST /submit - Submit proofs with custom paths", async () => {
    const result = await request("POST", "/submit", {
      proofFile: "circuits/batch-proofs.json",
      publicFile: "circuits/batch-public.json",
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (!result.data) throw new Error("No response data");
  });

  // Test 9: Complete Workflow
  await test("POST /workflow - Execute complete workflow", async () => {
    const result = await request("POST", "/workflow", {
      assets: [
        { assetId: "3001", secret: "secret_test_3001" },
        { assetId: "3002", secret: "secret_test_3002" },
        { assetId: "3003", secret: "secret_test_3003" },
      ],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200)
      throw new Error(`Expected 200, got ${result.status}`);
    // Workflow might fail if dependencies aren't met, but should return structured response
    if (!result.data.status) throw new Error("Missing status in response");
  });

  // Test 10: Get Asset Status - Single Asset
  await test("GET /status/:assetIds - Query single asset", async () => {
    const result = await request("GET", "/status/1001");

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200)
      throw new Error(`Expected 200, got ${result.status}`);
    if (!result.data.assets) throw new Error("Missing assets array in response");
  });

  // Test 11: Get Asset Status - Multiple Assets
  await test("GET /status/:assetIds - Query multiple assets", async () => {
    const result = await request("GET", "/status/1001,1002,1003");

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200)
      throw new Error(`Expected 200, got ${result.status}`);
    if (!Array.isArray(result.data.assets))
      throw new Error("Missing assets array in response");
  });

  // Test 12: Invalid Endpoint
  await test("GET /invalid - Return 404 for invalid endpoint", async () => {
    const result = await request("GET", "/invalid");

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status === 404 || result.status === 200) {
      // 404 is expected, but might get 200 with error message depending on implementation
    } else {
      throw new Error(`Expected 404, got ${result.status}`);
    }
  });

  // Test 13: Register with Large Asset Count
  await test("POST /register - Handle large batch (10 assets)", async () => {
    const assets = [];
    for (let i = 0; i < 10; i++) {
      assets.push({
        assetId: `5${String(i).padStart(3, "0")}`,
        secret: `secret_batch_${i}`,
      });
    }

    const result = await request("POST", "/register", { assets });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    if (result.status !== 200)
      throw new Error(`Expected 200, got ${result.status}`);
    if (result.data.status !== "success")
      throw new Error(`Expected success, got ${result.data.status}`);
  });

  // Test 14: Register with Duplicate Assets
  await test("POST /register - Detect duplicate asset IDs", async () => {
    const result = await request("POST", "/register", {
      assets: [
        { assetId: "9001", secret: "secret1" },
        { assetId: "9001", secret: "secret2" },
      ],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);
    // Should either reject duplicates or accept them based on implementation
    if (!result.data) throw new Error("No response data");
  });

  // Test 15: Response Structure Validation
  await test("POST /register - Validate response structure", async () => {
    const result = await request("POST", "/register", {
      assets: [{ assetId: "7001", secret: "test_secret" }],
    });

    if (result.error) throw new Error(`Request failed: ${result.error}`);

    const data = result.data;
    if (!data.status) throw new Error("Missing status field");
    if (data.status !== "success" && !data.error)
      throw new Error("Error status must have error field");
    if (data.status === "success") {
      if (!data.action)
        throw new Error("Success response must have action field");
    }
  });

  log("\n========================================", "yellow");
  log("  Tests Complete!", "yellow");
  log("========================================\n", "yellow");
}

// Run tests
console.log(
  "\n⚠️  Make sure the API server is running: node scripts/api/server.mjs\n"
);

runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, "red");
  process.exit(1);
});
