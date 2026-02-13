# 🤖 Agent & Policy GraphQL API Endpoints

## Base URL
```
http://localhost:42070/graphql
```

## GraphQL Playground (Browser)
```
http://localhost:42070/
```

---

## 📋 **1. Agent Installations**

### Get All Agents
```graphql
query {
  agentInstallationss(limit: 100, orderBy: "installedAt", orderDirection: "desc") {
    items {
      id
      chainId
      owner {
        id
        address
      }
      agentTokenId
      templateUsed
      enabled
      installedAt
      uninstalledAt
      transactionId
      blockNumber
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
  }
}
```

### Get User's Agents
```graphql
query {
  agentInstallationss(
    where: {
      owner: "84532-0x85C67299165117acAd97C2c5ECD4E642dFbF727E"
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

### Get Active Agents Only
```graphql
query {
  agentInstallationss(
    where: {
      enabled: true
      uninstalledAt: 0
    }
  ) {
    items {
      agentTokenId
      owner {
        address
      }
      templateUsed
      installedAt
    }
  }
}
```

### Get Specific Agent by Token ID
```graphql
query {
  agentInstallationss(where: { agentTokenId: "100" }) {
    items {
      id
      agentTokenId
      owner {
        address
      }
      templateUsed
      enabled
      installedAt
      uninstalledAt
    }
  }
}
```

---

## 📊 **2. Agent Orders**

### Get All Agent Orders
```graphql
query {
  orderss(
    where: { agentTokenId_gt: "0" }
    limit: 100
    orderBy: "timestamp"
    orderDirection: "desc"
  ) {
    items {
      orderId
      userAddress
      agentTokenId
      executor
      side
      price
      quantity
      status
      type
      timestamp
    }
  }
}
```

### Get Orders by Specific Agent
```graphql
query {
  orderss(where: { agentTokenId: "100" }) {
    items {
      orderId
      userAddress
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

### Get Orders by Executor Address
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

## 🛡️ **3. Agent Stats & Performance**

### Get Agent Statistics
```graphql
query {
  agentStatss(where: { agentTokenId: "100" }) {
    items {
      agentTokenId
      owner {
        address
      }
      totalOrders
      totalTrades
      totalVolume
      totalBorrows
      totalRepays
      lastActivityTimestamp
    }
  }
}
```

---

## 🚨 **4. Agent Circuit Breakers**

### Get Circuit Breaker Events
```graphql
query {
  agentCircuitBreakerss(
    orderBy: "timestamp"
    orderDirection: "desc"
  ) {
    items {
      id
      agentTokenId
      owner {
        address
      }
      reason
      timestamp
      transactionId
    }
  }
}
```

### Get Circuit Breakers for Specific Agent
```graphql
query {
  agentCircuitBreakerss(where: { agentTokenId: "100" }) {
    items {
      reason
      timestamp
      transactionId
    }
  }
}
```

---

## ⚠️ **5. Agent Policy Violations**

### Get All Policy Violations
```graphql
query {
  agentPolicyViolationss(
    orderBy: "timestamp"
    orderDirection: "desc"
  ) {
    items {
      id
      agentTokenId
      owner {
        address
      }
      violationType
      details
      timestamp
      transactionId
    }
  }
}
```

### Get Violations for Specific Agent
```graphql
query {
  agentPolicyViolationss(where: { agentTokenId: "100" }) {
    items {
      violationType
      details
      timestamp
    }
  }
}
```

---

## 💰 **6. Agent Lending Events**

### Get Agent Lending Activity
```graphql
query {
  agentLendingEventss(
    where: { agentTokenId: "100" }
    orderBy: "timestamp"
    orderDirection: "desc"
  ) {
    items {
      id
      agentTokenId
      owner {
        address
      }
      eventType
      asset
      amount
      timestamp
      transactionId
    }
  }
}
```

---

## 🔍 **Common Filter Patterns**

### By User Address (Owner)
```graphql
where: {
  owner: "84532-0x85C67299165117acAd97C2c5ECD4E642dFbF727E"
}
```

### By Agent Token ID
```graphql
where: {
  agentTokenId: "100"
}
```

### By Time Range
```graphql
where: {
  timestamp_gte: 1707800000
  timestamp_lte: 1707900000
}
```

### Active Agents Only
```graphql
where: {
  enabled: true
  uninstalledAt: 0
}
```

---

## 📝 **cURL Examples**

### Get All Agents
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentInstallationss(limit: 100) { items { agentTokenId owner { address } templateUsed enabled installedAt } } }"}' \
  | jq '.'
```

### Get User's Agents
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ agentInstallationss(where: { owner: \"84532-0x85C67299165117acAd97C2c5ECD4E642dFbF727E\" }) { items { agentTokenId templateUsed enabled } } }"}' \
  | jq '.'
```

### Get Agent Orders (Working Example)
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ orderss(where: { agentTokenId: \"100\" }) { items { orderId executor side price quantity status } } }"}' \
  | jq '.'
```

---

## 🎯 **Available Tables**

1. ✅ **agentInstallations** - Agent NFT installations/uninstallations
2. ✅ **agentOrders** - Orders placed by agents
3. ✅ **agentStats** - Aggregated agent performance metrics
4. ✅ **agentLendingEvents** - Agent lending/borrowing activity
5. ✅ **agentCircuitBreakers** - Circuit breaker trigger events
6. ✅ **agentPolicyViolations** - Policy violation events
7. ✅ **orders** - All orders (includes agentTokenId and executor fields)

---

## 📌 **Quick Reference**

### Query All Agent Orders
```bash
curl -s "http://localhost:42070/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ orderss(where: { agentTokenId_gt: \"0\" }) { items { orderId agentTokenId executor userAddress side price quantity status } } }"}' \
  | jq '.'
```

**Current Result:**
```json
{
  "data": {
    "orderss": {
      "items": [
        {
          "orderId": "6",
          "agentTokenId": "100",
          "executor": "0xfc98c3ed81138d8a5f35b30a3b735cb5362e14dc",
          "userAddress": "0x85C67299165117acAd97C2c5ECD4E642dFbF727E",
          "side": "Buy",
          "price": "300000",
          "quantity": "10000000000000000",
          "status": "OPEN"
        }
      ]
    }
  }
}
```

✅ **Agent tracking fully functional!**
