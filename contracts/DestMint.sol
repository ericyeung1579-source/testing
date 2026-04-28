// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./AssetToken.sol";

contract DestMint {
    AssetToken public token;
    address[] public validators;
    mapping(address => bool) public isValidator;
    uint256 public threshold;
    mapping(bytes32 => bool) public usedMessages;

    event Minted(bytes32 indexed messageHash, address indexed recipient, uint256 amount);

    constructor(address _token, address[] memory _validators, uint256 _threshold) {
        token = AssetToken(_token);
        validators = _validators;
        threshold = _threshold;
        for (uint i = 0; i < _validators.length; i++) {
            isValidator[_validators[i]] = true;
        }
    }

    // New function that recomputes the hash on-chain, including this contract's address
    function mintWithSignatures(
        bytes32 lockId,
        uint256 assetId,
        uint256 amount,
        address recipient,
        uint256 nonce,
        uint256 sourceChainId,
        bytes[] calldata signatures
    ) external {
        // Recompute the exact hash that validators signed (must include destination contract address)
        bytes32 expectedHash = keccak256(abi.encodePacked(
            lockId,
            assetId,
            amount,
            recipient,
            nonce,
            sourceChainId,
            address(this)   // ← critical: bind to this specific contract
        ));
        require(!usedMessages[expectedHash], "Message already used");
        require(signatures.length >= threshold, "Not enough signatures");

        address[] memory signers = new address[](signatures.length);
        for (uint i = 0; i < signatures.length; i++) {
            address signer = recoverSigner(expectedHash, signatures[i]);
            require(isValidator[signer], "Invalid validator");
            signers[i] = signer;
        }

        // Ensure at least `threshold` unique validators
        uint256 uniqueCount = countUniqueSigners(signers);
        require(uniqueCount >= threshold, "Not enough unique validators");

        usedMessages[expectedHash] = true;
        token.mint(recipient, amount);

        emit Minted(expectedHash, recipient, amount);
    }

    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        // Add the Ethereum prefix
        bytes32 prefixedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
        return ecrecover(prefixedHash, v, r, s);
    }

    function countUniqueSigners(address[] memory arr) internal pure returns (uint256) {
        uint256 count = 0;
        for (uint i = 0; i < arr.length; i++) {
            bool duplicate = false;
            for (uint j = 0; j < i; j++) {
                if (arr[i] == arr[j]) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) count++;
        }
        return count;
    }
}