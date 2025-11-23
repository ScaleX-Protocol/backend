import { Context } from 'elysia';
import { currencyService } from '../services';
import { createSuccessResponse, createErrorResponse } from '../utils';
import { HttpStatus } from '../enums';

export class CurrencyController {
  static async getAllCurrencies({ query, set }: Context) {
    try {
      const chainId = query.chainId ? parseInt(query.chainId as string) : undefined;
      const limit = Math.min(parseInt(query.limit as string) || 100, 1000); // Cap at 1000
      const offset = Math.max(parseInt(query.offset as string) || 0, 0); // Ensure non-negative
      const tokenType = query.tokenType as 'underlying' | 'synthetic' | undefined;
      const onlyActual = query.onlyActual === 'true'; // filter for actual (underlying) tokens only

      const result = await currencyService.getAllCurrencies({
        chainId,
        limit,
        offset,
        tokenType,
        onlyActual
      });

      if (!result.success) {
        set.status = HttpStatus.INTERNAL_SERVER_ERROR;
        return { error: result.message };
      }

      return result.data;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getCurrencyByQuery({ query, set }: Context) {
    try {
      const { address } = query as { address: string };

      if (!address) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Address is required' };
      }

      const result = await currencyService.getCurrencyByAddress(address);

      if (!result.success) {
        set.status = HttpStatus.NOT_FOUND;
        return { error: result.message };
      }

      return result.data;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getCurrencyByParam({ params, set }: Context) {
    try {
      const { address } = params as { address: string };

      if (!address) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'Address is required' };
      }

      const result = await currencyService.getCurrencyByAddress(address);

      if (!result.success) {
        set.status = HttpStatus.NOT_FOUND;
        return { error: result.message };
      }

      return result.data;
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
