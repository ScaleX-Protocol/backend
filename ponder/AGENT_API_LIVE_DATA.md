# 🤖 Agent & Policy API - Live Data Summary

## ✅ **Endpoints with Data**

### 1. **Agent Installations** ✅ (1 agent)
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentInstallationss { items { agentTokenId owner { address } templateUsed enabled installedAt } } }"}' \
  | jq '.data.agentInstallationss.items'
```

**Live Data:**
- **Agent Token ID**: 100
- **Owner**: 0x85c67299165117acad97c2c5ecd4e642dfbf727e
- **Template**: conservative
- **Status**: Enabled
- **Installed At**: 1770944402 (Feb 12, 2026)

---

### 2. **Agent Orders** ✅ (1 order)
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ orderss(where: { agentTokenId_gt: \"0\" }) { items { orderId agentTokenId executor userAddress side price quantity status } } }"}' \
  | jq '.data.orderss.items'
```

**Live Data:**
- **Order ID**: 6
- **Agent Token ID**: 100
- **Executor**: 0xfc98c3ed81138d8a5f35b30a3b735cb5362e14dc
- **User**: 0x85C67299165117acAd97C2c5ECD4E642dFbF727E
- **Side**: Buy
- **Price**: 300,000 (0.3 IDRX)
- **Quantity**: 0.01 WETH
- **Status**: OPEN

---

## 📊 **All Available Queries**

### Get User's Agents
```graphql
query {
  agentInstallationss(
    where: {
      owner: "84532-0x85c67299165117acad97c2c5ecd4e642dfbf727e"
    }
  ) {
    items {
      agentTokenId
      templateUsed
      enabled
      installedAt
      owner {
        address
      }
    }
  }
}
```

### Get All Agent Orders
```graphql
query {
  orderss(where: { agentTokenId: "100" }) {
    items {
      orderId
      executor
      side
      price
      quantity
      status
      timestamp
    }
  }
}
```

### Get Orders by Executor
```graphql
query {
  orderss(where: { executor: "0xfc98c3ed81138d8a5f35b30a3b735cb5362e14dc" }) {
    items {
      orderId
      agentTokenId
      userAddress
      side
      price
      quantity
      status
    }
  }
}
```

---

## 🎯 **Status Summary**

| Endpoint | Status | Count | Notes |
|----------|--------|-------|-------|
| **Agent Installations** | ✅ Working | 1 | Agent ID 100 with conservative template |
| **Agent Orders** | ✅ Working | 1 | Buy order for 0.01 WETH @ 0.3 IDRX |
| **Agent Stats** | ⏳ Ready | 0 | Will populate with more activity |
| **Agent Lending** | ⏳ Ready | 0 | No lending activity yet |
| **Circuit Breakers** | ⏳ Ready | 0 | No violations (good!) |
| **Policy Violations** | ⏳ Ready | 0 | No violations (good!) |

---

## 📝 **Quick Test Commands**

### Get all agents
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentInstallationss { items { agentTokenId templateUsed enabled installedAt owner { address } } } }"}' \
  | jq '.'
```

### Get all agent orders
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ orderss(where: { agentTokenId_gt: \"0\" }) { items { orderId agentTokenId executor status } } }"}' \
  | jq '.'
```

### Get specific agent details
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentInstallationss(where: { agentTokenId: \"100\" }) { items { agentTokenId owner { address } templateUsed enabled installedAt uninstalledAt } } }"}' \
  | jq '.'
```

---

## ✅ **Complete System Status**

🎉 **All agent tracking is fully functional:**
- ✅ Agent installations indexed from blockchain (historical events captured)
- ✅ Agent orders tracked with executor information
- ✅ GraphQL API endpoints working
- ✅ Historical data captured from block 36,880,100+
- ✅ Real-time indexing active
- ✅ Agent event handlers registered and working

**API Endpoints:**
- **GraphQL API**: http://localhost:42070/graphql
- **Interactive Playground**: http://localhost:42070/
- **Health Check**: http://localhost:42070/health

**Indexed Data:**
- **Start Block**: 36,880,100
- **Current Block**: 37,602,500+ (realtime)
- **Agents Found**: 1 (Agent ID 100)
- **Agent Orders**: 1 (Order ID 6)

---

## 🚀 **Next Steps**

To see more data populate:
1. Place more agent orders → will appear in `orderss` with `agentTokenId > 0`
2. Use agent lending features → will populate `agentLendingEventss`
3. Trigger policy violations → will populate `agentPolicyViolationss` (if any)

All endpoints are ready and will automatically populate as more on-chain activity occurs!
