import { ponderDb } from '../config/database';
const db = ponderDb;
import { orders, pools, orderBookTrades, dailyBuckets, orderBookDepth } from '../schema';
import { and, asc, desc, eq, gte, gt, or, sql, inArray } from 'drizzle-orm';
import { 
  AllOrdersParams, 
  OpenOrdersParams, 
  TickerPriceParams, 
  Ticker24HrParams,
  DailyStats,
  FormattedOrder,
  TickerPriceResponse,
  Ticker24HrResponse
} from '../types';

export class TradeService {
  static async getInitData(symbol: string, address: `0x${string}`) {
    try {
      const allOrders = await this.getAllOrders({ symbol, limit: 500, address });
      const openOrders = await this.getOpenOrders({ symbol, address });
      const tickerPrice = await this.getTickerPrice({ symbol });
      const ticker24Hr = await this.getTicker24Hr({ symbol });

      return { allOrders, openOrders, tickerPrice, ticker24Hr };
    } catch (error) {
      throw new Error(`Failed to fetch init data: ${error}`);
    }
  }
    
  static async getAllOrders({ symbol, limit = 500, address }: AllOrdersParams) {
    try {
      const baseQuery = db.select().from(orders);
      let query = baseQuery.where(eq(orders.userAddress, address as `0x${string}`));

      if (symbol) {
        const queriedPools = await ponderDb.select().from(pools).where(eq(pools.coin, symbol));
        
        if (!queriedPools || queriedPools.length === 0) {
          throw new Error("Pool not found");
        }

        const poolId = queriedPools[0]!.orderBook;
        if (poolId) {
          query = baseQuery.where(and(eq(orders.userAddress, address as `0x${string}`), eq(orders.poolId, poolId)));
        }
      }

      const effectiveLimit = Math.min(limit, 1000);
      const userOrders = await query.orderBy(desc(orders.timestamp)).limit(effectiveLimit);

      // Collect all unique poolIds to avoid N+1 queries
      const uniquePoolIds = Array.from(new Set(userOrders.map(order => order.poolId).filter(Boolean)));
      
      // Fetch all pool data in a single query
      const poolsData = await db
        .select()
        .from(pools)
        .where(inArray(pools.orderBook, uniquePoolIds as `0x${string}`[]));
      
      // Create a map for quick lookup
      const poolsMap = new Map(poolsData.map(pool => [pool.orderBook, pool]));

      const formattedOrders: FormattedOrder[] = userOrders.map(order => {
        let decimals = 18;
        let orderSymbol = symbol || "UNKNOWN";

        if (order.poolId && poolsMap.has(order.poolId as `0x${string}`)) {
          const pool = poolsMap.get(order.poolId as `0x${string}`);
          if (pool?.quoteDecimals) {
            decimals = Number(pool.quoteDecimals);
          }
          if (!symbol && pool?.coin) {
            orderSymbol = pool.coin;
          }
        }

        return {
          symbol: orderSymbol,
          orderId: order.orderId.toString(),
          orderListId: -1,
          clientOrderId: order.id,
          price: order.price?.toString() || "0",
          origQty: order.quantity?.toString() || "0",
          executedQty: order.filled?.toString() || "0",
          cummulativeQuoteQty:
            order.filled && order.price
              ? ((BigInt(order.filled) * BigInt(order.price)) / BigInt(10 ** decimals)).toString()
              : "0",
          status: order.status || "UNKNOWN",
          timeInForce: order.timeInForce || "GTC",
          type: order.type || "UNKNOWN",
          side: order.side?.toUpperCase() || "UNKNOWN",
          stopPrice: "0",
          icebergQty: "0",
          time: Number(order.timestamp) * 1000,
          updateTime: Number(order.timestamp) * 1000,
          isWorking: order.status === "NEW" || order.status === "PARTIALLY_FILLED",
          origQuoteOrderQty: "0",
        };
      });

      return formattedOrders;
    } catch (error) {
      throw new Error(`Failed to fetch orders: ${error}`);
    }
  }

  static async getOpenOrders({ symbol, address }: OpenOrdersParams) {
    try {
      const baseQuery = db.select().from(orders);
      let query = baseQuery.where(
        and(
          eq(orders.userAddress, address as `0x${string}`),
          or(eq(orders.status, "NEW"), eq(orders.status, "PARTIALLY_FILLED"), eq(orders.status, "OPEN"))
        )
      );

      if (symbol) {
        const queriedPools = await ponderDb.select().from(pools).where(eq(pools.coin, symbol));
        
        if (!queriedPools || queriedPools.length === 0) {
          throw new Error("Pool not found");
        }

        const poolId = queriedPools[0]!.orderBook;
        if (poolId) {
          query = baseQuery.where(
            and(
              eq(orders.userAddress, address as `0x${string}`),
              or(eq(orders.status, "NEW"), eq(orders.status, "PARTIALLY_FILLED"), eq(orders.status, "OPEN")),
              eq(orders.poolId, poolId)
            )
          );
        }
      }

      const openOrders = await query.orderBy(desc(orders.timestamp)).limit(500);
      
      // Collect all unique poolIds to avoid N+1 queries
      const uniquePoolIds = Array.from(new Set(openOrders.map(order => order.poolId).filter(Boolean)));
      
      // Fetch all pool data in a single query
      const poolsData = await db
        .select()
        .from(pools)
        .where(inArray(pools.orderBook, uniquePoolIds as `0x${string}`[]));
      
      // Create a map for quick lookup
      const poolsMap = new Map(poolsData.map(pool => [pool.orderBook, pool]));

      const formattedOrders: FormattedOrder[] = openOrders.map(order => {
        let orderSymbol = symbol;
        let decimals = 18;

        if (order.poolId && poolsMap.has(order.poolId as `0x${string}`)) {
          const pool = poolsMap.get(order.poolId as `0x${string}`);
          orderSymbol = pool?.coin || "UNKNOWN";
          if (pool?.quoteDecimals) {
            decimals = Number(pool.quoteDecimals);
          }
        }

        return {
          symbol: orderSymbol || "UNKNOWN",
          orderId: order.orderId.toString(),
          orderListId: -1,
          clientOrderId: order.id,
          price: order.price?.toString() || "0",
          origQty: order.quantity?.toString() || "0",
          executedQty: order.filled?.toString() || "0",
          cummulativeQuoteQty:
            order.filled && order.price
              ? ((BigInt(order.filled) * BigInt(order.price)) / BigInt(10 ** decimals)).toString()
              : "0",
          status: order.status || "UNKNOWN",
          timeInForce: order.timeInForce || "GTC",
          type: order.type || "UNKNOWN",
          side: order.side?.toUpperCase() || "UNKNOWN",
          stopPrice: "0",
          icebergQty: "0",
          time: Number(order.timestamp) * 1000,
          updateTime: Number(order.timestamp) * 1000,
          isWorking: true,
          origQuoteOrderQty: "0",
        };
      });

      return formattedOrders;
    } catch (error) {
      throw new Error(`Failed to fetch open orders: ${error}`);
    }
  }

