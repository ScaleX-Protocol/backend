#!/usr/bin/env node

/**
 * Depth Validation Script
 *
 * This script validates that the /api/depth and /api/depth-orders endpoints are aligned.
 * It checks:
 * 1. Total quantities match for each price level
 * 2. Order counts match aggregated depth
 * 3. Best bid/ask prices align
 * 4. No missing or extra orders between endpoints
 */


interface DepthOrder {
  orderId: string;
  user: string;
  price: string;
  quantity: string;
  filled: string;
  remaining: string;
  status: string;
  type: string;
  timestamp: number;
  side: 'buy' | 'sell';
}

interface DepthOrdersResponse {
  lastUpdateId: number;
  symbol: string;
  poolId: string;
  bids: DepthOrder[];
  asks: DepthOrder[];
  summary: {
    totalBidOrders: number;
    totalAskOrders: number;
    totalBidQuantity: string;
    totalAskQuantity: string;
    highestBid: string;
    lowestAsk: string;
  };
}

interface DepthResponse {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface ValidationResult {
  symbol: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    depthOrdersBids: number;
    depthOrdersAsks: number;
    depthBids: number;
    depthAsks: number;
    bidQuantityMatch: boolean;
    askQuantityMatch: boolean;
    bestBidMatch: boolean;
    bestAskMatch: boolean;
  };
}

class DepthValidator {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async fetchDepthOrders(symbol: string, limit: number = 100): Promise<DepthOrdersResponse> {
    const url = `${this.baseUrl}/api/depth-orders?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch depth-orders: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async fetchDepth(symbol: string, limit: number = 100): Promise<DepthResponse> {
    const url = `${this.baseUrl}/api/depth?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch depth: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  aggregateOrdersByPrice(orders: DepthOrder[]): Map<string, { quantity: bigint; count: number }> {
    const aggregated = new Map<string, { quantity: bigint; count: number }>();

    for (const order of orders) {
      const price = order.price;
      const remaining = BigInt(order.remaining);

      if (aggregated.has(price)) {
        const current = aggregated.get(price)!;
        current.quantity += remaining;
        current.count += 1;
      } else {
        aggregated.set(price, { quantity: remaining, count: 1 });
      }
    }

    return aggregated;
  }

  compareAggregatedDepth(
    ordersAggregated: Map<string, { quantity: bigint; count: number }>,
    depthLevels: [string, string][]
  ): { matches: boolean; errors: string[] } {
    const errors: string[] = [];

    // Convert depth levels to Map for comparison
    const depthMap = new Map<string, bigint>();
    for (const [price, quantity] of depthLevels) {
      depthMap.set(price, BigInt(quantity));
    }

    // Check if all price levels in orders exist in depth
    for (const [price, orderData] of ordersAggregated) {
      const depthQuantity = depthMap.get(price);

      if (depthQuantity === undefined) {
        errors.push(`Price level ${price} found in orders but missing in depth`);
      } else if (orderData.quantity !== depthQuantity) {
        errors.push(
          `Quantity mismatch at price ${price}: ` +
          `Orders have ${orderData.quantity.toString()}, Depth has ${depthQuantity.toString()}`
        );
      }
    }

    // Check if all price levels in depth exist in orders
    for (const [price, depthQuantity] of depthMap) {
      if (!ordersAggregated.has(price)) {
        errors.push(`Price level ${price} found in depth but missing in orders`);
      }
    }

    return {
      matches: errors.length === 0,
      errors
    };
  }

  async validateSymbol(symbol: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      symbol,
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        depthOrdersBids: 0,
        depthOrdersAsks: 0,
        depthBids: 0,
        depthAsks: 0,
        bidQuantityMatch: false,
        askQuantityMatch: false,
        bestBidMatch: false,
        bestAskMatch: false
      }
    };

