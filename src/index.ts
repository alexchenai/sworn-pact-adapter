// SWORN x PACT Adapter
// Cross-chain bridge: PACT escrow (Arbitrum One) -> SWORN attestations (Solana mainnet)
export { SwornPactAdapter } from "./adapter";
export { createSwornAttestation, verifyAttestation, buildCapabilityHash } from "./sworn-client";
export { PACT_ESCROW_ABI, PACT_ESCROW_ADDRESS, PACT_TOKEN_ADDRESS } from "./pact-abi";
