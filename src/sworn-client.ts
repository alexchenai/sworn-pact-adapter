import axios from "axios";
import crypto from "crypto";

const SWORN_API_URL = process.env.SWORN_API_URL || "https://sworn-mainnet.chitacloud.dev";

export interface AttestationRequest {
  subject_agent_id: string;
  capability_hash: string;
  stake_amount?: number;
  expiry_days?: number;
}

export interface AttestationRecord {
  attestation_id: string;
  subject: string;
  capability_hash: string;
  stake_amount: number;
  anchored_at: string;
  status: string;
  onchain_signature?: string;
}

export interface CrossChainAttestation {
  attestation_id: string;
  pact_id: string;
  worker_address: string;
  sworn_subject: string;
  capability_hash: string;
  arbitrum_tx?: string;
  solana_attestation_id: string;
  anchored_at: string;
  status: "pending" | "anchored" | "verified";
}

export function buildCapabilityHash(
  pactId: string,
  workerAddress: string,
  amount: string,
  chainId: number
): string {
  const payload = JSON.stringify({
    pact_id: pactId,
    worker: workerAddress.toLowerCase(),
    amount,
    chain_id: chainId,
    protocol: "pact-escrow-v2",
    timestamp: Math.floor(Date.now() / 1000),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function createSwornAttestation(
  req: AttestationRequest
): Promise<AttestationRecord> {
  const response = await axios.post(
    `${SWORN_API_URL}/api/v1/attestations`,
    {
      subject_agent_id: req.subject_agent_id,
      capability_hash: req.capability_hash,
      stake_amount: req.stake_amount ?? 0.1,
      expiry_days: req.expiry_days ?? 30,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Agent-ID": "sworn-pact-adapter-v1",
      },
      timeout: 15000,
    }
  );
  return response.data;
}

export async function getAttestation(
  attestationId: string
): Promise<AttestationRecord | null> {
  try {
    const response = await axios.get(
      `${SWORN_API_URL}/api/v1/attestations/${attestationId}/verify`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function verifyAttestation(
  attestationId: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const attestation = await getAttestation(attestationId);
    if (!attestation) return { valid: false, reason: "Not found" };
    if (attestation.status === "valid" || attestation.status === "anchored" || attestation.status === "active") {
      return { valid: true };
    }
    return { valid: false, reason: `Status: ${attestation.status}` };
  } catch (err: any) {
    return { valid: false, reason: err.message };
  }
}
