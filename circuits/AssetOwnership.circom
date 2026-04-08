pragma circom 2.2.0;


include "circomlib/circuits/mimcsponge.circom";


template AssetOwnership() {
    signal input secret;
    signal input assetId;
    signal input commitment;
    signal input ownerPublicKey;


    component mimc = MiMCSponge(1, 220, 1);
    mimc.ins[0] <== secret;
    mimc.k <== assetId;
    commitment === mimc.outs[0];
}


component main {public [assetId, commitment, ownerPublicKey]} = AssetOwnership();
