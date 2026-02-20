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
	}
] as const;
