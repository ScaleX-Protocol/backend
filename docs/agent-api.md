# Agent API Documentation

Base URL: `https://base-sepolia-indexer.scalex.money`

---

## Agent Fields on Order Endpoints

The following standard order endpoints include agent identification fields on every order. Orders placed by an AI agent have `isAgentOrder: true`; regular user orders have `isAgentOrder: false`.

### Added Fields

| Field | Type | Description |
|---|---|---|
| `isAgentOrder` | `boolean` | `true` if this order was placed by an AI agent |
| `agentTokenId` | `string \| null` | ERC-8004 agent token ID (decimal string). `null` if not an agent order |
| `agentExecutor` | `string \| null` | Executor address that submitted the order on behalf of the agent. `null` if not an agent order |

---

## Standard Order Endpoints (with Agent Fields)

### GET /api/allOrders

Returns all orders for a user address, enriched with agent info.

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `address` | Yes | — | User wallet address |
| `symbol` | No | — | Market symbol filter, e.g. `sxWETH/sxIDRX` |
| `limit` | No | `500` | Max results (max: 1000) |

**Example Request**
```
GET /api/allOrders?address=0x27dD1eBE7D826197FD163C134E79502402Fd7cB7&limit=2
```

**Example Response**
```json
[
    {
        "symbol": "sxWETH/sxIDRX",
        "orderId": "5",
        "orderListId": -1,
        "clientOrderId": "3fba2600982d4a08d93a19bec3cd8dd57c1663735a0893dc5b607923f7362b8c",
        "price": "305000",
        "origQty": "10000000000000000",
        "executedQty": "0",
        "cumulativeQuoteQty": "0",
        "status": "OPEN",
        "timeInForce": "GTC",
        "type": "Limit",
        "side": "BUY",
        "stopPrice": "0",
        "icebergQty": "0",
        "time": 1770956708000,
        "updateTime": 1770956708000,
        "isWorking": true,
        "origQuoteOrderQty": "0",
        "isAgentOrder": false,
        "agentTokenId": null,
        "agentExecutor": null
    },
    {
        "symbol": "sxWETH/sxIDRX",
        "orderId": "2",
        "orderListId": -1,
        "clientOrderId": "a2deb7ca525b98d0c97f938913225af0d5dd8795636115520408d65a909c0768",
        "price": "200000",
        "origQty": "3000000000000000",
        "executedQty": "0",
        "cumulativeQuoteQty": "0",
        "status": "OPEN",
        "timeInForce": "GTC",
        "type": "Limit",
        "side": "BUY",
        "stopPrice": "0",
        "icebergQty": "0",
        "time": 1770883994000,
        "updateTime": 1770883994000,
        "isWorking": true,
        "origQuoteOrderQty": "0",
        "isAgentOrder": true,
        "agentTokenId": "0",
        "agentExecutor": "0x2dbf9d93e9ec66e9e03fe484256ecc432e5681d3"
    }
]
```

---

### GET /api/openOrders

Returns open (unfilled / partially filled) orders for a user address, enriched with agent info.

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `address` | Yes | — | User wallet address |
| `symbol` | No | — | Market symbol filter, e.g. `sxWETH/sxIDRX` |

**Example Request**
```
GET /api/openOrders?address=0x27dD1eBE7D826197FD163C134E79502402Fd7cB7
```

