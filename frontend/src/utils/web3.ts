import { ethers } from 'ethers';

let addresses: any = null;

const loadAddresses = async () => {
  if (!addresses) {
    const response = await fetch('/deployment-addresses.json');
    addresses = await response.json();
  }
  return addresses;
};

export const getRegistryAddress = async () => {
  const addr = (await loadAddresses()).registry;
  console.log('Using registry address:', addr);
  return addr;
};

export const getTokenAddress = async () => (await loadAddresses()).token;

// ABIs – add batch methods
export const registryABI = [
  'function registerAsset(uint256 assetId, uint256 commitment) external',
  'function registerAssetsBatch(uint256[] calldata assetIds, uint256[] calldata commitments) external',
  'function proveOwnership(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint256 assetId, uint256 commitment) external',
  'function proveOwnershipBatch((uint[2], uint[2][2], uint[2], uint256, uint256)[] calldata proofs) external',
  'function assets(uint256) view returns (uint256 commitment, address owner, bool exists, bool provenOnce)',
  'function assetToken() view returns (address)'
];

export const tokenABI = [
  'function balanceOf(address account) external view returns (uint256)'
];

// Provider & signer (unchanged)
export const getProvider = () => new ethers.JsonRpcProvider('http://127.0.0.1:8545');

export const getSigner = async (accountIndex: number = 0) => {
  const provider = getProvider();
  return provider.getSigner(accountIndex);
};

export const getRegistryContract = async () => {
  const signer = await getSigner();
  const registryAddress = await getRegistryAddress();
  return new ethers.Contract(registryAddress, registryABI, signer);
};

export const getTokenContract = async () => {
  const provider = getProvider();
  const tokenAddress = await getTokenAddressFromRegistry();
  return new ethers.Contract(tokenAddress, tokenABI, provider);
};

export const getTokenAddressFromRegistry = async (): Promise<string> => {
  const provider = getProvider();
  const registryAddress = await getRegistryAddress();
  const registry = new ethers.Contract(registryAddress, registryABI, provider);
  return await registry.assetToken();
};
