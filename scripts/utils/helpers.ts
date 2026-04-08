/**
 * Shared utilities for ZK Asset Registry scripts
 */

import * as fs from "fs";
import * as path from "path";

export interface DeploymentAddresses {
  verifier: string;
  token: string;
  registry: string;
  bridge: string;
  timestamp: number;
}

/**
 * Load deployment addresses from JSON file
 */
export function loadDeploymentAddresses(): DeploymentAddresses {
  const filePath = path.join(process.cwd(), "deployment-addresses.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Deployment addresses not found. Please run: npx hardhat run scripts/1-setup/deploy-contracts.ts`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const addresses = JSON.parse(content) as DeploymentAddresses;

  if (!addresses.verifier || !addresses.token || !addresses.registry || !addresses.bridge) {
    throw new Error("Invalid deployment addresses format (missing bridge)");
  }

  return addresses;
}

/**
 * Save deployment addresses to JSON file
 */
export function saveDeploymentAddresses(addresses: DeploymentAddresses): void {
  const filePath = path.join(process.cwd(), "deployment-addresses.json");
  fs.writeFileSync(filePath, JSON.stringify(addresses, null, 2));
}

/**
 * Print formatted section header
 */
export function printHeader(title: string): void {
  console.log("\n" + "=".repeat(50));
  console.log(`  ${title}`);
  console.log("=".repeat(50) + "\n");
}

/**
 * Print formatted step
 */
export function printStep(number: number, title: string): void {
  console.log(`✓ Step ${number}: ${title}`);
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: bigint | string | number, decimals: number = 18): string {
  // Convert input to BigInt (handles string, number, and bigint)
  const bigAmount = BigInt(amount);
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = bigAmount / divisor;
  const fractionalPart = bigAmount % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${integerPart}.${fractionalStr}`;
}

// (You can keep the rest of your original helper functions here if you have more, such as loadProof, etc.)

export default {
  loadDeploymentAddresses,
  saveDeploymentAddresses,
  printHeader,
  printStep,
  printSuccess,
  formatTokenAmount,
};
