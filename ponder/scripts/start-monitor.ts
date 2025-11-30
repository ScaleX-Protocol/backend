#!/usr/bin/env node

import { systemMonitor } from '../src/utils/systemMonitor.js';
import dotenv from 'dotenv';

console.log('⚠️  DEPRECATED: metrics:start script');
console.log('📝 For accurate WebSocket metrics, use integrated monitoring instead:');
console.log('   ENABLE_SYSTEM_MONITOR=true pnpm dev');
console.log('');

// Load environment variables
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const intervalMinutes = args[0] ? parseInt(args[0]) : 5;

if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
  console.log('Usage: node start-monitor.js [interval_minutes]');
  console.log('Example: node start-monitor.js 10');
  process.exit(1);
}

// Start the system monitor
systemMonitor.start(intervalMinutes);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nStopping system monitor...');
  systemMonitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nStopping system monitor...');
  systemMonitor.stop();
  process.exit(0);
});
