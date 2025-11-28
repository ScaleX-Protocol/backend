import { Redis } from 'ioredis';
import {
  TradeEvent,
  BalanceUpdateEvent,
  OrderEvent,
  DepthEvent,
  KlineEvent,
  ExecutionReportEvent,
  ChainBalanceEvent,
  LendingEvent,
  LiquidationEvent,
  PriceUpdateEvent,
  YieldAccrualEvent,
  EventStreams,
  getStreamKey
} from './types.js';

export class EventPublisher {
  private redis: Redis;
  private isEnabled: boolean = true;
  private chainId: string;

  constructor(redis: Redis, chainId?: string) {
    this.redis = redis;
    this.isEnabled = process.env.ENABLE_EVENT_PUBLISHING !== 'false';
    this.chainId = chainId || process.env.DEFAULT_CHAIN_ID || '84532';
  }

  async publishTrade(trade: TradeEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.TRADES, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'symbol', trade.symbol,
        'price', trade.price,
        'quantity', trade.quantity,
        'timestamp', trade.timestamp,
        'userId', trade.userId,
        'side', trade.side,
        'tradeId', trade.tradeId,
        'orderId', trade.orderId,
        'makerOrderId', trade.makerOrderId,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish trade event:', error);
    }
  }

  async publishBalanceUpdate(balance: BalanceUpdateEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.BALANCES, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'userId', balance.userId,
        'token', balance.token,
        'available', balance.available,
        'locked', balance.locked,
        'timestamp', balance.timestamp,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish balance update event:', error);
    }
  }

  async publishChainBalanceUpdate(chainBalance: ChainBalanceEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.CHAIN_BALANCES, chainBalance.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'eventType', chainBalance.eventType,
        'userId', chainBalance.userId,
        'token', chainBalance.token,
        'amount', chainBalance.amount,
        'chainId', chainBalance.chainId,
        'timestamp', chainBalance.timestamp,
        'transactionId', chainBalance.transactionId,
        'blockNumber', chainBalance.blockNumber
      );
    } catch (error) {
      console.error('Failed to publish chain balance event:', error);
    }
  }

  async publishOrder(order: OrderEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.ORDERS, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'orderId', order.orderId,
        'userId', order.userId,
        'symbol', order.symbol,
        'side', order.side,
        'type', order.type,
        'price', order.price,
        'quantity', order.quantity,
        'filledQuantity', order.filledQuantity,
        'status', order.status,
        'timestamp', order.timestamp,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish order event:', error);
    }
  }

  async publishDepth(depth: DepthEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.DEPTH, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '500', '*',
        'symbol', depth.symbol,
        'bids', JSON.stringify(depth.bids),
        'asks', JSON.stringify(depth.asks),
        'timestamp', depth.timestamp,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish depth event:', error);
    }
  }

  async publishKline(kline: KlineEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.KLINES, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'symbol', kline.symbol,
        'interval', kline.interval,
        'openTime', kline.openTime,
        'closeTime', kline.closeTime,
        'open', kline.open,
        'high', kline.high,
        'low', kline.low,
        'close', kline.close,
        'volume', kline.volume,
        'trades', kline.trades,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish kline event:', error);
    }
  }

  async publishExecutionReport(report: ExecutionReportEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.EXECUTION_REPORTS, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'orderId', report.orderId,
        'userId', report.userId,
        'symbol', report.symbol,
        'side', report.side,
        'type', report.type,
        'price', report.price,
        'quantity', report.quantity,
        'filledQuantity', report.filledQuantity,
        'status', report.status,
        'timestamp', report.timestamp,
        'executionType', report.executionType,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish execution report event:', error);
    }
  }

  // Lending protocol event publishers
  async publishLendingEvent(lending: LendingEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.LENDING, this.chainId);
      const fields = [
        'action', lending.action,
        'user', lending.user,
        'token', lending.token,
        'amount', lending.amount,
        'timestamp', lending.timestamp,
        'chainId', this.chainId
      ];

      // Add optional fields if they exist
      if (lending.collateralToken) fields.push('collateralToken', lending.collateralToken);
      if (lending.debtToken) fields.push('debtToken', lending.debtToken);
      if (lending.healthFactor) fields.push('healthFactor', lending.healthFactor);
      if (lending.interestRate) fields.push('interestRate', lending.interestRate);
      if (lending.liquidator) fields.push('liquidator', lending.liquidator);
      if (lending.debtRepaid) fields.push('debtRepaid', lending.debtRepaid);
      if (lending.liquidationBonus) fields.push('liquidationBonus', lending.liquidationBonus);
      if (lending.interestPaid) fields.push('interestPaid', lending.interestPaid);
      if (lending.interestEarned) fields.push('interestEarned', lending.interestEarned);

      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*', ...fields);
    } catch (error) {
      console.error('Failed to publish lending event:', error);
    }
  }

  async publishLiquidation(liquidation: LiquidationEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.LIQUIDATIONS, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'liquidatedUser', liquidation.liquidatedUser,
        'liquidator', liquidation.liquidator,
        'collateralToken', liquidation.collateralToken,
        'debtToken', liquidation.debtToken,
        'collateralAmount', liquidation.collateralAmount,
        'debtAmount', liquidation.debtAmount,
        'healthFactor', liquidation.healthFactor,
        'price', liquidation.price,
        'timestamp', liquidation.timestamp,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish liquidation event:', error);
    }
  }

  async publishPriceUpdate(priceUpdate: PriceUpdateEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.PRICE_UPDATES, this.chainId);
      const fields = [
        'token', priceUpdate.token,
        'price', priceUpdate.price,
        'decimals', priceUpdate.decimals,
        'source', priceUpdate.source,
        'timestamp', priceUpdate.timestamp,
        'chainId', this.chainId
      ];

      if (priceUpdate.confidence) {
        fields.push('confidence', priceUpdate.confidence);
      }

      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*', ...fields);
    } catch (error) {
      console.error('Failed to publish price update event:', error);
    }
  }

  async publishYieldAccrual(yieldAccrual: YieldAccrualEvent): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const streamKey = getStreamKey(EventStreams.YIELD_ACCRUALS, this.chainId);
      await this.redis.xadd(streamKey, 'MAXLEN', '~', '1000', '*',
        'user', yieldAccrual.user,
        'token', yieldAccrual.token,
        'yieldType', yieldAccrual.yieldType,
        'amount', yieldAccrual.amount,
        'interestRate', yieldAccrual.interestRate,
        'timestamp', yieldAccrual.timestamp,
        'cumulativeYield', yieldAccrual.cumulativeYield,
        'chainId', this.chainId
      );
    } catch (error) {
      console.error('Failed to publish yield accrual event:', error);
    }
  }

  async createConsumerGroups(): Promise<void> {
    const groups = [
      { stream: EventStreams.TRADES, groups: ['websocket-consumers', 'analytics-consumers'] },
      { stream: EventStreams.BALANCES, groups: ['websocket-consumers', 'analytics-consumers'] },
      { stream: EventStreams.ORDERS, groups: ['websocket-consumers', 'analytics-consumers'] },
      { stream: EventStreams.DEPTH, groups: ['websocket-consumers'] },
      { stream: EventStreams.KLINES, groups: ['websocket-consumers', 'analytics-consumers'] },
      { stream: EventStreams.EXECUTION_REPORTS, groups: ['websocket-consumers'] },
      { stream: EventStreams.CHAIN_BALANCES, groups: ['websocket-consumers', 'analytics-consumers', 'cross-chain-consumers'] }
    ];

    for (const { stream, groups: consumerGroups } of groups) {
      try {
        const streamKey = getStreamKey(stream, this.chainId);

        // Only create consumer groups if stream exists
        const exists = await this.redis.exists(streamKey);
        if (!exists) {
          continue;
        }

        for (const group of consumerGroups) {
          try {
            // Add chain ID to consumer group name for uniqueness
            const chainSpecificGroup = `${group}-${this.chainId}`;
            await this.redis.xgroup('CREATE', streamKey, chainSpecificGroup, '0');
          } catch (error: any) {
            if (error.message.includes('BUSYGROUP')) {
            } else {
              console.error(`Failed to create consumer group ${group} for stream ${streamKey}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing stream ${stream}:`, error);
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Event publisher health check failed:', error);
      return false;
    }
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }
}