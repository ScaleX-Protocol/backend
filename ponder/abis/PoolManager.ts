export const PoolManagerABI: any[] = [
	{
		"type": "constructor",
		"inputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "addCommonIntermediary",
		"inputs": [
			{
				"name": "currency",
				"type": "address",
				"internalType": "Currency"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "createPool",
		"inputs": [
			{
				"name": "_baseCurrency",
				"type": "address",
				"internalType": "Currency"
			},
			{
				"name": "_quoteCurrency",
				"type": "address",
				"internalType": "Currency"
			},
			{
				"name": "_tradingRules",
				"type": "tuple",
				"internalType": "struct IOrderBook.TradingRules",
				"components": [
					{
						"name": "minTradeAmount",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minAmountMovement",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minPriceMovement",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minOrderSize",
						"type": "uint128",
						"internalType": "uint128"
					}
				]
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "bytes32",
				"internalType": "PoolId"
			}
		],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "createPoolKey",
		"inputs": [
			{
				"name": "currency1",
				"type": "address",
				"internalType": "Currency"
			},
			{
				"name": "currency2",
				"type": "address",
				"internalType": "Currency"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct PoolKey",
				"components": [
					{
						"name": "baseCurrency",
						"type": "address",
						"internalType": "Currency"
					},
					{
						"name": "quoteCurrency",
						"type": "address",
						"internalType": "Currency"
					}
				]
			}
		],
		"stateMutability": "pure"
	},
	{
		"type": "function",
		"name": "getAllCurrencies",
		"inputs": [],
		"outputs": [
			{
				"name": "",
				"type": "address[]",
				"internalType": "Currency[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getCommonIntermediaries",
		"inputs": [],
		"outputs": [
			{
				"name": "",
				"type": "address[]",
				"internalType": "Currency[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getPool",
		"inputs": [
			{
				"name": "key",
				"type": "tuple",
				"internalType": "struct PoolKey",
				"components": [
					{
						"name": "baseCurrency",
						"type": "address",
						"internalType": "Currency"
					},
					{
						"name": "quoteCurrency",
						"type": "address",
						"internalType": "Currency"
					}
				]
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct IPoolManager.Pool",
				"components": [
					{
						"name": "baseCurrency",
						"type": "address",
						"internalType": "Currency"
					},
					{
						"name": "quoteCurrency",
						"type": "address",
						"internalType": "Currency"
					},
					{
						"name": "orderBook",
						"type": "address",
						"internalType": "contract IOrderBook"
					}
				]
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getPoolId",
		"inputs": [
			{
				"name": "key",
				"type": "tuple",
				"internalType": "struct PoolKey",
				"components": [
					{
						"name": "baseCurrency",
						"type": "address",
						"internalType": "Currency"
					},
					{
						"name": "quoteCurrency",
						"type": "address",
						"internalType": "Currency"
					}
				]
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "bytes32",
				"internalType": "PoolId"
			}
		],
		"stateMutability": "pure"
	},
	{
		"type": "function",
		"name": "getPoolLiquidityScore",
		"inputs": [
			{
				"name": "currency1",
				"type": "address",
				"internalType": "Currency"
			},
			{
				"name": "currency2",
				"type": "address",
				"internalType": "Currency"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "uint256",
				"internalType": "uint256"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "initialize",
		"inputs": [
			{
				"name": "_owner",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "_balanceManager",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "_orderBookBeacon",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "owner",
		"inputs": [],
		"outputs": [
			{
				"name": "",
				"type": "address",
				"internalType": "address"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "poolExists",
		"inputs": [
			{
				"name": "currency1",
				"type": "address",
				"internalType": "Currency"
			},
			{
				"name": "currency2",
				"type": "address",
				"internalType": "Currency"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "bool",
				"internalType": "bool"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "removeCommonIntermediary",
		"inputs": [
			{
				"name": "currency",
				"type": "address",
				"internalType": "Currency"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "renounceOwnership",
		"inputs": [],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "setRouter",
		"inputs": [
			{
				"name": "_router",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "transferOwnership",
		"inputs": [
			{
				"name": "newOwner",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "updatePoolLiquidity",
		"inputs": [
			{
				"name": "key",
				"type": "tuple",
				"internalType": "struct PoolKey",
				"components": [
					{
						"name": "baseCurrency",
						"type": "address",
						"internalType": "Currency"
					},
					{
						"name": "quoteCurrency",
						"type": "address",
						"internalType": "Currency"
					}
				]
			},
			{
				"name": "liquidityScore",
				"type": "uint256",
				"internalType": "uint256"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "updatePoolTradingRules",
		"inputs": [
			{
				"name": "_poolId",
				"type": "bytes32",
				"internalType": "PoolId"
			},
			{
				"name": "_newRules",
				"type": "tuple",
				"internalType": "struct IOrderBook.TradingRules",
				"components": [
					{
						"name": "minTradeAmount",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minAmountMovement",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minPriceMovement",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minOrderSize",
						"type": "uint128",
						"internalType": "uint128"
					}
				]
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "event",
		"name": "CurrencyAdded",
		"inputs": [
			{
				"name": "currency",
				"type": "address",
				"indexed": false,
				"internalType": "Currency"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "Initialized",
		"inputs": [
			{
				"name": "version",
				"type": "uint64",
				"indexed": false,
				"internalType": "uint64"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "IntermediaryAdded",
		"inputs": [
			{
				"name": "currency",
				"type": "address",
				"indexed": false,
				"internalType": "Currency"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "IntermediaryRemoved",
		"inputs": [
			{
				"name": "currency",
				"type": "address",
				"indexed": false,
				"internalType": "Currency"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "OwnershipTransferred",
		"inputs": [
			{
				"name": "previousOwner",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "newOwner",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "PoolCreated",
		"inputs": [
			{
				"name": "poolId",
				"type": "bytes32",
				"indexed": true,
				"internalType": "PoolId"
			},
			{
				"name": "orderBook",
				"type": "address",
				"indexed": false,
				"internalType": "address"
			},
			{
				"name": "baseCurrency",
				"type": "address",
				"indexed": false,
				"internalType": "Currency"
			},
			{
				"name": "quoteCurrency",
				"type": "address",
				"indexed": false,
				"internalType": "Currency"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "PoolLiquidityUpdated",
		"inputs": [
			{
				"name": "poolId",
				"type": "bytes32",
				"indexed": false,
				"internalType": "PoolId"
			},
			{
				"name": "newLiquidity",
				"type": "uint256",
				"indexed": false,
				"internalType": "uint256"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "TradingRulesUpdated",
		"inputs": [
			{
				"name": "poolId",
				"type": "bytes32",
				"indexed": true,
				"internalType": "PoolId"
			},
			{
				"name": "newRules",
				"type": "tuple",
				"indexed": false,
				"internalType": "struct IOrderBook.TradingRules",
				"components": [
					{
						"name": "minTradeAmount",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minAmountMovement",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minPriceMovement",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "minOrderSize",
						"type": "uint128",
						"internalType": "uint128"
					}
				]
			}
		],
		"anonymous": false
	},
	{
		"type": "error",
		"name": "InvalidInitialization",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidRouter",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidTradingRule",
		"inputs": [
			{
				"name": "reason",
				"type": "string",
				"internalType": "string"
			}
		]
	},
	{
		"type": "error",
		"name": "NotInitializing",
		"inputs": []
	},
	{
		"type": "error",
		"name": "OwnableInvalidOwner",
		"inputs": [
			{
				"name": "owner",
				"type": "address",
				"internalType": "address"
			}
		]
	},
	{
		"type": "error",
		"name": "OwnableUnauthorizedAccount",
		"inputs": [
			{
				"name": "account",
				"type": "address",
				"internalType": "address"
			}
		]
	},
	{
		"type": "error",
		"name": "PoolAlreadyExists",
		"inputs": [
			{
				"name": "id",
				"type": "bytes32",
				"internalType": "bytes32"
			}
		]
	}
] as const;