**Example Response**
```json
[
    {
        "symbol": "sxWETH/sxIDRX",
        "orderId": "5",
        "orderListId": -1,
        "clientOrderId": "3fba2600982d4a08d93a19bec3cd8dd57c1663735a0893dc5b607923f7362b8c",
        "price": "305000",
        "origQty": "10000000000000000",
        "executedQty": "0",
        "cumulativeQuoteQty": "0",
        "status": "OPEN",
        "timeInForce": "GTC",
        "type": "Limit",
        "side": "BUY",
        "stopPrice": "0",
        "icebergQty": "0",
        "time": 1770956708000,
        "updateTime": 1770956708000,
        "isWorking": true,
        "origQuoteOrderQty": "0",
        "isAgentOrder": false,
        "agentTokenId": null,
        "agentExecutor": null
    },
    {
        "symbol": "sxWETH/sxIDRX",
        "orderId": "2",
        "orderListId": -1,
        "clientOrderId": "a2deb7ca525b98d0c97f938913225af0d5dd8795636115520408d65a909c0768",
        "price": "200000",
        "origQty": "3000000000000000",
        "executedQty": "0",
        "cumulativeQuoteQty": "0",
        "status": "OPEN",
        "timeInForce": "GTC",
        "type": "Limit",
        "side": "BUY",
        "stopPrice": "0",
        "icebergQty": "0",
        "time": 1770883994000,
        "updateTime": 1770883994000,
        "isWorking": true,
        "origQuoteOrderQty": "0",
        "isAgentOrder": true,
        "agentTokenId": "0",
        "agentExecutor": "0x2dbf9d93e9ec66e9e03fe484256ecc432e5681d3"
    }
]
```

---

## Agent-Specific Endpoints

### GET /api/agents

List all installed AI agents for an owner. Each agent includes its full policy inline.

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `owner` | No | — | Filter by owner wallet address |
| `chainId` | No | `84532` | Chain ID (84532 = Base Sepolia) |
| `enabled` | No | — | Filter by enabled status: `true` / `false` |
| `limit` | No | `50` | Max results (max: 100) |
| `offset` | No | `0` | Pagination offset |

**Example Request**
```
GET /api/agents?owner=0x27dD1eBE7D826197FD163C134E79502402Fd7cB7
```

**Example Response**
```json
{
    "success": true,
    "data": [
        {
            "id": "84532-0x27dD1eBE7D826197FD163C134E79502402Fd7cB7-0",
            "chainId": 84532,
            "owner": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7",
            "agentTokenId": "0",
            "templateUsed": "custom",
            "enabled": true,
            "installedAt": 1771493634,
            "uninstalledAt": 1771494198,
            "transactionId": "0x7d23ab4d2b3f44018e4143d3ed15e59b3bd6626fdbf803744120c95243ea5c0c",
            "blockNumber": "37862673",
            "policy": {
                "templateUsed": "custom",
                "enabled": true,
                "installedAt": "1771493634",
                "expiryTimestamp": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
                "lastUpdatedAt": 1771494200,
                "maxOrderSize": "340282366920938463463374607431768211455",
                "minOrderSize": "0",
                "whitelistedTokens": [],
                "blacklistedTokens": [],
                "allowMarketOrders": true,
                "allowLimitOrders": true,
                "allowSwap": true,
                "allowBorrow": true,
                "allowRepay": true,
                "allowSupplyCollateral": true,
                "allowWithdrawCollateral": true,
                "allowPlaceLimitOrder": true,
                "allowCancelOrder": true,
                "allowBuy": true,
                "allowSell": true,
                "allowAutoBorrow": true,
                "maxAutoBorrowAmount": "5000000000",
                "allowAutoRepay": true,
                "minDebtToRepay": "100000000",
                "minHealthFactor": "1300000000000000000",
                "maxSlippageBps": "500",
                "minTimeBetweenTrades": "60",
                "emergencyRecipient": "0x0000000000000000000000000000000000000000",
                "dailyVolumeLimit": "0",
                "weeklyVolumeLimit": "0",
                "maxDailyDrawdown": "0",
                "maxWeeklyDrawdown": "0",
                "maxTradeVsTVLBps": "0",
                "minWinRateBps": "0",
                "minSharpeRatio": "0",
                "maxPositionConcentrationBps": "0",
                "maxCorrelationBps": "10000",
                "maxTradesPerDay": "0",
                "maxTradesPerHour": "0",
                "tradingStartHour": "0",
                "tradingEndHour": "23",
                "minReputationScore": "0",
                "useReputationMultiplier": false,
                "requiresChainlinkFunctions": false
            }
        }
    ],
    "count": 1,
    "pagination": {
        "limit": 50,
        "offset": 0
    }
}
```

