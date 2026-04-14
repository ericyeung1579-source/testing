declare module 'circomlibjs' {
  export interface MimcSponge {
    multiHash(values: bigint[], key: number): bigint;
  }

  export interface Poseidon {
    (values: bigint[]): bigint;
  }

  export function buildMimcSponge(): Promise<MimcSponge>;
  export function buildMimcSponge(rounds: number): Promise<MimcSponge>;

  export function buildPoseidon(): Promise<Poseidon>;
  export function buildPoseidon(nInputs: number): Promise<Poseidon>;
}
