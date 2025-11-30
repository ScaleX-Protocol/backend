#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

function dropAndRecreateDatabase(envFile: string) {
  // Load environment variables from the specified file
  config({ path: envFile });
  
  const dbUrl = process.env.PONDER_DATABASE_URL;
  if (!dbUrl) {
    console.error(`No PONDER_DATABASE_URL found in ${envFile}`);
    return;
  }

  // Parse the database URL
  const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!match) {
    console.error(`Invalid database URL format: ${dbUrl}`);
    return;
  }

  const [, user, password, host, port, dbName] = match;
  
  console.log(`Dropping and recreating database: ${dbName}`);
  
  try {
    // Terminate existing connections
    console.log('Terminating existing connections...');
    execSync(
      `docker exec clob-indexer-postgres-1 psql -U ${user} -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();"`,
      { stdio: 'inherit' }
    );

    // Drop the database
    console.log('Dropping database...');
    execSync(
      `docker exec clob-indexer-postgres-1 psql -U ${user} -c "DROP DATABASE IF EXISTS ${dbName};"`,
      { stdio: 'inherit' }
    );
    
    console.log(`✅ Database ${dbName} dropped successfully`);
  } catch (error) {
    console.log(`ℹ️  Database ${dbName} may not exist or already dropped`);
  }

  try {
    // Create the database
    console.log('Creating database...');
    execSync(
      `docker exec clob-indexer-postgres-1 psql -U ${user} -c "CREATE DATABASE ${dbName};"`,
      { stdio: 'inherit' }
    );
    
    console.log(`✅ Database ${dbName} created successfully`);
  } catch (error) {
    console.error(`❌ Failed to create database ${dbName}:`, error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: tsx scripts/drop-db.ts <core|side|both>');
  process.exit(1);
}

const command = args[0];

switch (command) {
  case 'core':
    dropAndRecreateDatabase('.env.core-chain');
    break;
  case 'side':
    dropAndRecreateDatabase('.env.side-chain');
    break;
  case 'both':
    dropAndRecreateDatabase('.env.core-chain');
    dropAndRecreateDatabase('.env.side-chain');
    break;
  default:
    console.error('Invalid command. Use: core, side, or both');
    process.exit(1);
}