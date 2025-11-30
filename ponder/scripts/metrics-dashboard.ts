#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Use CommonJS-style __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dashboard state object to store configuration and state
const dashboardState = {
  // Configuration
  REFRESH_INTERVAL_MS: 5000, // 5 seconds refresh interval
  MAX_ENTRIES_TO_SHOW: 5,
  // State
  lastUpdateTime: new Date(),
  lastUpdateSource: 'init',
  cachedCurrentMetrics: null as any,
  cachedPreviousMetrics: null as any,
  autoRefresh: true
};

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bgBlue: "\x1b[44m",
  white: "\x1b[37m"
};

// Helper functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

function drawProgressBar(value: number, max: number, width: number = 20): string {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  let color = colors.green;
  if (percentage > 70) color = colors.yellow;
  if (percentage > 90) color = colors.red;

  return `${color}${'█'.repeat(filledWidth)}${colors.dim}${'░'.repeat(emptyWidth)}${colors.reset} ${percentage.toFixed(1)}%`;
}

// Clear the terminal screen
function clearScreen(): void {
  const isTTY = Boolean(process.stdin.isTTY || process.stdout.isTTY);

  if (isTTY) {
    console.clear();
    process.stdout.write('\x1Bc');
  } else {
    console.log('\n' + '='.repeat(80) + '\n');
  }
}

