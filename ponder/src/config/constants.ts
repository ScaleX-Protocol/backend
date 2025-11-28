// Central configuration constants for the ScaleX CLOB Indexer
export const CONFIG = {
  // Cache & TTL Settings
  CACHE: {
    REDIS_TTL_DEFAULT: 2147483647, // max int32 - ~68 years
    REDIS_TTL_SHORT: 3600,        // 1 hour
    REDIS_TTL_MEDIUM: 86400,      // 24 hours  
    REDIS_TTL_LONG: 604800,       // 7 days
  },

  // API Limits & Pagination
  API: {
    DEFAULT_LIMIT_SMALL: 100,
    DEFAULT_LIMIT_MEDIUM: 500,
    DEFAULT_LIMIT_LARGE: 1000,
    MAX_LIMIT_SMALL: 1000,
    MAX_LIMIT_MEDIUM: 5000,
    MAX_LIMIT_LARGE: 10000,
  },

  // WebSocket & Network Settings
  NETWORK: {
    WS_PING_INTERVAL_DEFAULT: 30000,  // 30 seconds
    WS_TIMEOUT_DEFAULT: 60000,        // 1 minute
    SYSTEM_MONITOR_INTERVAL_DEFAULT: 60, // 1 minute
    SYSTEM_MONITOR_INTERVAL_PRODUCTION: 120, // 2 minutes
  },

  // Business Logic Thresholds
  BUSINESS: {
    LIQUIDITY_THRESHOLDS: {
      EXCELLENT: 10000,
      VERY_GOOD: 5000,
      GOOD: 1000,
      FAIR: 0
    },
    LIQUIDITY_SCORES: {
      EXCELLENT: '92.3',
      VERY_GOOD: '85.7',
      GOOD: '78.5',
      FAIR: '65.2'
    },
    LIQUIDITY_RATINGS: {
      EXCELLENT: 'Excellent',
      VERY_GOOD: 'Very Good',
      GOOD: 'Good',
      FAIR: 'Fair'
    },
    SLIPPAGE_VOLUME_THRESHOLD: 30000,
    MIN_LIQUIDITY_BASELINE: 30000,
  },

  // Addresses
  ADDRESSES: {
    ZERO_ADDRESS: "0x0000000000000000000000000000000000000000" as const,
    DEFAULT_USER_ADDRESS: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const,
  },

  // Feature Flags
  FEATURES: {
    USE_RAW_SQL_DEFAULT: false,
    ENABLE_DEBUG_LOGS_DEFAULT: false,
    ENABLE_WEBSOCKET_LOGS_DEFAULT: false,
  }
} as const;

// Helper functions for getting configuration values
export const getCacheTtl = (customTtl?: string | number, type: 'short' | 'medium' | 'long' | 'default' = 'default'): number => {
  const ttlKey = `REDIS_TTL_${type.toUpperCase()}` as keyof typeof CONFIG.CACHE;
  if (customTtl) {
    const parsed = parseInt(customTtl.toString());
    return isNaN(parsed) ? CONFIG.CACHE[ttlKey] : parsed;
  }
  return CONFIG.CACHE[ttlKey];
};

export const getApiLimit = (providedLimit?: string | number, type: 'small' | 'medium' | 'large' = 'medium'): number => {
  const maxKey = `MAX_LIMIT_${type.toUpperCase()}` as keyof typeof CONFIG.API;
  const defaultKey = `DEFAULT_LIMIT_${type.toUpperCase()}` as keyof typeof CONFIG.API;
  if (providedLimit) {
    const parsed = parseInt(providedLimit.toString());
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, CONFIG.API[maxKey]);
    }
  }
  return CONFIG.API[defaultKey];
};

export const getNetworkInterval = (customInterval?: string | number, type: 'ping' | 'monitor' = 'ping', production = false): number => {
  const intervalKey = `WS_${type.toUpperCase()}_INTERVAL_${production ? 'PRODUCTION' : 'DEFAULT'}` as keyof typeof CONFIG.NETWORK;
  if (customInterval) {
    const parsed = parseInt(customInterval.toString());
    return isNaN(parsed) ? CONFIG.NETWORK[intervalKey] : parsed;
  }
  return CONFIG.NETWORK[intervalKey];
};

export const getLiquidityThreshold = (totalLiquidity: number): {
  score: string;
  rating: string;
  level: 'excellent' | 'very_good' | 'good' | 'fair';
} => {
  const { LIQUIDITY_THRESHOLDS, LIQUIDITY_SCORES, LIQUIDITY_RATINGS } = CONFIG.BUSINESS;

  if (totalLiquidity >= LIQUIDITY_THRESHOLDS.EXCELLENT) {
    return { score: LIQUIDITY_SCORES.EXCELLENT, rating: LIQUIDITY_RATINGS.EXCELLENT, level: 'excellent' };
  } else if (totalLiquidity >= LIQUIDITY_THRESHOLDS.VERY_GOOD) {
    return { score: LIQUIDITY_SCORES.VERY_GOOD, rating: LIQUIDITY_RATINGS.VERY_GOOD, level: 'very_good' };
  } else if (totalLiquidity >= LIQUIDITY_THRESHOLDS.GOOD) {
    return { score: LIQUIDITY_SCORES.GOOD, rating: LIQUIDITY_RATINGS.GOOD, level: 'good' };
  } else {
    return { score: LIQUIDITY_SCORES.FAIR, rating: LIQUIDITY_RATINGS.FAIR, level: 'fair' };
  }
};