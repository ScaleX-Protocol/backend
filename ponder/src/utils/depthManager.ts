import { and, eq, or } from "ponder";
import { orderBookDepth, orders } from "../../ponder.schema";
import { validatePoolId } from "./validation";

export class DepthManager {
    private static createDepthId(poolId: string, chainId: number, side: string, price: string): string {
        return `${poolId}:${chainId}:${side}:${price}`;
    }

    static async getCurrentDepth(context: any, poolId: `0x${string}`, chainId: number) {
        try {
            const validatedPoolId = validatePoolId(poolId);
            const depthData = await context.db.sql
                .select()
                .from(orderBookDepth)
                .where(
                    and(
                        eq(orderBookDepth.poolId, validatedPoolId),
                        eq(orderBookDepth.chainId, chainId)
                    )
                )
                .execute();

            const bids = depthData
                .filter((d: any) => d.side === "Buy")
                .sort((a: any, b: any) => Number(b.price - a.price))
                .slice(0, 50)
                .map((d: any) => [d.price.toString(), d.quantity.toString()]);

            const asks = depthData
                .filter((d: any) => d.side === "Sell")
                .sort((a: any, b: any) => Number(a.price - b.price))
                .slice(0, 50)
                .map((d: any) => [d.price.toString(), d.quantity.toString()]);

            return { bids, asks };
        } catch (error) {
            console.log(`Error getting current depth: ${error}`);
            return { bids: [], asks: [] };
        }
    }

    static async updateOrderBookDepth(context: any, poolId: `0x${string}`, chainId: number, timestamp: number) {
        try {
            const validatedPoolId = validatePoolId(poolId);

            const activeOrders = await context.db.sql
                .select()
                .from(orders)
                .where(
                    and(
                        eq(orders.poolId, validatedPoolId),
                        eq(orders.chainId, chainId),
                        or(
                            eq(orders.status, "NEW"),
                            eq(orders.status, "PARTIALLY_FILLED"),
                            eq(orders.status, "OPEN")
                        )
                    )
                )
                .execute();

            const ordersByPriceAndSide = new Map();

            for (const order of activeOrders) {
                const key = `${order.side}:${order.price.toString()}`;
                if (!ordersByPriceAndSide.has(key)) {
                    ordersByPriceAndSide.set(key, {
                        side: order.side,
                        price: order.price,
                        orders: []
                    });
                }
                ordersByPriceAndSide.get(key).orders.push(order);
            }

            for (const [key, data] of ordersByPriceAndSide.entries()) {
                const { side, price, orders: ordersAtLevel } = data;
                const normalizedSide = side === "Buy" ? "Buy" : "Sell";

                let totalQuantity = BigInt(0);
                for (const order of ordersAtLevel) {
                    const remainingQuantity = BigInt(order.quantity) - BigInt(order.filled);
                    if (remainingQuantity > 0) {
                        totalQuantity += remainingQuantity;
                    }
                }

                const orderCount = ordersAtLevel.length;

                const depthId = this.createDepthId(validatedPoolId, chainId, normalizedSide, price.toString());

                const existingRecord = await context.db.find(orderBookDepth, {
                    id: depthId
                });

                if (existingRecord) {
                    await context.db.update(orderBookDepth, { id: depthId })
                        .set({
                            quantity: totalQuantity,
                            orderCount,
                            lastUpdated: timestamp
                        });
                } else {
                    await context.db.insert(orderBookDepth)
                        .values({
                            id: depthId,
                            chainId,
                            poolId: validatedPoolId,
                            side: normalizedSide,
                            price,
                            quantity: totalQuantity,
                            orderCount,
                            lastUpdated: timestamp
                        })
                        .onConflictDoUpdate((row: any) => ({
                            quantity: totalQuantity,
                            orderCount,
                            lastUpdated: timestamp
                        }));
                }
            }

            return true;
        } catch (error) {
            console.error(`Error rebuilding order book depth: ${error instanceof Error ? error.message : error}`);
            return false;
        }
    }
}