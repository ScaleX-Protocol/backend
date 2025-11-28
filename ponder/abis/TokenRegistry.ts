export const TokenRegistryABI: any[] = [
	{
		"type": "constructor",
		"inputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "convertAmount",
		"inputs": [
			{
				"name": "amount",
				"type": "uint256",
				"internalType": "uint256"
			},
			{
				"name": "fromDecimals",
				"type": "uint8",
				"internalType": "uint8"
			},
			{
				"name": "toDecimals",
				"type": "uint8",
				"internalType": "uint8"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "uint256",
				"internalType": "uint256"
			}
		],
		"stateMutability": "pure"
	},
	{
		"type": "function",
		"name": "convertAmountForMapping",
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
		"name": "getChainTokens",
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
		"name": "getSourceToken",
		"inputs": [
			{
				"name": "targetChainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [
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
			},
			{
				"name": "targetChainId",
				"type": "uint32",
				"internalType": "uint32"
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
		"name": "getTokenMapping",
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
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct TokenRegistryStorage.TokenMapping",
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
						"name": "targetChainId",
						"type": "uint32",
						"internalType": "uint32"
					},
					{
						"name": "syntheticToken",
						"type": "address",
						"internalType": "address"
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
					},
					{
						"name": "isActive",
						"type": "bool",
						"internalType": "bool"
					},
					{
						"name": "registeredAt",
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
		"name": "initialize",
		"inputs": [
			{
				"name": "_owner",
				"type": "address",
				"internalType": "address"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "isTokenMappingActive",
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
		"name": "registerTokenMapping",
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
				"name": "syntheticToken",
				"type": "address",
				"internalType": "address"
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
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "removeTokenMapping",
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
		"name": "setTokenMappingStatus",
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
		"name": "updateTokenMapping",
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
				"name": "newSyntheticToken",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "newSyntheticDecimals",
				"type": "uint8",
				"internalType": "uint8"
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
		"name": "TokenMappingRegistered",
		"inputs": [
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
				"name": "targetChainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			},
			{
				"name": "syntheticToken",
				"type": "address",
				"indexed": false,
				"internalType": "address"
			},
			{
				"name": "symbol",
				"type": "string",
				"indexed": false,
				"internalType": "string"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "TokenMappingRemoved",
		"inputs": [
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
				"name": "targetChainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "TokenMappingUpdated",
		"inputs": [
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
				"name": "targetChainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			},
			{
				"name": "oldSynthetic",
				"type": "address",
				"indexed": false,
				"internalType": "address"
			},
			{
				"name": "newSynthetic",
				"type": "address",
				"indexed": false,
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
				"name": "targetChainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
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
		"name": "DecimalMismatch",
		"inputs": [
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
		"type": "error",
		"name": "InvalidChainId",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidInitialization",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidTokenAddress",
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
		"name": "TokenMappingAlreadyExists",
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
			}
		]
	},
	{
		"type": "error",
		"name": "TokenMappingNotFound",
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
			}
		]
	},
	{
		"type": "error",
		"name": "TokenNotActive",
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
			}
		]
	}
] as const;