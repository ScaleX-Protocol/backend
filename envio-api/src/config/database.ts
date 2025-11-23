import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';
import * as faucetSchema from '../schema/faucet.schema';
import * as fs from 'fs';

// SSL configuration
const sslConfig = process.env.DATABASE_CA ? {
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(process.env.DATABASE_CA).toString(),
  }
} : {};

// Primary database for envio indexer data (trading, markets, currencies)
const envioConnectionString = process.env.ENVIO_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:testing@localhost:5433/envio-dev';

const envioPool = new Pool({
  connectionString: envioConnectionString,
  ...sslConfig,
});

export const db = drizzle(envioPool, { schema });

// Secondary database for faucet functionality
const faucetConnectionString = process.env.FAUCET_DATABASE_URL || 'postgresql://postgres:password@localhost:5435/envio_faucet';

const faucetPool = new Pool({
  connectionString: faucetConnectionString,
  ...sslConfig,
});

export const faucetDb = drizzle(faucetPool, { schema: faucetSchema });
