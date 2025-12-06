export interface WalletBalance {
  symbol: string;
  available: string;
  locked: string;
  decimals: number;
}

export interface WalletOrders {
  open: number;
  filled: number;
  cancelled: number;
}

export interface WalletInfo {
  index: number;
  name: string;
  address: string;
  privateKey: string;
  onChainBalances: {
    ETH: string;
    WETH: string;
    USDC: string;
  };
  depositedBalances: WalletBalance[];
  orders: WalletOrders;
}

export interface WalletsResponse {
  wallets: WalletInfo[];
}

export interface OrderHistoryItem {
  orderId: string;
  poolId: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  price: string;
  quantity: string;
  filled: string;
  remaining: string;
  timestamp: number;
  createdAt: string;
}

export interface WalletDetailInfo {
  address: string;
  walletIndex: number | null;
  walletName: string | null;
  onChainBalances: {
    ETH: string;
    WETH: string;
    USDC: string;
  };
  depositedBalances: WalletBalance[];
  ordersSummary: WalletOrders;
  ordersHistory: OrderHistoryItem[];
}
