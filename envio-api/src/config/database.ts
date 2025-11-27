import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';

const connectionString = process.env.ENVIO_API_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/envio';

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
