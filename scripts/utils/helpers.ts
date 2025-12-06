/**
 * Shared utilities for ZK Asset Registry scripts
 * Provides common functions for address management, contract interactions, etc.
 */

import * as fs from "fs";
import * as path from "path";

export interface DeploymentAddresses {
  verifier: string;
  token: string;
  registry: string;
  timestamp: number;
}

/**
 * Load deployment addresses from JSON file
 * @returns Deployment addresses object
 * @throws Error if file not found or invalid
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

  if (!addresses.verifier || !addresses.token || !addresses.registry) {
    throw new Error("Invalid deployment addresses format");
  }

  return addresses;
}

/**
 * Save deployment addresses to JSON file
 * @param addresses Addresses to save
 */
export function saveDeploymentAddresses(addresses: DeploymentAddresses): void {
  const filePath = path.join(process.cwd(), "deployment-addresses.json");
  fs.writeFileSync(filePath, JSON.stringify(addresses, null, 2));
}

/**
 * Load proof and public inputs from JSON file
 * @returns Proof object with pi_a, pi_b, pi_c, protocol, and public inputs
 * @throws Error if file not found
 */
export function loadProof(): any {
  const filePath = path.join(process.cwd(), "proof.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      "Proof file not found. Please generate a proof first: .\\scripts\\2-prove\\generate_proof.ps1 42 123456789"
    );
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Format address for display (shortened)
 * @param address Full address
 * @returns Shortened address (0x1234...5678)
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format token amount for display
 * @param amount Amount in wei
 * @param decimals Number of decimals
 * @returns Formatted amount
 */
export function formatTokenAmount(amount: bigint, decimals: number = 18): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${integerPart}.${fractionalStr}`;
}

/**
 * Get sender signer from ethers
 * @returns First signer (assumed to be the account)
 */
export async function getSigner(): Promise<any> {
  const ethers = await import("ethers");
  const signers = await (ethers as any).getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available");
  }
  return signers[0];
}

/**
 * Pause execution for specified milliseconds
 * @param ms Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Print formatted section header
 * @param title Title of section
 */
export function printHeader(title: string): void {
  console.log("\n" + "=".repeat(50));
  console.log(`  ${title}`);
  console.log("=".repeat(50) + "\n");
}

/**
 * Print formatted step
 * @param number Step number
 * @param title Step title
 */
export function printStep(number: number, title: string): void {
  console.log(`\n✓ Step ${number}: ${title}`);
}

/**
 * Print success message
 * @param message Message to print
 */
export function printSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

/**
 * Print error message
 * @param message Message to print
 */
export function printError(message: string): void {
  console.log(`✗ ${message}`);
}

/**
 * Print warning message
 * @param message Message to print
 */
export function printWarning(message: string): void {
  console.log(`⚠ ${message}`);
}
