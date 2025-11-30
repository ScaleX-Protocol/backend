#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFile = path.join(__dirname, '..', 'logs', 'system-metrics.log');
const historyLogFile = path.join(__dirname, '..', 'logs', 'metrics-history.log');

/**
 * Saves the latest metrics entry to a separate history log file
 */
function saveMetricsToHistory(): void {
  try {
    if (!fs.existsSync(logFile)) {
      return;
    }

    // Create logs directory if it doesn't exist
    const logsDir = path.dirname(historyLogFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Only save the latest entry to history if it exists
    if (lines.length > 0) {
      const latestMetric = lines[lines.length - 1];
      fs.appendFileSync(historyLogFile, latestMetric + '\n');
    }
  } catch (error) {
    console.error('Error saving metrics to history:', error instanceof Error ? error.message : String(error));
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function displayMetrics(count = 5): void {
  try {
    if (!fs.existsSync(logFile)) {
      console.log('No metrics log file found.');
      return;
    }

    // Save the latest metrics to history log
    saveMetricsToHistory();

    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const metrics = lines.map(line => JSON.parse(line));
    const latestMetrics = metrics.slice(-count).reverse();

    console.log(`\n📊 System Metrics (Last ${count} entries)\n`);
    console.log('═'.repeat(80));

    latestMetrics.forEach((metric, index) => {
      const timestamp = new Date(metric.timestamp).toLocaleString();
      console.log(`\n[${index + 1}] ${timestamp}`);
      console.log('─'.repeat(50));

      // Database
      console.log(`💾 Database Size: ${metric.database.sizeMB.toFixed(2)} MB (${formatBytes(metric.database.sizeBytes)})`);

      // Memory
      console.log(`🧠 Memory Usage:`);
      console.log(`   RSS: ${(metric.memory.rss / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   Heap Used: ${(metric.memory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   Heap Total: ${(metric.memory.heapTotal / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   External: ${(metric.memory.external / (1024 * 1024)).toFixed(2)} MB`);

      // Records
      console.log(`📊 Record Counts:`);
      console.log(`   Pools: ${metric.records.pools}`);
      console.log(`   Orders: ${metric.records.orders}`);
      console.log(`   Trades: ${metric.records.trades}`);
      console.log(`   Depth Levels: ${metric.records.depth}`);
      console.log(`   Balances: ${metric.records.balances}`);

      // WebSocket stats if available
      if (metric.websocket) {
        console.log(`🔌 WebSocket:`);
        console.log(`   Active Connections: ${metric.websocket.activeConnections}`);
        console.log(`   Total Subscriptions: ${metric.websocket.totalSubscriptions}`);
        console.log(`   User Connections: ${metric.websocket.userConnections}`);
        console.log(`   Public Connections: ${metric.websocket.publicConnections}`);
        console.log(`   Messages Sent (last min): ${metric.websocket.messagesSentLastMinute}`);
        console.log(`   Messages Received (last min): ${metric.websocket.messagesReceivedLastMinute}`);
      }

      // Uptime
      const hours = Math.floor(metric.uptime / 3600);
      const minutes = Math.floor((metric.uptime % 3600) / 60);
      console.log(`⏱️  Uptime: ${hours}h ${minutes}m`);
    });

    // Calculate trends if we have at least 2 metrics
    if (latestMetrics.length >= 2) {
      const current = latestMetrics[0];
      const previous = latestMetrics[1];

      console.log(`\n📈 Trends (vs previous entry):`);
      console.log(`──────────────────────────────`);

      // Database size trend
      const dbSizeDiff = current.database.sizeBytes - previous.database.sizeBytes;
      console.log(`Database: ${dbSizeDiff > 0 ? '+' : ''}${formatBytes(dbSizeDiff)}`);

      // Memory trend (heap used)
      const memoryDiff = (current.memory.heapUsed - previous.memory.heapUsed) / (1024 * 1024);
      console.log(`Memory: ${memoryDiff > 0 ? '+' : ''}${memoryDiff.toFixed(2)} MB`);

      // Orders trend
      const ordersDiff = current.records.orders - previous.records.orders;
      console.log(`Orders: ${ordersDiff > 0 ? '+' : ''}${ordersDiff}`);

      // Trades trend
      const tradesDiff = current.records.trades - previous.records.trades;
      console.log(`Trades: ${tradesDiff > 0 ? '+' : ''}${tradesDiff}`);

      // WebSocket message trends if available
      if (current.websocket && previous.websocket) {
        const sentDiff = current.websocket.messagesSentLastMinute - previous.websocket.messagesSentLastMinute;
        console.log(`WS Messages Sent: ${sentDiff > 0 ? '+' : ''}${sentDiff}`);

        const recvDiff = current.websocket.messagesReceivedLastMinute - previous.websocket.messagesReceivedLastMinute;
        console.log(`WS Messages Received: ${recvDiff > 0 ? '+' : ''}${recvDiff}`);
      }
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`Log file: ${logFile}`);
    console.log(`Total entries: ${metrics.length}`);
    console.log(`Historical data saved to: ${historyLogFile}`);
  } catch (error) {
    console.error('Error displaying metrics:', error instanceof Error ? error.message : String(error));
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const count = args[0] ? parseInt(args[0]) : 5;

if (isNaN(count) || count <= 0) {
  console.log('Usage: node check-metrics.js [count]');
  console.log('Example: node check-metrics.js 10');
  process.exit(1);
}

displayMetrics(count);
