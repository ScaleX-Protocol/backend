import { createClient } from 'redis';
import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_CACHE_TTL = parseInt(process.env.REDIS_CACHE_TTL || '2147483647'); 

// Single Redis clients for all chains (using key prefixes for isolation)
let redisClient: ReturnType<typeof createClient> | null = null;
let ioredisClient: Redis | null = null;

// Create chain-specific key with chain ID prefix
export const createChainKey = (chainId: number, key: string): string => {
  return `chain:${chainId}:${key}`;
};

export const initRedisClient = async () => {
  try {
    if (!redisClient) {
      redisClient = createClient({
        url: REDIS_URL
      });
      
      redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });
      
      await redisClient.connect();
      console.log('Redis client connected');
    }
    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    return null;
  }
};

// Chain-specific cache functions (using key prefixes with single connection)
export const getChainCachedData = async <T>(key: string, chainId: number, blockNumber: number, callerFunction: string): Promise<T | null> => {
  try {
    const client = await initRedisClient();
    if (!client) {
      return null;
    }
    
    const chainKey = createChainKey(chainId, key);
    const data = await client.get(chainKey);
    const result = data ? JSON.parse(data.toString(), jsonReviver) as T : null;
    
    return result;
  } catch (error) {
    console.error(`Error getting cached data for key ${key} on chain ${chainId}:`, error);
    return null;
  }
};

export const setChainCachedData = async <T>(key: string, data: T, chainId: number, ttl: number = REDIS_CACHE_TTL, blockNumber: number, callerFunction: string): Promise<void> => {
  try {
    const client = await initRedisClient();
    if (!client) {
      return;
    }
    
    const chainKey = createChainKey(chainId, key);
    const serializedData = JSON.stringify(data, jsonReplacer);
    
    await client.set(chainKey, serializedData, { EX: ttl });
  } catch (error) {
    console.error(`Error setting cached data for key ${key} on chain ${chainId}:`, error);
  }
};

export const getCachedData = async <T>(key: string, blockNumber: number, callerFunction: string): Promise<T | null> => {
  try {
    const client = await initRedisClient();
    if (!client) {
      return null;
    }
    
    const data = await client.get(key);
    const result = data ? JSON.parse(data.toString(), jsonReviver) as T : null;
    
    return result;
  } catch (error) {
    console.error(`Error getting cached data for key ${key}:`, error);
    return null;
  }
};

const jsonReplacer = (_key: string, value: any) => {
  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() };
  }
  return value;
};

const jsonReviver = (_key: string, value: any) => {
  if (value && value.__type === 'bigint' && typeof value.value === 'string') {
    return BigInt(value.value);
  }
  return value;
};

export const setCachedData = async <T>(key: string, data: T, ttl: number = REDIS_CACHE_TTL, blockNumber: number, callerFunction: string): Promise<void> => {
  try {
    const client = await initRedisClient();
    if (!client) {
      return;
    }
    
    const serializedData = JSON.stringify(data, jsonReplacer);
    
    await client.set(key, serializedData, { EX: ttl });
  } catch (error) {
    console.error(`Error setting cached data for key ${key}:`, error);
  }
};

export const createPoolCacheKey = (orderBook: string, chainId: number): string => {
  return `pool:${orderBook.toLowerCase()}`;
};


export const initIORedisClient = async (): Promise<Redis | null> => {
  try {
    if (!ioredisClient) {
      ioredisClient = new Redis(REDIS_URL);
      
      ioredisClient.on('error', (err) => {
        console.error('IORedis Client Error:', err);
      });
      
      ioredisClient.on('connect', () => {
        console.log('IORedis client connected');
      });
      
      // Test connection
      await ioredisClient.ping();
    }
    return ioredisClient;
  } catch (error) {
    console.error('Failed to initialize IORedis client:', error);
    return null;
  }
};

export const getIORedisClient = (): Redis | null => {
  return ioredisClient;
};

// Chain-specific IORedis operations (using key prefixes with single connection)
export const getChainIORedisClient = async (chainId: number): Promise<Redis | null> => {
  return await initIORedisClient();
};

// Helper to create chain-specific keys for IORedis operations
export const createIORedisChainKey = (chainId: number, streamName: string): string => {
  return `chain:${chainId}:${streamName}`;
};
