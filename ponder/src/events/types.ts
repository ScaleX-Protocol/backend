export interface TradeEvent {
  symbol: string;
  price: string;
  quantity: string;
  timestamp: string;
  userId: string;
  side: 'buy' | 'sell';
  tradeId: string;
  orderId: string;
  makerOrderId: string;
}

export interface BalanceUpdateEvent {
  userId: string;
  token: string;
  available: string;
  locked: string;
  timestamp: string;
}

export interface ChainBalanceEvent {
  eventType: 'deposit' | 'withdraw' | 'unlock' | 'claim';
  userId: string;
  token: string;
  amount: string;
  chainId: string;
  timestamp: string;
  transactionId: string;
  blockNumber: string;
}

export interface OrderEvent {
  orderId: string;
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: string;
  quantity: string;
  filledQuantity: string;
  status: 'pending' | 'filled' | 'cancelled' | 'partially_filled';
  timestamp: string;
}

export interface DepthEvent {
  symbol: string;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
  timestamp: string;
}

export interface KlineEvent {
  symbol: string;
  interval: string;
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: string;
}

export interface ExecutionReportEvent {
  orderId: string;
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: string;
  quantity: string;
  filledQuantity: string;
  status: 'new' | 'filled' | 'cancelled' | 'partially_filled';
  timestamp: string;
  executionType: 'new' | 'trade' | 'cancelled';
}

export interface LendingEvent {
  action: 'supply' | 'borrow' | 'repay' | 'withdraw' | 'liquidate';
  user: string;
  token: string;
  amount: string;
  timestamp: string;
  collateralToken?: string;
  debtToken?: string;
  healthFactor?: string;
  interestRate?: string;
  liquidator?: string;
  debtRepaid?: string;
  liquidationBonus?: string;
  interestPaid?: string;
  interestEarned?: string;
}

export interface LiquidationEvent {
  liquidatedUser: string;
  liquidator: string;
  collateralToken: string;
  debtToken: string;
  collateralAmount: string;
  debtAmount: string;
  healthFactor: string;
  price: string;
  timestamp: string;
}

export interface PriceUpdateEvent {
  token: string;
  price: string;
  decimals: string;
  source: string;
  timestamp: string;
  confidence?: string;
}

export interface YieldAccrualEvent {
  user: string;
  token: string;
  yieldType: 'lending' | 'borrowing';
  amount: string;
  interestRate: string;
  timestamp: string;
  cumulativeYield: string;
}

export enum EventStreams {
  TRADES = 'trades',
  BALANCES = 'balances',
  ORDERS = 'orders',
  DEPTH = 'depth',
  KLINES = 'klines',
  EXECUTION_REPORTS = 'execution_reports',
  CHAIN_BALANCES = 'chain_balances',
  LENDING = 'lending',
  LIQUIDATIONS = 'liquidations',
  YIELD_ACCRUALS = 'yield_accruals',
  PRICE_UPDATES = 'price_updates'
}

// Helper function to create chain-specific stream keys
export function getStreamKey(stream: EventStreams, chainId?: string): string {
  const defaultChainId = process.env.DEFAULT_CHAIN_ID || '31337';
  const actualChainId = chainId || defaultChainId;
  return `chain:${actualChainId}:${stream}`;
}

export interface StreamMessage {
  [key: string]: string;
}