import { pgTable, text, integer, varchar, boolean, numeric } from 'drizzle-orm/pg-core';

// Ponder DB: orders table (Ponder schema, distinct from API's orders table)
// Column names verified from live DB: user_address, agent_token_id, pool_id, etc.
export const ponderOrders = pgTable('orders', {
    id: text('id').primaryKey(),
    chainId: integer('chain_id').notNull(),
    poolId: text('pool_id').notNull(),
    userAddress: text('user_address'),
    side: varchar('side'),
    timestamp: integer('timestamp'),
    price: numeric('price', { precision: 78, scale: 0 }),
    quantity: numeric('quantity', { precision: 78, scale: 0 }),
    status: varchar('status'),
    agentTokenId: numeric('agent_token_id', { precision: 78, scale: 0 }),
});

// Ponder DB: trades table
export const ponderTrades = pgTable('trades', {
    id: text('id').primaryKey(),
    chainId: integer('chain_id').notNull(),
    poolId: text('pool_id').notNull(),
    orderId: text('order_id').notNull(),
    price: numeric('price', { precision: 78, scale: 0 }),
    quantity: numeric('quantity', { precision: 78, scale: 0 }),
    timestamp: integer('timestamp'),
});

// Ponder DB: pools table
export const ponderPools = pgTable('pools', {
    id: text('id').primaryKey(),
    chainId: integer('chain_id').notNull(),
    coin: varchar('coin'),
    orderBook: text('order_book'),
    baseDecimals: integer('base_decimals'),
    quoteDecimals: integer('quote_decimals'),
    price: numeric('price', { precision: 78, scale: 0 }),
});

// Ponder DB: agent_registry table
export const ponderAgentRegistry = pgTable('agent_registry', {
    id: text('id').primaryKey(),
    chainId: integer('chain_id').notNull(),
    tokenId: numeric('token_id', { precision: 78, scale: 0 }).notNull(),
    owner: text('owner').notNull(),
    metadataUri: text('metadata_uri'),
    registeredAt: integer('registered_at').notNull(),
});

// Ponder DB: agent_installations table
export const ponderAgentInstallations = pgTable('agent_installations', {
    id: text('id').primaryKey(),
    chainId: integer('chain_id').notNull(),
    owner: text('owner').notNull(),
    agentTokenId: numeric('agent_token_id', { precision: 78, scale: 0 }).notNull(),
    enabled: boolean('enabled'),
    installedAt: integer('installed_at').notNull(),
});
