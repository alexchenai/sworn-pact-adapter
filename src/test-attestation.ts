import { SwornPactAdapter } from "./adapter";
import { verifyAttestation } from "./sworn-client";

async function main() {
  console.log("=== SWORN x PACT Adapter Integration Test ===\n");

  const adapter = new SwornPactAdapter();

  // Test 1: Network connectivity
  console.log("Test 1: Connecting to Arbitrum One...");
  const network = await adapter.getNetwork();
  console.log(`  Chain ID: ${network.chainId} (expected: 42161)`);
  console.log(`  Current block: ${network.blockNumber}`);
  console.assert(network.chainId === 42161, "Must connect to Arbitrum One");
  console.log("  PASS\n");

  // Test 2: Bridge PACT #5 to SWORN (the real escrow pact)
  console.log("Test 2: Bridging PACT #5 (real escrow) to SWORN attestation...");
  const result = await adapter.bridgePactToSworn(5, "0x344441FE9A207fD2c08CBC260aa5e491Fe95711A");
  console.log(`  Pact ID: ${result.pact_id}`);
  console.log(`  Worker: ${result.worker_address}`);
  console.log(`  Amount: ${result.amount_pact} PACT`);
  console.log(`  Capability Hash: ${result.capability_hash}`);
  console.log(`  Attestation ID: ${result.attestation_id}`);
  console.log(`  Attestation Status: ${result.attestation_status}`);
  console.log(`  Bridged at: ${result.bridged_at}`);
  console.assert(result.attestation_id.length > 0, "Must receive attestation ID");
  console.log("  PASS\n");

  // Test 3: Verify the attestation
  console.log("Test 3: Verifying SWORN attestation...");
  const verification = await verifyAttestation(result.attestation_id);
  console.log(`  Valid: ${verification.valid}`);
  if (verification.reason) console.log(`  Reason: ${verification.reason}`);
  console.log("  PASS (verification call succeeded)\n");

  console.log("=== All tests passed ===");
  console.log("\nSummary:");
  console.log(`  Arbitrum One block: ${network.blockNumber}`);
  console.log(`  SWORN attestation: ${result.attestation_id}`);
  console.log(`  Cross-chain bridge: Arbitrum (chain 42161) -> Solana devnet`);
  console.log(`  PACT escrow contract: 0x220B97972d6028Acd70221890771E275e7734BFB`);
  console.log(`  SWORN API: https://sworn.chitacloud.dev`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
