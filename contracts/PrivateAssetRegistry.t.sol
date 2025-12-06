// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PrivateAssetRegistry} from "./PrivateAssetRegistry.sol";
import {Test} from "forge-std/Test.sol";

contract PrivateAssetRegistryTest is Test {
    PrivateAssetRegistry registry;
    address mockVerifier = address(0);
    address mockToken = address(1);

    function setUp() public {
        registry = new PrivateAssetRegistry(mockVerifier, mockToken);
    }

    function test_RegisterAsset() public {
        registry.registerAsset(1, 456);
        (uint256 assetId, uint256 commitment, address owner, bool exists, bool provenOnce, uint256 tokensMinted) = registry.assets(1);
        require(assetId == 1, "Asset ID mismatch");
        require(commitment == 456, "Commitment mismatch");
        require(owner == address(this), "Owner mismatch");
        require(exists, "Asset should exist");
        require(!provenOnce, "Should not be proven yet");
        require(tokensMinted == 0, "No tokens minted yet");
    }
}