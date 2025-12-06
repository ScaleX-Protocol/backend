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
