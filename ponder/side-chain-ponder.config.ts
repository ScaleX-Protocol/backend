// side-chain-ponder.config.ts - Configuration for Side Chain (sideDevnet/31337)
import dotenv from "dotenv";
import { factory } from "ponder";
import { fallback, getAddress, http, parseAbiItem } from "viem";
import { ChainBalanceManagerABI, MailboxABI } from "./abis";

dotenv.config({ path: ".env.side-chain" });

const default_address = getAddress("0x0000000000000000000000000000000000000000");

const contracts: any = {
	// ChainBalanceManager exists on ScaleX Anvil 2 (side chain - 31337)
	ChainBalanceManager: {
		abi: ChainBalanceManagerABI || [],
		network: {
			sideDevnet: {
				address: getAddress((process.env.CHAIN_BALANCE_MANAGER_ScaleX_SIDE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.ScaleX_SIDE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.ScaleX_SIDE_DEVNET_END_BLOCK) || undefined,
			},
		},
	},

	// HyperlaneMailbox exists on ScaleX Anvil 2 (side chain)
	HyperlaneMailbox: {
		abi: MailboxABI || [],
		network: {
			sideDevnet: {
				address: getAddress((process.env.MAILBOX_ScaleX_SIDE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.ScaleX_SIDE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.ScaleX_SIDE_DEVNET_END_BLOCK) || undefined,
			},
			coreDevnet: {
				address: getAddress((process.env.MAILBOX_SCALEX_CORE_DEVNET_ADDRESS as `0x${string}`) || default_address),
				startBlock: Number(process.env.SCALEX_CORE_DEVNET_START_BLOCK) || 0,
				endBlock: Number(process.env.SCALEX_CORE_DEVNET_END_BLOCK) || undefined,
			}
		},
	},
};

export function getSideChainConfig() {
	const config = {
		networks: {
			// ScaleX Anvil 2 (Side Chain - 31337) - Cross-chain operations
			sideDevnet: {
				chainId: 31337,
				transport: fallback([
					http(process.env.SIDE_DEVNET_ENDPOINT),
				]),
				pollingInterval: Number(process.env.ScaleX_SIDE_DEVNET_POLLING_INTERVAL) || 1000,
				maxRequestsPerSecond: Number(process.env.ScaleX_SIDE_DEVNET_MAX_REQUESTS_PER_SECOND) || 50,
				// Anvil-specific optimizations
				retryCount: Number(process.env.MAX_RETRIES) || 3,
				retryDelay: Number(process.env.RETRY_DELAY) || 1000,
			},
			coreDevnet: {
				chainId: 31337,
				transport: fallback([
					http(process.env.CORE_DEVNET_ENDPOINT),
				]),
				pollingInterval: Number(process.env.SCALEX_CORE_DEVNET_POLLING_INTERVAL) || 1000,
				maxRequestsPerSecond: Number(process.env.SCALEX_CORE_DEVNET_MAX_REQUESTS_PER_SECOND) || 50,
				// Anvil-specific optimizations
				retryCount: Number(process.env.MAX_RETRIES) || 3,
				retryDelay: Number(process.env.RETRY_DELAY) || 1000,
			},
		},
		contracts: contracts,

		// Additional side-chain-specific configuration
		options: {
			// Performance settings optimized for side chain operations
			maxHealthcheckDuration: 30_000,
			telemetryDisabled: process.env.PONDER_TELEMETRY_DISABLED === "true",

			// Debug settings
			logLevel: process.env.LOG_LEVEL as "silent" | "error" | "warn" | "info" | "debug" | "trace" || "debug",
		},

		// Server configuration
		server: {
			port: Number(process.env.PONDER_PORT) || 42071,
		},
	};

	return config;
}

// Utility function to validate side chain environment variables
export function validateSideChainEnvironment(): boolean {
	const requiredVars = [
		"SIDE_DEVNET_ENDPOINT",
		"CHAIN_BALANCE_MANAGER_ScaleX_SIDE_DEVNET_ADDRESS",
		"MAILBOX_ScaleX_SIDE_DEVNET_ADDRESS",
		"FAUCET_ScaleX_SIDE_DEVNET_ADDRESS",
	];

	const missing = requiredVars.filter(varName => !process.env[varName]);

	if (missing.length > 0) {
		console.error(`Missing required side chain environment variables: ${missing.join(", ")}`);
		console.error("Please ensure .env.side-chain is properly configured");
		return false;
	}

	return true;
}