/**
 * Circuit Configuration
 * Centralized configuration for all cost measurement scripts
 * Reduces hardcoding and makes it easy to switch between circuits
 */

export const circuitConfig = {
  // Circuit metadata
  name: "AssetOwnership",
  basePath: "circuits",
  
  // Files
  files: {
    circom: "AssetOwnership.circom",
    wasm: "AssetOwnership_js",
    zkey: "AssetOwnership_0001.zkey",
    vkey: "verification_key.json",
  },
  
  // Test inputs - update these when switching circuits
  testInput: {
    secret: "123456789",
    assetId: "1000",
    commitment: "18545201478374298500019494926384043568035445551691203693116491660858223240810",
    ownerPublicKey: "1",
  },
  
  // Output files for measurements
  outputs: {
    witness: "test_witness.wtns",
    proof: "test_proof.json",
    public: "test_public.json",
  },
  
  // Measurement configuration
  trials: {
    total: 10,
    warmupEnd: 5,  // Trials 1-5 are warmup, 6-10 are measured
  },
  
  // Report configuration
  report: {
    file: "cost-comparison-report.json",
    excludeCompilation: true,  // Set to false to include compilation in report
  }
};

/**
 * Helper function to get full paths
 */
export function getPaths(cwd = process.cwd()) {
  return {
    circuit: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.circom}`,
    wasm: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.wasm}`,
    zkey: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.zkey}`,
    vkey: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.vkey}`,
    wasmDir: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.wasm}`,
    witness: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.wasm}/${circuitConfig.outputs.witness}`,
    proof: `${cwd}/${circuitConfig.basePath}/${circuitConfig.outputs.proof}`,
    public: `${cwd}/${circuitConfig.basePath}/${circuitConfig.outputs.public}`,
    inputJson: `${cwd}/${circuitConfig.basePath}/${circuitConfig.files.wasm}/test_input.json`,
  };
}
