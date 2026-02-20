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
	}
] as const;
