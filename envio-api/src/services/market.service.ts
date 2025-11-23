import { db } from '../config/database';
import {
  pools,
  orders,
  orderBookDepth,
  orderBookTrades,
  balances,
  minuteBuckets,
  fiveMinuteBuckets,
  thirtyMinuteBuckets,
  hourBuckets,
  dailyBuckets,
} from '../schema/aggregated';
import { eq, and, desc, sql, gte, lte, asc } from 'drizzle-orm';
import type { Order, Trade, Pool, OrderBookDepth as OrderBookDepthType, DepthLevel } from '../types';

// Pool address mapping (you may want to get this dynamically)
const POOL_ADDRESSES: Record<string, string> = {
  'WETHUSDC': '0x58013521Ba2D0FdfDC4763313Ae4e61A4dD9438e',
  'WETH/USDC': '0x58013521Ba2D0FdfDC4763313Ae4e61A4dD9438e',
  'WBTCUSDC': '0x66b50d56c4275e59dAC301f51E3906C5391c7131',
  'WBTC/USDC': '0x66b50d56c4275e59dAC301f51E3906C5391c7131',
};

export class MarketService {
  private getPoolAddress(symbol: string): string {
    const normalizedSymbol = symbol.toUpperCase().replace('/', '');
    const poolAddress = POOL_ADDRESSES[normalizedSymbol] || POOL_ADDRESSES[symbol];

    if (!poolAddress) {
      throw new Error(`Unsupported symbol: ${symbol}`);
    }

    return poolAddress.toLowerCase();
  }

