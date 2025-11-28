export const SyntheticTokenFactoryABI: any[] = [
	{
		"type": "constructor",
		"inputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "batchCreateSyntheticTokens",
		"inputs": [
			{
				"name": "params",
				"type": "tuple[]",
				"internalType": "struct SyntheticTokenFactoryStorage.TokenCreationParams[]",
				"components": [
					{
						"name": "sourceChainId",
						"type": "uint32",
						"internalType": "uint32"
					},
					{
						"name": "sourceToken",
						"type": "address",
						"internalType": "address"
					},
					{
						"name": "name",
						"type": "string",
						"internalType": "string"
					},
					{
						"name": "symbol",
						"type": "string",
						"internalType": "string"
					},
					{
						"name": "sourceDecimals",
						"type": "uint8",
						"internalType": "uint8"
					},
					{
						"name": "syntheticDecimals",
						"type": "uint8",
						"internalType": "uint8"
					}
				]
			},
			{
				"name": "targetChainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"outputs": [
			{
				"name": "syntheticTokens",
				"type": "address[]",
				"internalType": "address[]"
			}
		],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "convertAmount",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "amount",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "sourceToSynthetic",
				"type": "bool",
				"internalType": "bool"
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
		"name": "createSyntheticToken",
		"inputs": [
			{
				"name": "sourceChainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "sourceToken",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "targetChainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "name",
				"type": "string",
				"internalType": "string"
			},
			{
				"name": "symbol",
				"type": "string",
				"internalType": "string"
			},
			{
				"name": "sourceDecimals",
				"type": "uint8",
				"internalType": "uint8"
			},
			{
				"name": "syntheticDecimals",
				"type": "uint8",
				"internalType": "uint8"
			}
		],
		"outputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
			}
		],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "getActiveSyntheticTokens",
		"inputs": [],
		"outputs": [
			{
				"name": "activeTokens",
				"type": "address[]",
				"internalType": "address[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getAllSyntheticTokens",
		"inputs": [],
		"outputs": [
			{
				"name": "",
				"type": "address[]",
				"internalType": "address[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getBridgeReceiver",
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
		"name": "getChainSyntheticTokens",
		"inputs": [
			{
				"name": "sourceChainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "address[]",
				"internalType": "address[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getSourceTokenInfo",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct SyntheticTokenFactoryStorage.SourceTokenInfo",
				"components": [
					{
						"name": "sourceChainId",
						"type": "uint32",
						"internalType": "uint32"
					},
					{
						"name": "sourceToken",
						"type": "address",
						"internalType": "address"
					},
					{
						"name": "sourceDecimals",
						"type": "uint8",
						"internalType": "uint8"
					},
					{
						"name": "syntheticDecimals",
						"type": "uint8",
						"internalType": "uint8"
					},
					{
						"name": "isActive",
						"type": "bool",
						"internalType": "bool"
					},
					{
						"name": "createdAt",
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
		"name": "getSyntheticToken",
		"inputs": [
			{
				"name": "sourceChainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "sourceToken",
				"type": "address",
				"internalType": "address"
			}
		],
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
		"name": "getTokenRegistry",
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
		"name": "getTotalSyntheticTokens",
		"inputs": [],
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
				"name": "_tokenRegistry",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "_bridgeReceiver",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "isSyntheticTokenActive",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
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
		"name": "renounceOwnership",
		"inputs": [],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "setBridgeReceiver",
		"inputs": [
			{
				"name": "newBridgeReceiver",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "setSyntheticTokenStatus",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "isActive",
				"type": "bool",
				"internalType": "bool"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "setTokenRegistry",
		"inputs": [
			{
				"name": "newTokenRegistry",
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
		"type": "event",
		"name": "BridgeReceiverUpdated",
		"inputs": [
			{
				"name": "oldReceiver",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "newReceiver",
				"type": "address",
				"indexed": true,
				"internalType": "address"
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
		"name": "SyntheticTokenCreated",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "sourceChainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			},
			{
				"name": "sourceToken",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "name",
				"type": "string",
				"indexed": false,
				"internalType": "string"
			},
			{
				"name": "symbol",
				"type": "string",
				"indexed": false,
				"internalType": "string"
			},
			{
				"name": "decimals",
				"type": "uint8",
				"indexed": false,
				"internalType": "uint8"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "TokenRegistryUpdated",
		"inputs": [
			{
				"name": "oldRegistry",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "newRegistry",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "TokenStatusChanged",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"indexed": true,
				"internalType": "address"
			},
			{
				"name": "isActive",
				"type": "bool",
				"indexed": false,
				"internalType": "bool"
			}
		],
		"anonymous": false
	},
	{
		"type": "error",
		"name": "InvalidBridgeReceiver",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidDecimals",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidInitialization",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidSourceToken",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidTokenRegistry",
		"inputs": []
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
		"name": "TokenAlreadyExists",
		"inputs": [
			{
				"name": "sourceChainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "sourceToken",
				"type": "address",
				"internalType": "address"
			}
		]
	},
	{
		"type": "error",
		"name": "TokenNotFound",
		"inputs": [
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
			}
		]
	}
] as const;