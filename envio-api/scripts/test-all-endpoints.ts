#!/usr/bin/env bun
/**
 * Comprehensive API Endpoint Test Script
 *
 * This script tests ALL Envio API endpoints
 * Run the API server first: bun run dev
 * Then run this script in another terminal: bun run scripts/test-all-endpoints.ts
 */

const API_BASE_URL = 'http://localhost:3000';
const API_PREFIX = '/api';

interface TestCase {
  name: string;
  endpoint: string;
  method?: string;
  params?: Record<string, string>;
  expectedStatus?: number;
  validateResponse?: (data: any) => { valid: boolean; error?: string };
  skipIfNoData?: boolean;
}

interface TestResult {
  name: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
  statusCode?: number;
  responseTime?: number;
  error?: string;
  dataCount?: number;
  validation?: string;
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

async function testEndpoint(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  const { name, endpoint, method = 'GET', params, expectedStatus = 200, validateResponse, skipIfNoData } = testCase;

  try {
    // Build URL
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    // Make request
    const response = await fetch(url.toString(), { method });
    const responseTime = Date.now() - startTime;

    // Parse response
    let data: any;
    try {
      data = await response.json();
    } catch {
      return {
        name,
        endpoint,
        status: 'FAIL',
        statusCode: response.status,
        responseTime,
        error: 'Invalid JSON response',
      };
    }

    // Check status code
    if (response.status !== expectedStatus) {
      return {
        name,
        endpoint,
        status: 'FAIL',
        statusCode: response.status,
        responseTime,
        error: `Expected status ${expectedStatus}, got ${response.status}: ${data.message || 'Unknown error'}`,
      };
    }

    // Check data count
    const isArray = Array.isArray(data.data);
    const dataCount = isArray ? data.data.length : data.data ? 1 : 0;

    // Skip if no data and skipIfNoData is true
    if (skipIfNoData && dataCount === 0) {
      return {
        name,
        endpoint,
        status: 'SKIP',
        statusCode: response.status,
        responseTime,
        dataCount,
        error: 'No data available (expected for new indexer)',
      };
    }

    // Validate response structure
    if (validateResponse) {
      const validation = validateResponse(data);
      if (!validation.valid) {
        return {
          name,
          endpoint,
          status: 'FAIL',
          statusCode: response.status,
          responseTime,
          dataCount,
          error: validation.error || 'Validation failed',
        };
      }
    }

    // Warn if no data
    if (dataCount === 0) {
      return {
        name,
        endpoint,
        status: 'WARN',
        statusCode: response.status,
        responseTime,
        dataCount,
        validation: 'Endpoint works but returned no data',
      };
    }

    // Success
    return {
      name,
      endpoint,
      status: 'PASS',
      statusCode: response.status,
      responseTime,
      dataCount,
    };
  } catch (error) {
    return {
      name,
      endpoint,
      status: 'FAIL',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function runAllTests() {
  console.log(colorize('\n╔═══════════════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(colorize('║         Envio API Comprehensive Endpoint Testing                     ║', 'cyan'));
  console.log(colorize('╚═══════════════════════════════════════════════════════════════════════╝\n', 'cyan'));

  // Test data
  const testAddress = '0x1234567890123456789012345678901234567890';
  const testSymbol = 'WETHUSDC';
  const altSymbol = 'WBTCUSDC';

  const testCases: TestCase[] = [
    // System Endpoints
    {
      name: 'Health Check',
      endpoint: '/health',
      validateResponse: (data) => {
        if (data.status !== 'healthy') {
          return { valid: false, error: 'Health check failed' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Root Endpoint',
      endpoint: '/',
      validateResponse: (data) => {
        if (!data.message || !data.version) {
          return { valid: false, error: 'Missing required fields' };
        }
        return { valid: true };
      },
    },

    // Market Data Endpoints
    {
      name: 'Get All Pairs',
      endpoint: `${API_PREFIX}/pairs`,
      validateResponse: (data) => {
        if (!Array.isArray(data.data)) {
          return { valid: false, error: 'Expected array of pairs' };
        }
        if (data.data.length > 0) {
          const pool = data.data[0];
          if (!pool.poolId || !pool.baseCurrency || !pool.quoteCurrency) {
            return { valid: false, error: 'Missing required pool fields' };
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Get All Markets',
      endpoint: `${API_PREFIX}/markets`,
      validateResponse: (data) => {
        if (!Array.isArray(data.data)) {
          return { valid: false, error: 'Expected array of markets' };
        }
        return { valid: true };
      },
    },

    // Price Endpoints
    {
      name: 'Get Ticker Price (WETHUSDC)',
      endpoint: `${API_PREFIX}/ticker/price`,
      params: { symbol: testSymbol },
      skipIfNoData: true,
      validateResponse: (data) => {
        if (data.data && !data.data.price) {
          return { valid: false, error: 'Missing price field' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Get Ticker Price (WBTCUSDC)',
      endpoint: `${API_PREFIX}/ticker/price`,
      params: { symbol: altSymbol },
      skipIfNoData: true,
      validateResponse: (data) => {
        if (data.data && !data.data.price) {
          return { valid: false, error: 'Missing price field' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Get Ticker Price (with slash)',
      endpoint: `${API_PREFIX}/ticker/price`,
      params: { symbol: 'WETH/USDC' },
      skipIfNoData: true,
    },
    {
      name: 'Get 24hr Ticker (WETHUSDC)',
      endpoint: `${API_PREFIX}/ticker/24hr`,
      params: { symbol: testSymbol },
      validateResponse: (data) => {
        if (!data.data) return { valid: true }; // OK if no data
        const ticker = data.data;
        const requiredFields = ['symbol', 'priceChange', 'lastPrice', 'volume', 'openPrice', 'highPrice', 'lowPrice'];
        for (const field of requiredFields) {
          if (!(field in ticker)) {
            return { valid: false, error: `Missing field: ${field}` };
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Get 24hr Ticker (WBTCUSDC)',
      endpoint: `${API_PREFIX}/ticker/24hr`,
      params: { symbol: altSymbol },
    },

    // Order Book Endpoints
    {
      name: 'Get Depth (WETHUSDC)',
      endpoint: `${API_PREFIX}/depth`,
      params: { symbol: testSymbol },
      validateResponse: (data) => {
        if (!data.data) return { valid: true };
        if (!data.data.bids || !data.data.asks) {
          return { valid: false, error: 'Missing bids or asks' };
        }
        if (!Array.isArray(data.data.bids) || !Array.isArray(data.data.asks)) {
          return { valid: false, error: 'bids and asks must be arrays' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Get Depth with limit',
      endpoint: `${API_PREFIX}/depth`,
      params: { symbol: testSymbol, limit: '10' },
    },
    {
      name: 'Get Depth (WBTCUSDC)',
      endpoint: `${API_PREFIX}/depth`,
      params: { symbol: altSymbol, limit: '20' },
    },

    // Trades Endpoints
    {
      name: 'Get Trades (WETHUSDC)',
      endpoint: `${API_PREFIX}/trades`,
      params: { symbol: testSymbol },
      skipIfNoData: true,
      validateResponse: (data) => {
        if (!Array.isArray(data.data)) {
          return { valid: false, error: 'Expected array of trades' };
        }
        if (data.data.length > 0) {
          const trade = data.data[0];
          if (!trade.price || !trade.quantity || !trade.timestamp) {
            return { valid: false, error: 'Missing required trade fields' };
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Get Trades with limit',
      endpoint: `${API_PREFIX}/trades`,
      params: { symbol: testSymbol, limit: '50' },
      skipIfNoData: true,
    },
    {
      name: 'Get Trades (WBTCUSDC)',
      endpoint: `${API_PREFIX}/trades`,
      params: { symbol: altSymbol, limit: '100' },
      skipIfNoData: true,
    },

    // Klines/Candlestick Endpoints
    {
      name: 'Get Klines - 1m interval',
      endpoint: `${API_PREFIX}/klines`,
      params: { symbol: testSymbol, interval: '1m', limit: '100' },
      skipIfNoData: true,
      validateResponse: (data) => {
        if (!Array.isArray(data.data)) {
          return { valid: false, error: 'Expected array of klines' };
        }
        if (data.data.length > 0) {
          const kline = data.data[0];
          const requiredFields = ['t', 'T', 'o', 'h', 'l', 'c', 'v', 'q', 'n'];
          for (const field of requiredFields) {
            if (!(field in kline)) {
              return { valid: false, error: `Missing kline field: ${field}` };
            }
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Get Klines - 5m interval',
      endpoint: `${API_PREFIX}/klines`,
      params: { symbol: testSymbol, interval: '5m', limit: '100' },
      skipIfNoData: true,
    },
    {
      name: 'Get Klines - 30m interval',
      endpoint: `${API_PREFIX}/klines`,
      params: { symbol: testSymbol, interval: '30m', limit: '50' },
      skipIfNoData: true,
    },
    {
      name: 'Get Klines - 1h interval',
      endpoint: `${API_PREFIX}/klines`,
      params: { symbol: testSymbol, interval: '1h', limit: '24' },
      skipIfNoData: true,
    },
    {
      name: 'Get Klines - 1d interval',
      endpoint: `${API_PREFIX}/klines`,
      params: { symbol: testSymbol, interval: '1d', limit: '30' },
      skipIfNoData: true,
    },
    {
      name: 'Get Klines - WBTCUSDC',
      endpoint: `${API_PREFIX}/klines`,
      params: { symbol: altSymbol, interval: '1m', limit: '100' },
      skipIfNoData: true,
    },

    // Order Endpoints
    {
      name: 'Get Open Orders',
      endpoint: `${API_PREFIX}/openOrders`,
      params: { symbol: testSymbol, address: testAddress },
      skipIfNoData: true,
      validateResponse: (data) => {
        if (!Array.isArray(data.data)) {
          return { valid: false, error: 'Expected array of orders' };
        }
        if (data.data.length > 0) {
          const order = data.data[0];
          if (!order.orderId || !order.user || !order.side || !order.price || !order.quantity) {
            return { valid: false, error: 'Missing required order fields' };
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Get All Orders',
      endpoint: `${API_PREFIX}/allOrders`,
      params: { symbol: testSymbol, address: testAddress, limit: '50' },
      skipIfNoData: true,
    },
    {
      name: 'Get All Orders (WBTCUSDC)',
      endpoint: `${API_PREFIX}/allOrders`,
      params: { symbol: altSymbol, address: testAddress, limit: '100' },
      skipIfNoData: true,
    },

    // Account Endpoint
    {
      name: 'Get Account Balances',
      endpoint: `${API_PREFIX}/account`,
      params: { address: testAddress },
      validateResponse: (data) => {
        if (!data.data) {
          return { valid: false, error: 'Missing data object' };
        }
        if (!data.data.address) {
          return { valid: false, error: 'Missing address field' };
        }
        if (!Array.isArray(data.data.balances)) {
          return { valid: false, error: 'balances must be an array' };
        }
        if (data.data.balances.length > 0) {
          const balance = data.data.balances[0];
          if (!balance.currency || !('available' in balance) || !('locked' in balance) || !('total' in balance)) {
            return { valid: false, error: 'Missing required balance fields' };
          }
        }
        return { valid: true };
      },
    },

    // Currency Endpoints
    {
      name: 'Get All Currencies',
      endpoint: `${API_PREFIX}/currencies`,
      validateResponse: (data) => {
        if (!Array.isArray(data.data)) {
          return { valid: false, error: 'Expected array of currencies' };
        }
        if (data.data.length > 0) {
          const currency = data.data[0];
          if (!currency.address || !currency.symbol) {
            return { valid: false, error: 'Missing required currency fields' };
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Get Specific Currency',
      endpoint: `${API_PREFIX}/currency`,
      params: { address: '0x835c8aa033972e372865fcc933c9de0a48b6ae23' },
      skipIfNoData: true,
      validateResponse: (data) => {
        if (data.data && (!data.data.address || !data.data.symbol)) {
          return { valid: false, error: 'Missing required currency fields' };
        }
        return { valid: true };
      },
    },

    // Error Handling Tests
    {
      name: 'Missing Symbol Parameter',
      endpoint: `${API_PREFIX}/ticker/price`,
      expectedStatus: 400,
      validateResponse: (data) => {
        if (data.success !== false) {
          return { valid: false, error: 'Should return success: false' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Missing Address Parameter',
      endpoint: `${API_PREFIX}/account`,
      expectedStatus: 400,
      validateResponse: (data) => {
        if (data.success !== false) {
          return { valid: false, error: 'Should return success: false' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Invalid Symbol',
      endpoint: `${API_PREFIX}/ticker/price`,
      params: { symbol: 'INVALIDPAIR' },
      expectedStatus: 500,
      skipIfNoData: true,
    },
  ];

  console.log(colorize('🚀 Starting endpoint tests...\n', 'bright'));
  console.log(colorize(`Testing against: ${API_BASE_URL}`, 'dim'));
  console.log(colorize(`Total test cases: ${testCases.length}\n`, 'dim'));
  console.log('─'.repeat(100));

  const results: TestResult[] = [];

  // Run tests
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const result = await testEndpoint(testCase);
    results.push(result);

    // Display result
    const statusIcon =
      result.status === 'PASS' ? colorize('✓', 'green') :
      result.status === 'WARN' ? colorize('⚠', 'yellow') :
      result.status === 'SKIP' ? colorize('○', 'dim') :
      colorize('✗', 'red');

    const statusText =
      result.status === 'PASS' ? colorize('PASS', 'green') :
      result.status === 'WARN' ? colorize('WARN', 'yellow') :
      result.status === 'SKIP' ? colorize('SKIP', 'dim') :
      colorize('FAIL', 'red');

    const testNumber = colorize(`[${(i + 1).toString().padStart(2, '0')}/${testCases.length}]`, 'dim');
    const testName = result.name.padEnd(35);
    const statusCode = result.statusCode ? colorize(result.statusCode.toString(), 'cyan') : '---';
    const responseTime = result.responseTime ? colorize(`${result.responseTime}ms`, 'blue') : '---';
    const dataInfo = result.dataCount !== undefined ? colorize(`(${result.dataCount} records)`, 'dim') : '';

    console.log(`${statusIcon} ${testNumber} ${testName} ${statusText.padEnd(15)} ${statusCode} ${responseTime.padStart(8)} ${dataInfo}`);

    if (result.error) {
      console.log(colorize(`   └─ Error: ${result.error}`, 'red'));
    }
    if (result.validation) {
      console.log(colorize(`   └─ ${result.validation}`, 'yellow'));
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(100));
  console.log(colorize('\n📊 TEST SUMMARY\n', 'bright'));

  const passCount = results.filter(r => r.status === 'PASS').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const skipCount = results.filter(r => r.status === 'SKIP').length;

  console.log(colorize(`✓ PASSED:  ${passCount}/${testCases.length}`, 'green'));
  console.log(colorize(`⚠ WARNED:  ${warnCount}/${testCases.length}`, 'yellow'));
  console.log(colorize(`✗ FAILED:  ${failCount}/${testCases.length}`, 'red'));
  console.log(colorize(`○ SKIPPED: ${skipCount}/${testCases.length}`, 'dim'));

  const totalDataCount = results.reduce((sum, r) => sum + (r.dataCount || 0), 0);
  const avgResponseTime = results
    .filter(r => r.responseTime)
    .reduce((sum, r, _, arr) => sum + (r.responseTime! / arr.length), 0);

  console.log(colorize(`\n📈 Total records retrieved: ${totalDataCount}`, 'cyan'));
  console.log(colorize(`⚡ Average response time: ${avgResponseTime.toFixed(0)}ms`, 'blue'));

  // Failed tests detail
  if (failCount > 0) {
    console.log(colorize('\n❌ FAILED TESTS:\n', 'red'));
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(colorize(`   • ${r.name}`, 'red'));
        console.log(colorize(`     ${r.endpoint}`, 'dim'));
        console.log(colorize(`     Error: ${r.error}`, 'red'));
      });
  }

  // Warnings detail
  if (warnCount > 0) {
    console.log(colorize('\n⚠️  WARNINGS (endpoints work but have no data):\n', 'yellow'));
    results
      .filter(r => r.status === 'WARN')
      .forEach(r => {
        console.log(colorize(`   • ${r.name}`, 'yellow'));
      });
    console.log(colorize('\n   This is normal if the indexer is new or has no activity yet.', 'dim'));
  }

  // Recommendations
  console.log(colorize('\n💡 RECOMMENDATIONS:\n', 'bright'));

  if (failCount === 0 && warnCount === 0 && skipCount === 0) {
    console.log(colorize('   ✅ All tests passed! Your API is working perfectly.', 'green'));
  } else if (failCount === 0 && passCount > 0) {
    console.log(colorize('   ✅ No critical errors. Some endpoints have no data yet.', 'green'));
    console.log(colorize('   📝 Run the indexer longer to populate more data.', 'dim'));
  } else if (failCount > 0) {
    console.log(colorize('   ❌ Some tests failed. Please check:', 'red'));
    console.log(colorize('      1. API server is running (bun run dev)', 'dim'));
    console.log(colorize('      2. Database connection is correct', 'dim'));
    console.log(colorize('      3. Envio indexer is creating aggregated data', 'dim'));
  }

  console.log('\n' + '═'.repeat(100) + '\n');

  // Exit code
  process.exit(failCount > 0 ? 1 : 0);
}

// Check if API server is running first
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('Server health check failed');
    }
    return true;
  } catch (error) {
    console.log(colorize('\n❌ ERROR: Cannot connect to API server\n', 'red'));
    console.log(colorize(`   Make sure the API server is running on ${API_BASE_URL}`, 'yellow'));
    console.log(colorize('   Run in another terminal: bun run dev\n', 'yellow'));
    process.exit(1);
  }
}

// Main execution
(async () => {
  await checkServerHealth();
  await runAllTests();
})();
