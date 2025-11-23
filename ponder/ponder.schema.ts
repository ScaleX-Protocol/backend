import { index, onchainTable, relations } from "ponder";

export const pools = onchainTable(
	"pools",
	t => ({
		id: t.hex().primaryKey(),
		chainId: t.integer().notNull(),
		coin: t.varchar(),
		orderBook: t.hex(),
		baseCurrency: t.hex().notNull(),
		quoteCurrency: t.hex().notNull(),
		baseDecimals: t.integer(),
		quoteDecimals: t.integer(),
		volume: t.bigint(),
		volumeInQuote: t.bigint(),
		price: t.bigint(),
		timestamp: t.integer(),
	}),
	(table: any) => ({
		coinIdx: index().on(table.coin),
		chainIdIdx: index().on(table.chainId),
		orderBookIdx: index().on(table.orderBook),
	})
);

export const orders = onchainTable(
	"orders",
	(t: any) => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		poolId: t.hex().notNull(),
		orderId: t.bigint().notNull(),
		transactionId: t.text(),
		user: t.hex(),
		side: t.varchar(),
		timestamp: t.integer(),
		price: t.bigint(),
		quantity: t.bigint(),
		filled: t.bigint(),
		type: t.varchar(),
		status: t.varchar(),
		expiry: t.integer(),
	}),
	(table: any) => ({
		orderIdChainIdx: index().on(table.orderId, table.chainId),
		poolChainStatusIdx: index().on(table.poolId, table.chainId, table.status),
		poolStatusSideIdx: index().on(table.poolId, table.status, table.side),
		depthOptimizedIdx: index().on(table.poolId, table.status, table.side, table.price),
		userTimestampIdx: index().on(table.user, table.timestamp),
		userStatusTimestampIdx: index().on(table.user, table.status, table.timestamp),
		poolIdx: index().on(table.poolId),
		statusIdx: index().on(table.status),
		timestampIdx: index().on(table.timestamp),
		userIdx: index().on(table.user),
	})
);

export const orderHistory = onchainTable(
	"order_history",
	(t: any) => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		poolId: t.hex().notNull(),
		orderId: t.bigint().notNull(),
		transactionId: t.text(),
		timestamp: t.integer(),
		filled: t.bigint(),
		status: t.varchar(),
	}),
	(table: any) => ({
		orderIdx: index().on(table.orderId),
		poolIdx: index().on(table.poolId),
		chainIdIdx: index().on(table.chainId),
		orderIdChainIdx: index().on(table.orderId, table.chainId),
		poolChainTimestampIdx: index().on(table.poolId, table.chainId, table.timestamp),
	})
);

export const orderBookDepth = onchainTable(
	"order_book_depth",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		poolId: t.hex().notNull(),
		side: t.varchar().notNull(),
		price: t.bigint().notNull(),
		quantity: t.bigint().notNull(),
		orderCount: t.integer().notNull(),
		lastUpdated: t.integer().notNull(),
	}),
	table => ({
		poolSideIdx: index().on(table.poolId, table.side),
		poolPriceIdx: index().on(table.poolId, table.price),
		chainIdIdx: index().on(table.chainId),
		lastUpdatedIdx: index().on(table.lastUpdated),
		poolChainSideIdx: index().on(table.poolId, table.chainId, table.side),
		poolChainSidePriceIdx: index().on(table.poolId, table.chainId, table.side, table.price),
		quantityIdx: index().on(table.quantity),
	})
);

export const ordersRelations = relations(orders, ({ many, one }) => ({
	pool: one(pools, {
		fields: [orders.poolId, orders.chainId],
		references: [pools.id, pools.chainId],
	}),
}));

export const orderHistoryRelations = relations(orderHistory, ({ one }) => ({
	order: one(orders, {
		fields: [orderHistory.orderId],
		references: [orders.orderId],
	}),
	pool: one(pools, {
		fields: [orderHistory.poolId],
		references: [pools.id],
	}),
}));

export const orderBookDepthRelations = relations(orderBookDepth, ({ one }) => ({
	pool: one(pools, {
		fields: [orderBookDepth.poolId, orderBookDepth.chainId],
		references: [pools.id, pools.chainId],
	}),
}));

export const trades = onchainTable(
	"trades",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		transactionId: t.text(),
		poolId: t.hex().notNull(),
		orderId: t.text().notNull(),
		price: t.bigint(),
		quantity: t.bigint(),
		timestamp: t.integer(),
	}),
	table => ({
		transactionIdx: index().on(table.transactionId),
		poolIdx: index().on(table.poolId),
		chainIdIdx: index().on(table.chainId),
		orderIdIdx: index().on(table.orderId),
		poolChainTimestampIdx: index().on(table.poolId, table.chainId, table.timestamp),
		timestampIdx: index().on(table.timestamp),
		timestampDescIdx: index().on(table.timestamp, table.id),
	})
);

