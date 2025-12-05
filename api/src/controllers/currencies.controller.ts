import { and, asc, eq } from 'drizzle-orm';
import { ponderDb } from '../config/database';
import { currencies } from '../schema/ponder-currencies';

export const getAllCurrencies = async ({ query }: { query: any }) => {
  try {
    const chainId = query.chainId ? parseInt(query.chainId) : undefined;
    const limit = parseInt(query.limit) || 100;
    const offset = parseInt(query.offset) || 0;
    const tokenType = query.tokenType; // 'underlying', 'synthetic', or undefined for all
    const onlyActual = query.onlyActual === 'true'; // filter for actual (underlying) tokens only

    const conditions = [];
    if (chainId) {
      conditions.push(eq(currencies.chainId, chainId));
    }

    // Filter by token type
    if (tokenType) {
      conditions.push(eq(currencies.tokenType, tokenType));
    }

    // Filter for actual tokens only (exclude synthetic)
    if (onlyActual) {
      conditions.push(eq(currencies.tokenType, 'underlying'));
    }

    const allCurrencies = await ponderDb.select({
      id: currencies.id,
      address: currencies.address,
      symbol: currencies.symbol,
      name: currencies.name,
      decimals: currencies.decimals,
      chainId: currencies.chainId,
      tokenType: currencies.tokenType,
      sourceChainId: currencies.sourceChainId,
      underlyingTokenAddress: currencies.underlyingTokenAddress,
      isActive: currencies.isActive,
      registeredAt: currencies.registeredAt,
    }).from(currencies)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(currencies.symbol))
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count with same conditions
    const countQuery = ponderDb.select({ count: currencies.id }).from(currencies);
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    const countResult = await countQuery.execute();

    return {
      success: true,
      message: 'Currencies retrieved successfully',
      data: {
        items: allCurrencies,
        total: countResult.length,
        limit,
        offset,
        filters: {
          chainId,
          tokenType,
          onlyActual
        }
      }
    };
  } catch (error) {
    console.error('Error fetching currencies:', error);
    return {
      success: false,
      message: 'Failed to fetch currencies',
      data: null
    };
  }
};

export const getCurrencyByAddress = async ({ params }: { params: any }) => {
  try {
    const { address } = params;

    const currency = await ponderDb
      .select({
        id: currencies.id,
        address: currencies.address,
        symbol: currencies.symbol,
        name: currencies.name,
        decimals: currencies.decimals,
        chainId: currencies.chainId,
        tokenType: currencies.tokenType,
        sourceChainId: currencies.sourceChainId,
        underlyingTokenAddress: currencies.underlyingTokenAddress,
        isActive: currencies.isActive,
        registeredAt: currencies.registeredAt,
      })
      .from(currencies)
      .where(eq(currencies.address, address))
      .limit(1)
      .execute();

    if (currency.length === 0) {
      return {
        success: false,
        message: 'Currency not found',
        data: null
      };
    }

    return {
      success: true,
      message: 'Currency retrieved successfully',
      data: currency[0]
    };
  } catch (error) {
    console.error('Error fetching currency:', error);
    return {
      success: false,
      message: 'Failed to fetch currency',
      data: null
    };
  }
};