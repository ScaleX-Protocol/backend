export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface Order {
  id: string;
  orderId: string;
  user: string;
  side: 'buy' | 'sell';
  price: string;
  quantity: string;
  filled: string;
  status: 'open' | 'filled' | 'cancelled' | 'partially_filled';
  expiry: string;
  isMarketOrder: boolean;
  timestamp?: string;
}

export interface Trade {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  user: string;
  side: 'buy' | 'sell';
  price: string;
  quantity: string;
  timestamp: string;
}

export interface Pool {
  id: string;
  poolId: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseAsset?: string;  // For Ponder compatibility
  quoteAsset?: string; // For Ponder compatibility
  orderBook: string;
  price?: string;
  volume24h?: string;
  baseDecimals?: number;
  quoteDecimals?: number;
  volume?: string;
  volumeInQuote?: string;
  timestamp?: number;
}

export interface DepthLevel {
  price: string;
  quantity: string;
}

export interface OrderBookDepth {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface Balance {
  currency: string;
  available: string;
  locked: string;
  total: string;
}
