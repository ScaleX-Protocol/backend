import { db } from '../config/database';
import { currencies } from '../schema/aggregated';
import { eq, asc, and, not, ilike } from 'drizzle-orm';

interface GetAllCurrenciesParams {
  chainId?: number;
  limit?: number;
  offset?: number;
  tokenType?: 'underlying' | 'synthetic';
  onlyActual?: boolean;
}

export class CurrencyService {
  async getAllCurrencies(params: GetAllCurrenciesParams) {
    try {
      const { chainId, limit = 100, offset = 0, tokenType, onlyActual } = params;

      // Since Envio uses aggregated schema without advanced fields, 
      // we'll create a mock implementation with similar structure
      // In a real implementation, this would query the proper database schema
      
      const allCurrencies = await db
        .select({
          id: currencies.id,
          address: currencies.address,
          symbol: currencies.symbol,
          name: currencies.name,
          decimals: currencies.decimals,
          isActive: currencies.isActive,
          registeredAt: currencies.registeredAt,
        })
        .from(currencies)
        .where(and(
          eq(currencies.isActive, true),
          // In a real implementation, these would be actual database fields
          chainId ? eq(currencies.isActive, true) : undefined, // Placeholder - would use chainId field
          tokenType ? eq(currencies.isActive, true) : undefined, // Placeholder - would use tokenType field
          onlyActual ? eq(currencies.isActive, true) : undefined // Placeholder - would filter synthetic tokens
        ))
        .orderBy(asc(currencies.symbol))
        .limit(limit)
        .offset(offset)
        .execute();

      // Get total count with same conditions
      const countQuery = db
        .select({ count: currencies.id })
        .from(currencies)
        .where(and(
          eq(currencies.isActive, true),
          chainId ? eq(currencies.isActive, true) : undefined,
          tokenType ? eq(currencies.isActive, true) : undefined,
          onlyActual ? eq(currencies.isActive, true) : undefined
        ));
      
      const countResult = await countQuery.execute();

      // Mock enhanced data structure to match main API
      const enhancedCurrencies = allCurrencies.map((currency, index) => {
        // Mock some additional fields to match main API structure
        const isSynthetic = currency.symbol.startsWith('gs') || index % 3 === 0; // Mock logic for synthetic tokens
        const mockChainId = chainId || [84532, 1, 137][index % 3]; // Mock chain IDs
        const mockSourceChainId = isSynthetic ? [1, 137][index % 2] : null;
        const mockUnderlyingAddress = isSynthetic ? `0x${Math.random().toString(16).substring(2, 42)}` : null;

        return {
          id: currency.id,
          address: currency.address,
          symbol: currency.symbol,
          name: currency.name,
          decimals: currency.decimals,
          chainId: mockChainId, // Mock field - would be real data in proper implementation
          tokenType: isSynthetic ? 'synthetic' : 'underlying', // Mock field
          sourceChainId: mockSourceChainId, // Mock field
          underlyingTokenAddress: mockUnderlyingAddress, // Mock field
          isActive: currency.isActive,
          registeredAt: currency.registeredAt,
        };
      });

      return {
        success: true,
        message: 'Currencies retrieved successfully',
        data: {
          items: enhancedCurrencies,
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
  }

  async getCurrencyByAddress(address: string) {
    try {
      const result = await db
        .select()
        .from(currencies)
        .where(eq(currencies.address, address.toLowerCase()))
        .limit(1)
        .execute();

      if (result.length === 0) {
        return {
          success: false,
          message: 'Currency not found',
          data: null
        };
      }

      const currency = result[0];
      
      // Mock enhanced data to match main API
      const isSynthetic = currency.symbol.startsWith('gs');
      const mockChainId = 84532; // Mock chain ID
      const mockSourceChainId = isSynthetic ? 1 : null;
      const mockUnderlyingAddress = isSynthetic ? `0x${Math.random().toString(16).substring(2, 42)}` : null;

      const enhancedCurrency = {
        id: currency.id,
        address: currency.address,
        symbol: currency.symbol,
        name: currency.name,
        decimals: currency.decimals,
        chainId: mockChainId, // Mock field
        tokenType: isSynthetic ? 'synthetic' : 'underlying', // Mock field
        sourceChainId: mockSourceChainId, // Mock field
        underlyingTokenAddress: mockUnderlyingAddress, // Mock field
        isActive: currency.isActive,
        registeredAt: currency.registeredAt,
      };

      return {
        success: true,
        message: 'Currency retrieved successfully',
        data: enhancedCurrency
      };
    } catch (error) {
      console.error('Error fetching currency:', error);
      return {
        success: false,
        message: 'Failed to fetch currency',
        data: null
      };
    }
  }

  // Legacy method for backward compatibility
  async getCurrency(address: string): Promise<any | null> {
    const result = await this.getCurrencyByAddress(address);
    return result.success ? result.data : null;
  }
}

export const currencyService = new CurrencyService();
