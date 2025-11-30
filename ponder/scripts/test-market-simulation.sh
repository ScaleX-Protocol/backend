#!/bin/bash

echo "🚀 Testing market data simulation to generate WebSocket messages..."
echo "📊 This will create real trading activity that the indexer will process"
echo ""

# First try to load from local .env file
if [ -f ".env" ]; then
    source .env
    echo "✅ Environment variables loaded from .env"
fi

# Check if CLOB_DEX_PATH is set, otherwise use a relative path
if [ -z "$CLOB_DEX_PATH" ]; then
    # Try to find the directory relative to this script
    CLOB_DEX_PATH="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")/../clob-dex"
    echo "ℹ️  CLOB_DEX_PATH not set in .env, using: $CLOB_DEX_PATH"
fi

# Navigate to the clob-dex directory
cd "$CLOB_DEX_PATH" || { echo "❌ Error: Could not navigate to clob-dex directory: $CLOB_DEX_PATH"; exit 1; }

# Source environment variables from clob-dex directory if they exist
if [ -f ".env" ]; then
    source .env
    echo "✅ Environment variables loaded from clob-dex directory"
else
    echo "⚠️  Warning: .env file not found in clob-dex directory"
fi

echo ""
echo "🔄 Running market simulation cycle..."

echo ""
echo "📝 Step 1: Filling orderbook with limit orders..."
make fill-orderbook

if [ $? -eq 0 ]; then
    echo "✅ Orderbook filled successfully"
    echo "⏳ Waiting 5 seconds for indexer to process..."
    sleep 5
else
    echo "❌ Failed to fill orderbook"
    exit 1
fi

echo ""
echo "💰 Step 2: Placing market orders to trigger trades..."
make market-orderbook

if [ $? -eq 0 ]; then
    echo "✅ Market orders placed successfully"
    echo "⏳ Waiting 5 seconds for indexer to process..."
    sleep 5
else
    echo "❌ Failed to place market orders"
    exit 1
fi

echo ""
echo "🎉 Market simulation completed!"
echo "📊 Check the WebSocket metrics now:"
echo "   cd /Users/renaka/Documents/learn/eth/scalex/clob/clob-indexer"
echo "   npm run metrics:dashboard"
echo ""
echo "📈 You should now see WebSocket messages sent > 0/min in the dashboard"