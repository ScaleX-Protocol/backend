// Type definitions for Ponder event handlers - Side Chain only

/**
 * Helper function to safely type event names for Ponder
 * This provides a way to document and centralize all event names
 * while still satisfying TypeScript's type checking
 */
export function ponderEvent<T extends string>(eventName: T): any {
	// Using type assertion to any here to satisfy Ponder's type system
	// This is safer than sprinkling 'as any' throughout the codebase
	return eventName as any;
}

/**
 * Helper function to safely type event handlers for Ponder
 * This provides a way to document and centralize handler typings
 * while still satisfying Ponder's type system
 */
export function createPonderHandler<T>(handler: (args: any) => Promise<void>): (args: any) => Promise<void> {
	// This function doesn't actually do anything at runtime
	// It just helps TypeScript understand the types better
	return handler;
}

/**
 * Event names used in the Side Chain configuration
 * These are kept as constants for documentation and to avoid typos
 */
export const PonderEvents = {
  // ChainBalanceManager Events (Side Chain)
  CHAIN_BALANCE_MANAGER_DEPOSIT: ponderEvent("ChainBalanceManager:Deposit"),
  CHAIN_BALANCE_MANAGER_WITHDRAW: ponderEvent("ChainBalanceManager:Withdraw"),
  CHAIN_BALANCE_MANAGER_UNLOCK: ponderEvent("ChainBalanceManager:Unlock"),
  CHAIN_BALANCE_MANAGER_CLAIM: ponderEvent("ChainBalanceManager:Claim"),
  CHAIN_BALANCE_MANAGER_TOKEN_WHITELISTED: ponderEvent("ChainBalanceManager:TokenWhitelisted"),
  CHAIN_BALANCE_MANAGER_TOKEN_REMOVED: ponderEvent("ChainBalanceManager:TokenRemoved"),
  CHAIN_BALANCE_MANAGER_OWNERSHIP_TRANSFERRED: ponderEvent("ChainBalanceManager:OwnershipTransferred"),
  CHAIN_BALANCE_MANAGER_INITIALIZED: ponderEvent("ChainBalanceManager:Initialized"),
  
  // Missing ChainBalanceManager Events (CRITICAL for cross-chain operations)
  CHAIN_BALANCE_MANAGER_BRIDGE_TO_SYNTHETIC: ponderEvent("ChainBalanceManager:BridgeToSynthetic"),
  CHAIN_BALANCE_MANAGER_WITHDRAW_MESSAGE_RECEIVED: ponderEvent("ChainBalanceManager:WithdrawMessageReceived"),
  CHAIN_BALANCE_MANAGER_TOKEN_MAPPING_SET: ponderEvent("ChainBalanceManager:TokenMappingSet"),
  CHAIN_BALANCE_MANAGER_CROSS_CHAIN_CONFIG_UPDATED: ponderEvent("ChainBalanceManager:CrossChainConfigUpdated"),
  CHAIN_BALANCE_MANAGER_NONCE_INCREMENTED: ponderEvent("ChainBalanceManager:NonceIncremented"),
  
  // Cross-Chain Events (Hyperlane)
  HYPERLANE_MAILBOX_DISPATCH_ID: ponderEvent("HyperlaneMailbox:DispatchId"),
  HYPERLANE_MAILBOX_PROCESS_ID: ponderEvent("HyperlaneMailbox:ProcessId"),
  
  // Faucet Events (available on side chain too)
  ADD_TOKEN: ponderEvent("Faucet:AddToken"),
  REQUEST_TOKEN: ponderEvent("Faucet:RequestToken"),
  DEPOSIT_TOKEN: ponderEvent("Faucet:DepositToken"),
};

/**
 * Type for Ponder database operations
 */
export interface PonderDatabase {
	insert: (table: any) => {
		values: (values: any) => {
			onConflictDoNothing: () => Promise<any>;
			onConflictDoUpdate: (options: any) => Promise<any>;
			execute: () => Promise<any>;
		};
	};
	update: (
		table: any,
		values: any
	) => {
		where: (condition: any) => Promise<any>;
		execute: () => Promise<any>;
	};
	find: <T = any>(table: any, where: any) => Promise<T | null>;
	select: () => {
		from: (table: any) => {
			where: (condition: any) => {
				execute: () => Promise<any[]>;
				orderBy: (column: any) => {
					limit: (limit: number) => {
						execute: () => Promise<any[]>;
					};
				};
			};
			orderBy: (column: any) => {
				limit: (limit: number) => {
					execute: () => Promise<any[]>;
				};
			};
			limit: (limit: number) => {
				execute: () => Promise<any[]>;
			};
			execute: () => Promise<any[]>;
		};
	};
	sql: (...args: any[]) => Promise<any>;
}

/**
 * Generic handler parameter type for Ponder event handlers
 */
export interface PonderHandlerParams<T = any> {
	event: {
		args: T;
		log: {
			address: `0x${string}`;
			blockNumber: bigint;
			transactionHash: `0x${string}`;
		};
		block: {
			timestamp: bigint;
			number: bigint;
		};
		transaction: {
			hash: `0x${string}`;
		};
	};
	context: {
		db: PonderDatabase;
		network: {
			chainId: number;
			name: string;
		};
	};
}