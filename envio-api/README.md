# Envio API

A high-performance REST API for querying aggregated blockchain data from the Envio indexer. Built with Elysia and Bun for maximum performance.

## 🚀 Features

- ⚡ **Blazing Fast** - Built with [Elysia](https://elysiajs.com/) and [Bun](https://bun.sh/)
- 📊 **Complete Market Data** - Prices, order book depth, trades, candlestick charts
- 📈 **OHLCV Candlesticks** - Multiple intervals (1m, 5m, 30m, 1h, 1d)
- 💰 **Account Balances** - Real-time balance tracking
- 🪙 **Currency Info** - Token metadata and information
- 💧 **Faucet Integration** - Token and native token faucet with rate limiting
- 🔄 **Trading Endpoints** - Order management and trade history
- 🔍 **OpenAPI/Swagger** - Interactive API documentation
- 📈 **OpenTelemetry** - Built-in observability
- 🗄️ **Drizzle ORM** - Type-safe database queries
- 🔒 **CORS Enabled** - Ready for frontend integration
- ✅ **Comprehensive Tests** - 35+ automated test cases
- 🗄️ **Dual Database Architecture** - Separate databases for indexer and faucet data

## 📚 Documentation

- 🚀 **[Quick Start Guide](QUICK_START.md)** - Get started in 5 minutes
- 🧪 **[Testing Guide](TESTING.md)** - Complete testing documentation
- 🏃 **[Run Tests](RUN_TESTS.md)** - Simple test instructions
- 📖 **[API Reference](API_ENDPOINTS.md)** - Complete endpoint documentation
- 📝 **[Update Summary](UPDATE_SUMMARY.md)** - What's new and changed

## 🎯 Quick Start

### 1. Prerequisites

- ✅ [Bun](https://bun.sh/) runtime installed
- ✅ PostgreSQL database running
- ✅ Envio indexer running with aggregation handlers

### 2. Install Dependencies

```bash
cd D:/Workdir/envio-api
bun install
```

### 3. Configure Database

Copy and update the environment configuration:

```bash
cp .env.example .env
```

Update the database connections in your `.env`:

```bash
# Primary database for envio indexer data (trading, markets, currencies)
ENVIO_DATABASE_URL=postgresql://postgres:password@localhost:5432/envio

# Secondary database for faucet functionality (requests, rate limiting)
FAUCET_DATABASE_URL=postgresql://postgres:password@localhost:5435/envio_faucet

# Faucet configuration
FAUCET_PRIVATE_KEY=your_private_key_here
FAUCET_DEFAULT_AMOUNT=1000
FAUCET_NATIVE_AMOUNT=0.01
```

**Two databases are required:**
1. **Envio Database** - Contains blockchain indexer data (orders, trades, markets)
2. **Faucet Database** - Contains faucet requests and rate limiting data

### 4. Verify Data

Check that the Envio indexer has created aggregated data:

```bash
bun run verify
```

### 5. Start Server

```bash
bun run dev
```

The API will be available at:
- **API:** http://localhost:3000
- **Swagger Docs:** http://localhost:3000/docs
- **Health Check:** http://localhost:3000/health

### 6. Test All Endpoints

In a separate terminal:

```bash
bun test
```

See **[RUN_TESTS.md](RUN_TESTS.md)** for detailed testing instructions.

## 📊 Available Endpoints

### System
- `GET /` - API information
- `GET /health` - Health check

### Market Data
- `GET /api/pairs` - Get all trading pairs
- `GET /api/markets` - Get all markets
- `GET /api/ticker/price` - Get current price
- `GET /api/ticker/24hr` - Get 24-hour statistics

### Order Book & Trading
- `GET /api/depth` - Get order book depth
- `GET /api/trades` - Get recent trades

### Candlestick Data (OHLCV)
- `GET /api/klines` - Get candlestick data
  - Intervals: `1m`, `5m`, `30m`, `1h`, `1d`
  - Optional time range filtering

### Trading
- `GET /api/trades/:symbol` - Get trading data for a symbol
- `GET /api/trades/:symbol/orders` - Get user's orders for a symbol
- `GET /api/trades/:symbol/price` - Get current ticker price
- `GET /api/trades/:symbol/ticker` - Get 24hr ticker data
- `GET /api/trades/:symbol/depth` - Get order book depth
- `GET /api/trades/:symbol/history` - Get trade history

### Faucet
- `POST /api/faucet/request` - Request tokens from faucet
- `POST /api/faucet/native-request` - Request native tokens
- `GET /api/faucet/address` - Get faucet address for chain
- `GET /api/faucet/history` - Get faucet request history

### Account & Balances
- `GET /api/account` - Get account balances

### Currencies
- `GET /api/currencies` - Get all registered currencies
- `GET /api/currency` - Get specific currency info

See **[API_ENDPOINTS.md](API_ENDPOINTS.md)** for complete documentation with examples.

## 🗄️ Database Structure

The API uses **dual database architecture** for optimal performance:

### Database 1: Envio Indexer Data
**Tables for blockchain indexer data:**
- **Pool** - Trading pair information
- **Order** - Current order state
- **OrderHistory** - Order state changes
- **OrderBookDepth** - Aggregated order book levels
- **OrderBookTrade** - Trade history
- **Balance** - User balances (available + locked)
- **Currency** - Token information
- **MinuteBucket** - 1-minute OHLCV data
- **FiveMinuteBucket** - 5-minute OHLCV data
- **ThirtyMinuteBucket** - 30-minute OHLCV data
- **HourBucket** - 1-hour OHLCV data
- **DailyBucket** - 1-day OHLCV data

### Database 2: Faucet Functionality
**Tables for faucet and rate limiting:**
- **faucet_requests** - Faucet request tracking
- **faucet_rate_limits** - Rate limiting data

### Connection Configuration
```typescript
// Primary database (envio indexer data)
export const db = drizzle(envioPool, { schema });

// Secondary database (faucet data)  
export const faucetDb = drizzle(faucetPool, { schema: faucetSchema });
```

This separation ensures faucet operations don't impact trading query performance.

## 🧪 Testing

### Verify Database Data

```bash
bun run verify
```

This checks all aggregated tables and shows sample data.

### Run Comprehensive Tests

```bash
# Terminal 1: Start API server
bun run dev

# Terminal 2: Run all tests
bun test
```

**Tests include:**
- ✅ System health checks
- ✅ All market data endpoints
- ✅ Price information (current & 24hr)
- ✅ Order book depth
- ✅ Trade history
- ✅ Candlestick data (all intervals)
- ✅ Order management
- ✅ Account balances
- ✅ Currency information
- ✅ Error handling

**35+ test cases** with detailed validation and reporting.

See **[TESTING.md](TESTING.md)** for complete testing guide.

## 📁 Project Structure

```
envio-api/
├── src/
│   ├── config/          # Configuration (database, app)
│   ├── controllers/     # Request handlers
│   │   ├── market.controller.ts
│   │   └── currency.controller.ts
│   ├── enums/           # Enums and constants
│   ├── routes/          # API route definitions
│   │   ├── market.routes.ts
│   │   └── currency.routes.ts
│   ├── schema/          # Drizzle ORM schemas
│   │   ├── aggregated.ts    # Aggregated entity schemas
│   │   └── index.ts
│   ├── services/        # Business logic
│   │   ├── market.service.ts
│   │   └── currency.service.ts
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   └── index.ts         # Application entry point
├── scripts/             # Utility scripts
│   ├── verify-data.ts           # Check database data
│   ├── test-all-endpoints.ts   # Comprehensive tests
│   └── test-endpoints.ts        # Simple tests
├── API_ENDPOINTS.md     # Complete API reference
├── QUICK_START.md       # Quick start guide
├── TESTING.md           # Testing documentation
├── RUN_TESTS.md         # How to run tests
├── UPDATE_SUMMARY.md    # What's new
└── README.md            # This file
```

## 🔧 Available Scripts

```bash
# Development
bun run dev              # Start dev server with hot reload

# Testing
bun test                 # Run comprehensive endpoint tests
bun run test:simple      # Run simple test suite
bun run verify           # Verify database has aggregated data

# Database
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Run database migrations
bun run db:studio        # Open Drizzle Studio (visual DB browser)
```

## 🌐 API Examples

### Get Current Price

```bash
curl "http://localhost:3000/api/ticker/price?symbol=WETHUSDC"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "price": "1500000000"
  }
}
```

### Get Candlestick Data

```bash
curl "http://localhost:3000/api/klines?symbol=WETHUSDC&interval=1m&limit=100"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "t": 1234567890000,
      "T": 1234567950000,
      "o": "1500.50",
      "h": "1505.75",
      "l": "1498.25",
      "c": "1502.00",
      "v": "1000000.50",
      "q": "1500000000.75",
      "n": 45
    }
  ]
}
```

### Get Account Balances

```bash
curl "http://localhost:3000/api/account?address=0x1234567890123456789012345678901234567890"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x1234567890123456789012345678901234567890",
    "balances": [
      {
        "currency": "WETH",
        "available": "1000000000",
        "locked": "100000000",
        "total": "1100000000"
      }
    ]
  }
}
```

### Get All Currencies

```bash
curl "http://localhost:3000/api/currencies"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "0x...",
      "address": "0x...",
      "name": "Wrapped Ether",
      "symbol": "WETH",
      "decimals": 18,
      "isActive": true
    }
  ]
}
```

## 🎨 Supported Trading Pairs

- **WETH/USDC** - `0x58013521Ba2D0FdfDC4763313Ae4e61A4dD9438e`
- **WBTC/USDC** - `0x66b50d56c4275e59dAC301f51E3906C5391c7131`

Symbol format: `WETHUSDC` or `WETH/USDC` (both work)

To add more pools, update `POOL_ADDRESSES` in `src/services/market.service.ts`.

## ⏱️ Candlestick Intervals

| Interval | Description | Table |
|----------|-------------|-------|
| `1m` | 1 minute | MinuteBucket |
| `5m` | 5 minutes | FiveMinuteBucket |
| `30m` | 30 minutes | ThirtyMinuteBucket |
| `1h` | 1 hour | HourBucket |
| `1d` | 1 day | DailyBucket |

## 🔍 Data Aggregation

The Envio indexer implements aggregation handlers that:

1. **Process raw blockchain events** (OrderPlaced, OrderMatched, etc.)
2. **Aggregate data in real-time** into queryable tables
3. **Calculate derived data** (order book depth, OHLCV candles)
4. **Maintain state** (current order status, user balances)

This is similar to how Ponder works, providing a clean API over complex blockchain data.

## 🛠️ Technologies

- **[Elysia](https://elysiajs.com/)** - Fast web framework for Bun
- **[Bun](https://bun.sh/)** - High-performance JavaScript runtime
- **[Drizzle ORM](https://orm.drizzle.team/)** - Type-safe database ORM
- **[PostgreSQL](https://www.postgresql.org/)** - Reliable database
- **TypeScript** - Type safety and better DX
- **OpenAPI/Swagger** - API documentation
- **OpenTelemetry** - Observability and monitoring

## 📈 Performance

- **Average response time:** < 100ms for most queries
- **Concurrent requests:** Handles 1000+ req/s
- **Database optimization:** Uses indexes on frequently queried fields
- **Caching ready:** Compatible with Redis caching (future enhancement)

## 🐛 Troubleshooting

### No data in responses

**Check if data exists:**
```bash
bun run verify
```

**Solution:**
1. Ensure Envio indexer is running
2. Wait for blockchain events to sync
3. Verify aggregation handlers are configured

### Database connection errors

**Check connection:**
```bash
# Update credentials in src/config/database.ts
psql -h localhost -U postgres -d envio
```

### Tests failing

**Check server is running:**
```bash
curl http://localhost:3000/health
```

**See:** [TESTING.md](TESTING.md) for detailed troubleshooting.

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- [ ] Add more trading pair support
- [ ] Implement caching layer (Redis)
- [ ] Add WebSocket support for real-time updates
- [ ] Add rate limiting
- [ ] Add authentication/API keys
- [ ] Add more candlestick intervals

## 📄 License

MIT

## 🔗 Related Projects

- **Envio Indexer:** `D:/Workdir/envio-indexer`
- **Ponder Indexer:** `D:/Workdir/indexer` (reference implementation)

---

**Made with ❤️ using Bun and Elysia**

For questions or issues, please open a GitHub issue or contact the team.
