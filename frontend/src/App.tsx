import React, { useState, useEffect } from 'react';
import { Button, TextField, Typography, Box, Container, List, ListItem, ListItemText, Paper } from '@mui/material';
import { ethers } from 'ethers';
import { getRegistryContract, getTokenContract, getSigner } from './utils/web3';
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

interface Asset {
  id: string;
  secret: string;
  commitment: string;
  registered: boolean;
  proven: boolean;
  tokensMinted: string; // as ether string (e.g., "1000.0")
}

const parseContractError = (error: any): string => {
  const msg: string = error?.message ?? '';
  if (msg.includes('Already registered') || msg.includes('CALL_EXCEPTION') || msg.includes('estimateGas')) {
    if (msg.includes('registerAsset') || msg.includes('estimateGas')) return 'This asset ID is already registered.';
  }
  if (msg.includes('Not found')) return 'Asset not found on-chain.';
  if (msg.includes('Bad commitment')) return 'Commitment mismatch — asset may have been registered with a different secret.';
  if (msg.includes('Only owner can prove')) return 'Only the original owner can prove this asset.';
  if (msg.includes('Invalid proof')) return 'Proof verification failed — please try again.';
  if (msg.includes('Assert Failed')) return 'Proof generation failed — commitment does not match the secret and asset ID.';
  if (msg.includes('user rejected') || msg.includes('User denied')) return 'Transaction rejected by user.';
  if (msg.includes('CALL_EXCEPTION') || msg.includes('missing revert data')) return 'Transaction reverted — the asset ID may already be registered.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connect')) return 'Could not connect to the local node. Is Hardhat running?';
  return 'Unexpected error — check the browser console for details.';
};

const App: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [newAssetId, setNewAssetId] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [status, setStatus] = useState('');
  const [totalBalance, setTotalBalance] = useState('0');

  // Load total balance whenever assets change (or after proofs)
  useEffect(() => {
    fetchTotalBalance();
  }, [assets]);

  const fetchTotalBalance = async () => {
    try {
      const tokenContract = await getTokenContract();
      const signer = await getSigner();
      const address = await signer.getAddress();
      const bal = await tokenContract.balanceOf(address);
      setTotalBalance(ethers.formatEther(bal));
    } catch (error) {
      console.error('Balance fetch error:', error);
    }
  };

  const generateSecret = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const newSecret = BigInt('0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')).toString();
    setNewSecret(newSecret);
    setStatus('Secret generated!');
  };

  const computeCommitment = async () => {
    if (!newSecret || !newAssetId) {
      setStatus('Enter secret and asset ID first!');
      return;
    }

    try {
      setStatus('Computing commitment...');
      const poseidon = await buildPoseidon();
      const hash = poseidon([BigInt(newSecret), BigInt(newAssetId)]);
      const commitmentStr = poseidon.F.toString(hash);
      
      // Add new asset to list
      setAssets(prev => [...prev, {
        id: newAssetId,
        secret: newSecret,
        commitment: commitmentStr,
        registered: false,
        proven: false,
        tokensMinted: '0'
      }]);
      
      setNewAssetId('');
      setNewSecret('');
      setStatus('Asset added! Now register it on-chain.');
    } catch (error) {
      console.error(error);
      setStatus('Error computing commitment.');
    }
  };

  const registerAsset = async (asset: Asset) => {
    try {
      const contract = await getRegistryContract();
      const tx = await contract.registerAsset(BigInt(asset.id), BigInt(asset.commitment));
      await tx.wait();
      
      // Update asset registration status
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, registered: true } : a
      ));
      setStatus(`Asset ${asset.id} registered!`);
    } catch (error: any) {
      console.error('Registration error:', error);
      setStatus(`Registration failed: ${parseContractError(error)}`);
    }
  };

  const generateProof = async (asset: Asset): Promise<any> => {
  setStatus(`Generating proof for asset ${asset.id}...`);
  
  const input = {
    secret: asset.secret,
    assetId: asset.id,
    commitment: asset.commitment,
    ownerPublicKey: "1"
  };

  console.log("Input:", input);

  try {
    const wasmPath = '/circuits/AssetOwnership.wasm';
    const zkeyPath = '/circuits/AssetOwnership_0001.zkey';

    // Use fullProve to generate proof directly
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.log("Proof generated:", proof);
    return { proof, publicSignals };
    } catch (error) {
    console.error('Proof generation error:', error);
    throw error;
    }
  };

  const submitProof = async (asset: Asset) => {
    try {
      const { proof, publicSignals } = await generateProof(asset);
    
      const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
      const b = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
      ];
      const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

      const contract = await getRegistryContract();
      const tx = await contract.proveOwnership(
        a, b, c, 
        BigInt(publicSignals[0]), 
        BigInt(publicSignals[1])
      );
      await tx.wait();

      // Mark as proven optimistically
      const tokensFormatted = ethers.formatEther(ethers.parseEther('1000'));
      setAssets(prev => prev.map(a =>
        a.id === asset.id ? { ...a, proven: true, tokensMinted: tokensFormatted } : a
      ));
      setStatus(`Proof submitted! Minted ${tokensFormatted} ASSET for asset ${asset.id}.`);
    
      fetchTotalBalance();
    } catch (error: any) {
      console.error('Proof submission error:', error);
      setStatus(`Proof failed: ${parseContractError(error)}`);
    }
  };

  // Tokens per proof is fixed at 1000 ASSET by the contract
  const refreshAssetTokens = () => {
    const tokensFormatted = ethers.formatEther(ethers.parseEther('1000'));
    const updated = assets.map((asset) =>
      asset.proven ? { ...asset, tokensMinted: tokensFormatted } : asset
    );
    setAssets(updated);
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>ZK Asset Tokenization</Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Manage multiple assets with zero-knowledge proofs.
        </Typography>

        {/* Add Asset Form */}
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6">Add New Asset</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
            <Button variant="contained" onClick={generateSecret}>Generate Secret</Button>
            <TextField 
              label="Asset ID" 
              value={newAssetId} 
              onChange={(e) => setNewAssetId(e.target.value)} 
              sx={{ width: 150 }} 
            />
            <TextField 
              label="Secret" 
              value={newSecret} 
              onChange={(e) => setNewSecret(e.target.value)} 
              sx={{ width: 250 }} 
            />
            <Button variant="contained" onClick={computeCommitment}>Add Asset</Button>
          </Box>
        </Paper>

        {/* Assets List */}
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6">Your Assets</Typography>
          {assets.length === 0 ? (
            <Typography>No assets yet. Add one above.</Typography>
          ) : (
            <List>
              {assets.map((asset) => (
                <ListItem key={asset.id} divider>
                  <ListItemText
                    primary={`Asset ID: ${asset.id}`}
                    secondary={
                      <>
                        Commitment: {asset.commitment.substring(0, 10)}...<br />
                        Registered: {asset.registered ? '✅' : '❌'} | 
                        Proven: {asset.proven ? '✅' : '❌'} | 
                        Minted: {asset.tokensMinted} ASSET
                      </>
                    }
                  />
                  <Box>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      disabled={asset.registered}
                      onClick={() => registerAsset(asset)}
                      sx={{ mr: 1 }}
                    >
                      Register
                    </Button>
                    <Button 
                      size="small" 
                      variant="contained" 
                      disabled={!asset.registered || asset.proven}
                      onClick={() => submitProof(asset)}
                    >
                      Prove
                    </Button>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>

        {/* Status and Balance */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="success.main">
            Status: {status}
          </Typography>
          <Typography variant="h6">
            Total Balance: {totalBalance} ASSET
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default App;