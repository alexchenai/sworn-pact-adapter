# SWORN x PACT Adapter

Cross-chain adapter bridging PACT escrow (Arbitrum One) with SWORN attestations (Solana devnet).

When a PACT escrow is created or released, this adapter automatically issues a cryptographic attestation on the SWORN Trust Protocol, creating a verifiable on-chain record of the work agreement across two chains.

## Architecture

PACT Escrow (Arbitrum One) --> sworn-pact-relay --> SWORN Devnet API (Solana devnet)

- PACT escrow contract: 0x220B97972d6028Acd70221890771E275e7734BFB (Arbitrum One, chain 42161)
- SWORN program: CSBAc1SiMALr4rnuCoB17BsddzthB4RAhjibGvyt6p6S (Solana devnet)
- Live relay: https://sworn-pact-relay.chitacloud.dev

## Requirements

- Node.js 18+
- npm 8+

## Setup

    git clone https://github.com/alexchenai/sworn-pact-adapter
    cd sworn-pact-adapter
    npm install
    npm run build

## Configuration

Environment variables (all optional, defaults work out of the box):

    SWORN_API_URL=https://sworn-devnet.chitacloud.dev  # SWORN devnet API
    PORT=3000                                           # relay server port

## Running the relay server

    npm run relay

The relay starts on port 3000 and exposes:

    GET  /health            service info + available endpoints
    GET  /network           connected chain info (Arbitrum + Solana)
    POST /attest            bridge a PACT ID to a SWORN attestation
    GET  /attestation/:id   get attestation details
    GET  /verify/:id        verify an attestation is still valid

## Running tests

    npm test

Example output:

    === SWORN x PACT Adapter Integration Test ===

    Test 1: Connecting to Arbitrum One...
      Chain ID: 42161 (expected: 42161)
      Current block: 451689747
      PASS

    Test 2: Bridging PACT #5 (real escrow) to SWORN attestation...
    [SwornPactAdapter] Bridging PACT #5 to SWORN...
    [SwornPactAdapter] Pact #5: worker=0x344441FE9A207fD2c08CBC260aa5e491Fe95711A, amount=0.0 PACT
    [SwornPactAdapter] Connected to chain 42161, block 451689749
    [SwornPactAdapter] Capability hash: 104b5642350cda6f6f5f4b7912335e2bbf394e210a7ee87200c6ccc0e428313a
    [SwornPactAdapter] SWORN attestation created: attest_pact-worker-5_a72d62f220bad008
      Pact ID: 5
      Worker: 0x344441FE9A207fD2c08CBC260aa5e491Fe95711A
      Amount: 0.0 PACT
      Capability Hash: 104b5642350cda6f6f5f4b7912335e2bbf394e210a7ee87200c6ccc0e428313a
      Attestation ID: attest_pact-worker-5_a72d62f220bad008
      Attestation Status: anchored
      Bridged at: 2026-04-12T10:38:00.683Z
      PASS

    Test 3: Verifying SWORN attestation...
      Valid: true
      PASS (verification call succeeded)

    === All tests passed ===

    Summary:
      Arbitrum One block: 451689747
      SWORN attestation: attest_pact-worker-5_a72d62f220bad008
      Cross-chain bridge: Arbitrum (chain 42161) -> Solana devnet
      PACT escrow contract: 0x220B97972d6028Acd70221890771E275e7734BFB
      SWORN API: https://sworn.chitacloud.dev

## Using the adapter programmatically

    import { SwornPactAdapter } from "sworn-pact-adapter";

    const adapter = new SwornPactAdapter();

    // Bridge a PACT escrow to SWORN
    const result = await adapter.bridgePactToSworn(5, "0xYourAddress");
    console.log(result.attestation_id); // attest_pact-worker-5_...
    console.log(result.capability_hash); // sha256 of pact params

    // Listen for PactReleased events and auto-attest
    const attestations = await adapter.listenForPactEvents(fromBlock, "latest");

## Making a cross-chain attestation via the relay

    curl -X POST https://sworn-pact-relay.chitacloud.dev/attest \
      -H "Content-Type: application/json" \
      -d "{\"pact_id\": 5, \"worker_address\": \"0x344441FE9A207fD2c08CBC260aa5e491Fe95711A\"}"

Response:

    {
      "success": true,
      "cross_chain_attestation": {
        "pact_id": "5",
        "worker_address": "0x344441FE9A207fD2c08CBC260aa5e491Fe95711A",
        "amount_pact": "0.0",
        "capability_hash": "104b5642...",
        "attestation_id": "attest_pact-worker-5_a72d62f220bad008",
        "arbitrum_block": 451689749,
        "attestation_status": "anchored",
        "bridged_at": "2026-04-12T10:38:00.683Z"
      },
      "sworn_attestation_url": "https://sworn-devnet.chitacloud.dev/api/v1/attestations/attest_pact-worker-5_a72d62f220bad008/verify"
    }

## How it works

1. The adapter connects to Arbitrum One via JSON-RPC
2. For each PACT ID, it queries the escrow contract (0x220B...BFB) to get worker and amount
3. It computes a deterministic capability_hash = SHA256(pact_id + worker + amount + chain_id + protocol + timestamp)
4. It submits this capability_hash to the SWORN devnet API as an attestation for the worker agent
5. SWORN anchors the attestation on Solana devnet and returns an attestation_id
6. The attestation can be verified at any time via the relay /verify/:id endpoint

This creates a cryptographic bridge: work done under a PACT escrow on Arbitrum becomes verifiable trust on the SWORN protocol on Solana.

## License

MIT
