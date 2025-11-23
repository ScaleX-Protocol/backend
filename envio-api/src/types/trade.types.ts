export interface AllOrdersParams {
  symbol?: string;
  limit?: number;
  address: string;
}

export interface OpenOrdersParams {
  symbol?: string;
  address: string;
}

export interface TickerPriceParams {
  symbol: string;
}

export interface Ticker24HrParams {
  symbol: string;
}

export interface DepthParams {
  symbol: string;
  limit: number;
}

export interface TradeHistoryParams {
  symbol: string;
  limit: number;
  user?: string;
}

export interface DailyStats {
  open?: bigint | null;
  high?: bigint | null;
  low?: bigint | null;
  volume?: bigint | null;
  quoteVolume?: bigint | null;
  openTime?: number | null;
  count?: number | null;
  average?: bigint | null;
}

export interface FormattedOrder {
  symbol: string;
  orderId: string;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  origQuoteOrderQty: string;
}

export interface TickerPriceResponse {
  symbol: string;
  price: string;
}

export interface Ticker24HrResponse {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: string;
  lastId: string;
  count: number;
}

export interface DepthResponse {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

export interface TradeHistoryResponse {
  id: string;
  price: string;
  qty: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
}