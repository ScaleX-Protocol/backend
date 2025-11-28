import { and, asc, eq, gt, or, sql } from "ponder";
import { orders } from "../../ponder.schema";

export async function getDepth(pool: `0x${string}`, db: any, limit: number) {
    // Bids: Buy, OPEN or PARTIALLY_FILLED, price desc
    const bids = await db
        .sql
        .select({
            price: orders.price,
            quantity: sql`SUM(${orders.quantity})`.as("quantity"),
            filled: sql`SUM(${orders.filled})`.as("filled"),
        })
        .from(orders)
        .where(
            and(
                gt(orders.price, 0),
                eq(orders.poolId, pool),
                eq(orders.side, "Buy"),
                or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
            )
        )
        .orderBy(asc(orders.price))
        .groupBy(orders.price)
        .limit(limit)
        .execute();

    // Asks: Sell, OPEN or PARTIALLY_FILLED, price asc
    const asks = await db
        .sql
        .select({
            price: orders.price,
            quantity: sql`SUM(${orders.quantity})`.as("quantity"),
            filled: sql`SUM(${orders.filled})`.as("filled"),
        })
        .from(orders)
        .where(
            and(
                gt(orders.price, 0),
                eq(orders.poolId, pool),
                eq(orders.side, "Sell"),
                or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
            )
        )
        .orderBy(asc(orders.price))
        .groupBy(orders.price)
        .limit(limit)
        .execute();

    return {
        bids: bids.map((o: any) => [o.price.toString(), (o.quantity - o.filled).toString()]),
        asks: asks.map((o: any) => [o.price.toString(), (o.quantity - o.filled).toString()])
    };
}