  async getOpenOrders(symbol: string, address: string): Promise<Order[]> {
    const poolAddress = this.getPoolAddress(symbol);

    const result = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.poolId, poolAddress),
          eq(orders.user, address.toLowerCase()),
          eq(orders.status, 'Open')
        )
      )
      .orderBy(desc(orders.timestamp));

    return result.map(order => ({
      id: order.id,
      orderId: order.orderId.toString(),
      user: order.user!,
      side: order.side?.toLowerCase() as 'buy' | 'sell',
      price: order.price?.toString() || '0',
      quantity: order.quantity?.toString() || '0',
      filled: order.filled?.toString() || '0',
      status: order.status?.toLowerCase() as any,
      expiry: order.expiry?.toString() || '0',
      isMarketOrder: order.orderType === 'Market',
      timestamp: order.timestamp?.toString(),
    }));
  }

  async getAllOrders(symbol: string, address: string, limit: number = 50): Promise<Order[]> {
    const poolAddress = this.getPoolAddress(symbol);

    const result = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.poolId, poolAddress),
          eq(orders.user, address.toLowerCase())
        )
      )
      .orderBy(desc(orders.timestamp))
      .limit(limit);

    return result.map(order => ({
      id: order.id,
      orderId: order.orderId.toString(),
      user: order.user!,
      side: order.side?.toLowerCase() as 'buy' | 'sell',
      price: order.price?.toString() || '0',
      quantity: order.quantity?.toString() || '0',
      filled: order.filled?.toString() || '0',
      status: order.status?.toLowerCase() as any,
      expiry: order.expiry?.toString() || '0',
      isMarketOrder: order.orderType === 'Market',
      timestamp: order.timestamp?.toString(),
    }));
  }

  async getTrades(symbol: string, limit: number = 100, user?: string): Promise<Trade[]> {
    const poolAddress = this.getPoolAddress(symbol);

    let query = db
      .select()
      .from(orderBookTrades)
      .where(eq(orderBookTrades.poolId, poolAddress));

    const result = await query
      .orderBy(desc(orderBookTrades.timestamp))
      .limit(limit);

    return result.map(trade => ({
      id: trade.id,
      buyOrderId: trade.id, // Simplified
      sellOrderId: trade.id, // Simplified
      user: user || '',
      side: trade.side?.toLowerCase() as 'buy' | 'sell',
      price: trade.price?.toString() || '0',
      quantity: trade.quantity?.toString() || '0',
      timestamp: trade.timestamp?.toString() || '0',
    }));
  }

  async getDepth(symbol: string, limit: number = 20): Promise<OrderBookDepthType> {
    const poolAddress = this.getPoolAddress(symbol);

    // Get buy orders (bids)
    const buyOrders = await db
      .select()
      .from(orderBookDepth)
      .where(
        and(
          eq(orderBookDepth.poolId, poolAddress),
          eq(orderBookDepth.side, 'Buy')
        )
      )
      .orderBy(desc(orderBookDepth.price))
      .limit(limit);

    // Get sell orders (asks)
    const sellOrders = await db
      .select()
      .from(orderBookDepth)
      .where(
        and(
          eq(orderBookDepth.poolId, poolAddress),
          eq(orderBookDepth.side, 'Sell')
        )
      )
      .orderBy(asc(orderBookDepth.price))
      .limit(limit);

    return {
      lastUpdateId: Date.now(),
      bids: buyOrders.map(order => ([
        order.price.toString(),
        order.quantity.toString(),
      ])),
      asks: sellOrders.map(order => ([
        order.price.toString(),
        order.quantity.toString(),
      ])),
    };
  }

  async getPairs(): Promise<Pool[]> {
    const result = await db
      .select()
      .from(pools);

    return result.map(pool => ({
      id: pool.id,
      poolId: pool.poolId,
      baseAsset: pool.baseCurrency,  // Use baseAsset to match Ponder API
      quoteAsset: pool.quoteCurrency, // Use quoteAsset to match Ponder API
      baseCurrency: pool.baseCurrency, // Keep original for backward compatibility
      quoteCurrency: pool.quoteCurrency, // Keep original for backward compatibility
      orderBook: pool.orderBook,
      price: pool.price?.toString(),
      volume24h: pool.volume?.toString(),
      baseDecimals: pool.baseDecimals,
      quoteDecimals: pool.quoteDecimals,
      volume: pool.volume?.toString(),
      volumeInQuote: pool.volumeInQuote?.toString() || '0',
      timestamp: pool.timestamp,
    }));
  }

  async getTickerPrice(symbol: string): Promise<{ symbol: string, price: string } | null> {
    const poolAddress = this.getPoolAddress(symbol);

    // First try to get the latest trade price
    const latestTrade = await db
      .select()
      .from(orderBookTrades)
      .where(eq(orderBookTrades.poolId, poolAddress))
      .orderBy(desc(orderBookTrades.timestamp))
      .limit(1);

    if (latestTrade.length > 0) {
      return {
        symbol: symbol,
        price: latestTrade[0].price?.toString() || '0',
      };
    }

    // If no trades, fall back to pool price
    const pool = await db
      .select()
      .from(pools)
      .where(eq(pools.poolId, poolAddress))
      .limit(1);

    if (pool.length === 0) {
      return null;
    }

    return {
      symbol: symbol,
      price: pool[0].price?.toString() || '0',
    };
  }

  async getTicker24Hr(symbol: string): Promise<any> {
    const poolAddress = this.getPoolAddress(symbol);

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const trades = await db
      .select()
      .from(orderBookTrades)
      .where(
        and(
          eq(orderBookTrades.poolId, poolAddress),
          gte(orderBookTrades.timestamp, oneDayAgo)
        )
      )
      .orderBy(asc(orderBookTrades.timestamp));

    if (trades.length === 0) {
      return {
        symbol,
        priceChange: '0',
        priceChangePercent: '0',
        lastPrice: '0',
        volume: '0',
        quoteVolume: '0',
        openPrice: '0',
        highPrice: '0',
        lowPrice: '0',
        count: 0,
      };
    }

    const prices = trades.map(t => BigInt(t.price || 0));
    const volumes = trades.map(t => BigInt(t.quantity || 0));

    const lastPrice = prices[prices.length - 1];
    const openPrice = prices[0];
    const highPrice = prices.reduce((a, b) => a > b ? a : b);
    const lowPrice = prices.reduce((a, b) => a < b ? a : b);
    const volume = volumes.reduce((a, b) => a + b, 0n);

    const priceChange = lastPrice - openPrice;
    const priceChangePercent = openPrice > 0n
      ? Number((priceChange * 10000n) / openPrice) / 100
      : 0;

    return {
      symbol,
      priceChange: priceChange.toString(),
      priceChangePercent: priceChangePercent.toFixed(2),
      lastPrice: lastPrice.toString(),
      volume: volume.toString(),
      quoteVolume: (volume * lastPrice).toString(),
      openPrice: openPrice.toString(),
      highPrice: highPrice.toString(),
      lowPrice: lowPrice.toString(),
      count: trades.length,
    };
  }

  async getKlines(symbol: string, interval: string, limit: number = 500, startTime?: number, endTime?: number): Promise<any[]> {
    const poolAddress = this.getPoolAddress(symbol);

    // Map interval to bucket table
    const bucketTable = this.getBucketTable(interval);

    let query = db
      .select()
      .from(bucketTable)
      .where(eq(bucketTable.poolId, poolAddress));

    // Add time filters if provided
    if (startTime) {
      query = query.where(gte(bucketTable.openTime, startTime)) as any;
    }
    if (endTime) {
      query = query.where(lte(bucketTable.closeTime, endTime)) as any;
    }

    const result = await query
      .orderBy(desc(bucketTable.openTime))
      .limit(limit);

    return result.map(bucket => ({
      t: bucket.openTime * 1000,
      T: bucket.closeTime * 1000,
      o: bucket.openPrice.toString(),
      h: bucket.highPrice.toString(),
      l: bucket.lowPrice.toString(),
      c: bucket.closePrice.toString(),
      v: bucket.volume.toString(),
      q: bucket.quoteVolume.toString(),
      n: bucket.count,
      V: bucket.takerBuyBaseVolume.toString(),
      Q: bucket.takerBuyQuoteVolume.toString(),
    })).reverse(); // Return in ascending order
  }

  private getBucketTable(interval: string) {
    switch (interval) {
      case '1m':
        return minuteBuckets;
      case '5m':
        return fiveMinuteBuckets;
      case '30m':
        return thirtyMinuteBuckets;
      case '1h':
        return hourBuckets;
      case '1d':
        return dailyBuckets;
      default:
        return minuteBuckets;
    }
  }

  async getBalances(address: string): Promise<any[]> {
    const result = await db
      .select()
      .from(balances)
      .where(eq(balances.user, address.toLowerCase()));

    return result.map(balance => ({
      currency: balance.currency,
      available: balance.amount?.toString() || '0',
      locked: balance.lockedAmount?.toString() || '0',
      total: ((balance.amount || 0n) + (balance.lockedAmount || 0n)).toString(),
    }));
  }
}

export const marketService = new MarketService();