---

### GET /api/agents/:agentTokenId

Get a specific agent with its policy.

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID (decimal string) |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `owner` | No | — | Filter by owner address (useful when same agentTokenId exists across multiple owners) |
| `chainId` | No | `84532` | Chain ID |

**Example Request**
```
GET /api/agents/0?owner=0x27dD1eBE7D826197FD163C134E79502402Fd7cB7
```

**Example Response**
```json
{
    "success": true,
    "data": {
        "id": "84532-0x27dD1eBE7D826197FD163C134E79502402Fd7cB7-0",
        "chainId": 84532,
        "owner": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7",
        "agentTokenId": "0",
        "templateUsed": "custom",
        "enabled": true,
        "installedAt": 1771493634,
        "uninstalledAt": 1771494198,
        "transactionId": "0x7d23ab4d2b3f44018e4143d3ed15e59b3bd6626fdbf803744120c95243ea5c0c",
        "blockNumber": "37862673",
        "policy": {
            "templateUsed": "custom",
            "enabled": true,
            "installedAt": "1771493634",
            "expiryTimestamp": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            "lastUpdatedAt": 1771494200,
            "maxOrderSize": "340282366920938463463374607431768211455",
            "minOrderSize": "0",
            "whitelistedTokens": [],
            "blacklistedTokens": [],
            "allowMarketOrders": true,
            "allowLimitOrders": true,
            "allowSwap": true,
            "allowBorrow": true,
            "allowRepay": true,
            "allowSupplyCollateral": true,
            "allowWithdrawCollateral": true,
            "allowPlaceLimitOrder": true,
            "allowCancelOrder": true,
            "allowBuy": true,
            "allowSell": true,
            "allowAutoBorrow": true,
            "maxAutoBorrowAmount": "5000000000",
            "allowAutoRepay": true,
            "minDebtToRepay": "100000000",
            "minHealthFactor": "1300000000000000000",
            "maxSlippageBps": "500",
            "minTimeBetweenTrades": "60",
            "emergencyRecipient": "0x0000000000000000000000000000000000000000",
            "dailyVolumeLimit": "0",
            "weeklyVolumeLimit": "0",
            "maxDailyDrawdown": "0",
            "maxWeeklyDrawdown": "0",
            "maxTradeVsTVLBps": "0",
            "minWinRateBps": "0",
            "minSharpeRatio": "0",
            "maxPositionConcentrationBps": "0",
            "maxCorrelationBps": "10000",
            "maxTradesPerDay": "0",
            "maxTradesPerHour": "0",
            "tradingStartHour": "0",
            "tradingEndHour": "23",
            "minReputationScore": "0",
            "useReputationMultiplier": false,
            "requiresChainlinkFunctions": false
        }
    }
}
```

---

### GET /api/agents/:agentTokenId/orders

Get raw order records placed by a specific agent (from `orders` table, includes `agentTokenId` column).

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `chainId` | No | `84532` | Chain ID |
| `status` | No | — | Filter by status: `OPEN`, `FILLED`, `CANCELLED`, `PARTIALLY_FILLED` |
| `limit` | No | `50` | Max results (max: 100) |
| `offset` | No | `0` | Pagination offset |

**Example Request**
```
GET /api/agents/0/orders
```

**Example Response**
```json
{
    "success": true,
    "data": [
        {
            "id": "3fba2600982d4a08d93a19bec3cd8dd57c1663735a0893dc5b607923f7362b8c",
            "chainId": 84532,
            "poolId": "0x629a14ee7dc9d29a5eb676fbcef94e989bc0dea1",
            "orderId": "5",
            "transactionId": "0x138abe8f16a02f41432b436a1997c9fbfcd1ab2f254746add61a44ee5b9663da",
            "userAddress": "0x27dD1eBE7D826197FD163C134E79502402Fd7cB7",
            "side": "Buy",
            "timestamp": 1770956708,
            "price": "305000",
            "quantity": "10000000000000000",
            "filled": "0",
            "type": "Limit",
            "status": "OPEN",
            "expiry": 1778732708,
            "autoRepay": false,
            "autoBorrow": false,
            "timeInForce": "GTC",
            "quoteQuantity": "3050000000000000000000",
            "executedQuoteQuantity": "0",
            "agentTokenId": "0",
            "executor": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7"
        }
    ],
    "count": 1,
    "pagination": {
        "limit": 50,
        "offset": 0
    }
}
```

