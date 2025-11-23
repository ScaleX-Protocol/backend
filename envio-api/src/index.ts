import { Elysia, ValidationError } from 'elysia';
import { cors } from '@elysiajs/cors';
import { opentelemetry } from '@elysiajs/opentelemetry';
import { openapi } from '@elysiajs/openapi';
import { marketRoutes, currencyRoutes, tradeRoutes, faucetRoutes, crosschainRoutes, lendingRoutes } from './routes';
import { app as appConfig } from './config/app';
import { createErrorResponse } from './utils/response.utils';
import { HttpStatus } from './enums';

const app = new Elysia()
  // CORS configuration
  .use(
    cors({
      origin: [
        /^http:\/\/localhost:\d+$/,
        /^https:\/\/.*\.vercel\.app$/,
        /^https:\/\/.*\.netlify\.app$/,
        /^https:\/\/.*\.scalex\.money$/,
      ],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    })
  )
  // OpenTelemetry configuration
  .use(opentelemetry())
  // OpenAPI/Swagger documentation
  .use(
    openapi({
      path: '/docs',
      documentation: {
        info: {
          title: 'Envio API Documentation',
          version: '1.0.0',
          description: 'API for querying blockchain events from Envio indexer',
        },
        tags: [
          { name: 'Market', description: 'Market and trading endpoints' },
          { name: 'Orders', description: 'Order management endpoints' },
          { name: 'Trading', description: 'Trading data endpoints' },
          { name: 'Currency', description: 'Currency information endpoints' },
          { name: 'Cross-Chain', description: 'Cross-chain transfer and token mapping endpoints' },
          { name: 'Lending', description: 'Lending protocol and dashboard endpoints' },
          { name: 'Faucet', description: 'Faucet endpoints for testnet tokens' },
        ],
      },
    })
  )
  // Error handling
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = HttpStatus.BAD_REQUEST;
      const parsedError = JSON.parse(error.message) as ValidationError;
      const errorMsg = `Validation error: ${parsedError.message}`;
      return createErrorResponse(errorMsg, HttpStatus.BAD_REQUEST);
    }

    if (code === 'NOT_FOUND') {
      set.status = HttpStatus.NOT_FOUND;
      return createErrorResponse('Route not found', HttpStatus.NOT_FOUND);
    }

    set.status = HttpStatus.INTERNAL_SERVER_ERROR;
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  })
  // Root endpoint
  .get('/', () => ({
    message: 'Envio API Server',
    status: 'running',
    version: '1.0.0',
    documentation: '/docs',
  }))
  // Health check endpoint
  .get('/health', () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }));

// Register routes
app.use(marketRoutes);
app.use(currencyRoutes);
app.use(tradeRoutes);
app.use(faucetRoutes);
app.use(crosschainRoutes);
app.use(lendingRoutes);

// Start server
app.listen(appConfig.port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(`📚 Documentation available at http://localhost:${appConfig.port}/docs`);
