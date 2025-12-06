import { Elysia, ValidationError } from "elysia";
import { cors } from '@elysiajs/cors';
import { tradeRoutes, marketRoutes, faucetRoutes, walletRoutes } from './routes';
import { currenciesRoutes } from './routes/currencies.routes';
import { app as appConfig} from './config/app';
import { swagger } from '@elysiajs/swagger';
import { createErrorResponse } from './utils/response.utils';
import { HttpStatus } from './enums';
import { createLogger, LogLevel, LogLabel, ServiceName } from './utils/logger';

// Initialize logger
const logger = createLogger('index.ts', ServiceName.SCALEX_API);

const app = new Elysia()
  // Request logging middleware
  .onRequest(({ request, set }) => {
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
    set.startTime = startTime;
  })
  
  // Response logging middleware
  .onAfterHandle(({ request, set }) => {
    const duration = Date.now() - (set.startTime || Date.now());
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
        if (parsedError.message) {
          errorMsg = `Validation error: ${parsedError.message}`;
        } else if (parsedError.summary) {
          errorMsg = `Validation error: ${parsedError.summary}`;
        } else if (parsedError.errors && parsedError.errors.length > 0) {
          const firstError = parsedError.errors[0];
          errorMsg = `Validation error: ${firstError.message || firstError.path || 'Invalid input'}`;
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
    logger.error(`${method} ${path} - ${error.message}`, LogLabel.API, 'onError', {
      code,
      error: error.message,
      stack: error.stack,
      path,
      method
    });
    
    set.status = 500;
    return createErrorResponse('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
  })
  .get("/", () => ({ message: "GTX API Server", status: "running" }));

if(!appConfig.isProduction) app.use(swagger({
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

app.listen(appConfig.port);

logger.info(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`, LogLabel.SYSTEM, 'startup', {
  port: appConfig.port,
  hostname: app.server?.hostname,
  isProduction: appConfig.isProduction
});
