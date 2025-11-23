import { pgTable, serial, text, timestamp, varchar, bigint, numeric, integer, uniqueIndex } from 'drizzle-orm/pg-core';

// Table for faucet requests tracking
export const faucetRequests = pgTable('faucet_requests', {
  id: serial('id').primaryKey(),
  chainId: integer('chain_id').notNull(),
  requesterAddress: varchar('requester_address', { length: 42 }).notNull(),
  receiverAddress: varchar('receiver_address', { length: 42 }).notNull(),
  tokenAddress: varchar('token_address', { length: 42 }).notNull(),
  tokenSymbol: varchar('token_symbol', { length: 20 }).notNull(),
  tokenDecimals: integer('token_decimals').notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  amountFormatted: varchar('amount_formatted', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // pending, completed, failed
  transactionHash: varchar('transaction_hash', { length: 66 }),
  gasUsed: bigint('gas_used', { mode: 'bigint' }),
  gasPrice: bigint('gas_price', { mode: 'bigint' }),
  errorMessage: text('error_message'),
  requestTimestamp: timestamp('request_timestamp', { withTimezone: true }).notNull(),
  completedTimestamp: timestamp('completed_timestamp', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
  userAgent: text('user_agent'),
});

// Table for faucet rate limiting tracking (optional, for analytics)
export const faucetRateLimits = pgTable('faucet_rate_limits', {
  id: serial('id').primaryKey(),
  identifier: varchar('identifier', { length: 100 }).notNull(), // address or IP
  identifierType: varchar('identifier_type', { length: 10 }).notNull(), // 'address' or 'ip'
  requestCount: integer('request_count').notNull().default(1),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  lastRequestTime: timestamp('last_request_time', { withTimezone: true }).notNull(),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
}, (table) => {
  return {
    identifierTypeIdx: uniqueIndex('faucet_rate_limits_identifier_type_idx').on(table.identifier, table.identifierType),
  };
});

export type FaucetRequest = typeof faucetRequests.$inferSelect;
export type NewFaucetRequest = typeof faucetRequests.$inferInsert;

export type FaucetRateLimit = typeof faucetRateLimits.$inferSelect;
export type NewFaucetRateLimit = typeof faucetRateLimits.$inferInsert;