// Load metrics from log file
function loadMetricsFromLog(): any {
  const logFilePath = path.join(__dirname, '..', 'logs', 'system-metrics.log');

  if (!fs.existsSync(logFilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(logFilePath, 'utf8');
    const lines = content.split('\n').filter(line => !!line && line.trim() !== '');

    if (lines.length === 0) {
      return null;
    }

    const lastLine = lines[lines.length - 1];
    return JSON.parse(lastLine);
  } catch (error) {
    console.error('Error reading metrics log:', error);
    return null;
  }
}

// Main dashboard function
function showDashboard(): void {
  const metrics = loadMetricsFromLog();

  if (!metrics) {
    console.log('No metrics data available. Please start the metrics collector first.');
    console.log('Run: pnpm monitor');
    return;
  }

  // Clear screen
  clearScreen();

  // Draw header
  const now = new Date();
  const header = `${colors.bright}${colors.bgBlue}${colors.white} ScaleX Indexer Metrics Dashboard ${colors.reset} ${now.toLocaleString()}`;
  const uptimeStr = metrics.uptime ? `Uptime: ${formatUptime(metrics.uptime)}` : '';

  console.log(header + (uptimeStr ? ' '.repeat(Math.max(0, 80 - header.length - uptimeStr.length)) + uptimeStr : ''));
  console.log('═'.repeat(80));

  // System resources section
  console.log(`${colors.bright}${colors.cyan}System Resources${colors.reset}`);

  // System Memory (get fresh data)
  const totalMem = os.totalmem() / (1024 * 1024 * 1024);
  const freeMem = os.freemem() / (1024 * 1024 * 1024);
  const usedMem = totalMem - freeMem;
  const percentUsed = (usedMem / totalMem) * 100;

  // Note: This is raw memory usage that includes OS cache and buffers
  // and will appear higher than what tools like htop show as "used" memory
  const systemMemoryPercentBar = drawProgressBar(usedMem, totalMem);
  console.log(`${colors.yellow}🖥️  System Memory:  ${colors.reset}${systemMemoryPercentBar} ${usedMem.toFixed(2)} / ${totalMem.toFixed(2)} GB (${percentUsed.toFixed(1)}%)`);
  console.log(`${colors.dim}              Free: ${freeMem.toFixed(2)} GB${colors.reset}`);
  console.log(`${colors.dim}              Note: Includes OS cache & buffers (htop will show lower usage)${colors.reset}`);

  // Process Memory
  if (metrics.memory) {
    console.log(`${colors.yellow}⚙️  Process Memory:  ${colors.reset}${drawProgressBar(metrics.memory.heapUsed, metrics.memory.heapTotal)} ${metrics.memory.heapUsed.toFixed(2)} / ${metrics.memory.heapTotal.toFixed(2)} MB`);
    console.log(`${colors.dim}              RSS: ${metrics.memory.rss.toFixed(2)} MB${colors.reset}`);
    console.log(`${colors.dim}              External: ${metrics.memory.external.toFixed(2)} MB${colors.reset}`);
  }

  // CPU Usage
  if (metrics.cpu) {
    const cpuBar = drawProgressBar(metrics.cpu.usage, 100);
    console.log(`${colors.yellow}🧠 CPU Usage:     ${colors.reset}${cpuBar} ${metrics.cpu.usage.toFixed(1)}% (${metrics.cpu.cores} cores)`);
    if (metrics.cpu.loadAvg && Array.isArray(metrics.cpu.loadAvg) && metrics.cpu.loadAvg.length >= 3) {
      const oneMin = metrics.cpu.loadAvg[0] || 0;
      const fiveMin = metrics.cpu.loadAvg[1] || 0;
      const fifteenMin = metrics.cpu.loadAvg[2] || 0;
      console.log(`${colors.dim}              Load Avg: ${oneMin.toFixed(2)}, ${fiveMin.toFixed(2)}, ${fifteenMin.toFixed(2)} (1m, 5m, 15m)${colors.reset}`);
    }
  }

  // Disk Usage
  if (metrics.disk) {
    const diskBar = drawProgressBar(metrics.disk.used, metrics.disk.total);
    const usedGB = metrics.disk.used / (1024 * 1024 * 1024);
    const totalGB = metrics.disk.total / (1024 * 1024 * 1024);
    const freeGB = metrics.disk.free / (1024 * 1024 * 1024);
    console.log(`${colors.yellow}💾 Disk Usage:    ${colors.reset}${diskBar} ${usedGB.toFixed(2)} / ${totalGB.toFixed(2)} GB (${metrics.disk.usagePercent.toFixed(1)}%)`);
    console.log(`${colors.dim}              Free: ${freeGB.toFixed(2)} GB${colors.reset}`);
  }

  // Log Files
  if (metrics.logs) {
    const totalSizeMB = metrics.logs.totalSizeBytes / (1024 * 1024);
    const fileCount = Object.keys(metrics.logs.files).length;
    console.log(`${colors.yellow}📄 Log Files:     ${colors.reset}${fileCount} files, ${totalSizeMB.toFixed(2)} MB total`);

    // Display up to 3 largest log files
    const sortedFiles = Object.entries(metrics.logs.files)
      .sort(([, sizeA], [, sizeB]) => (Number(sizeB) - Number(sizeA)))
      .slice(0, 3);

    for (const [filename, size] of sortedFiles) {
      const sizeMB = Number(size) / (1024 * 1024);
      console.log(`${colors.dim}              ${filename}: ${sizeMB.toFixed(2)} MB${colors.reset}`);
    }
  }

  // Network
  if (metrics.network) {
    console.log(`${colors.yellow}🌐 Network:       ${colors.reset}${metrics.network.connections} active connections`);
    console.log(`${colors.dim}              Packets Received: ${formatNumber(metrics.network.totalReceived)}${colors.reset}`);
    console.log(`${colors.dim}              Packets Sent: ${formatNumber(metrics.network.totalSent)}${colors.reset}`);
  }

  console.log('─'.repeat(80));

  // Database
  if (metrics.database && typeof metrics.database.sizeMB === 'number') {
    console.log(`${colors.yellow}🗄️  Database Size: ${colors.reset}${metrics.database.sizeMB.toFixed(2)} MB`);
  }

  // Record counts section
  console.log(`${colors.bright}${colors.cyan}Record Counts${colors.reset}`);

  if (metrics.records) {
    const recordTypes = [
      { name: 'Pools', value: metrics.records.pools || 0 },
      { name: 'Orders', value: metrics.records.orders || 0 },
      { name: 'Trades', value: metrics.records.trades || 0 },
      { name: 'Depth Levels', value: metrics.records.depth || 0 },
      { name: 'Balances', value: metrics.records.balances || 0 }
    ];

    const maxRecords = Math.max(...recordTypes.map(r => r.value));

    recordTypes.forEach(record => {
      const barWidth = 30;
      const filledWidth = maxRecords > 0 ? Math.max(1, Math.round((record.value / maxRecords) * barWidth)) : 0;
      const bar = '█'.repeat(filledWidth) + ' '.repeat(barWidth - filledWidth);

      console.log(`${colors.yellow}${record.name.padEnd(12)}${colors.reset} ${record.value.toString().padStart(5)} ${colors.blue}${bar}${colors.reset}`);
    });
  }

  console.log('─'.repeat(80));

  // WebSocket stats
  if (metrics.websocket) {
    console.log(`${colors.bright}${colors.cyan}WebSocket Stats${colors.reset}`);

    const activeConnections = metrics.websocket.activeConnections || 0;
    console.log(`${colors.yellow}🔌 Connections:   ${colors.reset}${activeConnections} active connections`);

    const userConnections = metrics.websocket.userConnections || 0;
    const publicConnections = metrics.websocket.publicConnections || 0;
    console.log(`${colors.dim}              ${userConnections} user, ${publicConnections} public${colors.reset}`);

    const totalSubscriptions = metrics.websocket.totalSubscriptions || 0;
    console.log(`${colors.dim}              ${totalSubscriptions} subscriptions${colors.reset}`);

    // Display subscription types
    if (metrics.websocket.subscriptionTypes) {
      const subscriptionTypes = metrics.websocket.subscriptionTypes;
      const sortedTypes = Object.entries(subscriptionTypes)
        .sort(([, countA], [, countB]) => countB - countA);

      for (const [type, count] of sortedTypes.slice(0, 3)) {
        if (count > 0) {
          console.log(`${colors.dim}              ${type}: ${count}${colors.reset}`);
        }
      }
    }

    const messagesSent = metrics.websocket.messagesSentLastMinute || 0;
    const messagesReceived = metrics.websocket.messagesReceivedLastMinute || 0;

    console.log(`${colors.yellow}📨 Messages:      ${colors.reset}${drawProgressBar(messagesSent, 1000)} ${messagesSent}/min sent`);
    console.log(`${colors.dim}              ${messagesReceived}/min received${colors.reset}`);
  } else {
    console.log(`${colors.dim}No WebSocket data available${colors.reset}`);
  }

  console.log('═'.repeat(80));

  // Display last updated timestamp
  if (metrics.timestamp) {
    const lastUpdate = new Date(metrics.timestamp);
    console.log(`${colors.dim}Last updated: ${lastUpdate.toLocaleString()}${colors.reset}`);
  }

  console.log(`${colors.dim}Auto-refreshing every ${dashboardState.REFRESH_INTERVAL_MS / 1000} seconds. Press Ctrl+C to quit.${colors.reset}`);
}

// Initial dashboard display
console.log('Starting ScaleX Indexer Dashboard...');
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}`);

// Check if we're in a TTY environment
const isTTY = Boolean(process.stdin.isTTY || process.stdout.isTTY);
console.log(`Terminal mode: ${isTTY ? 'Interactive TTY' : 'Non-interactive'}`);

// Show initial dashboard
showDashboard();

// Set up auto-refresh
const intervalId = setInterval(() => {
  showDashboard();
}, 5000);

// Handle clean exit
process.on('SIGINT', () => {
  console.log('\nDashboard closed');
  clearInterval(intervalId);
  process.exit(0);
});

// Keep the process running
console.log('Dashboard is running...');