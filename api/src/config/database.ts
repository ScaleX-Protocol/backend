import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';
import * as fs from 'fs';

// SSL configuration
const sslConfig = process.env.DATABASE_CA ? {
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(process.env.DATABASE_CA).toString(),
  }
} : {};

// Primary database for API/faucet functionality
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5435/scalex_api';

const pool = new Pool({
  connectionString,
  ...sslConfig,
});

export const db = drizzle(pool, { schema });

// Secondary database for Ponder data (currencies, etc.)
const ponderConnectionString = process.env.PONDER_DATABASE_URL || 'postgresql://postgres:password@localhost:5433/ponder_core';

export const ponderPool = new Pool({
  connectionString: ponderConnectionString,
  ...sslConfig,
});

// Set search_path to include ponder schema
ponderPool.on('connect', async (client) => {
  await client.query('SET search_path TO "ponder.schema.ts", public');
});

export const ponderDb = drizzle(ponderPool, { schema });