    try {
      // Fetch data from both endpoints
      const [depthOrdersData, depthData] = await Promise.all([
        this.fetchDepthOrders(symbol),
        this.fetchDepth(symbol)
      ]);

      // Update summary counts
      result.summary.depthOrdersBids = depthOrdersData.bids.length;
      result.summary.depthOrdersAsks = depthOrdersData.asks.length;
      result.summary.depthBids = depthData.bids.length;
      result.summary.depthAsks = depthData.asks.length;

      // Debug: Show sample data from both endpoints
      console.log(`\nDEBUG: Sample comparison for ${symbol}`);
      console.log(`Depth endpoint (first 3 bids):`, depthData.bids.slice(0, 3).map(b => [b[0], b[1]]));
      console.log(`Depth-orders endpoint (first 3 bids):`, depthOrdersData.bids.slice(0, 3).map(b => ({ price: b.price, quantity: b.quantity })));

      // Convert depth-orders data to Map format for comparison
      const depthOrdersBidsMap = new Map<string, { quantity: bigint; count: number }>();
      depthOrdersData.bids.forEach((bid: any) => {
        depthOrdersBidsMap.set(bid.price, {
          quantity: BigInt(bid.quantity),
          count: bid.orders ? bid.orders.length : 1
        });
      });

      const depthOrdersAsksMap = new Map<string, { quantity: bigint; count: number }>();
      depthOrdersData.asks.forEach((ask: any) => {
        depthOrdersAsksMap.set(ask.price, {
          quantity: BigInt(ask.quantity),
          count: ask.orders ? ask.orders.length : 1
        });
      });

      // Compare bids
      const bidsComparison = this.compareAggregatedDepth(depthOrdersBidsMap, depthData.bids);
      result.summary.bidQuantityMatch = bidsComparison.matches;
      result.errors.push(...bidsComparison.errors);

      // Compare asks
      const asksComparison = this.compareAggregatedDepth(depthOrdersAsksMap, depthData.asks);
      result.summary.askQuantityMatch = asksComparison.matches;
      result.errors.push(...asksComparison.errors);

      // Check best bid/ask prices
      const bestBidOrder = depthOrdersData.bids.length > 0 ? depthOrdersData.bids[0].price : "0";
      const bestAskOrder = depthOrdersData.asks.length > 0 ? depthOrdersData.asks[0].price : "0";
      const bestBidDepth = depthData.bids.length > 0 ? depthData.bids[0][0] : "0";
      const bestAskDepth = depthData.asks.length > 0 ? depthData.asks[0][0] : "0";

      result.summary.bestBidMatch = bestBidOrder === bestBidDepth;
      result.summary.bestAskMatch = bestAskOrder === bestAskDepth;

      if (!result.summary.bestBidMatch) {
        result.errors.push(
          `Best bid price mismatch: Orders show ${bestBidOrder}, Depth shows ${bestBidDepth}`
        );
      }

      if (!result.summary.bestAskMatch) {
        result.errors.push(
          `Best ask price mismatch: Orders show ${bestAskOrder}, Depth shows ${bestAskDepth}`
        );
      }

      // Add warnings for potential issues
      if (depthOrdersData.bids.length === 0 && depthData.bids.length > 0) {
        result.warnings.push("No bid orders found but depth shows bid levels");
      }

      if (depthOrdersData.asks.length === 0 && depthData.asks.length > 0) {
        result.warnings.push("No ask orders found but depth shows ask levels");
      }

      if (depthOrdersData.bids.length > 0 && depthData.bids.length === 0) {
        result.warnings.push("Bid orders found but depth shows no bid levels");
      }

      if (depthOrdersData.asks.length > 0 && depthData.asks.length === 0) {
        result.warnings.push("Ask orders found but depth shows no ask levels");
      }

      // Check for stale data (significant time difference)
      const timeDiff = Math.abs(depthOrdersData.lastUpdateId - depthData.lastUpdateId);
      if (timeDiff > 5000) { // 5 seconds threshold
        result.warnings.push(
          `Large time difference between endpoints: ${timeDiff}ms`
        );
      }

      result.valid = result.errors.length === 0;

    } catch (error) {
      result.valid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  async validateSymbols(symbols: string[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const symbol of symbols) {
      console.log(`Validating ${symbol}...`);
      const result = await this.validateSymbol(symbol);
      results.push(result);
    }

    return results;
  }

  printResults(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('DEPTH VALIDATION REPORT');
    console.log('='.repeat(80));

    let totalValid = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const result of results) {
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;

      if (result.valid) {
        totalValid++;
      }

      console.log(`\n📊 ${result.symbol}`);
      console.log(`   Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
      console.log(`   Orders - Bids: ${result.summary.depthOrdersBids}, Asks: ${result.summary.depthOrdersAsks}`);
      console.log(`   Depth - Bids: ${result.summary.depthBids}, Asks: ${result.summary.depthAsks}`);
      console.log(`   Quantity Match - Bids: ${result.summary.bidQuantityMatch ? '✅' : '❌'}, Asks: ${result.summary.askQuantityMatch ? '✅' : '❌'}`);
      console.log(`   Best Price Match - Bid: ${result.summary.bestBidMatch ? '✅' : '❌'}, Ask: ${result.summary.bestAskMatch ? '✅' : '❌'}`);

      if (result.errors.length > 0) {
        console.log('\n   ❌ ERRORS:');
        result.errors.forEach(error => console.log(`      - ${error}`));
      }

      if (result.warnings.length > 0) {
        console.log('\n   ⚠️  WARNINGS:');
        result.warnings.forEach(warning => console.log(`      - ${warning}`));
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total symbols: ${results.length}`);
    console.log(`Valid: ${totalValid}/${results.length}`);
    console.log(`Invalid: ${results.length - totalValid}/${results.length}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Total warnings: ${totalWarnings}`);

    if (totalErrors === 0) {
      console.log('\n🎉 All validations passed!');
    } else {
      console.log('\n💥 Some validations failed. Please review the errors above.');
    }
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run validate-depth <symbol1> [symbol2] [symbol3] ...');
    console.log('Example: npm run validate-depth WETHUSDC WBTCUSDC');
    process.exit(1);
  }

  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const validator = new DepthValidator(baseUrl);

  console.log(`Validating depth endpoints at ${baseUrl}`);
  console.log(`Symbols: ${args.join(', ')}`);

  const results = await validator.validateSymbols(args);
  validator.printResults(results);

  // Exit with error code if any validation failed
  const hasErrors = results.some(result => !result.valid);
  process.exit(hasErrors ? 1 : 0);
}

// Export for programmatic use
export { DepthValidator, type DepthOrdersResponse, type DepthResponse, type ValidationResult };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}