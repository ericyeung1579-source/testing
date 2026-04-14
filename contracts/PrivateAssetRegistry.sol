// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory input
    ) external view returns (bool);
}

interface IAssetToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}


contract PrivateAssetRegistry {
    IVerifier public verifier;
    IAssetToken public assetToken;
    
    struct Asset {
        uint256 commitment;  // slot 0
        address owner;       // slot 1 (20 bytes)
        bool exists;         // slot 1 (1 byte, packed)
        bool provenOnce;     // slot 1 (1 byte, packed)
    }
    
    mapping(uint256 => Asset) public assets;
    
    uint256 public tokensPerProof = 1000 * 10**18;


    event AssetRegistered(uint256 indexed assetId, uint256 commitment, address owner);
    event OwnershipProven(uint256 indexed assetId, address owner, uint256 tokensMinted);


    constructor(address _verifier, address _assetToken) {
        verifier = IVerifier(_verifier);
        assetToken = IAssetToken(_assetToken);
    }


    function registerAsset(uint256 assetId, uint256 commitment) external {
        require(!assets[assetId].exists, "Already registered");
        assets[assetId] = Asset(commitment, msg.sender, true, false);
        emit AssetRegistered(assetId, commitment, msg.sender);
    }

    function registerAssetsBatch(uint256[] calldata assetIds, uint256[] calldata commitments) external {
        require(assetIds.length == commitments.length, "Arrays length mismatch");
        require(assetIds.length > 0, "Empty arrays");
        
        for (uint256 i = 0; i < assetIds.length; i++) {
            require(!assets[assetIds[i]].exists, "Asset already registered");
            assets[assetIds[i]] = Asset(commitments[i], msg.sender, true, false);
            emit AssetRegistered(assetIds[i], commitments[i], msg.sender);
        }
    }


    function proveOwnership(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint256 assetId,
        uint256 commitment
    ) external {
        require(assets[assetId].exists, "Not found");
        require(assets[assetId].commitment == commitment, "Bad commitment");
        require(assets[assetId].owner == msg.sender, "Only owner can prove");

        uint[3] memory input = [assetId, commitment, 1];
        require(verifier.verifyProof(a, b, c, input), "Invalid proof");

        if (!assets[assetId].provenOnce) {
            assets[assetId].provenOnce = true;
            assetToken.mint(msg.sender, tokensPerProof);
            emit OwnershipProven(assetId, msg.sender, tokensPerProof);
        } else {
            emit OwnershipProven(assetId, msg.sender, 0);
        }
    }

    struct ProofData {
        uint[2] a;
        uint[2][2] b;
        uint[2] c;
        uint256 assetId;
        uint256 commitment;
    }

    function proveOwnershipBatch(ProofData[] calldata proofs) external {
        require(proofs.length > 0, "Empty proofs array");
        
        uint256 totalTokens = 0;
        
        for (uint256 i = 0; i < proofs.length; i++) {
            ProofData calldata proof = proofs[i];
            
            require(assets[proof.assetId].exists, "Asset not found");
            require(assets[proof.assetId].commitment == proof.commitment, "Bad commitment");
            require(assets[proof.assetId].owner == msg.sender, "Only owner can prove");

            uint[3] memory input = [proof.assetId, proof.commitment, 1];
            require(verifier.verifyProof(proof.a, proof.b, proof.c, input), "Invalid proof");

            if (!assets[proof.assetId].provenOnce) {
                totalTokens += tokensPerProof;
                assets[proof.assetId].provenOnce = true;
                emit OwnershipProven(proof.assetId, msg.sender, tokensPerProof);
            } else {
                emit OwnershipProven(proof.assetId, msg.sender, 0);
            }
        }
        
        // Mint all tokens at once for gas efficiency
        if (totalTokens > 0) {
            assetToken.mint(msg.sender, totalTokens);
        }
    }


    function setTokensPerProof(uint256 amount) external {
        // In production, use proper access control (e.g., onlyOwner)
        tokensPerProof = amount;
    }
}