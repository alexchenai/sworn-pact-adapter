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
      "GET /attestations": "List attestations (cursor: ?since=ISO&limit=N&network=mainnet-beta) - watcher polling endpoint",
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
        network: "mainnet-beta",
        sworn_api: process.env.SWORN_API_URL || "https://sworn-mainnet.chitacloud.dev",
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
// GET /attestations — list all attestations the relay knows about, with
// optional filters for the watcher polling pattern. Added 2026-04-26 to
// unblock the SWORNAutoSubmit Phase 2 watcher (sworn-autosubmit/watcher)
// which has no other way to discover newly-bridged attestations. Returns
// the same shape as GET /attestation/:id, plus a top-level cursor.
//
// Query params (all optional):
//   ?since=<ISO8601>      only return entries with bridged_at >= since
//   ?limit=<int 1..500>   cap response (default 100)
//   ?network=<string>     filter by network field (e.g. "mainnet-beta")
//
// The store is in-memory and per-process; the watcher MUST be tolerant
// to a relay restart wiping non-pre-seeded attestations and to
// out-of-order arrival within a single since window.
app.get("/attestations", (req, res) => {
  const sinceParam = typeof req.query.since === "string" ? req.query.since : "";
  const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  const networkFilter = typeof req.query.network === "string" ? req.query.network : "";
  const sinceTs = sinceParam ? Date.parse(sinceParam) : 0;
  if (sinceParam && !Number.isFinite(sinceTs)) {
    return res.status(400).json({
      error: "invalid since parameter",
      hint: "expected ISO 8601 timestamp e.g. 2026-04-26T03:00:00Z",
    });
  }

  const all = Object.values(attestationStore) as Array<Record<string, any>>;
  const filtered = all
    .filter((a) => {
      if (networkFilter && a.network !== networkFilter) return false;
      if (sinceTs) {
        const t = a.bridged_at ? Date.parse(a.bridged_at) : 0;
        if (!Number.isFinite(t) || t < sinceTs) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ta = a.bridged_at ? Date.parse(a.bridged_at) : 0;
      const tb = b.bridged_at ? Date.parse(b.bridged_at) : 0;
      return ta - tb;
    });

  const slice = filtered.slice(0, limit);
  const nextSince = slice.length > 0 ? slice[slice.length - 1].bridged_at : sinceParam || null;

  res.json({
    count: slice.length,
    total_in_store: all.length,
    next_since: nextSince,
    note: "Cursor pattern: pass next_since back as ?since= on the next call to skip already-seen entries. Store is in-memory; watcher MUST tolerate restarts and out-of-order arrival within a since window.",
    items: slice,
  });
});

// POST /admin/at-02-replay — clones an existing attestation under a new store
// key with bumped bridged_at, so the watcher sees the SAME attestation_id in
// two consecutive cursor windows. Tests the watcher dedup invariant (AT-02).
// Token-gated via AT_ADMIN_TOKEN env var. Remove after May 6 (AT framework end).
app.post("/admin/at-02-replay", (req, res) => {
  const expected = process.env.AT_ADMIN_TOKEN || "";
  const got = req.header("x-admin-token") || "";
  if (!expected || got !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const id = req.body && req.body.attestation_id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "attestation_id (string) is required" });
  }
  const original = attestationStore[id];
  if (!original) {
    return res.status(404).json({ error: "attestation not found in store", attestation_id: id });
  }
  const replayKey = id + "__at02_replay_" + Date.now();
  const newBridgedAt = new Date(Date.now()).toISOString();
  attestationStore[replayKey] = { ...original, bridged_at: newBridgedAt };
  return res.json({
    success: true,
    note: "AT-02 replay injected. The same attestation_id now appears at two distinct bridged_at timestamps in the store. Watcher should dedup the second on submittedSet[aid] check.",
    original_bridged_at: original.bridged_at,
    replay_bridged_at: newBridgedAt,
    attestation_id: id,
    store_keys: [id, replayKey],
  });
});


