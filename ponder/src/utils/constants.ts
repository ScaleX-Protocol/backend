export const ORDER_STATUS = ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"];

export const TIME_INTERVALS = {
	minute: 60,
	fiveMinutes: 300,
	thirtyMinutes: 1800,
	hour: 3600,
	day: 86400,
};

export enum OrderSide {
	BUY = "Buy",
	SELL = "Sell",
}

export enum OrderType {
	MARKET = "Market",
	LIMIT = "Limit",
}

// Lending Protocol Constants
export const LENDING_ACTIONS = [
	"SUPPLY",
	"BORROW", 
	"REPAY",
	"WITHDRAW",
	"LIQUIDATE"
] as const;

export const YIELD_TYPES = [
	"LENDING",
	"BORROWING"
] as const;

export const ORACLE_SOURCES = [
	"CHAINLINK",
	"TWAP",
	"MANUAL"
] as const;

// Health factor thresholds (in basis points)
export const HEALTH_FACTOR_THRESHOLDS = {
	SAFE: 15000,      // 150%
	WARNING: 12000,   // 120%
	DANGER: 10000,    // 100%
	LIQUIDATION: 8500  // 85%
} as const;

// Interest rate constants (basis points)
export const INTEREST_RATE_CONSTANTS = {
	BASE_RATE: 100,           // 1%
	MAX_RATE: 10000,          // 100%
	UTILIZATION_PREMIUM: 5000, // 50%
} as const;

// Collateral factors (basis points)
export const COLLATERAL_FACTORS = {
	WETH: 9000,      // 90%
	USDC: 9500,      // 95%
	WBTC: 8500,      // 85%
	ETH: 8500,       // 85%
	DEFAULT: 7500,   // 75%
} as const;
