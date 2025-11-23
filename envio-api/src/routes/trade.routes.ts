import { Elysia } from 'elysia';
import { TradeController } from '../controllers';

export const tradeRoutes = new Elysia({ prefix: '/api/trades' })
    .get('/:symbol', TradeController.getInitData)
    .get('/:symbol/orders', TradeController.getOpenOrders)
    .get('/:symbol/price', TradeController.getTickerPrice)
    .get('/:symbol/ticker', TradeController.getTicker24Hr)
    .get('/:symbol/depth', TradeController.getDepth)
    .get('/:symbol/history', TradeController.getTradeHistory);