export const AgentRouterABI = [
	{
		"type": "event",
		"name": "StrategyAgentAuthorized",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "StrategyAgentRevoked",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSwapExecuted",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "tokenIn", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "tokenOut", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amountIn", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "amountOut", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentLimitOrderPlaced",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "orderId", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
			{ "name": "tokenIn", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "tokenOut", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "limitPrice", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "isBuy", "type": "bool", "indexed": false, "internalType": "bool" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentOrderCancelled",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "orderId", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentBorrowExecuted",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "token", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "newHealthFactor", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentRepayExecuted",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "token", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "newHealthFactor", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentCollateralSupplied",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "token", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentCollateralWithdrawn",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "token", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfTradeExecuted",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "orderBook", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "side", "type": "uint8", "indexed": false, "internalType": "enum IOrderBook.Side" },
			{ "name": "quantity", "type": "uint128", "indexed": false, "internalType": "uint128" },
			{ "name": "filled", "type": "uint128", "indexed": false, "internalType": "uint128" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfLimitOrderPlaced",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "orderBook", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "side", "type": "uint8", "indexed": false, "internalType": "enum IOrderBook.Side" },
			{ "name": "price", "type": "uint128", "indexed": false, "internalType": "uint128" },
			{ "name": "quantity", "type": "uint128", "indexed": false, "internalType": "uint128" },
			{ "name": "orderId", "type": "uint48", "indexed": false, "internalType": "uint48" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfOrderCancelled",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "orderBook", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "orderId", "type": "uint48", "indexed": false, "internalType": "uint48" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfBorrowExecuted",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "token", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfRepayExecuted",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "token", "type": "address", "indexed": false, "internalType": "address" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentListedOnMarketplace",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentDelistedFromMarketplace",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentPredictionPlaced",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "marketId", "type": "uint64", "indexed": false, "internalType": "uint64" },
			{ "name": "predictUp", "type": "bool", "indexed": false, "internalType": "bool" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentPredictionClaimed",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "executor", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "marketId", "type": "uint64", "indexed": false, "internalType": "uint64" },
			{ "name": "payout", "type": "uint256", "indexed": false, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfPredictionPlaced",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "marketId", "type": "uint64", "indexed": false, "internalType": "uint64" },
			{ "name": "predictUp", "type": "bool", "indexed": false, "internalType": "bool" },
			{ "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentSelfPredictionClaimed",
		"inputs": [
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "agentWallet", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "marketId", "type": "uint64", "indexed": false, "internalType": "uint64" },
			{ "name": "payout", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	}
] as const;
