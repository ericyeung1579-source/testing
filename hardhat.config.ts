// Get the environment configuration from .env file
import 'dotenv/config'

import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import '@nomiclabs/hardhat-ethers'
import '@layerzerolabs/toolbox-hardhat'
import { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'

import { EndpointId } from '@layerzerolabs/lz-definitions'

import './type-extensions'
import './tasks/sendOFT'

// Default Hardhat test mnemonic (used if no MNEMONIC or PRIVATE_KEY is set)
const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk"

const MNEMONIC = process.env.MNEMONIC
const PRIVATE_KEY = process.env.PRIVATE_KEY

const accounts: HttpNetworkAccountsUserConfig = MNEMONIC
    ? { mnemonic: MNEMONIC }
    : PRIVATE_KEY
      ? [PRIVATE_KEY]
      : { mnemonic: DEFAULT_MNEMONIC }

const config: HardhatUserConfig = {
    paths: {
        cache: 'cache/hardhat',
    },
    solidity: {
        compilers: [
            {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545",
            accounts,
            chainId: 31337,
        },
        chainA: {
            url: "http://127.0.0.1:8545",
            accounts,
            chainId: 31337,
        },
        chainB: {
            url: "http://127.0.0.1:8546",
            accounts,
            chainId: 31337,
        },
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/...',
            accounts,
        },
        'arbitrum-sepolia': {
            eid: EndpointId.ARBSEP_V2_TESTNET,
            url: process.env.RPC_URL_ARB_SEPOLIA || 'https://arbitrum-sepolia.gateway.tenderly.co',
            accounts,
        },
        'base-sepolia': {
            eid: EndpointId.BASESEP_V2_TESTNET,
            url: process.env.RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.gateway.tenderly.co',
            accounts,
            oftAdapter: {
                tokenAddress: '0x0',
            },
        },
        hardhat: {
            allowUnlimitedContractSize: true,
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
}

export default config