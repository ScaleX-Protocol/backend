import { eq } from "ponder";
import { pools } from "../../ponder.schema";
import { createPoolCacheKey, getChainCachedData, setChainCachedData } from "./redis";
import { validatePoolId } from "./validation";
import * as fs from "node:fs";
import * as path from "node:path";

type PoolData = {
  id: string;
  chainId: number;
  coin: string;
  orderBook: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseDecimals: number;
  quoteDecimals: number;
  volume: bigint;
  volumeInQuote: bigint;
  price: bigint;
  timestamp: number;
};

let STATIC_POOL_DATA: any = null;

const loadStaticPoolData = () => {
  if (STATIC_POOL_DATA === null) {
    try {
      const poolDataPath = path.join(process.cwd(), 'pool-data.json');
      if (fs.existsSync(poolDataPath)) {
        const fileContent = fs.readFileSync(poolDataPath, 'utf8');
        STATIC_POOL_DATA = JSON.parse(fileContent);
      } else {
        STATIC_POOL_DATA = { data: { poolss: { items: [] } } };
      }
    } catch (error) {
      console.error('Error loading pool data from file:', error);
      STATIC_POOL_DATA = { data: { poolss: { items: [] } } };
    }
  }
  return STATIC_POOL_DATA;
};

// Check if static data mode is enabled
const USE_STATIC_DATA = process.env.USE_STATIC_POOL_DATA === 'true';

/**
 * Get pool data from static configuration
 */
const getStaticPoolData = (orderBook: string, chainId: number): PoolData | null => {
  const poolData = loadStaticPoolData();
  const pool = poolData.data.poolss.items.find(
    (item: any) => item.orderBook.toLowerCase() === orderBook.toLowerCase() && item.chainId === chainId
  );

  if (!pool) {
    return null;
  }

  return {
    id: pool.id,
    chainId: pool.chainId,
    coin: pool.coin,
    orderBook: pool.orderBook,
    baseCurrency: pool.baseCurrency.address,
    quoteCurrency: pool.quoteCurrency.address,
    baseDecimals: pool.baseDecimals,
    quoteDecimals: pool.quoteDecimals,
    volume: BigInt(pool.volume),
    volumeInQuote: BigInt(pool.volumeInQuote),
    price: BigInt(pool.price),
    timestamp: pool.timestamp,
  };
};

export const getPoolTradingPair = async (context: any, pool: `0x${string}`, chainId: number, callerFunction: string, blockNumber?: number) => {

  try {
    const validatedPoolId = validatePoolId(pool);

    // If static data mode is enabled, use static pool data
    if (USE_STATIC_DATA) {

      const staticPoolData = getStaticPoolData(validatedPoolId, chainId);

      if (staticPoolData && staticPoolData.coin) {
        const result = staticPoolData.coin.replace('/', '').toLowerCase();
        return result;
      } else {
        throw new Error(`Static pool data not found for pool ${pool} on chain ${chainId}`);
      }
    }

    const cacheKey = createPoolCacheKey(validatedPoolId, chainId);

    const cachedPoolData = await getChainCachedData<PoolData>(cacheKey, chainId, blockNumber || 0, callerFunction);

    if (cachedPoolData && cachedPoolData.coin) {
      const result = cachedPoolData.coin.replace('/', '').toLowerCase();
      return result;
    }


    let poolData;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {

        // Add a small delay on retries to let reorg complete
        if (retryCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        }

        poolData = await context.db.find(pools, {
          orderBook: validatedPoolId,
          chainId: chainId
        });

        break;

      } catch (error) {
        retryCount++;

        if (retryCount >= maxRetries) {
          throw error;
        }
      }
    }


    if (!poolData) {

      let poolRows;
      let sqlRetryCount = 0;
      const sqlMaxRetries = 3;

      while (sqlRetryCount < sqlMaxRetries) {
        try {

          // Add a small delay on retries
          if (sqlRetryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * sqlRetryCount));
          }

          poolRows = await context.db.sql.select().from(pools).where(
            eq(pools.orderBook, validatedPoolId),
            eq(pools.chainId, chainId)
          ).limit(1).execute();

          break;

        } catch (error) {
          sqlRetryCount++;

          if (sqlRetryCount >= sqlMaxRetries) {
            throw error;
          }
        }
      }


      if (poolRows.length > 0) {
        poolData = poolRows[0];
      }
    }


    await setChainCachedData(cacheKey, poolData, chainId, parseInt(process.env.REDIS_CACHE_TTL || '2147483647'), blockNumber || 0, callerFunction);

    if (!poolData || !poolData.coin) {
      throw new Error(`Pool data not found for pool ${pool} on chain ${chainId}`);
    }

    const result = poolData.coin.replace('/', '').toLowerCase();

    return result;
  } catch (error) {
    throw error;
  }
};