export const tradeRelations = relations(trades, ({ one }) => ({
	order: one(orders, { fields: [trades.orderId], references: [orders.id] }),
	pool: one(pools, {
		fields: [trades.poolId],
		references: [pools.id],
	}),
}));

export const orderBookTrades = onchainTable(
	"order_book_trades",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		price: t.bigint(),
		quantity: t.bigint(),
		timestamp: t.integer(),
		transactionId: t.text(),
		side: t.varchar(),
		poolId: t.hex().notNull(),
	}),
	table => ({
		transactionIdx: index().on(table.transactionId),
		poolIdx: index().on(table.poolId),
		chainIdIdx: index().on(table.chainId),
		poolChainTimestampIdx: index().on(table.poolId, table.chainId, table.timestamp),
		sideIdx: index().on(table.side),
		timestampIdx: index().on(table.timestamp),
	})
);

const createBucketTable = (tableName: string) =>
	onchainTable(
		tableName,
		t => ({
			id: t.text().primaryKey(),
			chainId: t.integer().notNull(),
			openTime: t.integer().notNull(),
			closeTime: t.integer().notNull(),
			open: t.real().notNull(),
			high: t.real().notNull(),
			low: t.real().notNull(),
			close: t.real().notNull(),
			volume: t.real().notNull(),
			quoteVolume: t.real().notNull(),
			count: t.integer().notNull(),
			takerBuyBaseVolume: t.real().notNull(),
			takerBuyQuoteVolume: t.real().notNull(),
			average: t.real().notNull(),
			poolId: t.hex().notNull(),
		}),
		table => ({
			openTimeIdx: index().on(table.openTime),
			poolIdx: index().on(table.poolId),
			chainIdIdx: index().on(table.chainId),
			poolOpenTimeIdx: index().on(table.poolId, table.openTime),
			poolChainOpenTimeIdx: index().on(table.poolId, table.chainId, table.openTime),
			closeTimeIdx: index().on(table.closeTime),
		})
	);

export const minuteBuckets = createBucketTable("minute_buckets");
export const fiveMinuteBuckets = createBucketTable("five_minute_buckets");
export const thirtyMinuteBuckets = createBucketTable("thirty_minute_buckets");
export const hourBuckets = createBucketTable("hour_buckets");
export const dailyBuckets = createBucketTable("daily_buckets");

export const balances = onchainTable(
	"balances",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex(),
		currency: t.hex(),
		amount: t.bigint(),
		lockedAmount: t.bigint(),
		lastUpdated: t.integer(),
	}),
	table => ({
		currencyIdx: index().on(table.currency),
		chainIdIdx: index().on(table.chainId),
		userCurrencyIdx: index().on(table.user, table.currency),
		userChainIdx: index().on(table.user, table.chainId),
		userCurrencyChainIdx: index().on(table.user, table.currency, table.chainId),
		lastUpdatedIdx: index().on(table.lastUpdated),
	})
);

export const marketMakers = onchainTable(
	"market_makers",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex(),
		poolId: t.hex().notNull(),
		amount: t.bigint(),
		lockedAmount: t.bigint(),
		expiry: t.integer(),
	}),
	table => ({
		chainIdIdx: index().on(table.chainId),
		userIdx: index().on(table.user),
		poolIdx: index().on(table.poolId),
		userPoolIdx: index().on(table.user, table.poolId),
		expiryIdx: index().on(table.expiry),
	})
);

export const velockPositions = onchainTable(
	"velock_positions",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex(),
		poolId: t.hex().notNull(),
		amount: t.bigint(),
		lockedAmount: t.bigint(),
		expiry: t.integer(),
	}),
	table => ({
		chainIdIdx: index().on(table.chainId),
		userIdx: index().on(table.user),
		poolIdx: index().on(table.poolId),
		userPoolIdx: index().on(table.user, table.poolId),
		expiryIdx: index().on(table.expiry),
	})
);

export const votes = onchainTable(
	"votes",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex(),
		poolId: t.hex().notNull(),
		amount: t.bigint(),
		lockedAmount: t.bigint(),
		timestamp: t.integer(),
		expiry: t.integer(),
	}),
	table => ({
		chainIdIdx: index().on(table.chainId),
		userIdx: index().on(table.user),
		poolIdx: index().on(table.poolId),
		userPoolIdx: index().on(table.user, table.poolId),
		timestampIdx: index().on(table.timestamp),
		expiryIdx: index().on(table.expiry),
	})
);

