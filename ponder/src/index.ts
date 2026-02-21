import { ponder } from "ponder:registry";
import * as orderBookHandler from "../src/handlers/orderBookHandler";
import * as poolManagerHandler from "../src/handlers/poolManagerHandler";
import * as balanceManagerHandler from "../src/handlers/balanceManagerHandler";
import * as crossChainHandler from "../src/handlers/crossChainHandler";
import * as tokenRegistryHandler from "../src/handlers/tokenRegistryHandler";
import * as lendingManagerHandler from "../src/handlers/lendingManagerHandler";
import * as oracleHandler from "../src/handlers/oracleHandler";
import * as agentRouterHandler from "../src/handlers/agentRouterHandler";
import { PonderEvents } from "../src/types/ponder-core-chain";
import { withEventValidator } from "../src/utils/eventValidator";

// Pool Manager Events
ponder.on(PonderEvents.POOL_CREATED, poolManagerHandler.handlePoolCreated);

// Balance Manager Events - With transaction validation
ponder.on(PonderEvents.DEPOSIT, withEventValidator(balanceManagerHandler.handleDeposit, 'deposit'));
ponder.on(PonderEvents.WITHDRAWAL, withEventValidator(balanceManagerHandler.handleWithdrawal, 'withdrawal'));
ponder.on(PonderEvents.TRANSFER_FROM, withEventValidator(balanceManagerHandler.handleTransferFrom, 'transferFrom'));
ponder.on(PonderEvents.TRANSFER_LOCKED_FROM, withEventValidator(balanceManagerHandler.handleTransferLockedFrom, 'transferLockedFrom'));
ponder.on(PonderEvents.LOCK, withEventValidator(balanceManagerHandler.handleLock, 'lock'));
ponder.on(PonderEvents.UNLOCK, withEventValidator(balanceManagerHandler.handleUnlock, 'unlock'));

// Order Book Events - With transaction validation
ponder.on(PonderEvents.ORDER_PLACED, withEventValidator(orderBookHandler.handleOrderPlaced, 'orderPlaced'));
ponder.on(PonderEvents.ORDER_MATCHED, withEventValidator(orderBookHandler.handleOrderMatched, 'orderMatched'));
// ponder.on(PonderEvents.ORDER_CANCELLED, withEventValidator(orderBookHandler.handleOrderCancelled, 'orderCancelled'));
ponder.on(PonderEvents.UPDATE_ORDER, withEventValidator(orderBookHandler.handleUpdateOrder, 'updateOrder'));

// Hyperlane Mailbox Events - With transaction validation
ponder.on(PonderEvents.HYPERLANEMAILBOX_DISPATCH_ID, withEventValidator(crossChainHandler.handleHyperlaneMailboxDispatchId, 'hyperlaneDispatch'));
ponder.on(PonderEvents.HYPERLANEMAILBOX_PROCESS_ID, withEventValidator(crossChainHandler.handleHyperlaneMailboxProcessId, 'hyperlaneProcess'));

// TokenRegistry Events - With transaction validation
ponder.on(PonderEvents.TOKEN_MAPPING_REGISTERED, withEventValidator(tokenRegistryHandler.handleTokenMappingRegistered, 'tokenMappingRegistered'));
ponder.on(PonderEvents.TOKEN_MAPPING_UPDATED, withEventValidator(tokenRegistryHandler.handleTokenMappingUpdated, 'tokenMappingUpdated'));
ponder.on(PonderEvents.TOKEN_MAPPING_REMOVED, withEventValidator(tokenRegistryHandler.handleTokenMappingRemoved, 'tokenMappingRemoved'));
ponder.on(PonderEvents.TOKEN_STATUS_CHANGED, withEventValidator(tokenRegistryHandler.handleTokenStatusChanged, 'tokenStatusChanged'));
ponder.on(PonderEvents.TOKEN_OWNERSHIP_TRANSFERRED, withEventValidator(tokenRegistryHandler.handleOwnershipTransferred, 'tokenOwnershipTransferred'));
ponder.on(PonderEvents.TOKEN_INITIALIZED, withEventValidator(tokenRegistryHandler.handleInitialized, 'tokenInitialized'));

// LendingManager Events - With transaction validation
ponder.on(PonderEvents.LENDING_MANAGER_SUPPLY, withEventValidator(lendingManagerHandler.handleSupply, 'supply'));
ponder.on(PonderEvents.LENDING_MANAGER_BORROW, withEventValidator(lendingManagerHandler.handleBorrow, 'borrow'));
ponder.on(PonderEvents.LENDING_MANAGER_REPAY, withEventValidator(lendingManagerHandler.handleRepay, 'repay'));
ponder.on(PonderEvents.LENDING_MANAGER_WITHDRAW, withEventValidator(lendingManagerHandler.handleWithdraw, 'withdraw'));
ponder.on(PonderEvents.LENDING_MANAGER_LIQUIDATION, withEventValidator(lendingManagerHandler.handleLiquidation, 'liquidation'));
ponder.on(PonderEvents.LENDING_MANAGER_ASSET_CONFIGURED, withEventValidator(lendingManagerHandler.handleAssetConfigured, 'assetConfigured'));
ponder.on(PonderEvents.LENDING_MANAGER_INTEREST_RATE_PARAMS_SET, withEventValidator(lendingManagerHandler.handleInterestRateParamsSet, 'interestRateParamsSet'));

