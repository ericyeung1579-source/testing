#!/usr/bin/env node

/**
 * Prover Abstraction Layer
 * 
 * Abstracts proof generation to support both snarkjs and rapidsnark.
 * Automatically detects available prover and uses the faster option.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

class ProverFactory {
  static USE_RAPIDSNARK = process.env.USE_RAPIDSNARK === 'true';
  static RAPIDSNARK_PATH = process.env.RAPIDSNARK_PATH || path.join(process.cwd(), 'rapidsnark-build/build/linux/prover');

  /**
   * Check if rapidsnark is available
   */
  static isRapidsnarkAvailable() {
    try {
      // Check if rapidsnark binary exists and is executable
      if (fs.existsSync(this.RAPIDSNARK_PATH)) {
        execSync(`${this.RAPIDSNARK_PATH} --version`, { stdio: 'pipe' });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get the appropriate prover instance
   */
  static getProver(circuitPath) {
    if (this.USE_RAPIDSNARK && this.isRapidsnarkAvailable()) {
      console.log('✨ Using rapidsnark (fast native prover)');
      return new RapidsnarkProver(circuitPath);
    } else {
      if (this.USE_RAPIDSNARK && !this.isRapidsnarkAvailable()) {
        console.warn('⚠️  Rapidsnark requested but not available. Falling back to snarkjs.');
        console.warn(`    Expected at: ${this.RAPIDSNARK_PATH}`);
      }
      console.log('📚 Using snarkjs (JavaScript prover)');
      return new SnarkjsProver(circuitPath);
    }
  }
}

/**
 * SnarkJS Prover Implementation
 */
class SnarkjsProver {
  constructor(circuitPath) {
    this.circuitPath = circuitPath;
  }

  generateWitness(inputJson) {
    const inputPath = path.join(this.circuitPath, 'input.json');
    fs.writeFileSync(inputPath, JSON.stringify(inputJson));

    execSync(
      'snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns',
      {
        cwd: this.circuitPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  }

  generateProof() {
    execSync(
      'snarkjs groth16 prove ../AssetOwnership_0001.zkey witness.wtns proof.json public.json',
      {
        cwd: this.circuitPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  }

  getProof() {
    const proofPath = path.join(this.circuitPath, 'proof.json');
    return JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
  }

  getPublic() {
    const publicPath = path.join(this.circuitPath, 'public.json');
    return JSON.parse(fs.readFileSync(publicPath, 'utf-8'));
  }

  /**
   * Full prove workflow: witness -> proof
   */
  async prove(inputJson) {
    this.generateWitness(inputJson);
    this.generateProof();
    return {
      proof: this.getProof(),
      public: this.getPublic(),
    };
  }
}

/**
 * Rapidsnark Prover Implementation
 */
class RapidsnarkProver {
  constructor(circuitPath) {
    this.circuitPath = circuitPath;
  }

  generateWitness(inputJson) {
    const inputPath = path.join(this.circuitPath, 'input.json');
    fs.writeFileSync(inputPath, JSON.stringify(inputJson));

    // Use rapidsnark's witness generation (if available)
    // Otherwise fall back to snarkjs witness
    try {
      execSync(
        'snarkjs wtns calculate AssetOwnership.wasm input.json witness.wtns',
        {
          cwd: this.circuitPath,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
    } catch (e) {
      throw new Error('Witness generation failed: ' + e.message);
    }
  }

  generateProof() {
    const proverPath = process.env.RAPIDSNARK_PATH || path.join(process.cwd(), 'rapidsnark-build/build/linux/prover');
    const zkeyPath = path.join(this.circuitPath, 'AssetOwnership_0001.zkey');
    const witnessPath = path.join(this.circuitPath, 'witness.wtns');
    const proofPath = path.join(this.circuitPath, 'proof.json');
    const publicPath = path.join(this.circuitPath, 'public.json');

    try {
      execSync(
        `${proverPath} ${zkeyPath} ${witnessPath} ${proofPath} ${publicPath}`,
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
    } catch (e) {
      throw new Error('Rapidsnark proof generation failed: ' + e.message);
    }
  }

  getProof() {
    const proofPath = path.join(this.circuitPath, 'proof.json');
    return JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
  }

  getPublic() {
    const publicPath = path.join(this.circuitPath, 'public.json');
    return JSON.parse(fs.readFileSync(publicPath, 'utf-8'));
  }

  /**
   * Full prove workflow: witness -> proof (optimized)
   */
  async prove(inputJson) {
    this.generateWitness(inputJson);
    this.generateProof(); // Rapidsnark is much faster here
    return {
      proof: this.getProof(),
      public: this.getPublic(),
    };
  }
}

export { ProverFactory, SnarkjsProver, RapidsnarkProver };
