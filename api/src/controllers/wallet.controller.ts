import { Context } from 'elysia';
import { WalletService } from '../services/wallet.service';
import { createErrorResponse, createSuccessResponse } from '../utils/response.utils';
import { HttpStatus } from '../enums';

export class WalletController {
  static async getWallets(ctx: Context) {
    try {
      const indices = ctx.query.indices as string | undefined;
      const wallets = await WalletService.getWallets(indices);
      return createSuccessResponse({ wallets });
    } catch (error) {
      console.error('Error in getWallets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve wallets';
      return createErrorResponse(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
