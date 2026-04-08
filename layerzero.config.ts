import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { TwoWayConfig, generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption } from '@layerzerolabs/toolbox-hardhat'

import type { OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

const homeChainContract: OmniPointHardhat = {
    eid: EndpointId.BASESEP_V2_TESTNET,   // ← Change to SEPOLIA later if you want
    contractName: 'MyOFTAdapter',         // ← This is now your adapter
}

const destChainContract: OmniPointHardhat = {
    eid: EndpointId.ARBSEP_V2_TESTNET,
    contractName: 'MyOFT',                // destination uses the mintable OFT
}

// Base <-> Arbitrum (you can add more chains later)
const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    { msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 80000, value: 0 },
]

const pathways: TwoWayConfig[] = [
    [
        homeChainContract,
        destChainContract,
        [['LayerZero Labs'], []],
        [1, 1],
        [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
    ],
]

export default async function () {
    const connections = await generateConnectionsConfig(pathways)
    return {
        contracts: [{ contract: homeChainContract }, { contract: destChainContract }],
        connections,
    }
}