export const currencies = onchainTable(
	"currencies",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		address: t.hex().notNull(),
		name: t.varchar(),
		symbol: t.varchar(),
		decimals: t.integer(),
		tokenType: t.varchar().default("underlying"), // 'underlying' or 'synthetic'
		sourceChainId: t.integer(), // for synthetic tokens: original chain
		underlyingTokenAddress: t.hex(), // for synthetic tokens: points to underlying
		isActive: t.boolean().default(true),
		registeredAt: t.integer(),
	}),
	table => ({
		chainIdIdx: index().on(table.chainId),
		addressIdx: index().on(table.address),
		addressChainIdx: index().on(table.address, table.chainId),
		symbolIdx: index().on(table.symbol),
		addressChainSymbolIdx: index().on(table.address, table.chainId, table.symbol),
		tokenTypeIdx: index().on(table.tokenType),
		tokenTypeChainIdx: index().on(table.tokenType, table.chainId),
		underlyingTokenIdx: index().on(table.underlyingTokenAddress),
	})
);

export const poolsCurrenciesRelations = relations(pools, ({ one }) => ({
	baseCurrency: one(currencies, {
		fields: [pools.baseCurrency, pools.chainId],
		references: [currencies.address, currencies.chainId],
	}),
	quoteCurrency: one(currencies, {
		fields: [pools.quoteCurrency, pools.chainId],
		references: [currencies.address, currencies.chainId],
	}),
}));

export const balancesCurrenciesRelations = relations(balances, ({ one }) => ({
	currency: one(currencies, {
		fields: [balances.currency, balances.chainId],
		references: [currencies.address, currencies.chainId],
	}),
}));

// Legacy onchain faucet tables (for blockchain event tracking)
export const faucetRequests = onchainTable(
	"faucet_requests",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		requester: t.hex().notNull(),
		receiver: t.hex().notNull(),
		token: t.hex().notNull(),
		amount: t.bigint(),
		timestamp: t.integer(),
		transactionId: t.text(),
		blockNumber: t.text(),
	}),
	table => ({
		requesterIdx: index().on(table.requester),
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
	})
);

export const faucetDeposits = onchainTable(
	"faucet_deposits",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		depositor: t.hex().notNull(),
		token: t.hex().notNull(),
		amount: t.bigint(),
		timestamp: t.integer(),
		transactionId: t.text(),
		blockNumber: t.text(),
	}),
	table => ({
		depositorIdx: index().on(table.depositor),
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
	})
);

// API-based faucet request tracking (new improved schema)
export const faucetApiRequests = onchainTable(
	"faucet_api_requests",
	t => ({
		id: t.text().primaryKey(), // Format: {chainId}-{transactionHash}-{timestamp}
		chainId: t.integer().notNull(),
		requesterAddress: t.hex().notNull(), // Address requesting tokens
		receiverAddress: t.hex().notNull(), // Address receiving tokens (usually same as requester)
		tokenAddress: t.hex().notNull(), // Token contract address
		tokenSymbol: t.varchar().notNull(), // Token symbol from blockchain
		tokenDecimals: t.integer().notNull(), // Token decimals from blockchain
		amount: t.bigint().notNull(), // Amount requested (in smallest unit)
		amountFormatted: t.varchar().notNull(), // Human-readable amount
		status: t.varchar().notNull(), // "pending", "completed", "failed"
		transactionHash: t.text(), // Transaction hash if completed
		gasUsed: t.bigint(), // Gas used for the transaction
		gasPrice: t.bigint(), // Gas price used
		errorMessage: t.text(), // Error message if failed
		requestTimestamp: t.integer().notNull(), // When the API request was made (as Unix timestamp)
		completedTimestamp: t.integer(), // When the transaction was confirmed (as Unix timestamp)
		ipAddress: t.text(), // Client IP address for rate limiting
		userAgent: t.text(), // User agent string
	}),
	(table: any) => ({
		requesterAddressIdx: index().on(table.requesterAddress),
		tokenAddressIdx: index().on(table.tokenAddress),
		chainIdIdx: index().on(table.chainId),
		statusIdx: index().on(table.status),
		requestTimestampIdx: index().on(table.requestTimestamp),
		ipAddressIdx: index().on(table.ipAddress),
		transactionHashIdx: index().on(table.transactionHash),
		requesterChainIdx: index().on(table.requesterAddress, table.chainId),
		requesterStatusIdx: index().on(table.requesterAddress, table.status),
		chainStatusIdx: index().on(table.chainId, table.status),
	})
);

