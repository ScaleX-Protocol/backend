import { Context } from 'elysia';
import { TradeService } from '../services';
import { HttpStatus } from '../enums';

export class TradeController {
    static async getInitData(ctx: Context) {
        try {
            const { symbol } = ctx.params;
            const decodedSymbol = decodeURIComponent(symbol);
            const address = String(ctx.query.address || '').toLowerCase() as `0x${string}`;
            const response = await TradeService.getInitData(decodedSymbol, address);
            return response;
        } catch (error) {
            console.error('Error in getInitData:', error);
            ctx.set.status = HttpStatus.INTERNAL_SERVER_ERROR;
            return { error: 'Failed to retrieve trades init data' };
        }
    }

    static async getOpenOrders(ctx: Context) {
        try {
            const { symbol } = ctx.params;
            const decodedSymbol = decodeURIComponent(symbol);
            const address = String(ctx.query.address || '').toLowerCase() as `0x${string}`;
            const response = await TradeService.getOpenOrders({ symbol: decodedSymbol, address });
            return response;
        } catch (error) {
            console.error('Error in getOpenOrders:', error);
            ctx.set.status = HttpStatus.INTERNAL_SERVER_ERROR;
            return { error: 'Failed to retrieve open orders' };
        }
    }

    static async getTickerPrice(ctx: Context) {
        try {
            const { symbol } = ctx.params;
            const decodedSymbol = decodeURIComponent(symbol);
            const response = await TradeService.getTickerPrice({ symbol: decodedSymbol });
            return response;
        } catch (error) {
            console.error('Error in getTickerPrice:', error);
            ctx.set.status = HttpStatus.INTERNAL_SERVER_ERROR;
            return { error: 'Failed to retrieve ticker price' };
        }
    }

    static async getTicker24Hr(ctx: Context) {
        try {
            const { symbol } = ctx.params;
            const decodedSymbol = decodeURIComponent(symbol);
            const response = await TradeService.getTicker24Hr({ symbol: decodedSymbol });
            return response;
        } catch (error) {
            console.error('Error in getTicker24Hr:', error);
            ctx.set.status = HttpStatus.INTERNAL_SERVER_ERROR;
            return { error: 'Failed to retrieve ticker 24hr' };
        }
    }

    static async getDepth(ctx: Context) {
        try {
            const { symbol } = ctx.params;
            const decodedSymbol = decodeURIComponent(symbol);
            const limit = parseInt(ctx.query.limit || '100');
            const response = await TradeService.getDepth({ symbol: decodedSymbol, limit });
            return response;
        } catch (error) {
            console.error('Error in getDepth:', error);
            ctx.set.status = HttpStatus.INTERNAL_SERVER_ERROR;
            return { error: 'Failed to retrieve depth data' };
        }
    }

    static async getTradeHistory(ctx: Context) {
        try {
            const { symbol } = ctx.params;
            const decodedSymbol = decodeURIComponent(symbol);
            const limit = parseInt(ctx.query.limit || '500');
            const user = ctx.query.user;
            const response = await TradeService.getTradeHistory({ symbol: decodedSymbol, limit, user });
            return response;
        } catch (error) {
            console.error('Error in getTradeHistory:', error);
            ctx.set.status = HttpStatus.INTERNAL_SERVER_ERROR;
            return { error: 'Failed to retrieve trade history' };
        }
    }
}