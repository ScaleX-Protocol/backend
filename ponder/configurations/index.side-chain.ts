import { ponder } from "ponder:registry";
import * as crossChainHandler from "../src/handlers/crossChainHandler";
import * as chainBalanceManagerHandler from "../src/handlers/chainBalanceManagerHandler";
import { PonderEvents } from "../src/types/ponder-side-chain";

// Chain Balance Manager Events - PRIMARY SIDE CHAIN FUNCTIONALITY
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_DEPOSIT, chainBalanceManagerHandler.handleDeposit);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_WITHDRAW, chainBalanceManagerHandler.handleWithdraw);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_UNLOCK, chainBalanceManagerHandler.handleUnlock);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_CLAIM, chainBalanceManagerHandler.handleClaim);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_TOKEN_WHITELISTED, chainBalanceManagerHandler.handleTokenWhitelisted);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_TOKEN_REMOVED, chainBalanceManagerHandler.handleTokenRemoved);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_OWNERSHIP_TRANSFERRED, chainBalanceManagerHandler.handleOwnershipTransferred);
ponder.on(PonderEvents.CHAIN_BALANCE_MANAGER_INITIALIZED, chainBalanceManagerHandler.handleInitialized);

// Cross-Chain Events - Hyperlane messaging for side chain
ponder.on(PonderEvents.HYPERLANE_MAILBOX_DISPATCH_ID, crossChainHandler.handleHyperlaneMailboxDispatchId);
ponder.on(PonderEvents.HYPERLANE_MAILBOX_PROCESS_ID, crossChainHandler.handleHyperlaneMailboxProcessId);

console.log("✅ Side Chain indexer initialized - Chain ID: 84532");
console.log("🔗 Monitoring: ChainBalanceManager, Hyperlane cross-chain events");