export const crossChainTransfers = onchainTable(
	"cross_chain_transfers",
	t => ({
		id: t.text().primaryKey(),
		sourceChainId: t.integer().notNull(), // Source chain (where deposit originated)
		destinationChainId: t.integer(), // Destination chain (where funds will be credited) - nullable initially
		sender: t.hex().notNull(),
		recipient: t.hex().notNull(),
		sourceToken: t.hex().notNull(), // Original token address on source chain
		destinationToken: t.hex(), // Synthetic token address on destination chain
		amount: t.bigint().notNull(),
		messageId: t.hex(),
		dispatchMessageId: t.text(), // Reference to hyperlaneMessages ID for DISPATCH (messageId-DISPATCH)
		processMessageId: t.text(), // Reference to hyperlaneMessages ID for PROCESS (messageId-PROCESS)
		sourceTransactionHash: t.text().notNull(), // Source chain TX hash
		destinationTransactionHash: t.text(), // Destination chain TX hash (when processed)
		sourceBlockNumber: t.bigint().notNull(),
		destinationBlockNumber: t.bigint(), // When processed on destination
		timestamp: t.integer().notNull(),
		destinationTimestamp: t.integer(), // When processed on destination
		status: t.varchar().notNull(), // "SENT", "RELAYED", "COMPLETED"
		direction: t.varchar().notNull(), // "DEPOSIT" or "WITHDRAWAL"
	}),
	table => ({
		senderIdx: index().on(table.sender),
		recipientIdx: index().on(table.recipient),
		sourceTokenIdx: index().on(table.sourceToken),
		destinationTokenIdx: index().on(table.destinationToken),
		messageIdIdx: index().on(table.messageId),
		sourceChainIdIdx: index().on(table.sourceChainId),
		destinationChainIdIdx: index().on(table.destinationChainId),
		timestampIdx: index().on(table.timestamp),
		statusIdx: index().on(table.status),
		directionIdx: index().on(table.direction),
		sourceTransactionHashIdx: index().on(table.sourceTransactionHash),
		destinationTransactionHashIdx: index().on(table.destinationTransactionHash),
		sourceChainDirectionIdx: index().on(table.sourceChainId, table.direction),
		destinationChainDirectionIdx: index().on(table.destinationChainId, table.direction),
		userDirectionIdx: index().on(table.sender, table.direction),
	})
);

export const hyperlaneMessages = onchainTable(
	"hyperlane_messages",
	t => ({
		id: t.text().primaryKey(), // Use compound key: messageId-type
		chainId: t.integer().notNull(),
		sender: t.hex().notNull(),
		messageId: t.hex().notNull(),
		type: t.varchar().notNull(), // "DISPATCH" or "PROCESS"
		transactionHash: t.text().notNull(),
		blockNumber: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
	}),
	table => ({
		senderIdx: index().on(table.sender),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		transactionHashIdx: index().on(table.transactionHash),
		messageIdIdx: index().on(table.messageId),
		typeIdx: index().on(table.type),
		messageIdTypeIdx: index().on(table.messageId, table.type),
	})
);

// Relations for cross-chain transfers
export const crossChainTransfersRelations = relations(crossChainTransfers, ({ one }) => ({
	// Link to the source hyperlane DISPATCH message via dispatchMessageId
	dispatchMessage: one(hyperlaneMessages, {
		fields: [crossChainTransfers.dispatchMessageId],
		references: [hyperlaneMessages.id],
		relationName: "sourceDispatch",
	}),
	// Link to destination hyperlane PROCESS message via processMessageId
	processMessage: one(hyperlaneMessages, {
		fields: [crossChainTransfers.processMessageId],
		references: [hyperlaneMessages.id],
		relationName: "destinationProcess",
	}),
}));

// Relations for hyperlane messages
export const hyperlaneMessagesRelations = relations(hyperlaneMessages, ({ one, many }) => ({
	// For DISPATCH messages: link to cross-chain transfers that originated from this
	sourceTransfers: many(crossChainTransfers, {
		relationName: "sourceDispatch",
	}),
	// For PROCESS messages: link to cross-chain transfers completed by this
	destinationTransfers: many(crossChainTransfers, {
		relationName: "destinationProcess",
	}),
	// Link DISPATCH and PROCESS messages with same messageId
	pairedMessage: one(hyperlaneMessages, {
		fields: [hyperlaneMessages.messageId],
		references: [hyperlaneMessages.messageId],
		relationName: "messagePair",
	}),
	pairedMessages: many(hyperlaneMessages, {
		relationName: "messagePair",
	}),
}));

export const chainBalanceDeposits = onchainTable(
	"chain_balance_deposits",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		depositor: t.hex().notNull(),
		recipient: t.hex().notNull(),
		token: t.hex().notNull(),
		amount: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.text().notNull(),
	}),
	table => ({
		depositorIdx: index().on(table.depositor),
		recipientIdx: index().on(table.recipient),
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		depositorTokenIdx: index().on(table.depositor, table.token),
		depositorChainIdx: index().on(table.depositor, table.chainId),
		recipientTokenIdx: index().on(table.recipient, table.token),
		recipientChainIdx: index().on(table.recipient, table.chainId),
		tokenChainIdx: index().on(table.token, table.chainId),
		depositorTokenChainIdx: index().on(table.depositor, table.token, table.chainId),
		recipientTokenChainIdx: index().on(table.recipient, table.token, table.chainId),
	})
);

