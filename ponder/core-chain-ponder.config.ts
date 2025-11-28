// core-chain-ponder.config.ts - Configuration for Core Chain (coreDevnet/31337)
import dotenv from "dotenv";
import { factory } from "ponder";
import { fallback, getAddress, http, parseAbiItem } from "viem";
import { BalanceManagerABI, LendingManagerABI, MailboxABI, OracleABI, OrderBookABI, PoolManagerABI, SCALEXRouterABI, SyntheticTokenFactoryABI, TokenRegistryABI } from "./abis";

dotenv.config({ path: ".env.core-chain" });

const default_address = getAddress("0x0000000000000000000000000000000000000000");

const contracts: any = {
	// BalanceManager exists on ScaleX Anvil (core chain - 31337)
	BalanceManager: {
		abi: BalanceManagerABI || [],
		network: {
			coreDevnet: {
				address: getAddress((process.env.BALANCEMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// HyperlaneMailbox exists on ScaleX Anvil (core chain)
	HyperlaneMailbox: {
		abi: MailboxABI || [],
		network: {
			coreDevnet: {
				address: getAddress((process.env.MAILBOX_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// PoolManager exists on ScaleX Anvil (core chain)
	PoolManager: {
		abi: PoolManagerABI || [],
		network: {
			coreDevnet: {
				address: getAddress((process.env.POOLMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// OrderBook exists on ScaleX Anvil (using factory pattern from PoolManager)
	OrderBook: {
		abi: OrderBookABI,
		network: {
			coreDevnet: {
				address: factory({
					address: getAddress((process.env.POOLMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
					event: parseAbiItem(
						"event PoolCreated(bytes32 indexed poolId, address orderBook, address baseCurrency, address quoteCurrency)"
					),
					parameter: "orderBook",
				}),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// ScaleXRouter exists on ScaleX Anvil (core chain)
	ScaleXRouter: {
		abi: SCALEXRouterABI || [],
		network: {
			coreDevnet: {
				address: getAddress((process.env.ScaleXROUTER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// ChainRegistry exists on ScaleX Anvil (core chain)
	ChainRegistry: {
		abi: [], // Add ChainRegistry ABI if available
		network: {
			coreDevnet: {
				address: getAddress((process.env.CHAINREGISTRY_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// TokenRegistry exists on ScaleX Anvil (core chain)
	TokenRegistry: {
		abi: TokenRegistryABI,
		network: {
			coreDevnet: {
				address: getAddress((process.env.TOKENREGISTRY_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// SyntheticTokenFactory exists on ScaleX Anvil (core chain)
	SyntheticTokenFactory: {
		abi: SyntheticTokenFactoryABI || [], // Add SyntheticTokenFactory ABI if available
		network: {
			coreDevnet: {
				address: getAddress((process.env.SYNTHETICTOKENFACTORY_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// Oracle exists on ScaleX Anvil (core chain)
	Oracle: {
		abi: OracleABI || [],
		network: {
			coreDevnet: {
				address: getAddress((process.env.ORACLE_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// LendingManager exists on ScaleX Anvil (core chain)
	LendingManager: {
		abi: LendingManagerABI || [],
		network: {
			coreDevnet: {
				address: getAddress((process.env.LENDINGMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},
};

export function getCoreChainConfig() {
	// Handle multiple HTTP endpoints from comma-separated string
	if (!process.env.CORE_DEVNET_ENDPOINT) {
		throw new Error("CORE_DEVNET_ENDPOINT environment variable is required");
	}
	
	const coreDevnetEndpoints = process.env.CORE_DEVNET_ENDPOINT
		.split(",")
		.map(endpoint => http(endpoint.trim()));

	const config = {
		networks: {
			// ScaleX Core Chain - Main trading chain
			coreDevnet: {
				chainId: Number(process.env.SCALEX_CORE_DEVNET_CHAIN_ID) || 84532,
				transport: fallback(coreDevnetEndpoints),
				pollingInterval: Number(process.env.SCALEX_CORE_DEVNET_POLLING_INTERVAL) || 1000,
				maxRequestsPerSecond: Number(process.env.SCALEX_CORE_DEVNET_MAX_REQUESTS_PER_SECOND) || 50,
				// Anvil-specific optimizations
				retryCount: Number(process.env.MAX_RETRIES) || 3,
				retryDelay: Number(process.env.RETRY_DELAY) || 1000,
			},
		},
		contracts: contracts,

		// Additional core-chain-specific configuration
		options: {
			// Performance settings optimized for core chain operations
			maxHealthcheckDuration: 30_000,
			telemetryDisabled: process.env.PONDER_TELEMETRY_DISABLED === "true",

			// Debug settings
			logLevel: process.env.LOG_LEVEL as "silent" | "error" | "warn" | "info" | "debug" | "trace" || "debug",
		},

		// Server configuration
		server: {
			port: Number(process.env.PONDER_PORT) || 42070,
		},
	};

	return config;
}

// Utility function to validate core chain environment variables
export function validateCoreChainEnvironment(): boolean {
	const requiredVars = [
		"CORE_DEVNET_ENDPOINT",
		"BALANCEMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
		"POOLMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
		"ScaleXROUTER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
		"TOKENREGISTRY_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
		"SYNTHETICTOKENFACTORY_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
		"ORACLE_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
		"LENDINGMANAGER_CONTRACT_SCALEX_CORE_DEVNET_ADDRESS",
	];

	const missing = requiredVars.filter(varName => !process.env[varName]);

	if (missing.length > 0) {
		console.error(`Missing required core chain environment variables: ${missing.join(", ")}`);
		console.error("Please ensure .env.core-chain is properly configured");
		return false;
	}

	return true;
}