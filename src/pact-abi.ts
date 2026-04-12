export const PACT_ESCROW_ABI = [
  {
    "type": "event",
    "name": "PactCreated",
    "inputs": [
      {"name": "pactId", "type": "uint256", "indexed": true},
      {"name": "worker", "type": "address", "indexed": true},
      {"name": "amount", "type": "uint256", "indexed": false},
      {"name": "deadline", "type": "uint256", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "PactReleased",
    "inputs": [
      {"name": "pactId", "type": "uint256", "indexed": true},
      {"name": "worker", "type": "address", "indexed": true},
      {"name": "amount", "type": "uint256", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "PactDisputed",
    "inputs": [
      {"name": "pactId", "type": "uint256", "indexed": true},
      {"name": "disputer", "type": "address", "indexed": true}
    ]
  },
  {
    "type": "function",
    "name": "getPact",
    "inputs": [{"name": "pactId", "type": "uint256"}],
    "outputs": [
      {"name": "client", "type": "address"},
      {"name": "worker", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "deadline", "type": "uint256"},
      {"name": "status", "type": "uint8"}
    ],
    "stateMutability": "view"
  }
] as const;

export const PACT_ESCROW_ADDRESS = "0x220B97972d6028Acd70221890771E275e7734BFB";
export const PACT_TOKEN_ADDRESS = "0x809c2540358E2cF37050cCE41A610cb6CE66Abe1";
export const ARBITRUM_ONE_RPC = "https://arb1.arbitrum.io/rpc";
export const ARBITRUM_ONE_CHAIN_ID = 42161;