---

### GET /api/agents/:agentTokenId/stats

Get trading statistics for a specific agent.

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `chainId` | No | `84532` | Chain ID |

**Example Request**
```
GET /api/agents/0/stats
```

**Example Response**
```json
{
    "success": true,
    "data": {
        "agentStats": {
            "id": "84532-0x27dD1eBE7D826197FD163C134E79502402Fd7cB7-0",
            "chainId": 84532,
            "owner": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7",
            "agentTokenId": "0",
            "totalMarketOrders": 0,
            "totalLimitOrders": 2,
            "totalOrdersCancelled": 0,
            "totalTradingVolume": "0",
            "totalBorrowAmount": "0",
            "totalRepayAmount": "0",
            "totalCollateralSupplied": "0",
            "totalCollateralWithdrawn": "0",
            "firstActivityTimestamp": 1771493634,
            "lastActivityTimestamp": 1771496064,
            "isActive": false
        },
        "ordersByStatus": {
            "OPEN": 4
        }
    }
}
```

---

### GET /api/agents/:agentTokenId/policy

Get policies for a specific agent. Because an agent NFT can be installed by **many different users** — each with their own independent policy — this endpoint returns different shapes depending on whether `owner` is provided:

- **Without `owner`**: returns a list of all policies for this agent (one per user who installed it)
- **With `owner`**: returns the single policy for that specific user's installation

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `owner` | No | — | Scope to a specific user's policy. Returns a single object instead of a list |
| `chainId` | No | `84532` | Chain ID |
| `limit` | No | `50` | Max results when listing (no `owner`). Max: 100 |
| `offset` | No | `0` | Pagination offset when listing |

**Example Request — all users' policies for agent 0**
```
GET /api/agents/0/policy
```

**Example Response (list)**
```json
{
    "success": true,
    "data": [
        {
            "id": "84532-0x27dD1eBE7D826197FD163C134E79502402Fd7cB7-0",
            "chainId": 84532,
            "owner": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7",
            "agentTokenId": "0",
            "templateUsed": "custom",
            "enabled": true,
            "installedAt": "1771493634",
            "expiryTimestamp": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            "lastUpdatedAt": 1771494200,
            "maxOrderSize": "340282366920938463463374607431768211455",
            "minOrderSize": "0",
            "whitelistedTokens": [],
            "blacklistedTokens": [],
            "allowMarketOrders": true,
            "allowLimitOrders": true,
            "allowSwap": true,
            "allowBorrow": true,
            "allowRepay": true,
            "allowSupplyCollateral": true,
            "allowWithdrawCollateral": true,
            "allowPlaceLimitOrder": true,
            "allowCancelOrder": true,
            "allowBuy": true,
            "allowSell": true,
            "allowAutoBorrow": true,
            "maxAutoBorrowAmount": "5000000000",
            "allowAutoRepay": true,
            "minDebtToRepay": "100000000",
            "minHealthFactor": "1300000000000000000",
            "maxSlippageBps": "500",
            "minTimeBetweenTrades": "60",
            "emergencyRecipient": "0x0000000000000000000000000000000000000000",
            "dailyVolumeLimit": "0",
            "weeklyVolumeLimit": "0",
            "maxDailyDrawdown": "0",
            "maxWeeklyDrawdown": "0",
            "maxTradeVsTVLBps": "0",
            "minWinRateBps": "0",
            "minSharpeRatio": "0",
            "maxPositionConcentrationBps": "0",
            "maxCorrelationBps": "10000",
            "maxTradesPerDay": "0",
            "maxTradesPerHour": "0",
            "tradingStartHour": "0",
            "tradingEndHour": "23",
            "minReputationScore": "0",
            "useReputationMultiplier": false,
            "requiresChainlinkFunctions": false
        }
    ],
    "count": 1,
    "pagination": { "limit": 50, "offset": 0 }
}
```

