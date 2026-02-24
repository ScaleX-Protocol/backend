import { Elysia, t } from 'elysia';
import { MarketController } from '../controllers/market.controller';

export const marketRoutes = new Elysia({ prefix: '/api' })
    .get('/kline', MarketController.getKline, {
        query: t.Object({
            symbol: t.String(),
            interval: t.Optional(t.String()),
            startTime: t.Optional(t.String()),
            endTime: t.Optional(t.String()),
            limit: t.Optional(t.String())
        })
    })
    .get('/depth', MarketController.getDepth, {
        query: t.Object({
            symbol: t.String(),
            limit: t.Optional(t.String())
        })
    })
    .get('/trades', MarketController.getTrades, {
        query: t.Object({
            symbol: t.String(),
            limit: t.Optional(t.String()),
            user: t.Optional(t.String()),
            orderBy: t.Optional(t.String())
        })
    })
    .get('/ticker/24hr/all', MarketController.getAllTickers24Hr)
    .get('/ticker/24hr', MarketController.getTicker24Hr, {
        query: t.Object({
            symbol: t.String()
        })
    })
    .get('/ticker/price', MarketController.getTickerPrice, {
        query: t.Object({
            symbol: t.String()
        })
    })
    .get('/allOrders', MarketController.getAllOrders, {
        query: t.Object({
            symbol: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            address: t.String()
        })
    })
    .get('/openOrders', MarketController.getOpenOrders, {
        query: t.Object({
            symbol: t.Optional(t.String()),
            address: t.String()
        })
    })
    .get('/account', MarketController.getAccount, {
        query: t.Object({
            address: t.String()
        })
    })
    .get('/pairs', MarketController.getPairs)
    .get('/markets', MarketController.getMarkets);