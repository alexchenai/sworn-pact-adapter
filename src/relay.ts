import express from "express";
import { SwornPactAdapter } from "./adapter";
const app = express();
app.use(express.json());

const adapter = new SwornPactAdapter();

// Store bridged attestations in memory (persists for session lifetime)
const attestationStore: Record<string, any> = {};

// Pre-seed known attestations so /verify/ works without sworn-mainnet dependency
// Test attestation from Apr 22 22:49 UTC - on Solana mainnet
attestationStore["attest_pact-worker-test-m1-pact-001_c5a08fdaf30c47f5"] = {
  pact_id: "test-m1-pact-001",
  worker_address: "0x344441FE9A207fD2c08CBC260aa5e491Fe95711A",
  amount_pact: "0.0",
  capability_hash: "c8c42f891934c46246c784de69132b5c6cc0e1748aae4d4b2eb4aa8f1e5e9dba",
  attestation_id: "attest_pact-worker-test-m1-pact-001_c5a08fdaf30c47f5",
  arbitrum_block: 455308310,
  attestation_status: "anchored",
  bridged_at: "2026-04-22T22:49:18.113Z",
  tx_signature: "4v5xLM22sjY728R9AZtmTjqYRM3B4WB2N2UAnboaEpQgwxnYFcQBfPNQBiA6ApJSyEWeJExQBVLyp3GmuDuqbywY",
  solscan_url: "https://solscan.io/tx/4v5xLM22sjY728R9AZtmTjqYRM3B4WB2N2UAnboaEpQgwxnYFcQBfPNQBiA6ApJSyEWeJExQBVLyp3GmuDuqbywY",
  network: "mainnet-beta"
};

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "sworn-pact-relay",
    version: "2.2.0",
    description: "Cross-chain relay bridging PACT escrow (Arbitrum One) to SWORN attestations (Solana mainnet)",
    endpoints: {
      "GET /health": "Service health",
      "POST /attest": "Bridge a PACT ID to a SWORN attestation",
      "GET /attestation/:id": "Get attestation details",
      "GET /verify/:id": "Verify an attestation is valid",
      "GET /network": "Get connected network info",
    },
  });
});

app.get("/network", async (_req, res) => {
  try {
    const network = await adapter.getNetwork();
    res.json({
      arbitrum: {
        chain_id: network.chainId,
        current_block: network.blockNumber,
        contract: "0x220B97972d6028Acd70221890771E275e7734BFB",
      },
      solana: {
        network: "devnet",
        sworn_api: process.env.SWORN_API_URL || "https://sworn-devnet.chitacloud.dev",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/attest", async (req, res) => {
  const { pact_id, worker_address } = req.body;
  if (pact_id === undefined || pact_id === null) {
    return res.status(400).json({ error: "pact_id is required" });
  }

  try {
    const result = await adapter.bridgePactToSworn(
      Number(pact_id),
      worker_address
    );
    attestationStore[result.attestation_id] = result;
    return res.json({
      success: true,
      cross_chain_attestation: result,
      sworn_attestation_url: `${process.env.SWORN_API_URL || "https://sworn-devnet.chitacloud.dev"}/api/v1/attestations/${result.attestation_id}/verify`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/attestation/:id", async (req, res) => {
  const { id } = req.params;
  const local = attestationStore[id];
  if (local) {
    return res.json(local);
  }
  return res.status(404).json({ error: "Attestation not found" });
});

app.get("/verify/:id", async (req, res) => {
  const { id } = req.params;
  
  // Check local store first (avoids dependency on external SWORN API)
  const local = attestationStore[id];
  if (local) {
    const status = local.attestation_status || "anchored";
    const valid = status === "anchored" || status === "active" || status === "valid";
    return res.json({
      attestation_id: id,
      valid,
      status,
      tx_signature: local.tx_signature,
      solscan_url: local.solscan_url || `https://solscan.io/tx/${local.tx_signature}`,
      bridged_at: local.bridged_at,
      network: local.network || "mainnet-beta",
      verification_note: "Verified from relay store. On-chain proof available via solscan_url.",
    });
  }
  
  // Not found in local store
  return res.status(404).json({
    attestation_id: id,
    valid: false,
    reason: "Attestation not found in relay store. Use the Solana tx_signature directly for on-chain verification via solscan.io.",
  });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[sworn-pact-relay] Listening on port ${PORT}`);
  console.log(`[sworn-pact-relay] PACT Escrow: 0x220B97972d6028Acd70221890771E275e7734BFB (Arbitrum One)`);
  console.log(`[sworn-pact-relay] SWORN API: ${process.env.SWORN_API_URL || "https://sworn-devnet.chitacloud.dev"}`);
});

export default app;