  static async getTickerPrice({ symbol }: TickerPriceParams) {
    try {
      const queriedPools = await ponderDb.select().from(pools).where(eq(pools.coin, symbol));

      if (!queriedPools || queriedPools.length === 0) {
        throw new Error("Pool not found");
      }

      const poolId = queriedPools[0]!.orderBook;

      if (!poolId) {
        throw new Error("Pool order book address not found");
      }

      const latestTrade = await db
        .select()
        .from(orderBookTrades)
        .where(eq(orderBookTrades.poolId, poolId))
        .orderBy(desc(orderBookTrades.timestamp))
        .limit(1);

      let price = "0";
      if (latestTrade.length > 0 && latestTrade[0]?.price) {
        price = latestTrade[0].price.toString();
      }

      const response: TickerPriceResponse = {
        symbol: symbol,
        price: price,
      };

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch price data: ${error}`);
    }
  }

  static async getTicker24Hr({ symbol }: Ticker24HrParams) {
    try {
      const queriedPools = await ponderDb.select().from(pools).where(eq(pools.coin, symbol));

      if (!queriedPools || queriedPools.length === 0) {
        throw new Error("Pool not found");
      }

      const poolId = queriedPools[0]!.orderBook;

      if (!poolId) {
        throw new Error("Pool order book address not found");
      }

      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 86400;

      // Execute all queries in parallel for better performance
      const [dailyStats, latestTrade, bestBids, bestAsks] = await Promise.all([
        db
          .select()
          .from(dailyBuckets)
          .where(and(eq(dailyBuckets.poolId, poolId), gte(dailyBuckets.openTime, oneDayAgo)))
          .orderBy(desc(dailyBuckets.openTime))
          .limit(1),
        
        db
          .select()
          .from(orderBookTrades)
          .where(eq(orderBookTrades.poolId, poolId))
          .orderBy(desc(orderBookTrades.timestamp))
          .limit(1),
        
        db
          .select()
          .from(orderBookDepth)
          .where(and(eq(orderBookDepth.poolId, poolId), eq(orderBookDepth.side, "Buy")))
          .orderBy(desc(orderBookDepth.price))
          .limit(1),
        
        db
          .select()
          .from(orderBookDepth)
          .where(and(eq(orderBookDepth.poolId, poolId), eq(orderBookDepth.side, "Sell")))
          .orderBy(asc(orderBookDepth.price))
          .limit(1)
      ]);

      const stats = (dailyStats[0] || {}) as unknown as DailyStats;
      const lastPrice = latestTrade[0]?.price?.toString() || "0";

      const openPrice = stats.open?.toString() ?? "0";
      const highPrice = stats.high?.toString() ?? "0";
      const lowPrice = stats.low?.toString() ?? "0";
      const volumeValue = stats.volume?.toString() ?? "0";
      const quoteVolumeValue = stats.quoteVolume?.toString() ?? "0";
      const openTimeValue = stats.openTime ? stats.openTime * 1000 : oneDayAgo * 1000;
      const countValue = stats.count ?? 0;
      const averageValue = stats.average?.toString() ?? "0";

      const prevClosePrice = openPrice || lastPrice;

      const priceChange = (parseFloat(lastPrice) - parseFloat(prevClosePrice)).toString();
      const priceChangePercent =
        parseFloat(prevClosePrice) > 0
          ? (((parseFloat(lastPrice) - parseFloat(prevClosePrice)) / parseFloat(prevClosePrice)) * 100).toFixed(2)
          : "0.00";

      const response: Ticker24HrResponse = {
        symbol: symbol,
        priceChange: priceChange,
        priceChangePercent: priceChangePercent,
        weightedAvgPrice: averageValue,
        prevClosePrice: prevClosePrice,
        lastPrice: lastPrice,
        lastQty: latestTrade[0]?.quantity?.toString() || "0",
        bidPrice: bestBids[0]?.price?.toString() || "0",
        askPrice: bestAsks[0]?.price?.toString() || "0",
        openPrice: openPrice,
        highPrice: highPrice,
        lowPrice: lowPrice,
        volume: volumeValue,
        quoteVolume: quoteVolumeValue,
        openTime: openTimeValue,
        closeTime: now * 1000,
        firstId: "0",
        lastId: latestTrade[0]?.id || "0",
        count: countValue,
      };

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch 24hr ticker data: ${error}`);
    }
  }
}