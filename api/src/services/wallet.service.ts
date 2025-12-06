import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { WalletInfo, WalletBalance } from '../types';
import { createLogger, LogLabel, ServiceName } from '../utils/logger';

const logger = createLogger('wallet.service.ts', ServiceName.SCALEX_API);

// Wallet names mapping
const WALLET_NAMES = [
  "Scalex 1",
  "Scalex 2",
  "MM Bot",
  "Trading Bot 1",
  "Trading Bot 2",
  "Trading Bot 3",
  "Faucet",
  "Trader 1",
  "Trader 2",
  "Trader 3",
];

// Get config from environment
const getConfig = () => {
  const seedPhrase = process.env.WALLET_SEED_PHRASE;
  const rpcUrl = process.env.WALLET_RPC_URL || process.env.FAUCET_RPC_URL_84532?.split(',')[0] || 'https://sepolia.base.org';
  const indexerUrl = process.env.WALLET_INDEXER_URL || 'https://base-sepolia-indexer.scalex.money/';
  const wethAddress = process.env.WALLET_WETH_ADDRESS || '0xCf6c841Fe5aeE3ddeEEb87dEff52cCf72E4649Ad';
  const usdcAddress = process.env.WALLET_USDC_ADDRESS || '0x44E9F25DCC735fCeABc6c784046722BcA5bBCcB5';

  return { seedPhrase, rpcUrl, indexerUrl, wethAddress, usdcAddress };
};

// Parse indices from string
function parseIndices(input?: string): number[] {
  if (!input) {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }

  const indices: number[] = [];
  const parts = input.split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        if (i >= 0 && i <= 9) {
          indices.push(i);
        }
      }
    } else {
      const idx = Number(part);
      if (idx >= 0 && idx <= 9) {
        indices.push(idx);
      }
    }
  }

  // Remove duplicates and sort
  return [...new Set(indices)].sort((a, b) => a - b);
}

// Get wallet from seed phrase at index
function getWallet(seedPhrase: string, index: number) {
  const account = mnemonicToAccount(seedPhrase, { addressIndex: index });
  return {
    address: account.address,
    privateKey: `0x${Buffer.from(account.getHdKey().privateKey!).toString('hex')}`,
  };
}

// GraphQL query helper
async function queryIndexer(indexerUrl: string, query: string): Promise<any> {
  try {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return await response.json();
  } catch (e) {
    logger.error(`Indexer query failed: ${e}`, LogLabel.API, 'queryIndexer');
    return null;
  }
}

// Fetch deposited balances for multiple users
async function fetchDepositedBalances(indexerUrl: string, addresses: string[]): Promise<Map<string, any[]>> {
  const userList = addresses.map((a) => `"${a.toLowerCase()}"`).join(', ');
  const query = `{ balancess(where: { user_in: [${userList}] }, limit: 100) { items { user amount lockedAmount currency { symbol decimals } } } }`;

  const result = await queryIndexer(indexerUrl, query);
  const balances = new Map<string, any[]>();

  if (result?.data?.balancess?.items) {
    for (const item of result.data.balancess.items) {
      const user = item.user.toLowerCase();
      if (!balances.has(user)) {
        balances.set(user, []);
      }
      balances.get(user)!.push(item);
    }
  }

  return balances;
}

// Fetch order count for a user by status
async function fetchOrderCount(indexerUrl: string, address: string, status: string): Promise<number> {
  const query = `{ orderss(where: { user: "${address.toLowerCase()}", status: "${status}" }) { totalCount } }`;
  const result = await queryIndexer(indexerUrl, query);
  return result?.data?.orderss?.totalCount || 0;
}

export class WalletService {
  static async getWallets(indicesInput?: string): Promise<WalletInfo[]> {
    const config = getConfig();

    if (!config.seedPhrase) {
      throw new Error('WALLET_SEED_PHRASE not configured');
    }

    const indices = parseIndices(indicesInput);

    logger.info(`Fetching wallets for indices: ${indices.join(',')}`, LogLabel.API, 'getWallets');

    // Create public client
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(config.rpcUrl),
    });

    // Get all wallet addresses for selected indices
    const wallets = indices.map((i) => ({
      index: i,
      name: WALLET_NAMES[i],
      ...getWallet(config.seedPhrase!, i),
    }));

    // Fetch deposited balances in a single request
    const depositedBalances = await fetchDepositedBalances(
      config.indexerUrl,
      wallets.map((w) => w.address)
    );

    // Process each wallet
    const results: WalletInfo[] = [];

    for (const wallet of wallets) {
      // Fetch on-chain balances
      const [ethBalance, wethBalanceRaw, usdcBalanceRaw] = await Promise.all([
        client.getBalance({ address: wallet.address as `0x${string}` }),
        client.readContract({
          address: config.wethAddress as `0x${string}`,
          abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
          functionName: 'balanceOf',
          args: [wallet.address as `0x${string}`],
        }),
        client.readContract({
          address: config.usdcAddress as `0x${string}`,
          abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
          functionName: 'balanceOf',
          args: [wallet.address as `0x${string}`],
        }),
      ]);

      // Process deposited balances
      const userBalances = depositedBalances.get(wallet.address.toLowerCase()) || [];
      const depositedBalancesList: WalletBalance[] = userBalances
        .sort((a, b) => a.currency.symbol.localeCompare(b.currency.symbol))
        .map((item) => {
          const decimals = item.currency.decimals;
          const amount = BigInt(item.amount || '0');
          const locked = BigInt(item.lockedAmount || '0');
          return {
            symbol: item.currency.symbol,
            available: (Number(amount) / 10 ** decimals).toString(),
            locked: (Number(locked) / 10 ** decimals).toString(),
            decimals,
          };
        });

      // Fetch order counts
      const [openCount, filledCount, cancelledCount] = await Promise.all([
        fetchOrderCount(config.indexerUrl, wallet.address, 'OPEN'),
        fetchOrderCount(config.indexerUrl, wallet.address, 'FILLED'),
        fetchOrderCount(config.indexerUrl, wallet.address, 'CANCELLED'),
      ]);

      results.push({
        index: wallet.index,
        name: wallet.name,
        address: wallet.address,
        privateKey: wallet.privateKey,
        onChainBalances: {
          ETH: formatEther(ethBalance),
          WETH: formatEther(wethBalanceRaw as bigint),
          USDC: formatUnits(usdcBalanceRaw as bigint, 6),
        },
        depositedBalances: depositedBalancesList,
        orders: {
          open: openCount,
          filled: filledCount,
          cancelled: cancelledCount,
        },
      });
    }

    logger.info(`Successfully fetched ${results.length} wallets`, LogLabel.API, 'getWallets');

    return results;
  }
}