// POST /admin/at-02-replay — clones an existing attestation under a new store
// key with bumped bridged_at, so the watcher sees the SAME attestation_id in
// two consecutive cursor windows. Tests the watcher dedup invariant (AT-02).
// Token-gated via AT_ADMIN_TOKEN env var. Remove after May 6 (AT framework end).
app.post("/admin/at-02-replay", (req, res) => {
  const expected = process.env.AT_ADMIN_TOKEN || "";
  const got = (req.header("x-admin-token") || "").toString();
  if (!expected || got !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const id = req.body && req.body.attestation_id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "attestation_id (string) is required" });
  }
  const original = attestationStore[id];
  if (!original) {
    return res.status(404).json({ error: "attestation not found in store", attestation_id: id });
  }
  const replayKey = id + "__at02_replay_" + Date.now();
  const newBridgedAt = new Date(Date.now()).toISOString();
  attestationStore[replayKey] = { ...original, bridged_at: newBridgedAt };
  return res.json({
    success: true,
    note: "AT-02 replay injected. The same attestation_id now appears at two distinct bridged_at timestamps in the store. Watcher should dedup the second on submittedSet[aid] check.",
    original_bridged_at: original.bridged_at,
    replay_bridged_at: newBridgedAt,
    attestation_id: id,
    store_keys: [id, replayKey],
  });
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

// POST /admin/at-02-inject-pair — synthesizes 2 store entries that share the
// SAME attestation_id but have distinct bridged_at, both matching pact_id="16"
// and capability_hash=<canonical clean stripped_hash>. The watcher's
// submittedSet[aid] dedup invariant should accept the first and silently
// skip the second within a single poll cycle (or two consecutive cycles
// across cursor advance). Token-gated. Added 2026-05-03 for AT-02 re-fire.
// Remove after May 6 (AT framework end).
app.post("/admin/at-02-inject-pair", (req, res) => {
  const expected = process.env.AT_ADMIN_TOKEN || "";
  const got = req.header("x-admin-token") || "";
  if (!expected || got !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const body = (req.body || {}) as Record<string, any>;
  const pact_id = typeof body.pact_id === "string" ? body.pact_id : "16";
  const capability_hash = typeof body.capability_hash === "string"
    ? body.capability_hash.replace(/^0x/i, "")
    : "a67d408151085fdb4fd484bac555fcbab3cfc60f1fb2cce861edadcc78183999";
  const attestation_id = typeof body.attestation_id === "string"
    ? body.attestation_id
    : "at02_" + Date.now();
  const network = typeof body.network === "string" ? body.network : "mainnet-beta";
  const worker_address = typeof body.worker_address === "string"
    ? body.worker_address
    : "0x344441FE9A207fD2c08CBC260aa5e491Fe95711A";
  const t1 = new Date(Date.now() - 100).toISOString();
  const t2 = new Date(Date.now()).toISOString();
  const base: Record<string, any> = {
    pact_id,
    worker_address,
    amount_pact: "0.0",
    capability_hash,
    attestation_id,
    arbitrum_block: 0,
    attestation_status: "anchored",
    tx_signature: "AT02SyntheticAttestation_NoOnChainProof",
    solscan_url: "",
    network,
  };
  const key1 = attestation_id + "__at02_first_" + Date.now();
  const key2 = attestation_id + "__at02_replay_" + (Date.now() + 1);
  attestationStore[key1] = { ...base, bridged_at: t1 };
  attestationStore[key2] = { ...base, bridged_at: t2 };
  return res.json({
    success: true,
    note: "AT-02 inject-pair complete. Two store entries share attestation_id; watcher should dedup the second on submittedSet[aid].",
    attestation_id,
    pact_id,
    capability_hash,
    network,
    store_keys: [key1, key2],
    bridged_at: [t1, t2],
  });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[sworn-pact-relay] Listening on port ${PORT}`);
  console.log(`[sworn-pact-relay] PACT Escrow: 0x220B97972d6028Acd70221890771E275e7734BFB (Arbitrum One)`);
  console.log(`[sworn-pact-relay] SWORN API: ${process.env.SWORN_API_URL || "https://sworn-devnet.chitacloud.dev"}`);
});

export default app;