export const chainBalanceWithdrawals = onchainTable(
	"chain_balance_withdrawals",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		token: t.hex().notNull(),
		amount: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.text().notNull(),
		withdrawalType: t.varchar().notNull(),
	}),
	table => ({
		userIdx: index().on(table.user),
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		withdrawalTypeIdx: index().on(table.withdrawalType),
		userTokenIdx: index().on(table.user, table.token),
		userChainIdx: index().on(table.user, table.chainId),
		tokenChainIdx: index().on(table.token, table.chainId),
		userTokenChainIdx: index().on(table.user, table.token, table.chainId),
	})
);

export const chainBalanceUnlocks = onchainTable(
	"chain_balance_unlocks",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		token: t.hex().notNull(),
		amount: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.text().notNull(),
	}),
	table => ({
		userIdx: index().on(table.user),
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		userTokenIdx: index().on(table.user, table.token),
		userChainIdx: index().on(table.user, table.chainId),
		tokenChainIdx: index().on(table.token, table.chainId),
		userTokenChainIdx: index().on(table.user, table.token, table.chainId),
	})
);

export const chainBalanceTokenWhitelist = onchainTable(
	"chain_balance_token_whitelist",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		token: t.hex().notNull(),
		isWhitelisted: t.boolean().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.text().notNull(),
		action: t.varchar().notNull(),
	}),
	table => ({
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		isWhitelistedIdx: index().on(table.isWhitelisted),
		actionIdx: index().on(table.action),
		tokenChainIdx: index().on(table.token, table.chainId),
		tokenWhitelistedIdx: index().on(table.token, table.isWhitelisted),
	})
);

export const chainBalanceStates = onchainTable(
	"chain_balance_states",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		token: t.hex().notNull(),
		balance: t.bigint().notNull(),
		unlockedBalance: t.bigint().notNull(),
		lastUpdated: t.integer().notNull(),
	}),
	table => ({
		userIdx: index().on(table.user),
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		lastUpdatedIdx: index().on(table.lastUpdated),
		userTokenIdx: index().on(table.user, table.token),
		userChainIdx: index().on(table.user, table.chainId),
		tokenChainIdx: index().on(table.token, table.chainId),
		userTokenChainIdx: index().on(table.user, table.token, table.chainId),
		balanceIdx: index().on(table.balance),
		unlockedBalanceIdx: index().on(table.unlockedBalance),
	})
);

export const tokenMappings = onchainTable(
	"token_mappings",
	t => ({
		id: t.text().primaryKey(),
		sourceChainId: t.integer().notNull(),
		sourceToken: t.hex().notNull(),
		targetChainId: t.integer().notNull(),
		syntheticToken: t.hex().notNull(),
		symbol: t.varchar().notNull(),
		sourceDecimals: t.integer().notNull(),
		syntheticDecimals: t.integer().notNull(),
		isActive: t.boolean().notNull(),
		registeredAt: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
	}),
	table => ({
		sourceChainIdIdx: index().on(table.sourceChainId),
		targetChainIdIdx: index().on(table.targetChainId),
		sourceTokenIdx: index().on(table.sourceToken),
		syntheticTokenIdx: index().on(table.syntheticToken),
		symbolIdx: index().on(table.symbol),
		isActiveIdx: index().on(table.isActive),
		sourceChainTargetChainIdx: index().on(table.sourceChainId, table.targetChainId),
		sourceTokenTargetChainIdx: index().on(table.sourceToken, table.targetChainId),
		syntheticTokenTargetChainIdx: index().on(table.syntheticToken, table.targetChainId),
		timestampIdx: index().on(table.timestamp),
		transactionIdIdx: index().on(table.transactionId),
	})
);

// User tracking table for analytics
export const users = onchainTable(
	"users",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		address: t.hex().notNull(),
		firstSeenTimestamp: t.integer().notNull(),
		lastSeenTimestamp: t.integer().notNull(),
		totalOrders: t.integer().default(0),
		totalDeposits: t.integer().default(0),
		totalVolume: t.bigint().default(BigInt(0)),
	}),
	table => ({
		addressIdx: index().on(table.address),
		chainIdIdx: index().on(table.chainId),
		addressChainIdx: index().on(table.address, table.chainId),
		firstSeenIdx: index().on(table.firstSeenTimestamp),
		lastSeenIdx: index().on(table.lastSeenTimestamp),
	})
);

