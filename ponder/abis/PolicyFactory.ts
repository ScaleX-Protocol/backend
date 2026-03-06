export const PolicyFactoryABI = [
	{
		"type": "event",
		"name": "PolicyInstalled",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "templateUsed", "type": "string", "indexed": false, "internalType": "string" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "PolicyUninstalled",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "PolicyUpdated",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "field", "type": "string", "indexed": false, "internalType": "string" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "PolicyEnabled",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "PolicyDisabled",
		"inputs": [
			{ "name": "user", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "reason", "type": "string", "indexed": false, "internalType": "string" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "function",
		"name": "getPolicy",
		"stateMutability": "view",
		"inputs": [
			{ "name": "user", "type": "address", "internalType": "address" },
			{ "name": "strategyAgentId", "type": "uint256", "internalType": "uint256" }
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct PolicyFactoryStorage.Policy",
				"components": [
					{ "name": "enabled", "type": "bool" },
					{ "name": "installedAt", "type": "uint256" },
					{ "name": "expiryTimestamp", "type": "uint256" },
					{ "name": "maxOrderSize", "type": "uint256" },
					{ "name": "minOrderSize", "type": "uint256" },
					{ "name": "whitelistedTokens", "type": "address[]" },
					{ "name": "blacklistedTokens", "type": "address[]" },
					{ "name": "allowMarketOrders", "type": "bool" },
					{ "name": "allowLimitOrders", "type": "bool" },
					{ "name": "allowSwap", "type": "bool" },
					{ "name": "allowBorrow", "type": "bool" },
					{ "name": "allowRepay", "type": "bool" },
					{ "name": "allowSupplyCollateral", "type": "bool" },
					{ "name": "allowWithdrawCollateral", "type": "bool" },
					{ "name": "allowPlaceLimitOrder", "type": "bool" },
					{ "name": "allowCancelOrder", "type": "bool" },
					{ "name": "allowPredict", "type": "bool" },
					{ "name": "allowClaimPrediction", "type": "bool" },
					{ "name": "maxPredictionStake", "type": "uint256" },
					{ "name": "allowBuy", "type": "bool" },
					{ "name": "allowSell", "type": "bool" },
					{ "name": "allowAutoBorrow", "type": "bool" },
					{ "name": "maxAutoBorrowAmount", "type": "uint256" },
					{ "name": "allowAutoRepay", "type": "bool" },
					{ "name": "minDebtToRepay", "type": "uint256" },
					{ "name": "minHealthFactor", "type": "uint256" },
					{ "name": "maxSlippageBps", "type": "uint256" },
					{ "name": "minTimeBetweenTrades", "type": "uint256" },
					{ "name": "emergencyRecipient", "type": "address" },
					{ "name": "dailyVolumeLimit", "type": "uint256" },
					{ "name": "weeklyVolumeLimit", "type": "uint256" },
					{ "name": "maxDailyDrawdown", "type": "uint256" },
					{ "name": "maxWeeklyDrawdown", "type": "uint256" },
					{ "name": "maxTradeVsTVLBps", "type": "uint256" },
					{ "name": "minWinRateBps", "type": "uint256" },
					{ "name": "minSharpeRatio", "type": "int256" },
					{ "name": "maxPositionConcentrationBps", "type": "uint256" },
					{ "name": "maxCorrelationBps", "type": "uint256" },
					{ "name": "maxTradesPerDay", "type": "uint256" },
					{ "name": "maxTradesPerHour", "type": "uint256" },
					{ "name": "tradingStartHour", "type": "uint256" },
					{ "name": "tradingEndHour", "type": "uint256" },
					{ "name": "minReputationScore", "type": "uint256" },
					{ "name": "useReputationMultiplier", "type": "bool" },
					{ "name": "requiresChainlinkFunctions", "type": "bool" }
				]
			}
		]
	}
] as const;
