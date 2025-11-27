import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.ENVIO_API_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/envio',
  },
});
