declare module 'snarkjs' {
  export const wtns: {
    calculate(input: any, wasm: string | Uint8Array): Promise<{ witness: any }>;
  };
  export const groth16: {
    prove(zkey: string | Uint8Array, witness: any): Promise<{ proof: any; publicSignals: string[] }>;
    fullProve(input: any, wasm: string | Uint8Array, zkey: string | Uint8Array, logger?: any): Promise<{ proof: any; publicSignals: string[] }>;
  };
}