// Analytics tables for deposit/withdrawal tracking
export const deposits = onchainTable(
	"deposits",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		currency: t.hex().notNull(),
		amount: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.bigint().notNull(),
	}),
	table => ({
		userIdx: index().on(table.user),
		currencyIdx: index().on(table.currency),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		userCurrencyIdx: index().on(table.user, table.currency),
		userChainIdx: index().on(table.user, table.chainId),
		currencyChainIdx: index().on(table.currency, table.chainId),
		userCurrencyChainIdx: index().on(table.user, table.currency, table.chainId),
		transactionIdx: index().on(table.transactionId),
	})
);

export const withdrawals = onchainTable(
	"withdrawals",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		currency: t.hex().notNull(),
		amount: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.bigint().notNull(),
	}),
	table => ({
		userIdx: index().on(table.user),
		currencyIdx: index().on(table.currency),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		userCurrencyIdx: index().on(table.user, table.currency),
		userChainIdx: index().on(table.user, table.chainId),
		currencyChainIdx: index().on(table.currency, table.chainId),
		userCurrencyChainIdx: index().on(table.user, table.currency, table.chainId),
		transactionIdx: index().on(table.transactionId),
	})
);

// =============================================================
//                   LENDING PROTOCOL TABLES
// =============================================================

// Lending positions (user collateral and debt tracking)
export const lendingPositions = onchainTable(
	"lending_positions",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		collateralToken: t.hex().notNull(),
		debtToken: t.hex().notNull(),
		collateralAmount: t.bigint().notNull(),
		debtAmount: t.bigint().notNull(),
		lastYieldClaim: t.integer(),
		lastUpdated: t.integer().notNull(),
		isActive: t.boolean().default(true),
	}),
	table => ({
		userIdx: index().on(table.user),
		chainIdIdx: index().on(table.chainId),
		collateralTokenIdx: index().on(table.collateralToken),
		debtTokenIdx: index().on(table.debtToken),
		userCollateralIdx: index().on(table.user, table.collateralToken),
		userDebtIdx: index().on(table.user, table.debtToken),
		isActiveIdx: index().on(table.isActive),
		lastUpdatedIdx: index().on(table.lastUpdated),
		userChainIdx: index().on(table.user, table.chainId),
	})
);

// Lending events (supply, borrow, repay, withdraw)
export const lendingEvents = onchainTable(
	"lending_events",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		action: t.varchar().notNull(), // "SUPPLY", "BORROW", "REPAY", "WITHDRAW", "LIQUIDATE"
		token: t.hex().notNull(),
		amount: t.bigint().notNull(),
		collateralToken: t.hex(), // For borrow/repay events
		debtToken: t.hex(), // For supply/withdraw events
		healthFactor: t.bigint(), // Health factor after action
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.bigint().notNull(),
		liquidator: t.hex(), // For liquidation events
		liquidatedAmount: t.bigint(), // For liquidation events
	}),
	table => ({
		userIdx: index().on(table.user),
		chainIdIdx: index().on(table.chainId),
		actionIdx: index().on(table.action),
		tokenIdx: index().on(table.token),
		timestampIdx: index().on(table.timestamp),
		transactionIdx: index().on(table.transactionId),
		userActionIdx: index().on(table.user, table.action),
		tokenActionIdx: index().on(table.token, table.action),
		userTimestampIdx: index().on(table.user, table.timestamp),
		healthFactorIdx: index().on(table.healthFactor),
		liquidatorIdx: index().on(table.liquidator),
	})
);

// Synthetic token tracking
export const syntheticTokens = onchainTable(
	"synthetic_tokens",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		address: t.hex().notNull(),
		name: t.varchar().notNull(),
		symbol: t.varchar().notNull(),
		decimals: t.integer().notNull(),
		underlyingToken: t.hex().notNull(), // Original token on source chain
		sourceChainId: t.integer().notNull(),
		totalSupply: t.bigint().default(BigInt(0)),
		totalBorrowed: t.bigint().default(BigInt(0)),
		interestRate: t.integer().default(0),
		lastUpdated: t.integer().notNull(),
		isActive: t.boolean().default(true),
	}),
	table => ({
		chainIdIdx: index().on(table.chainId),
		addressIdx: index().on(table.address),
		symbolIdx: index().on(table.symbol),
		underlyingTokenIdx: index().on(table.underlyingToken),
		sourceChainIdIdx: index().on(table.sourceChainId),
		isActiveIdx: index().on(table.isActive),
		addressChainIdx: index().on(table.address, table.chainId),
	})
);

