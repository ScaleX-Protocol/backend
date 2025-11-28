export const ChainRegistryABI: any[] = [
	{
		"type": "constructor",
		"inputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "getActiveChains",
		"inputs": [],
		"outputs": [
			{
				"name": "",
				"type": "uint32[]",
				"internalType": "uint32[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getAllChains",
		"inputs": [],
		"outputs": [
			{
				"name": "",
				"type": "uint32[]",
				"internalType": "uint32[]"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getChainByDomain",
		"inputs": [
			{
				"name": "domainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getChainConfig",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "tuple",
				"internalType": "struct ChainRegistryStorage.ChainConfig",
				"components": [
					{
						"name": "domainId",
						"type": "uint32",
						"internalType": "uint32"
					},
					{
						"name": "mailbox",
						"type": "address",
						"internalType": "address"
					},
					{
						"name": "rpcEndpoint",
						"type": "string",
						"internalType": "string"
					},
					{
						"name": "isActive",
						"type": "bool",
						"internalType": "bool"
					},
					{
						"name": "name",
						"type": "string",
						"internalType": "string"
					},
					{
						"name": "blockTime",
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
		"name": "getDomainId",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"outputs": [
			{
				"name": "",
				"type": "uint32",
				"internalType": "uint32"
			}
		],
		"stateMutability": "view"
	},
	{
		"type": "function",
		"name": "getMailbox",
		"inputs": [
			{
				"name": "chainId",
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
		"name": "isChainActive",
		"inputs": [
			{
				"name": "chainId",
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
		"name": "registerChain",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "domainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "mailbox",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "rpcEndpoint",
				"type": "string",
				"internalType": "string"
			},
			{
				"name": "name",
				"type": "string",
				"internalType": "string"
			},
			{
				"name": "blockTime",
				"type": "uint256",
				"internalType": "uint256"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "function",
		"name": "removeChain",
		"inputs": [
			{
				"name": "chainId",
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
		"name": "setChainStatus",
		"inputs": [
			{
				"name": "chainId",
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
		"name": "updateChain",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"internalType": "uint32"
			},
			{
				"name": "newMailbox",
				"type": "address",
				"internalType": "address"
			},
			{
				"name": "newRpcEndpoint",
				"type": "string",
				"internalType": "string"
			},
			{
				"name": "newBlockTime",
				"type": "uint256",
				"internalType": "uint256"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	},
	{
		"type": "event",
		"name": "ChainRegistered",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			},
			{
				"name": "domainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			},
			{
				"name": "mailbox",
				"type": "address",
				"indexed": false,
				"internalType": "address"
			},
			{
				"name": "name",
				"type": "string",
				"indexed": false,
				"internalType": "string"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "ChainRemoved",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			}
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "ChainStatusChanged",
		"inputs": [
			{
				"name": "chainId",
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
		"type": "event",
		"name": "ChainUpdated",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"indexed": true,
				"internalType": "uint32"
			},
			{
				"name": "oldMailbox",
				"type": "address",
				"indexed": false,
				"internalType": "address"
			},
			{
				"name": "newMailbox",
				"type": "address",
				"indexed": false,
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
		"type": "error",
		"name": "ChainAlreadyExists",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		]
	},
	{
		"type": "error",
		"name": "ChainNotFound",
		"inputs": [
			{
				"name": "chainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		]
	},
	{
		"type": "error",
		"name": "DomainAlreadyUsed",
		"inputs": [
			{
				"name": "domainId",
				"type": "uint32",
				"internalType": "uint32"
			}
		]
	},
	{
		"type": "error",
		"name": "InvalidDomain",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidInitialization",
		"inputs": []
	},
	{
		"type": "error",
		"name": "InvalidMailbox",
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
	}
] as const;