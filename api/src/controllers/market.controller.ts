import { Context } from 'elysia';
import { MarketService } from '../services/market.service';

export class MarketController {
    static async getKline(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;
            const interval = ctx.query.interval || "1m";
            const startTime = parseInt(ctx.query.startTime || "0");
            const endTime = parseInt(ctx.query.endTime || Date.now().toString());
            const limit = parseInt(ctx.query.limit || "1000");

            if (!symbol) {
                return { error: "Symbol parameter is required" };
            }

            const decodedSymbol = decodeURIComponent(symbol);
            const response = await MarketService.getKlineData({
                symbol: decodedSymbol,
                interval,
                startTime,
                endTime,
                limit
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch kline data: ${error}` };
        }
    }

    static async getDepth(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;
            const limit = parseInt(ctx.query.limit || "100");
            
            if (!symbol) {
                return { error: "Symbol parameter is required" };
            }

            const decodedSymbol = decodeURIComponent(symbol);
            const response = await MarketService.getDepth({
                symbol: decodedSymbol,
                limit
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch depth data: ${error}` };
        }
    }

    static async getTrades(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;
            const limit = parseInt(ctx.query.limit || "500");
            const user = ctx.query.user;
            const orderBy = ctx.query.orderBy || "desc";

            if (!symbol) {
                return { error: "Symbol parameter is required" };
            }

            const decodedSymbol = decodeURIComponent(symbol);
            const response = await MarketService.getTrades({
                symbol: decodedSymbol,
                limit,
                user: user as string,
                orderBy: orderBy as "asc" | "desc"
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch trades data: ${error}` };
        }
    }

    static async getAllOrders(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;
            const limit = parseInt(ctx.query.limit || "500");
            const address = ctx.query.address;

            if (!address) {
                return { error: "Address parameter is required" };
            }

            const response = await MarketService.getAllOrders({
                symbol: symbol as string,
                limit,
                address: address as string
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch orders: ${error}` };
        }
    }

    static async getAccount(ctx: Context) {
        try {
            const address = ctx.query.address;

            if (!address) {
                return { error: "Address parameter is required" };
            }

            const response = await MarketService.getAccount({
                address: address as string
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch account information: ${error}` };
        }
    }

    static async getPairs(ctx: Context) {
        try {
            const response = await MarketService.getPairs();
            return response;
        } catch (error) {
            return { error: `Failed to fetch pairs data: ${error}` };
        }
    }

    static async getMarkets(ctx: Context) {
        try {
            const response = await MarketService.getMarkets();
            return response;
        } catch (error) {
            return { error: `Failed to fetch pairs data: ${error}` };
        }
    }

    static async getTicker24Hr(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;

            if (!symbol) {
                return { error: "Symbol parameter is required" };
            }

            const decodedSymbol = decodeURIComponent(symbol);
            const response = await MarketService.getTicker24Hr({
                symbol: decodedSymbol
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch 24hr ticker data: ${error}` };
        }
    }

    static async getAllTickers24Hr(ctx: Context) {
        try {
            const response = await MarketService.getAllTickers24Hr();
            return response;
        } catch (error) {
            return { error: `Failed to fetch all 24hr ticker data: ${error}` };
        }
    }

    static async getTickerPrice(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;

            if (!symbol) {
                return { error: "Symbol parameter is required" };
            }

            const decodedSymbol = decodeURIComponent(symbol);
            const response = await MarketService.getTickerPrice({
                symbol: decodedSymbol
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch price data: ${error}` };
        }
    }

    static async getOpenOrders(ctx: Context) {
        try {
            const symbol = ctx.query.symbol;
            const address = ctx.query.address;

            if (!address) {
                return { error: "Address parameter is required" };
            }

            const response = await MarketService.getOpenOrders({
                symbol: symbol as string,
                address: address as string
            });
            return response;
        } catch (error) {
            return { error: `Failed to fetch open orders: ${error}` };
        }
    }
}