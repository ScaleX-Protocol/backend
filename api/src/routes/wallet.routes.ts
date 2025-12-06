import { Elysia } from 'elysia';
import { WalletController } from '../controllers';
import { WalletValidation } from '../validations/wallet.validation';

export const walletRoutes = new Elysia({ prefix: '/wallets' })
  .get('/', WalletController.getWallets, {
    query: WalletValidation.query.indicesQuery
  });
