import { config } from 'dotenv';
import { SystemMonitor } from '../src/utils/systemMonitor.js';

// Load environment variables from .env file
config();

console.log('⚠️  DEPRECATED: Standalone system monitor');
console.log('📝 For accurate WebSocket metrics, use integrated monitoring instead:');
console.log('   ENABLE_SYSTEM_MONITOR=true pnpm dev');
console.log('');
console.log('Starting standalone system monitor...');
console.log('PONDER_DATABASE_URL loaded:', !!process.env.PONDER_DATABASE_URL);
const monitor = new SystemMonitor();

try {
  monitor.start();
  console.log('System monitor started successfully');
} catch (error: unknown) {
  console.error('Failed to start system monitor:', error);
}
