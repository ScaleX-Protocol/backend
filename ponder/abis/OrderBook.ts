export const OrderBookABI: any[] = [
	{
		"type": "constructor",
		"inputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "cancelOrder",
		"inputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"internalType": "uint48"
			},
			{
				"name": "user",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "getBestPrice",
		"inputs": [
			{
				"name": "side",
				"type": "uint8",
				"internalType": "enum IOrderBook.Side"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct IOrderBook.PriceVolume",
				"components": [
					{
						"name": "price",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "volume",
						"type": "uint256",
						"internalType": "uint256"
					}
				]
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getNextBestPrices",
		"inputs": [
			{
				"name": "side",
				"type": "uint8",
				"internalType": "enum IOrderBook.Side"
			},
			{
				"name": "price",
				"type": "uint128",
				"internalType": "uint128"
			},
			{
				"name": "count",
				"type": "uint8",
				"internalType": "uint8"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple[]",
				"internalType": "struct IOrderBook.PriceVolume[]",
				"components": [
					{
						"name": "price",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "volume",
						"type": "uint256",
						"internalType": "uint256"
					}
				]
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getOrder",
		"inputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"internalType": "uint48"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct IOrderBook.Order",
				"components": [
					{
						"name": "user",
						"type": "address",
						"internalType": "address"
					},
					{
						"name": "id",
						"type": "uint48",
						"internalType": "uint48"
					},
					{
						"name": "next",
						"type": "uint48",
						"internalType": "uint48"
					},
					{
						"name": "quantity",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "filled",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "price",
						"type": "uint128",
						"internalType": "uint128"
					},
					{
						"name": "prev",
						"type": "uint48",
						"internalType": "uint48"
					},
					{
						"name": "expiry",
						"type": "uint48",
						"internalType": "uint48"
					},
					{
						"name": "status",
						"type": "uint8",
						"internalType": "enum IOrderBook.Status"
					},
					{
						"name": "orderType",
						"type": "uint8",
						"internalType": "enum IOrderBook.OrderType"
					},
					{
						"name": "side",
						"type": "uint8",
						"internalType": "enum IOrderBook.Side"
					}
				]
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getOrderQueue",
		"inputs": [
			{
				"name": "side",
				"type": "uint8",
				"internalType": "enum IOrderBook.Side"
			},
			{
				"name": "price",
				"type": "uint128",
				"internalType": "uint128"
			}
		],
		"outputs": [
			{
				"name": "orderCount",
				"type": "uint48",
				"internalType": "uint48"
			},
			{
				"name": "totalVolume",
				"type": "uint256",
				"internalType": "uint256"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getTradingRules",
		"inputs": [],
		"outputs": [
			{
				"name": "",
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
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "initialize",
		"inputs": [
			{
				"name": "_poolManager",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "_balanceManager",
				"type": "address",
				"internalType": "address"
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
			},
			{
				"name": "_poolKey",
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
		"name": "placeMarketOrder",
		"inputs": [
			{
				"name": "quantity",
				"type": "uint128",
				"internalType": "uint128"
			},
			{
				"name": "side",
				"type": "uint8",
				"internalType": "enum IOrderBook.Side"
			},
			{
				"name": "user",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"internalType": "uint48"
			},
			{
				"name": "receivedAmount",
				"type": "uint128",
				"internalType": "uint128"
			}
		],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "placeOrder",
		"inputs": [
			{
				"name": "price",
				"type": "uint128",
				"internalType": "uint128"
			},
			{
				"name": "quantity",
				"type": "uint128",
				"internalType": "uint128"
			},
			{
				"name": "side",
				"type": "uint8",
				"internalType": "enum IOrderBook.Side"
			},
			{
				"name": "user",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "timeInForce",
				"type": "uint8",
				"internalType": "enum IOrderBook.TimeInForce"
			}
		],
		"outputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"internalType": "uint48"
			}
		],
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
		"name": "setTradingRules",
		"inputs": [
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
		"name": "updateTradingRules",
		"inputs": [
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
		"name": "OrderCancelled",
		"inputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"indexed": true,
				"internalType": "uint48"
			},
			{
				"name": "user",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "timestamp",
				"type": "uint48",
				"indexed": false,
				"internalType": "uint48"
			},
			{
				"name": "status",
				"type": "uint8",
				"indexed": false,
				"internalType": "enum IOrderBook.Status"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "OrderMatched",
		"inputs": [
			{
				"name": "user",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "buyOrderId",
				"type": "uint48",
				"indexed": true,
				"internalType": "uint48"
			},
			{
				"name": "sellOrderId",
				"type": "uint48",
				"indexed": true,
				"internalType": "uint48"
			},
			{
				"name": "side",
				"type": "uint8",
				"indexed": false,
				"internalType": "enum IOrderBook.Side"
			},
			{
				"name": "timestamp",
				"type": "uint48",
				"indexed": false,
				"internalType": "uint48"
			},
			{
				"name": "executionPrice",
				"type": "uint128",
				"indexed": false,
				"internalType": "uint128"
			},
			{
				"name": "executedQuantity",
				"type": "uint128",
				"indexed": false,
				"internalType": "uint128"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "OrderPlaced",
		"inputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"indexed": true,
				"internalType": "uint48"
			},
			{
				"name": "user",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "side",
				"type": "uint8",
				"indexed": true,
				"internalType": "enum IOrderBook.Side"
			},
			{
				"name": "price",
				"type": "uint128",
				"indexed": false,
				"internalType": "uint128"
			},
			{
				"name": "quantity",
				"type": "uint128",
				"indexed": false,
				"internalType": "uint128"
			},
			{
				"name": "expiry",
				"type": "uint48",
				"indexed": false,
				"internalType": "uint48"
			},
			{
				"name": "isMarketOrder",
				"type": "bool",
				"indexed": false,
				"internalType": "bool"
			},
			{
				"name": "status",
				"type": "uint8",
				"indexed": false,
				"internalType": "enum IOrderBook.Status"
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
		"type": "event",
		"name": "UpdateOrder",
		"inputs": [
			{
				"name": "orderId",
				"type": "uint48",
				"indexed": true,
				"internalType": "uint48"
			},
			{
				"name": "timestamp",
				"type": "uint48",
				"indexed": false,
				"internalType": "uint48"
			},
			{
				"name": "filled",
				"type": "uint128",
				"indexed": false,
				"internalType": "uint128"
			},
			{
				"name": "status",
				"type": "uint8",
				"indexed": false,
				"internalType": "enum IOrderBook.Status"
			}
		],
		"anonymous": false
	},
	{
		"type": "error",
		"name": "FillOrKillNotFulfilled",
		"inputs": [
			{
				"name": "filledAmount",
				"type": "uint128",
				"internalType": "uint128"
			},
			{
				"name": "requestedAmount",
				"type": "uint128",
				"internalType": "uint128"
			}
		]
	},
	{
		"type": "error",
		"name": "IdenticalCurrencies",
		"inputs": [
			{
				"name": "currency",
				"type": "address",
				"internalType": "address"
			}
		]
	},
	{
		"type": "error",
		"name": "InsufficientBalanceRequired",
		"inputs": [
			{
				"name": "requiredDeposit",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "userBalance",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "InsufficientSwapBalance",
		"inputs": [
			{
				"name": "available",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "required",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "InvalidInitialization",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidOrderType",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidPrice",
		"inputs": [
			{
				"name": "price",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "InvalidPriceIncrement",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidQuantity",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidQuantityIncrement",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidSideForQuoteAmount",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidSlippageTolerance",
		"inputs": [
			{
				"name": "slippageBps",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "NoValidSwapPath",
		"inputs": [
			{
				"name": "srcCurrency",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "dstCurrency",
				"type": "address",
				"internalType": "address"
			}
		]
	},
	{
		"type": "error",
		"name": "NotAuthorized",
		"inputs": []
	},
	{
		"type": "error",
		"name": "NotInitializing",
		"inputs": []
	},
	{
		"type": "error",
		"name": "OrderHasNoLiquidity",
		"inputs": []
	},
	{
		"type": "error",
		"name": "OrderIsNotOpenOrder",
		"inputs": [
			{
				"name": "status",
				"type": "uint8",
				"internalType": "enum IOrderBook.Status"
			}
		]
	},
	{
		"type": "error",
		"name": "OrderNotFound",
		"inputs": []
	},
	{
		"type": "error",
		"name": "OrderTooLarge",
		"inputs": [
			{
				"name": "amount",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "maxAmount",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "OrderTooSmall",
		"inputs": [
			{
				"name": "amount",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "minAmount",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
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
		"name": "PostOnlyWouldTake",
		"inputs": []
	},
	{
		"type": "error",
		"name": "QueueEmpty",
		"inputs": []
	},
	{
		"type": "error",
		"name": "ReentrancyGuardReentrantCall",
		"inputs": []
	},
	{
		"type": "error",
		"name": "SlippageExceeded",
		"inputs": [
			{
				"name": "requestedPrice",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "limitPrice",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "SlippageTooHigh",
		"inputs": [
			{
				"name": "received",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "minReceived",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "SwapHopFailed",
		"inputs": [
			{
				"name": "hopIndex",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "receivedAmount",
				"type": "uint256",
				"internalType": "uint256"
			}
		]
	},
	{
		"type": "error",
		"name": "TooManyHops",
		"inputs": [
			{
				"name": "maxHops",
				"type": "uint8",
				"internalType": "uint8"
			},
			{
				"name": "limit",
				"type": "uint8",
				"internalType": "uint8"
			}
		]
	},
	{
		"type": "error",
		"name": "TradingPaused",
		"inputs": []
	},
	{
		"type": "error",
		"name": "UnauthorizedCancellation",
		"inputs": []
	},
	{
		"type": "error",
		"name": "UnauthorizedRouter",
		"inputs": [
			{
				"name": "reouter",
				"type": "address",
				"internalType": "address"
			}
		]
	}
] as const;