**Example Request — specific user's policy for agent 0**
```
GET /api/agents/0/policy?owner=0x27dD1eBE7D826197FD163C134E79502402Fd7cB7
```

**Example Response (single)**
```json
{
    "success": true,
    "data": {
        "id": "84532-0x27dD1eBE7D826197FD163C134E79502402Fd7cB7-0",
        "chainId": 84532,
        "owner": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7",
        "agentTokenId": "0",
        "templateUsed": "custom",
        "enabled": true,
        "installedAt": "1771493634",
        "expiryTimestamp": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
        "lastUpdatedAt": 1771494200,
        "maxOrderSize": "340282366920938463463374607431768211455",
        "minOrderSize": "0",
        "whitelistedTokens": [],
        "blacklistedTokens": [],
        "allowMarketOrders": true,
        "allowLimitOrders": true,
        "allowSwap": true,
        "allowBorrow": true,
        "allowRepay": true,
        "allowSupplyCollateral": true,
        "allowWithdrawCollateral": true,
        "allowPlaceLimitOrder": true,
        "allowCancelOrder": true,
        "allowBuy": true,
        "allowSell": true,
        "allowAutoBorrow": true,
        "maxAutoBorrowAmount": "5000000000",
        "allowAutoRepay": true,
        "minDebtToRepay": "100000000",
        "minHealthFactor": "1300000000000000000",
        "maxSlippageBps": "500",
        "minTimeBetweenTrades": "60",
        "emergencyRecipient": "0x0000000000000000000000000000000000000000",
        "dailyVolumeLimit": "0",
        "weeklyVolumeLimit": "0",
        "maxDailyDrawdown": "0",
        "maxWeeklyDrawdown": "0",
        "maxTradeVsTVLBps": "0",
        "minWinRateBps": "0",
        "minSharpeRatio": "0",
        "maxPositionConcentrationBps": "0",
        "maxCorrelationBps": "10000",
        "maxTradesPerDay": "0",
        "maxTradesPerHour": "0",
        "tradingStartHour": "0",
        "tradingEndHour": "23",
        "minReputationScore": "0",
        "useReputationMultiplier": false,
        "requiresChainlinkFunctions": false
    }
}
```

---

### GET /api/policies

Get all policies for a user (one per installed agent).

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `owner` | Yes | — | User wallet address |
| `chainId` | No | `84532` | Chain ID |

**Example Request**
```
GET /api/policies?owner=0x27dD1eBE7D826197FD163C134E79502402Fd7cB7
```

**Example Response**
```json
{
    "success": true,
    "data": [
        {
            "id": "84532-0x27dD1eBE7D826197FD163C134E79502402Fd7cB7-0",
            "chainId": 84532,
            "owner": "0x27dd1ebe7d826197fd163c134e79502402fd7cb7",
            "agentTokenId": "0",
            "templateUsed": "custom",
            "enabled": true,
            "installedAt": "1771493634",
            "expiryTimestamp": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            "lastUpdatedAt": 1771494200,
            "maxOrderSize": "340282366920938463463374607431768211455",
            "minOrderSize": "0",
            "whitelistedTokens": [],
            "blacklistedTokens": [],
            "allowMarketOrders": true,
            "allowLimitOrders": true,
            "allowSwap": true,
            "allowBorrow": true,
            "allowRepay": true,
            "allowSupplyCollateral": true,
            "allowWithdrawCollateral": true,
            "allowPlaceLimitOrder": true,
            "allowCancelOrder": true,
            "allowBuy": true,
            "allowSell": true,
            "allowAutoBorrow": true,
            "maxAutoBorrowAmount": "5000000000",
            "allowAutoRepay": true,
            "minDebtToRepay": "100000000",
            "minHealthFactor": "1300000000000000000",
            "maxSlippageBps": "500",
            "minTimeBetweenTrades": "60",
            "emergencyRecipient": "0x0000000000000000000000000000000000000000",
            "dailyVolumeLimit": "0",
            "weeklyVolumeLimit": "0",
            "maxDailyDrawdown": "0",
            "maxWeeklyDrawdown": "0",
            "maxTradeVsTVLBps": "0",
            "minWinRateBps": "0",
            "minSharpeRatio": "0",
            "maxPositionConcentrationBps": "0",
            "maxCorrelationBps": "10000",
            "maxTradesPerDay": "0",
            "maxTradesPerHour": "0",
            "tradingStartHour": "0",
            "tradingEndHour": "23",
            "minReputationScore": "0",
            "useReputationMultiplier": false,
            "requiresChainlinkFunctions": false
        }
    ],
    "count": 1
}
```

