import { ponder } from "ponder:registry";
import * as orderBookHandler from "../src/handlers/orderBookHandler";
import * as poolManagerHandler from "../src/handlers/poolManagerHandler";
import * as balanceManagerHandler from "../src/handlers/balanceManagerHandler";
import * as crossChainHandler from "../src/handlers/crossChainHandler";
import * as tokenRegistryHandler from "../src/handlers/tokenRegistryHandler";
import * as lendingManagerHandler from "../src/handlers/lendingManagerHandler";
import * as oracleHandler from "../src/handlers/oracleHandler";
import { PonderEvents } from "../src/types/ponder-core-chain";

// Pool Manager Events
ponder.on(PonderEvents.POOL_CREATED, poolManagerHandler.handlePoolCreated);

// Balance Manager Events
ponder.on(PonderEvents.DEPOSIT, balanceManagerHandler.handleDeposit);
ponder.on(PonderEvents.WITHDRAWAL, balanceManagerHandler.handleWithdrawal);
ponder.on(PonderEvents.TRANSFER_FROM, balanceManagerHandler.handleTransferFrom);
ponder.on(PonderEvents.TRANSFER_LOCKED_FROM, balanceManagerHandler.handleTransferLockedFrom);
ponder.on(PonderEvents.LOCK, balanceManagerHandler.handleLock);
ponder.on(PonderEvents.UNLOCK, balanceManagerHandler.handleUnlock);

// Order Book Events
ponder.on(PonderEvents.ORDER_PLACED, orderBookHandler.handleOrderPlaced);
ponder.on(PonderEvents.ORDER_MATCHED, orderBookHandler.handleOrderMatched);
ponder.on(PonderEvents.ORDER_CANCELLED, orderBookHandler.handleOrderCancelled);
ponder.on(PonderEvents.UPDATE_ORDER, orderBookHandler.handleUpdateOrder);

// Hyperlane Mailbox Events (cross-chain message processing)
ponder.on(PonderEvents.HYPERLANEMAILBOX_DISPATCH_ID, crossChainHandler.handleHyperlaneMailboxDispatchId);
ponder.on(PonderEvents.HYPERLANEMAILBOX_PROCESS_ID, crossChainHandler.handleHyperlaneMailboxProcessId);

// TokenRegistry Events (cross-chain token mapping)
ponder.on(PonderEvents.TOKEN_MAPPING_REGISTERED, tokenRegistryHandler.handleTokenMappingRegistered);
ponder.on(PonderEvents.TOKEN_MAPPING_UPDATED, tokenRegistryHandler.handleTokenMappingUpdated);
ponder.on(PonderEvents.TOKEN_MAPPING_REMOVED, tokenRegistryHandler.handleTokenMappingRemoved);
ponder.on(PonderEvents.TOKEN_STATUS_CHANGED, tokenRegistryHandler.handleTokenStatusChanged);
ponder.on(PonderEvents.TOKEN_OWNERSHIP_TRANSFERRED, tokenRegistryHandler.handleOwnershipTransferred);
ponder.on(PonderEvents.TOKEN_INITIALIZED, tokenRegistryHandler.handleInitialized);

// LendingManager Events - Testing one by one
ponder.on(PonderEvents.LENDING_MANAGER_SUPPLY, lendingManagerHandler.handleSupply);
ponder.on(PonderEvents.LENDING_MANAGER_BORROW, lendingManagerHandler.handleBorrow);
ponder.on(PonderEvents.LENDING_MANAGER_REPAY, lendingManagerHandler.handleRepay);
ponder.on(PonderEvents.LENDING_MANAGER_WITHDRAW, lendingManagerHandler.handleWithdraw);
ponder.on(PonderEvents.LENDING_MANAGER_LIQUIDATION, lendingManagerHandler.handleLiquidation);
ponder.on(PonderEvents.LENDING_MANAGER_ASSET_CONFIGURED, lendingManagerHandler.handleAssetConfigured);

// Oracle Events - Temporarily disabled due to telemetry issue
ponder.on(PonderEvents.ORACLE_PRICE_UPDATED, oracleHandler.handleOraclePriceUpdate);

console.log("✅ Core Chain indexer initialized - Chain ID: 84532");
console.log("📊 Monitoring: OrderBook, PoolManager, Hyperlane cross-chain events, TokenRegistry mappings");
console.log("🏦 Monitoring: LendingManager and Oracle events for lending protocol data");