// Oracle Events
ponder.on(PonderEvents.ORACLE_PRICE_UPDATED, oracleHandler.handleOraclePriceUpdate);

// AI Agent Events - ERC-8004 Agent System
ponder.on(PonderEvents.POLICY_INSTALLED, withEventValidator(agentRouterHandler.handlePolicyInstalled, 'policyInstalled'));
ponder.on(PonderEvents.POLICY_UNINSTALLED, withEventValidator(agentRouterHandler.handlePolicyUninstalled, 'policyUninstalled'));
ponder.on(PonderEvents.STRATEGY_AGENT_AUTHORIZED, withEventValidator(agentRouterHandler.handleStrategyAgentAuthorized, 'strategyAgentAuthorized'));
ponder.on(PonderEvents.STRATEGY_AGENT_REVOKED, withEventValidator(agentRouterHandler.handleStrategyAgentRevoked, 'strategyAgentRevoked'));

ponder.on(PonderEvents.AGENT_SWAP_EXECUTED, withEventValidator(agentRouterHandler.handleAgentSwapExecuted, 'agentSwapExecuted'));
ponder.on(PonderEvents.AGENT_LIMIT_ORDER_PLACED, withEventValidator(agentRouterHandler.handleAgentLimitOrderPlaced, 'agentLimitOrderPlaced'));
ponder.on(PonderEvents.AGENT_ORDER_CANCELLED, withEventValidator(agentRouterHandler.handleAgentOrderCancelled, 'agentOrderCancelled'));
ponder.on(PonderEvents.AGENT_BORROW_EXECUTED, withEventValidator(agentRouterHandler.handleAgentBorrowExecuted, 'agentBorrowExecuted'));
ponder.on(PonderEvents.AGENT_REPAY_EXECUTED, withEventValidator(agentRouterHandler.handleAgentRepayExecuted, 'agentRepayExecuted'));
ponder.on(PonderEvents.AGENT_COLLATERAL_SUPPLIED, withEventValidator(agentRouterHandler.handleAgentCollateralSupplied, 'agentCollateralSupplied'));
ponder.on(PonderEvents.AGENT_COLLATERAL_WITHDRAWN, withEventValidator(agentRouterHandler.handleAgentCollateralWithdrawn, 'agentCollateralWithdrawn'));

// AgentRouter Self-Funded Trading Events (agent trades own capital, no policy constraints)
ponder.on(PonderEvents.AGENT_SELF_TRADE_EXECUTED, withEventValidator(agentRouterHandler.handleAgentSelfTradeExecuted, 'agentSelfTradeExecuted'));
ponder.on(PonderEvents.AGENT_SELF_LIMIT_ORDER_PLACED, withEventValidator(agentRouterHandler.handleAgentSelfLimitOrderPlaced, 'agentSelfLimitOrderPlaced'));
ponder.on(PonderEvents.AGENT_SELF_ORDER_CANCELLED, withEventValidator(agentRouterHandler.handleAgentSelfOrderCancelled, 'agentSelfOrderCancelled'));
ponder.on(PonderEvents.AGENT_SELF_BORROW_EXECUTED, withEventValidator(agentRouterHandler.handleAgentSelfBorrowExecuted, 'agentSelfBorrowExecuted'));
ponder.on(PonderEvents.AGENT_SELF_REPAY_EXECUTED, withEventValidator(agentRouterHandler.handleAgentSelfRepayExecuted, 'agentSelfRepayExecuted'));

// Note: CircuitBreakerTriggered and PolicyViolation events are not in the current AgentRouter ABI
// ponder.on(PonderEvents.CIRCUIT_BREAKER_TRIGGERED, withEventValidator(agentRouterHandler.handleCircuitBreakerTriggered, 'circuitBreakerTriggered'));
// ponder.on(PonderEvents.POLICY_VIOLATION, withEventValidator(agentRouterHandler.handlePolicyViolation, 'policyViolation'));

console.log("✅ Core Chain indexer initialized - Chain ID: 84532");
console.log("📊 Monitoring: OrderBook, PoolManager, Hyperlane cross-chain events, TokenRegistry mappings");
console.log("🏦 Monitoring: LendingManager and Oracle events for lending protocol data");
console.log("🤖 Monitoring: AI Agent system (ERC-8004) - installations, orders, lending, violations");