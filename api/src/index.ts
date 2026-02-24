import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia, ValidationError } from "elysia";
import { app as appConfig } from './config/app';
import { HttpStatus } from './enums';
import { faucetRoutes, leaderboardRoutes, marketRoutes, tradeRoutes, walletRoutes } from './routes';
import { currenciesRoutes } from './routes/currencies.routes';
import { createLogger, LogLabel, ServiceName } from './utils/logger';
import { createErrorResponse } from './utils/response.utils';

// Define store type for request-scoped data
interface RequestStore {
  startTime?: number;
}

// Initialize logger
const logger = createLogger('index.ts', ServiceName.SCALEX_API);

const app = new Elysia()
  // Request logging middleware
  .onRequest(({ request, store }) => {
    const startTime = Date.now();
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname + url.search;

    logger.info(`${method} ${path}`, LogLabel.REQUEST, 'onRequest', {
      method,
      path,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    // Store start time for response logging
    (store as RequestStore).startTime = startTime;
  })

  // Response logging middleware
  .onAfterHandle(({ request, set, store }) => {
    const duration = Date.now() - ((store as RequestStore).startTime || Date.now());
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    const status = set.status || 200;

    logger.info(`${method} ${path} ${status} ${duration}ms`, LogLabel.REQUEST, 'onAfterHandle', {
      method,
      path,
      status,
      duration
    });
  })
  .use(cors({
    origin: [
      /^http:\/\/localhost:\d+$/,
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
      /^https:\/\/.*\.scalex\.money$/
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
  }))
  .onError(({ code, error, set, request }) => {
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname + url.search;

    if (code === 'VALIDATION') {
      set.status = 400;

      let errorDetails;
      let errorMsg = 'Validation error';

      try {
        // Parse Elysia validation error
        const parsedError = JSON.parse(error.message) as ValidationError;
        errorDetails = parsedError;

        // Extract meaningful error message
        if (parsedError.type === 'validation') {
          errorMsg = `Validation error: ${error.message}`;
        } else if (parsedError.message) {
          errorMsg = `Validation error: ${parsedError.message}`;
        } else {
          errorMsg = `Validation error: Invalid input`;
        }
      } catch (parseError) {
        // If parsing fails, use raw error message
        errorMsg = `Validation error: ${error.message}`;
        errorDetails = { rawError: error.message };
      }

      logger.warn(`${method} ${path} - ${errorMsg}`, LogLabel.VALIDATION, 'onError', {
        code,
        errorDetails,
        path,
        method
      });

      return createErrorResponse(errorMsg, HttpStatus.BAD_REQUEST);
    }

    // Log other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`${method} ${path} - ${errorMessage}`, LogLabel.API, 'onError', {
      code,
      error: errorMessage,
      stack: errorStack,
      path,
      method
    });

    set.status = 500;
    return createErrorResponse('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
  })
  .get("/", () => ({ message: "GTX API Server", status: "running" }));

if (!appConfig.isProduction) app.use(swagger({
  path: '/docs',
  documentation: {
    info: {
      title: 'GTX Api Documentation',
      version: '1.0.0'
    }
  }
}));
// routes register
app.use(tradeRoutes);
app.use(marketRoutes);
app.use(faucetRoutes);
app.use(currenciesRoutes);
app.use(walletRoutes);
app.use(leaderboardRoutes);

app.listen(appConfig.port);

logger.info(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`, LogLabel.SYSTEM, 'startup', {
  port: appConfig.port,
  hostname: app.server?.hostname,
  isProduction: appConfig.isProduction
});