---

### GET /api/agents/:agentTokenId/lending

Get lending activity (borrow, repay, supply, withdraw) for a specific agent.

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `chainId` | No | `84532` | Chain ID |
| `limit` | No | `50` | Max results (max: 100) |
| `offset` | No | `0` | Pagination offset |

**Example Request**
```
GET /api/agents/0/lending
```

**Example Response**
```json
{
    "success": true,
    "data": [],
    "count": 0,
    "pagination": {
        "limit": 50,
        "offset": 0
    }
}
```

---

### GET /api/agents/:agentTokenId/violations

Get policy violations triggered by a specific agent.

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `chainId` | No | `84532` | Chain ID |
| `limit` | No | `50` | Max results (max: 100) |
| `offset` | No | `0` | Pagination offset |

**Example Request**
```
GET /api/agents/0/violations
```

**Example Response**
```json
{
    "success": true,
    "data": [],
    "count": 0,
    "pagination": {
        "limit": 50,
        "offset": 0
    }
}
```

---

### GET /api/agents/:agentTokenId/circuit-breakers

Get circuit breaker events for a specific agent.

**Path Parameters**

| Parameter | Description |
|---|---|
| `agentTokenId` | The agent token ID |

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `chainId` | No | `84532` | Chain ID |
| `limit` | No | `50` | Max results (max: 100) |
| `offset` | No | `0` | Pagination offset |

**Example Request**
```
GET /api/agents/0/circuit-breakers
```

**Example Response**
```json
{
    "success": true,
    "data": [],
    "count": 0,
    "pagination": {
        "limit": 50,
        "offset": 0
    }
}
```

---

### GET /api/agent-orders

Get all orders placed by any agent system-wide (not filtered by user). Filters by `agentTokenId > 0` on the `orders` table.

**Query Parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `chainId` | No | `84532` | Chain ID |
| `executor` | No | — | Filter by executor address |
| `status` | No | — | Filter by status: `OPEN`, `FILLED`, `CANCELLED`, `PARTIALLY_FILLED` |
| `limit` | No | `50` | Max results (max: 100) |
| `offset` | No | `0` | Pagination offset |

**Example Request**
```
GET /api/agent-orders?executor=0x2dbf9d93e9ec66e9e03fe484256ecc432e5681d3
```

**Example Response**
```json
{
    "success": true,
    "data": [],
    "count": 0,
    "pagination": {
        "limit": 50,
        "offset": 0
    }
}
```

---

## Policy Field Reference

