import express from "express";
import { SwornPactAdapter } from "./adapter";
import { verifyAttestation } from "./sworn-client";

const app = express();
app.use(express.json());

const adapter = new SwornPactAdapter();

// Store bridged attestations in memory (for demo)
const attestationStore: Record<string, any> = {};

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "sworn-pact-relay",
    version: "1.0.0",
    description: "Cross-chain relay bridging PACT escrow (Arbitrum One) to SWORN attestations (Solana devnet)",
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
  const result = await verifyAttestation(id);
  return res.json({ attestation_id: id, ...result });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[sworn-pact-relay] Listening on port ${PORT}`);
  console.log(`[sworn-pact-relay] PACT Escrow: 0x220B97972d6028Acd70221890771E275e7734BFB (Arbitrum One)`);
  console.log(`[sworn-pact-relay] SWORN API: ${process.env.SWORN_API_URL || "https://sworn-devnet.chitacloud.dev"}`);
});

export default app;
