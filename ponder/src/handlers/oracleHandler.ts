import { getEventPublisher } from "@/events/index";
import { executeIfInSync } from "@/utils/syncState";
import {
  oraclePrices
} from "ponder:schema";
import { getAddress } from "viem";

// Oracle price update handler
export async function handleOraclePriceUpdate({ event, context }: any) {
  const { db } = context;
  const chainId = context.network.chainId;
  const token = getAddress(event.args.token);
  const price = BigInt(event.args.price);
  const decimals = Number(event.args.decimals || 18);
  const source = event.args.source || "TWAP";
  const timestamp = Number(event.block.timestamp);

  // Record oracle price
  const priceId = `${chainId}-${token}-${timestamp}`;
  await db.insert(oraclePrices).values({
    id: priceId,
    chainId,
    token,
    price,
    decimals,
    timestamp,
    blockNumber: BigInt(event.block.number),
    source,
    confidence: BigInt(event.args.confidence || 0),
  });


  // Publish price update if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    const eventPublisher = getEventPublisher();
    await eventPublisher.publishPriceUpdate({
      token,
      price: price.toString(),
      decimals: decimals.toString(),
      source,
      timestamp: timestamp.toString(),
      confidence: event.args.confidence?.toString() || "0"
    });
  }, 'handleOraclePriceUpdate');
}