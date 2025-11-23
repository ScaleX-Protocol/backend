import { Context } from 'elysia';
import { marketService } from '../services';
import { createSuccessResponse, createErrorResponse } from '../utils';
import { HttpStatus } from '../enums';

export class MarketController {
  static async getOpenOrders({ query, set }: Context) {
    try {
      const { symbol, address } = query as { symbol: string; address: string };

      if (!symbol || !address) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol and address are required' };
      }

      const orders = await marketService.getOpenOrders(symbol, address);
      return orders;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getAllOrders({ query, set }: Context) {
    try {
      const { symbol, address, limit } = query as {
        symbol?: string;
        address: string;
        limit?: string;
      };

      if (!address) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Address is required' };
      }

      if (!symbol) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol is required' };
      }

      const limitNum = limit ? parseInt(limit) : 50;
      const orders = await marketService.getAllOrders(symbol, address, limitNum);
      return orders;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTrades({ query, set }: Context) {
    try {
      const { symbol, limit, user } = query as {
        symbol: string;
        limit?: string;
        user?: string;
      };

      if (!symbol) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol is required' };
      }

      const limitNum = limit ? parseInt(limit) : 100;
      const trades = await marketService.getTrades(symbol, limitNum, user);
      return trades;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getDepth({ query, set }: Context) {
    try {
      const { symbol, limit } = query as { symbol: string; limit?: string };

      if (!symbol) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol is required' };
      }

      const limitNum = limit ? parseInt(limit) : 20;
      const depth = await marketService.getDepth(symbol, limitNum);
      return depth;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getPairs({ set }: Context) {
    try {
      const pairs = await marketService.getPairs();
      return pairs;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getMarkets({ set }: Context) {
    try {
      const pairs = await marketService.getPairs();
      
      // Enhance the markets data with liquidity calculations
      const marketsWithLiquidity = pairs.map(pair => {
        // Use the baseCurrency and quoteCurrency from the pool data
        const baseAsset = pair.baseCurrency || 'UNKNOWN';
        const quoteAsset = pair.quoteCurrency || 'USDT';
        const symbol = `${baseAsset}/${quoteAsset}`;
        
        // Mock liquidity calculations - should be implemented with actual order book depth queries
        const mockBidLiquidity = '1500000'; // 1.5M in base asset
        const mockAskLiquidity = '1200000'; // 1.2M in base asset
        const mockTotalLiquidityInQuote = '4500000000'; // 4.5B in quote asset (USDT equivalent)
        
        // Calculate market age in seconds (mock)
        const currentTime = Math.floor(Date.now() / 1000);
        const marketAge = pair.timestamp ? currentTime - pair.timestamp : 0;

        return {
          symbol: symbol,
          baseAsset: baseAsset,
          quoteAsset: quoteAsset,
          poolId: pair.poolId,
          baseDecimals: pair.baseDecimals || 18,
          quoteDecimals: pair.quoteDecimals || 6,
          volume: pair.volume24h || '0',
          volumeInQuote: pair.volumeInQuote?.toString() || '0',
          latestPrice: pair.price || '0',
          age: marketAge,
          bidLiquidity: mockBidLiquidity,
          askLiquidity: mockAskLiquidity,
          totalLiquidityInQuote: mockTotalLiquidityInQuote,
          createdAt: pair.timestamp
        };
      });

      return marketsWithLiquidity;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTickerPrice({ query, set }: Context) {
    try {
      const { symbol } = query as { symbol: string };

      if (!symbol) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol is required' };
      }

      let ticker = await marketService.getTickerPrice(symbol);
      if(!ticker) ticker = { price: '0' };

      return ticker;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTicker24Hr({ query, set }: Context) {
    try {
      const { symbol } = query as { symbol: string };

      if (!symbol) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol is required' };
      }

      const ticker = await marketService.getTicker24Hr(symbol);
      return ticker;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getKlines({ query, set }: Context) {
    try {
      const { symbol, interval, limit, startTime, endTime } = query as {
        symbol: string;
        interval: string;
        limit?: string;
        startTime?: number;
        endTime?: number;
      };

      if (!symbol || !interval) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Symbol and interval are required' };
      }

      const limitNum = limit ? parseInt(limit) : 500;
      const klines = await marketService.getKlines(symbol, interval, limitNum, startTime, endTime);
      return klines;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getAccount({ query, set }: Context) {
    try {
      const { address } = query as { address: string };

      if (!address) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Address is required' };
      }

      const balances = await marketService.getBalances(address);
      return {
        address,
        balances,
      };
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