// Yield accrual tracking
export const yieldAccruals = onchainTable(
	"yield_accruals",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		token: t.hex().notNull(),
		yieldType: t.varchar().notNull(), // "LENDING", "BORROWING"
		accrualAmount: t.bigint().notNull(),
		interestRate: t.integer().notNull(),
		timestamp: t.integer().notNull(),
		blockNumber: t.bigint().notNull(),
		cumulativeYield: t.bigint().notNull(), // Cumulative yield for this position
	}),
	table => ({
		userIdx: index().on(table.user),
		chainIdIdx: index().on(table.chainId),
		tokenIdx: index().on(table.token),
		yieldTypeIdx: index().on(table.yieldType),
		timestampIdx: index().on(table.timestamp),
		userTokenIdx: index().on(table.user, table.token),
		userYieldTypeIdx: index().on(table.user, table.yieldType),
		tokenYieldTypeIdx: index().on(table.token, table.yieldType),
		cumulativeYieldIdx: index().on(table.cumulativeYield),
	})
);

// Liquidation events tracking
export const liquidations = onchainTable(
	"liquidations",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		liquidatedUser: t.hex().notNull(),
		liquidator: t.hex().notNull(),
		collateralToken: t.hex().notNull(),
		debtToken: t.hex().notNull(),
		collateralAmount: t.bigint().notNull(),
		debtAmount: t.bigint().notNull(),
		healthFactor: t.bigint().notNull(), // Health factor at liquidation
		liquidationBonus: t.integer(), // Bonus percentage in basis points
		protocolFee: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		transactionId: t.text().notNull(),
		blockNumber: t.bigint().notNull(),
		price: t.bigint().notNull(), // Price at liquidation
	}),
	table => ({
		liquidatedUserIdx: index().on(table.liquidatedUser),
		liquidatorIdx: index().on(table.liquidator),
		chainIdIdx: index().on(table.chainId),
		collateralTokenIdx: index().on(table.collateralToken),
		debtTokenIdx: index().on(table.debtToken),
		timestampIdx: index().on(table.timestamp),
		transactionIdx: index().on(table.transactionId),
		healthFactorIdx: index().on(table.healthFactor),
		liquidatedUserTimestampIdx: index().on(table.liquidatedUser, table.timestamp),
		liquidatorTimestampIdx: index().on(table.liquidator, table.timestamp),
		tokenPairIdx: index().on(table.collateralToken, table.debtToken),
	})
);

// Oracle price feeds
export const oraclePrices = onchainTable(
	"oracle_prices",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		token: t.hex().notNull(),
		price: t.bigint().notNull(),
		decimals: t.integer().notNull(),
		timestamp: t.integer().notNull(),
		blockNumber: t.bigint().notNull(),
		source: t.varchar().notNull(), // "CHAINLINK", "TWAP", "MANUAL"
		confidence: t.bigint(), // Price confidence interval
	}),
	table => ({
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		timestampIdx: index().on(table.timestamp),
		sourceIdx: index().on(table.source),
		tokenChainIdx: index().on(table.token, table.chainId),
		tokenTimestampIdx: index().on(table.token, table.timestamp),
	})
);

// Asset configurations for lending
export const assetConfigurations = onchainTable(
	"asset_configurations",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		token: t.hex().notNull(),
		collateralFactor: t.integer().notNull(), // in basis points (e.g., 7500 = 75%)
		liquidationThreshold: t.integer().notNull(), // in basis points
		liquidationBonus: t.integer().notNull(), // in basis points
		reserveFactor: t.integer().notNull(), // in basis points
		timestamp: t.integer().notNull(),
		blockNumber: t.bigint().notNull(),
		isActive: t.boolean().default(true),
	}),
	table => ({
		tokenIdx: index().on(table.token),
		chainIdIdx: index().on(table.chainId),
		isActiveIdx: index().on(table.isActive),
		tokenChainIdx: index().on(table.token, table.chainId),
		tokenActiveIdx: index().on(table.token, table.isActive),
		timestampIdx: index().on(table.timestamp),
	})
);

// Enhanced user statistics with lending
export const userLendingStats = onchainTable(
	"user_lending_stats",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		user: t.hex().notNull(),
		totalSupplied: t.bigint().default(BigInt(0)),
		totalBorrowed: t.bigint().default(BigInt(0)),
		totalRepaid: t.bigint().default(BigInt(0)),
		totalWithdrawn: t.bigint().default(BigInt(0)),
		totalYieldEarned: t.bigint().default(BigInt(0)),
		totalInterestPaid: t.bigint().default(BigInt(0)),
		totalLiquidations: t.integer().default(0),
		totalLiquidatedAmount: t.bigint().default(BigInt(0)),
		averageHealthFactor: t.bigint().default(BigInt(0)),
		firstLendingActivity: t.integer(),
		lastLendingActivity: t.integer(),
		activePositions: t.integer().default(0),
	}),
	table => ({
		userIdx: index().on(table.user),
		chainIdIdx: index().on(table.chainId),
		userChainIdx: index().on(table.user, table.chainId),
		totalSuppliedIdx: index().on(table.totalSupplied),
		totalBorrowedIdx: index().on(table.totalBorrowed),
		activePositionsIdx: index().on(table.activePositions),
		lastLendingActivityIdx: index().on(table.lastLendingActivity),
	})
);

