/**
 * Batch Operations Server
 * 
 * REST API for frontend to interact with batch operations
 * No hardcoding - all parameters from requests
 */

import express from "express";
import cors from "cors";
import BatchOperationsAPI from "./BatchOperationsAPI.mjs";

const app = express();
const api = new BatchOperationsAPI();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize API on startup
let initialized = false;
const initializeAPI = async () => {
  if (!initialized) {
    try {
      const result = await api.initialize();
      console.log("✅ API Initialized:", result);
      initialized = true;
    } catch (error) {
      console.error("❌ Initialization failed:", error.message);
    }
  }
};

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: initialized ? "ready" : "initializing",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /register
 * Register multiple assets
 * 
 * Body: {
 *   assets: [
 *     { assetId: "1001", secret: "secret1" },
 *     { assetId: "1002", secret: "secret2" }
 *   ]
 * }
 */
app.post("/register", async (req, res) => {
  try {
    const { assets } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({
        error: "Assets must be a non-empty array",
        example: {
          assets: [
            { assetId: "1001", secret: "secret1" },
            { assetId: "1002", secret: "secret2" },
          ],
        },
      });
    }

    const result = await api.registerAssets(assets);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /generate
 * Generate proofs for assets
 * 
 * Body: {
 *   assets: [
 *     { assetId: "1001", secret: "secret1" },
 *     { assetId: "1002", secret: "secret2" }
 *   ]
 * }
 */
app.post("/generate", async (req, res) => {
  try {
    const { assets } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({
        error: "Assets must be a non-empty array",
      });
    }

    const result = await api.generateProofs(assets);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /submit
 * Submit generated proofs
 * 
 * Body: {
 *   proofFile: "/path/to/batch-proofs.json",  (optional, uses default if not provided)
 *   publicFile: "/path/to/batch-public.json"   (optional)
 * }
 */
app.post("/submit", async (req, res) => {
  try {
    const { proofFile, publicFile } = req.body;
    const result = await api.submitProofs(proofFile, publicFile);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    availableEndpoints: [
      "GET /health",
      "POST /register",
      "POST /generate",
      "POST /submit",
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;

// Start server
initializeAPI().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Batch Operations API running on http://localhost:${PORT}`);
    console.log(`📝 Documentation: http://localhost:${PORT}/health`);
  });
});

export default app;
