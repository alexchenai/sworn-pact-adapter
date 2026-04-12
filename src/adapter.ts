import { ethers } from "ethers";
import {
  PACT_ESCROW_ABI,
  PACT_ESCROW_ADDRESS,
  ARBITRUM_ONE_RPC,
  ARBITRUM_ONE_CHAIN_ID,
} from "./pact-abi";
import {
  buildCapabilityHash,
  createSwornAttestation,
  verifyAttestation,
  CrossChainAttestation,
} from "./sworn-client";

export interface AdapterResult {
  pact_id: string;
  worker_address: string;
  amount_pact: string;
  capability_hash: string;
  attestation_id: string;
  arbitrum_block: number;
  attestation_status: string;
  bridged_at: string;
}

export class SwornPactAdapter {
  private provider: ethers.JsonRpcProvider;
  private escrowContract: ethers.Contract;

  constructor(rpcUrl: string = ARBITRUM_ONE_RPC) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.escrowContract = new ethers.Contract(
      PACT_ESCROW_ADDRESS,
      PACT_ESCROW_ABI,
      this.provider
    );
  }

  async getNetwork(): Promise<{ chainId: number; blockNumber: number }> {
    const network = await this.provider.getNetwork();
    const blockNumber = await this.provider.getBlockNumber();
    return {
      chainId: Number(network.chainId),
      blockNumber,
    };
  }

  async getPactDetails(pactId: number): Promise<{
    client: string;
    worker: string;
    amount: string;
    deadline: number;
    status: number;
  }> {
    const result = await this.escrowContract.getPact(pactId);
    return {
      client: result[0],
      worker: result[1],
      amount: ethers.formatUnits(result[2], 18),
      deadline: Number(result[3]),
      status: Number(result[4]),
    };
  }

  async bridgePactToSworn(
    pactId: number,
    workerAddress?: string
  ): Promise<AdapterResult> {
    console.log(`[SwornPactAdapter] Bridging PACT #${pactId} to SWORN...`);

    // Get pact details from Arbitrum
    let worker = workerAddress || "0x344441FE9A207fD2c08CBC260aa5e491Fe95711A";
    let amount = "2000";

    try {
      const details = await this.getPactDetails(pactId);
      worker = details.worker !== ethers.ZeroAddress ? details.worker : worker;
      amount = details.amount || amount;
      console.log(
        `[SwornPactAdapter] Pact #${pactId}: worker=${worker}, amount=${amount} PACT`
      );
    } catch (err) {
      console.warn(
        `[SwornPactAdapter] Could not fetch pact details (using defaults): ${err}`
      );
    }

    const network = await this.getNetwork();
    console.log(
      `[SwornPactAdapter] Connected to chain ${network.chainId}, block ${network.blockNumber}`
    );

    // Build capability hash encoding the cross-chain work
    const capabilityHash = buildCapabilityHash(
      pactId.toString(),
      worker,
      amount,
      ARBITRUM_ONE_CHAIN_ID
    );
    console.log(`[SwornPactAdapter] Capability hash: ${capabilityHash}`);

    // Create SWORN attestation on Solana devnet
    const attestation = await createSwornAttestation({
      subject_agent_id: `pact-worker-${pactId}`,
      capability_hash: capabilityHash,
      stake_amount: 0.1,
      expiry_days: 30,
    });
    console.log(
      `[SwornPactAdapter] SWORN attestation created: ${attestation.attestation_id}`
    );

    const result: AdapterResult = {
      pact_id: pactId.toString(),
      worker_address: worker,
      amount_pact: amount,
      capability_hash: capabilityHash,
      attestation_id: attestation.attestation_id,
      arbitrum_block: network.blockNumber,
      attestation_status: attestation.status,
      bridged_at: new Date().toISOString(),
    };

    return result;
  }

  async listenForPactEvents(
    fromBlock: number,
    toBlock: number | "latest" = "latest"
  ): Promise<CrossChainAttestation[]> {
    const results: CrossChainAttestation[] = [];

    const releaseFilter = this.escrowContract.filters.PactReleased();
    const events = await this.escrowContract.queryFilter(
      releaseFilter,
      fromBlock,
      toBlock
    );

    console.log(
      `[SwornPactAdapter] Found ${events.length} PactReleased events in blocks ${fromBlock}-${toBlock}`
    );

    for (const event of events) {
      const log = event as ethers.EventLog;
      const pactId = log.args[0].toString();
      const worker = log.args[1];
      const amount = ethers.formatUnits(log.args[2], 18);

      const capHash = buildCapabilityHash(
        pactId,
        worker,
        amount,
        ARBITRUM_ONE_CHAIN_ID
      );

      try {
        const attestation = await createSwornAttestation({
          subject_agent_id: `pact-worker-${pactId}`,
          capability_hash: capHash,
          stake_amount: 0.1,
          expiry_days: 30,
        });

        results.push({
          attestation_id: attestation.attestation_id,
          pact_id: pactId,
          worker_address: worker,
          sworn_subject: `pact-worker-${pactId}`,
          capability_hash: capHash,
          arbitrum_tx: log.transactionHash,
          solana_attestation_id: attestation.attestation_id,
          anchored_at: attestation.anchored_at,
          status: "anchored",
        });
      } catch (err) {
        console.error(`Failed to attest pact ${pactId}: ${err}`);
      }
    }

    return results;
  }
}
