pragma circom 2.2.0;


include "circomlib/circuits/poseidon.circom";


template AssetOwnership() {
    signal input secret;
    signal input assetId;
    signal input commitment;
    signal input ownerPublicKey;


    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== secret;
    poseidon.inputs[1] <== assetId;
    commitment === poseidon.out;
}


component main {public [assetId, commitment, ownerPublicKey]} = AssetOwnership();