// Pool lending analytics
export const poolLendingStats = onchainTable(
	"pool_lending_stats",
	t => ({
		id: t.text().primaryKey(),
		chainId: t.integer().notNull(),
		poolId: t.hex().notNull(),
		token: t.hex().notNull(),
		totalSupply: t.bigint().default(BigInt(0)),
		totalBorrow: t.bigint().default(BigInt(0)),
		supplyRate: t.integer().default(0),
		borrowRate: t.integer().default(0),
		utilizationRate: t.integer().default(0), // in basis points
		totalYieldGenerated: t.bigint().default(BigInt(0)),
		activeLenders: t.integer().default(0),
		activeBorrowers: t.integer().default(0),
		lastUpdated: t.integer().notNull(),
	}),
	table => ({
		poolIdx: index().on(table.poolId),
		chainIdIdx: index().on(table.chainId),
		tokenIdx: index().on(table.token),
		utilizationRateIdx: index().on(table.utilizationRate),
		lastUpdatedIdx: index().on(table.lastUpdated),
		poolTokenIdx: index().on(table.poolId, table.token),
		poolChainIdx: index().on(table.poolId, table.chainId),
	})
);

// =============================================================
// Enhanced Relations for Lending
// =============================================================

export const lendingPositionsRelations = relations(lendingPositions, ({ one, many }) => ({
	user: one(users, {
		fields: [lendingPositions.user, lendingPositions.chainId],
		references: [users.address, users.chainId],
	}),
	collateralToken: one(currencies, {
		fields: [lendingPositions.collateralToken, lendingPositions.chainId],
		references: [currencies.address, currencies.chainId],
	}),
	debtToken: one(currencies, {
		fields: [lendingPositions.debtToken, lendingPositions.chainId],
		references: [currencies.address, currencies.chainId],
	}),
}));

export const lendingEventsRelations = relations(lendingEvents, ({ one }) => ({
	user: one(users, {
		fields: [lendingEvents.user, lendingEvents.chainId],
		references: [users.address, users.chainId],
	}),
	token: one(currencies, {
		fields: [lendingEvents.token, lendingEvents.chainId],
		references: [currencies.address, currencies.chainId],
	}),
}));

export const syntheticTokensRelations = relations(syntheticTokens, ({ one, many }) => ({
	underlyingToken: one(currencies, {
		fields: [syntheticTokens.underlyingToken, syntheticTokens.sourceChainId],
		references: [currencies.address, currencies.chainId],
	}),
}));

export const liquidationsRelations = relations(liquidations, ({ one }) => ({
	liquidatedUser: one(users, {
		fields: [liquidations.liquidatedUser, liquidations.chainId],
		references: [users.address, users.chainId],
	}),
	liquidator: one(users, {
		fields: [liquidations.liquidator, liquidations.chainId],
		references: [users.address, users.chainId],
	}),
	collateralToken: one(currencies, {
		fields: [liquidations.collateralToken, liquidations.chainId],
		references: [currencies.address, currencies.chainId],
	}),
	debtToken: one(currencies, {
		fields: [liquidations.debtToken, liquidations.chainId],
		references: [currencies.address, currencies.chainId],
	}),
}));

export const userLendingStatsRelations = relations(userLendingStats, ({ one }) => ({
	user: one(users, {
		fields: [userLendingStats.user, userLendingStats.chainId],
		references: [users.address, users.chainId],
	}),
}));

// Simple table for cross-chain message linking - avoids db.find() usage
export const crossChainMessageLinks = onchainTable(
	"cross_chain_message_links",
	t => ({
		messageId: t.text().primaryKey(), // Use messageId as primary key
		sourceTransactionHash: t.text(), // From DISPATCH event
		destinationTransactionHash: t.text(), // From PROCESS event (filled later)
		sourceChainId: t.integer(), // From DISPATCH event
		destinationChainId: t.integer(), // From PROCESS event (filled later)
		sourceTimestamp: t.integer(), // From DISPATCH event
		destinationTimestamp: t.integer(), // From PROCESS event (filled later)
		status: t.varchar().default("SENT"), // "SENT" -> "RELAYED"
	}),
	table => ({
		messageIdIdx: index().on(table.messageId),
		sourceTxHashIdx: index().on(table.sourceTransactionHash),
		destinationTxHashIdx: index().on(table.destinationTransactionHash),
		statusIdx: index().on(table.status),
	})
);
