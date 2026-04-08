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
        uint256 assetId;
        uint256 commitment;
        address owner;
        bool exists;
        bool provenOnce;
        uint256 tokensMinted;
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
        assets[assetId] = Asset(assetId, commitment, msg.sender, true, false, 0);
        emit AssetRegistered(assetId, commitment, msg.sender);
    }


    function proveOwnership(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 assetId,
        uint256 commitment
    ) external {
        require(assets[assetId].exists, "Not found");
        require(assets[assetId].commitment == commitment, "Bad commitment");

        uint[3] memory input = [assetId, commitment, 1];
        require(verifier.verifyProof(a, b, c, input), "Invalid proof");
        // Verify that only the owner can prove ownership
        require(assets[assetId].owner == msg.sender, "Only owner can prove");

        // Mint tokens for first proof
        if (!assets[assetId].provenOnce) {
            assetToken.mint(msg.sender, tokensPerProof);
            assets[assetId].provenOnce = true;
            assets[assetId].tokensMinted = tokensPerProof;
        }

        emit OwnershipProven(assetId, msg.sender, assets[assetId].tokensMinted);
    }


    function setTokensPerProof(uint256 amount) external {
        // In production, use proper access control (e.g., onlyOwner)
        tokensPerProof = amount;
    }
}