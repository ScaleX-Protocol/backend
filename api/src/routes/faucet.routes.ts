import { Elysia, t } from 'elysia';
import { FaucetController } from '../controllers/faucet.controller';

const faucetController = new FaucetController();

export const faucetRoutes = new Elysia({ prefix: '/api/faucet' })
  .get('/', () => ({
    message: 'Faucet API is running',
    version: '1.0.0',
    endpoints: {
      request: 'POST /api/faucet/request',
      'native-request': 'POST /api/faucet/native-request',
      address: 'GET /api/faucet/address',
      history: 'GET /api/faucet/history'
    }
  }))

  // Get faucet address for a chain
  .get('/address', async ({ query }) => {
    const chainId = parseInt(query.chainId || '31337');
    const result = await faucetController.getFaucetAddress(chainId);
    
    if (result.success) {
      return {
        success: true,
        chainId,
        faucetAddress: result.address,
        timestamp: Date.now()
      };
    } else {
      return {
        success: false,
        error: result.error,
        chainId,
        timestamp: Date.now()
      };
    }
  }, {
    query: t.Object({
      chainId: t.Optional(t.String())
    })
  })

  // Request tokens from faucet
  .post('/request', async ({ body, query, headers }) => {
    const chainId = parseInt(query.chainId || '31337');
    const clientIP = getClientIP(headers);
    const userAgent = headers['user-agent'];

    const { address, tokenAddress } = body as any;

    const result = await faucetController.requestTokens(
      address,
      tokenAddress,
      chainId,
      clientIP,
      userAgent
    );

    if (result.success) {
      return {
        success: true,
        ...result.data,
        chainId,
        timestamp: Date.now()
      };
    } else {
      return {
        success: false,
        error: result.error,
        chainId,
        requestId: null,
        timestamp: Date.now()
      };
    }
  }, {
    query: t.Object({
      chainId: t.Optional(t.String())
    }),
    body: t.Object({
      address: t.String({
        pattern: '^0x[a-fA-F0-9]{40}$',
        error: 'Invalid Ethereum address format'
      }),
      tokenAddress: t.String({
        pattern: '^0x[a-fA-F0-9]{40}$',
        error: 'Invalid token address format'
      })
    }),
    headers: t.Object({
      'user-agent': t.Optional(t.String()),
      'x-forwarded-for': t.Optional(t.String()),
      'x-real-ip': t.Optional(t.String()),
      'cf-connecting-ip': t.Optional(t.String()),
      'x-client-ip': t.Optional(t.String()),
      'x-vercel-forwarded-for': t.Optional(t.String()),
      'x-appengine-user-ip': t.Optional(t.String())
    })
  })

  // Request native tokens (ETH) from faucet
  .post('/native-request', async ({ body, query, headers }) => {
    const chainId = parseInt(query.chainId || '31337');
    const clientIP = getClientIP(headers);

    const { address } = body as any;

    const result = await faucetController.requestNativeTokens(
      address,
      chainId,
      clientIP
    );

    if (result.success) {
      return {
        success: true,
        transactionHash: result.transactionHash,
        chainId,
        timestamp: Date.now()
      };
    } else {
      return {
        success: false,
        error: result.error,
        chainId,
        timestamp: Date.now()
      };
    }
  }, {
    query: t.Object({
      chainId: t.Optional(t.String())
    }),
    body: t.Object({
      address: t.String({
        pattern: '^0x[a-fA-F0-9]{40}$',
        error: 'Invalid Ethereum address format'
      })
    }),
    headers: t.Object({
      'user-agent': t.Optional(t.String()),
      'x-forwarded-for': t.Optional(t.String()),
      'x-real-ip': t.Optional(t.String()),
      'cf-connecting-ip': t.Optional(t.String()),
      'x-client-ip': t.Optional(t.String()),
      'x-vercel-forwarded-for': t.Optional(t.String()),
      'x-appengine-user-ip': t.Optional(t.String())
    })
  })

  // Get faucet request history
  .get('/history', async ({ query }) => {
    const address = query.address as string;
    const chainId = query.chainId ? parseInt(query.chainId as string) : undefined;
    const limit = Math.min(parseInt(query.limit as string || '50'), 100);

    const result = await faucetController.getFaucetHistory(address, chainId, limit);

    if (result.success) {
      return {
        success: true,
        data: result.data || [],
        count: (result.data || []).length,
        timestamp: Date.now()
      };
    } else {
      return {
        success: false,
        error: result.error,
        data: [],
        timestamp: Date.now()
      };
    }
  }, {
    query: t.Object({
      address: t.Optional(t.String()),
      chainId: t.Optional(t.String()),
      limit: t.Optional(t.String())
    })
  });

// Helper function to get client IP address
function getClientIP(headers: Record<string, string>): string {
  // Try various headers for the real IP address
  const forwardedFor = headers['x-forwarded-for']?.split(',');
  const realIP = headers['x-real-ip'];
  const cfConnectingIP = headers['cf-connecting-ip'];
  const xClientIP = headers['x-client-ip'];

  if (forwardedFor && forwardedFor.length > 0 && forwardedFor[0]) {
    return forwardedFor[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  if (xClientIP) {
    return xClientIP;
  }

  // Fallback
  return headers['x-vercel-forwarded-for'] ||
    headers['x-appengine-user-ip'] ||
    '127.0.0.1';
}