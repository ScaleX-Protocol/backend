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

  static async getWalletDetail(ctx: Context) {
    try {
      const { address } = ctx.params;
      const limit = ctx.query.limit ? Number(ctx.query.limit) : 100;
      const side = ctx.query.side as string | undefined;
      const type = ctx.query.type as string | undefined;
      const status = ctx.query.status as string | undefined;
      const walletDetail = await WalletService.getWalletDetail(address, limit, side, type, status);
      return createSuccessResponse(walletDetail);
    } catch (error) {
      console.error('Error in getWalletDetail:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve wallet detail';
      return createErrorResponse(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
