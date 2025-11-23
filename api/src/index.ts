import { Elysia, ValidationError } from "elysia";
import { cors } from '@elysiajs/cors';
import { tradeRoutes, marketRoutes, faucetRoutes } from './routes';
import { currenciesRoutes } from './routes/currencies.routes';
import { app as appConfig} from './config/app';
import { swagger } from '@elysiajs/swagger';
import { createErrorResponse } from './utils/response.utils';
import { HttpStatus } from './enums';

const app = new Elysia()
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
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 400;
      const parsedError = JSON.parse(error.message) as ValidationError;
      const errorMsg = `Validation error: ${parsedError.message}`;
      return createErrorResponse(errorMsg, HttpStatus.BAD_REQUEST);
    }
    
    return {
      success: false,
      error: 'Internal Server Error'
    };
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

app.listen(appConfig.port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
