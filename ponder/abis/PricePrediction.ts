export const PricePredictionABI: any[] = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "FEE_UNIT",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelMarket",
    "inputs": [{ "name": "marketId", "type": "uint64", "internalType": "uint64" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [{ "name": "marketId", "type": "uint64", "internalType": "uint64" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimBatch",
    "inputs": [{ "name": "marketIds", "type": "uint64[]", "internalType": "uint64[]" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createMarket",
    "inputs": [
      { "name": "baseToken", "type": "address", "internalType": "address" },
      { "name": "marketType", "type": "uint8", "internalType": "enum IPricePrediction.MarketType" },
      { "name": "strikePrice", "type": "uint256", "internalType": "uint256" },
      { "name": "duration", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "marketId", "type": "uint64", "internalType": "uint64" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getClaimableAmount",
    "inputs": [
      { "name": "marketId", "type": "uint64", "internalType": "uint64" },
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMarket",
    "inputs": [{ "name": "marketId", "type": "uint64", "internalType": "uint64" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IPricePrediction.Market",
        "components": [
          { "name": "id", "type": "uint64", "internalType": "uint64" },
          { "name": "marketType", "type": "uint8", "internalType": "enum IPricePrediction.MarketType" },
          { "name": "status", "type": "uint8", "internalType": "enum IPricePrediction.MarketStatus" },
          { "name": "baseToken", "type": "address", "internalType": "address" },
          { "name": "strikePrice", "type": "uint256", "internalType": "uint256" },
          { "name": "openingTwap", "type": "uint256", "internalType": "uint256" },
          { "name": "startTime", "type": "uint256", "internalType": "uint256" },
          { "name": "endTime", "type": "uint256", "internalType": "uint256" },
          { "name": "totalUp", "type": "uint256", "internalType": "uint256" },
          { "name": "totalDown", "type": "uint256", "internalType": "uint256" },
          { "name": "outcome", "type": "bool", "internalType": "bool" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPosition",
    "inputs": [
      { "name": "marketId", "type": "uint64", "internalType": "uint64" },
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IPricePrediction.Position",
        "components": [
          { "name": "stakeUp", "type": "uint256", "internalType": "uint256" },
          { "name": "stakeDown", "type": "uint256", "internalType": "uint256" },
          { "name": "claimed", "type": "bool", "internalType": "bool" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      { "name": "_owner", "type": "address", "internalType": "address" },
      { "name": "_balanceManager", "type": "address", "internalType": "address" },
      { "name": "_oracle", "type": "address", "internalType": "address" },
      { "name": "_keystoneForwarder", "type": "address", "internalType": "address" },
      { "name": "_collateralCurrency", "type": "address", "internalType": "Currency" },
      { "name": "_protocolFeeBps", "type": "uint256", "internalType": "uint256" },
      { "name": "_minStakeAmount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "onReport",
    "inputs": [
      { "name": "", "type": "bytes", "internalType": "bytes" },
      { "name": "report", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "predict",
    "inputs": [
      { "name": "marketId", "type": "uint64", "internalType": "uint64" },
      { "name": "predictUp", "type": "bool", "internalType": "bool" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requestSettlement",
    "inputs": [{ "name": "marketId", "type": "uint64", "internalType": "uint64" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setKeystoneForwarder",
    "inputs": [{ "name": "forwarder", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMaxMarketTvl",
    "inputs": [{ "name": "maxTvl", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMinStakeAmount",
    "inputs": [{ "name": "minStake", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setProtocolFeeBps",
    "inputs": [{ "name": "feeBps", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawFees",
    "inputs": [{ "name": "to", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      { "name": "marketId", "type": "uint64", "indexed": true, "internalType": "uint64" },
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "payout", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketCancelled",
    "inputs": [
      { "name": "marketId", "type": "uint64", "indexed": true, "internalType": "uint64" },
      { "name": "reason", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketCreated",
    "inputs": [
      { "name": "marketId", "type": "uint64", "indexed": true, "internalType": "uint64" },
      { "name": "marketType", "type": "uint8", "indexed": false, "internalType": "enum IPricePrediction.MarketType" },
      { "name": "baseToken", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "strikePrice", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "openingTwap", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "startTime", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "endTime", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketSettled",
    "inputs": [
      { "name": "marketId", "type": "uint64", "indexed": true, "internalType": "uint64" },
      { "name": "outcome", "type": "bool", "indexed": false, "internalType": "bool" },
      { "name": "totalUp", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "totalDown", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "protocolFee", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Predicted",
    "inputs": [
      { "name": "marketId", "type": "uint64", "indexed": true, "internalType": "uint64" },
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "predictedUp", "type": "bool", "indexed": false, "internalType": "bool" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolFeeWithdrawn",
    "inputs": [
      { "name": "to", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SettlementRequested",
    "inputs": [
      { "name": "marketId", "type": "uint64", "indexed": true, "internalType": "uint64" },
      { "name": "baseToken", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "strikePrice", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "openingTwap", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
];
