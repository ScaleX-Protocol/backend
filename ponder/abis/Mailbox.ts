export const MailboxABI: any[] = [
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				name: "sender",
				type: "address",
			},
			{
				indexed: true,
				name: "destination",
				type: "uint32",
			},
			{
				indexed: true,
				name: "recipient",
				type: "bytes32",
			},
			{
				indexed: false,
				name: "message",
				type: "bytes",
			},
		],
		name: "Dispatch",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				name: "messageId",
				type: "bytes32",
			},
		],
		name: "DispatchId",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				name: "origin",
				type: "uint32",
			},
			{
				indexed: true,
				name: "sender",
				type: "bytes32",
			},
			{
				indexed: true,
				name: "recipient",
				type: "address",
			},
		],
		name: "Process",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				name: "messageId",
				type: "bytes32",
			},
		],
		name: "ProcessId",
		type: "event",
	},
] as const;
