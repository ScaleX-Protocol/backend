export const PolicyFactoryABI = [
	{
		"type": "event",
		"name": "AgentInstalled",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "templateUsed", "type": "string", "indexed": false, "internalType": "string" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	},
	{
		"type": "event",
		"name": "AgentUninstalled",
		"inputs": [
			{ "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
			{ "name": "agentTokenId", "type": "uint256", "indexed": true, "internalType": "uint256" },
			{ "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
		],
		"anonymous": false
	}
] as const;
