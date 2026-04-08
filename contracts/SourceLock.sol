// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./AssetToken.sol";

contract SourceLock {
    AssetToken public token;
    mapping(bytes32 => bool) public processedLocks;
    mapping(uint256 => bool) public usedNonces;

    event Locked(
        bytes32 indexed lockId,
        uint256 indexed assetId,
        uint256 amount,
        address indexed recipientOnDest,
        uint256 nonce,
        uint256 sourceChainId,
        uint[2] a,           // proof pi_a
        uint[2][2] b,        // proof pi_b
        uint[2] c,           // proof pi_c
        uint[3] pubSignals   // public inputs: assetId, commitment, 1
    );

    constructor(address _token) {
        token = AssetToken(_token);
    }

    function lock(
        uint256 assetId,
        uint256 amount,
        address recipientOnDest,
        uint256 nonce,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[3] calldata pubSignals
    ) external {
        require(amount > 0, "Amount > 0");
        require(!usedNonces[nonce], "Nonce used");
        usedNonces[nonce] = true;

        token.transferFrom(msg.sender, address(this), amount);

        bytes32 lockId = keccak256(
            abi.encodePacked(block.chainid, nonce, msg.sender, assetId)
        );
        require(!processedLocks[lockId], "Lock already processed");
        processedLocks[lockId] = true;

        emit Locked(lockId, assetId, amount, recipientOnDest, nonce, block.chainid, a, b, c, pubSignals);
    }
}