| Field | Type | Description |
|---|---|---|
| `templateUsed` | `string` | Template name used at install: `conservative`, `moderate`, `aggressive`, or `custom` |
| `enabled` | `boolean` | Whether the agent is currently allowed to trade |
| `installedAt` | `string` | Unix timestamp when the policy was installed (as decimal string) |
| `expiryTimestamp` | `string` | Unix timestamp when the policy expires. `uint256.max` = never expires |
| `lastUpdatedAt` | `number` | Unix timestamp of the last policy update |
| `maxOrderSize` | `string` | Maximum single order size in quote token base units |
| `minOrderSize` | `string` | Minimum single order size in quote token base units |
| `whitelistedTokens` | `string[]` | Token addresses the agent may trade. Empty = all tokens allowed |
| `blacklistedTokens` | `string[]` | Token addresses the agent may never trade |
| `allowMarketOrders` | `boolean` | Agent may place market orders |
| `allowLimitOrders` | `boolean` | Agent may place limit orders |
| `allowSwap` | `boolean` | Agent may execute swaps |
| `allowBorrow` | `boolean` | Agent may borrow from lending |
| `allowRepay` | `boolean` | Agent may repay debt |
| `allowSupplyCollateral` | `boolean` | Agent may supply collateral |
| `allowWithdrawCollateral` | `boolean` | Agent may withdraw collateral |
| `allowPlaceLimitOrder` | `boolean` | Agent may place limit orders via order book |
| `allowCancelOrder` | `boolean` | Agent may cancel orders |
| `allowBuy` | `boolean` | Agent may place buy orders |
| `allowSell` | `boolean` | Agent may place sell orders |
| `allowAutoBorrow` | `boolean` | Agent may auto-borrow to fund trades |
| `maxAutoBorrowAmount` | `string` | Max amount agent may auto-borrow per operation (base units) |
| `allowAutoRepay` | `boolean` | Agent may auto-repay debt after trades |
| `minDebtToRepay` | `string` | Minimum debt amount to trigger auto-repay (base units) |
| `minHealthFactor` | `string` | Minimum health factor (1e18 = 100%). e.g. `1300000000000000000` = 130% |
| `maxSlippageBps` | `string` | Maximum slippage in basis points. e.g. `500` = 5% |
| `minTimeBetweenTrades` | `string` | Minimum seconds between trades |
| `emergencyRecipient` | `string` | Address to send funds to in an emergency. Zero address if not set |
| `dailyVolumeLimit` | `string` | Max daily trading volume (base units). `0` = no limit |
| `weeklyVolumeLimit` | `string` | Max weekly trading volume (base units). `0` = no limit |
| `maxDailyDrawdown` | `string` | Max daily drawdown in basis points. `0` = no limit |
| `maxWeeklyDrawdown` | `string` | Max weekly drawdown in basis points. `0` = no limit |
| `maxTradeVsTVLBps` | `string` | Max trade size as % of pool TVL in basis points. `0` = no limit |
| `minWinRateBps` | `string` | Minimum required win rate in basis points. `0` = no limit |
| `minSharpeRatio` | `string` | Minimum required Sharpe ratio (scaled by 1e18). `0` = no limit |
| `maxPositionConcentrationBps` | `string` | Max concentration in a single position in basis points. `0` = no limit |
| `maxCorrelationBps` | `string` | Max allowed correlation between positions in basis points |
| `maxTradesPerDay` | `string` | Max trades per day. `0` = no limit |
| `maxTradesPerHour` | `string` | Max trades per hour. `0` = no limit |
| `tradingStartHour` | `string` | UTC hour trading is allowed to start (0–23) |
| `tradingEndHour` | `string` | UTC hour trading must stop (0–23). `23` = end of day |
| `minReputationScore` | `string` | Minimum agent reputation score required. `0` = no requirement |
| `useReputationMultiplier` | `boolean` | Whether limits scale based on reputation score |
| `requiresChainlinkFunctions` | `boolean` | Whether any limit requires off-chain Chainlink compute |

---

## Notes

- All numeric values (prices, quantities, BigInt fields) are returned as **decimal strings** to avoid JavaScript precision loss.
- Default `chainId` is `84532` (Base Sepolia) on all endpoints.
- `agentTokenId` is the ERC-8004 NFT token ID identifying the agent. Token IDs start at `0`.
- `agentExecutor` is the EOA address authorized to submit transactions on behalf of the agent.
- Policy data is indexed from the `PolicyFactory` contract on-chain at install time and updated on every `PolicyUpdated`, `PolicyEnabled`, and `PolicyDisabled` event. Only agents installed after the indexer deployment will have policy data.
