// Type definitions for Ponder event handlers

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
 * Event names used in the application
 * These are kept as constants for documentation and to avoid typos
 */
export const PonderEvents = {
	// Pool Manager Events
	POOL_CREATED: ponderEvent("PoolManager:PoolCreated"),

	// Balance Manager Events
	DEPOSIT: ponderEvent("BalanceManager:Deposit"),
	WITHDRAWAL: ponderEvent("BalanceManager:Withdrawal"),
	TRANSFER_FROM: ponderEvent("BalanceManager:TransferFrom"),
	TRANSFER_LOCKED_FROM: ponderEvent("BalanceManager:TransferLockedFrom"),
	LOCK: ponderEvent("BalanceManager:Lock"),
	UNLOCK: ponderEvent("BalanceManager:Unlock"),

	// Order Book Events
	ORDER_PLACED: ponderEvent("OrderBook:OrderPlaced"),
	ORDER_MATCHED: ponderEvent("OrderBook:OrderMatched"),
	ORDER_CANCELLED: ponderEvent("OrderBook:OrderCancelled"),
	UPDATE_ORDER: ponderEvent("OrderBook:UpdateOrder"),

	// ChainBalanceManager Events
	CHAIN_BALANCE_MANAGER_DEPOSIT: ponderEvent("ChainBalanceManager:Deposit"),
	CHAIN_BALANCE_MANAGER_WITHDRAW: ponderEvent("ChainBalanceManager:Withdraw"),
	CHAIN_BALANCE_MANAGER_UNLOCK: ponderEvent("ChainBalanceManager:Unlock"),
	CHAIN_BALANCE_MANAGER_CLAIM: ponderEvent("ChainBalanceManager:Claim"),
	CHAIN_BALANCE_MANAGER_TOKEN_WHITELISTED: ponderEvent("ChainBalanceManager:TokenWhitelisted"),
	CHAIN_BALANCE_MANAGER_TOKEN_REMOVED: ponderEvent("ChainBalanceManager:TokenRemoved"),
	CHAIN_BALANCE_MANAGER_OWNERSHIP_TRANSFERRED: ponderEvent("ChainBalanceManager:OwnershipTransferred"),
	CHAIN_BALANCE_MANAGER_INITIALIZED: ponderEvent("ChainBalanceManager:Initialized"),
	HYPERLANE_MAILBOX_DISPATCH_ID: ponderEvent("HyperlaneMailbox:DispatchId"),
	HYPERLANE_MAILBOX_PROCESS_ID: ponderEvent("HyperlaneMailbox:ProcessId"),
};

/**
 * OrderPlaced event arguments
 */
export interface OrderPlacedEventArgs {
	orderId: string;
	user: string;
	side: boolean;
	price: string;
	quantity: string;
	isMarketOrder: boolean;
	status: number;
	expiry: string;
}

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
