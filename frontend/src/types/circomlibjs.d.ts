declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: bigint[]): any;
    F: {
      toString: (val: any) => string;
    };
  }>;
  export function buildMimcSponge(): Promise<{
    multiHash: (inputs: bigint[], key: bigint) => any;
    F: {
      toString: (val: any) => string;
    };
  }>;
}