import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

interface SystemMetrics {
  timestamp: string;
  database: {
    sizeBytes: number;
    sizeMB: number;
    tables: {
      pools: number;
      orders: number;
      orderBookTrades: number;
      orderBookDepth: number;
      balances: number;
    };
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  systemMemory: {
    total: number;
    free: number;
    used: number;
    percentUsed: number;
  };
  cpu?: {
    usage: number;        // CPU usage percentage
    loadAvg: number[];    // 1, 5, 15 minute load averages
    cores: number;        // Number of CPU cores
  };
  disk?: {
    total: number;        // Total disk space in bytes
    free: number;         // Free disk space in bytes
    used: number;         // Used disk space in bytes
    usagePercent: number; // Disk usage percentage
  };
  logs?: {
    totalSizeBytes: number; // Total size of all log files
    files: Record<string, number>; // Size of individual log files in bytes
  };
  network?: {
    connections: number;  // Number of active network connections
    totalReceived: number; // Total packets received
    totalSent: number;     // Total packets sent
  };
  records: {
    pools: number;
    orders: number;
    trades: number;
    depth: number;
    balances: number;
  };
  websocket: {
    activeConnections: number;
    totalSubscriptions: number;
    userConnections: number;
    publicConnections: number;
    messagesSentLastMinute: number;
    messagesReceivedLastMinute: number;
    subscriptionTypes: {
      market: number;
      user: number;
      other: number;
    };
  };
  uptime: number;
}

export class SystemMonitor {
  private logFile: string;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private intervalSeconds = 60; // Default interval
  private isRunning = false;
  private wsMessagesSent = 0;
  private wsMessagesReceived = 0;
  private wsMessageHistory: Array<{ sent: number; received: number; timestamp: number }> = [];
  
  // Synchronized timing constants
  private readonly TIMING_SYNC = {
    // Base unit: 10 seconds (makes math easy)
    baseUnit: 10,
    // Monitoring intervals should be multiples of base unit
    defaultMonitoringInterval: 30, // 3x base unit
    // Message calculation window should be multiple of monitoring interval
    calculationWindowMultiplier: 2, // 2x monitoring interval
    // History retention should be longer than calculation window
    historyRetentionMultiplier: 4, // 4x monitoring interval
  };
  private wsStatsCallback: (() => { 
    activeConnections: number; 
    totalSubscriptions: number; 
    userConnections: number; 
    publicConnections: number;
    subscriptionTypes?: {
      market: number;
      user: number;
      other: number;
    };
  }) | null = null;

  constructor() {
    this.logFile = path.join(process.cwd(), 'logs', 'system-metrics.log');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  registerWebSocketStatsCallback(callback: () => { 
    activeConnections: number; 
    totalSubscriptions: number; 
    userConnections: number; 
    publicConnections: number;
    subscriptionTypes?: {
      market: number;
      user: number;
      other: number;
    };
  }) {
    this.wsStatsCallback = callback;
  }

  trackWebSocketMessageSent() {
    this.wsMessagesSent++;
  }

  trackWebSocketMessageReceived() {
    this.wsMessagesReceived++;
  }

  private updateWebSocketHistory() {
    const now = Date.now();
    this.wsMessageHistory.push({
      sent: this.wsMessagesSent,
      received: this.wsMessagesReceived,
      timestamp: now
    });

    // Use synchronized timing for history retention
    const historyWindowMs = this.intervalSeconds * this.TIMING_SYNC.historyRetentionMultiplier * 1000;
    const cutoffTime = now - historyWindowMs;
    this.wsMessageHistory = this.wsMessageHistory.filter(entry => entry.timestamp > cutoffTime);
  }

  private getWebSocketMetrics() {
    // Update message history with current counts
    this.updateWebSocketHistory();
    
    // Use synchronized calculation window (multiple of monitoring interval)
    const now = Date.now();
    const calculationWindowMs = this.intervalSeconds * this.TIMING_SYNC.calculationWindowMultiplier * 1000;
    const windowStartTime = now - calculationWindowMs;
    
    // Get all entries from the calculation window
    const windowEntries = this.wsMessageHistory.filter(entry => entry.timestamp > windowStartTime);
    
    let messagesSentLastMinute = 0;
    let messagesReceivedLastMinute = 0;
    
    if (windowEntries.length >= 2) {
      // Use the earliest and latest entries within the calculation window
      const earliest = windowEntries[0]!;
      const latest = windowEntries[windowEntries.length - 1]!;
      
      const rawSentDelta = latest.sent - earliest.sent;
      const rawReceivedDelta = latest.received - earliest.received;
      
      // Convert to per-minute rate based on actual time span
      const timeSpanSeconds = (latest.timestamp - earliest.timestamp) / 1000;
      if (timeSpanSeconds > 0) {
        const minuteMultiplier = 60 / timeSpanSeconds;
        messagesSentLastMinute = Math.round(rawSentDelta * minuteMultiplier);
        messagesReceivedLastMinute = Math.round(rawReceivedDelta * minuteMultiplier);
      }
      
      // Debug logging
      if (process.env.DEBUG_WEBSOCKET_METRICS === 'true') {
        console.log(`[WS Metrics] Calculation window: ${calculationWindowMs/1000}s`);
        console.log(`[WS Metrics] Window entries: ${windowEntries.length}`);
        console.log(`[WS Metrics] Actual time span: ${timeSpanSeconds.toFixed(1)}s`);
        console.log(`[WS Metrics] Raw delta: sent=${rawSentDelta}, received=${rawReceivedDelta}`);
        console.log(`[WS Metrics] Per-minute rate: sent=${messagesSentLastMinute}, received=${messagesReceivedLastMinute}`);
      }
    } else {
      // If we don't have enough entries, use 0
      if (process.env.DEBUG_WEBSOCKET_METRICS === 'true') {
        console.log(`[WS Metrics] Insufficient entries (${windowEntries.length}) in calculation window, using 0 rates`);
      }
    }
    
    // Get connection stats from callback
    const connectionStats = this.wsStatsCallback ? this.wsStatsCallback() : {
      activeConnections: 0,
      totalSubscriptions: 0,
      userConnections: 0,
      publicConnections: 0,
      subscriptionTypes: {
        market: 0,
        user: 0,
        other: 0
      }
    };
    
    return {
      ...connectionStats,
      messagesSentLastMinute,
      messagesReceivedLastMinute,
      subscriptionTypes: connectionStats.subscriptionTypes || {
        market: 0,
        user: 0,
        other: 0
      }
    };
  }

  async collectMetrics(): Promise<SystemMetrics> {
    try {
      const memoryUsage = process.memoryUsage();
      let databaseSizeBytes = 0;

      // Get database size if environment variable is available
      if (process.env.PONDER_DATABASE_URL) {
        try {
          const dbUrl = process.env.PONDER_DATABASE_URL;
          const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'postgres';
          
          const sizeResult = await execAsync(`psql "${dbUrl}" -t -c "SELECT pg_database_size('${dbName}');"`)
            .catch(() => ({ stdout: '0' }));
          
          databaseSizeBytes = parseInt(sizeResult.stdout.trim(), 10) || 0;
        } catch (dbError) {
          console.error('Error getting database size:', dbError);
        }
      }

      // Get record counts from database tables
      const dbUrl = process.env.PONDER_DATABASE_URL || '';
      
      const tableCountPromises = [
        execAsync(`psql "${dbUrl}" -t -c "SELECT COUNT(*) FROM pools"`),
        execAsync(`psql "${dbUrl}" -t -c "SELECT COUNT(*) FROM orders"`),
        execAsync(`psql "${dbUrl}" -t -c "SELECT COUNT(*) FROM order_book_trades"`),
        execAsync(`psql "${dbUrl}" -t -c "SELECT COUNT(*) FROM order_book_depth"`),
        execAsync(`psql "${dbUrl}" -t -c "SELECT COUNT(*) FROM balances"`),
      ];

      // Get CPU usage - use top to get overall system CPU usage
      const cpuUsagePromise = execAsync('top -l 1 | grep "CPU usage" | awk \'{ print $3 }\'').catch(() => ({ stdout: '0.0%' }));
      
      // Get disk usage for the current directory
      const diskUsagePromise = execAsync('df -k . | tail -1 | awk \'{ print $2,$3,$4,$5 }\'').catch(() => ({ stdout: '0 0 0 0%' }));
      
      // Get network connections count
      const networkConnectionsPromise = execAsync('netstat -an | grep -c ESTABLISHED').catch(() => ({ stdout: '0' }));
      
      // Get network stats
      const networkStatsPromise = execAsync('netstat -s | grep -E "total packets received|total packets sent"').catch(() => ({ stdout: '' }));

      // Wait for all promises to resolve
      const [
        recordCounts,
        cpuUsageResult,
        diskUsageResult,
        networkConnectionsResult,
        networkStatsResult
      ] = await Promise.all([
        Promise.all(tableCountPromises.map((p, index) => p.catch(e => {
          const tables = ['pools', 'orders', 'order_book_trades', 'order_book_depth', 'balances'];
          console.error(`SystemMonitor: Database query error for ${tables[index]}:`, e.message);
          return { stdout: '0' };
        }))),
        cpuUsagePromise,
        diskUsagePromise,
        networkConnectionsPromise,
        networkStatsPromise
      ]);

      // Parse CPU usage - top returns a percentage like "10.5%"
      const cpuUsageStr = cpuUsageResult.stdout.trim();
      const cpuUsage = parseFloat(cpuUsageStr.replace('%', '')) || 0;
      
      let diskMetrics = {
        total: 0,
        used: 0,
        free: 0,
        usagePercent: 0
      };
      try {
        // Parse the output to get total, used, free, and percentage
        const [total, used, free, usagePercent] = diskUsageResult.stdout.trim().split(' ');
        
        // Convert to bytes
        const totalBytes = parseInt(total || '0') * 1024;
        const usedBytes = parseInt(used || '0') * 1024;
        const freeBytes = parseInt(free || '0') * 1024;
        const usagePercentValue = parseInt((usagePercent || '0').replace('%', ''));
        
        diskMetrics = {
          total: totalBytes,
          used: usedBytes,
          free: freeBytes,
          usagePercent: usagePercentValue
        };
      } catch (error) {
        console.error('Error parsing disk usage:', error);
        // Provide fallback values
        diskMetrics = {
          total: 0,
          used: 0,
          free: 0,
          usagePercent: 0
        };
      }

      // Parse network connections
      const connections = parseInt(networkConnectionsResult.stdout.trim(), 10) || 0;
      
      // Parse network stats
      let totalReceived = 0;
      let totalSent = 0;
      
      try {
        const receivedMatch = networkStatsResult.stdout.match(/total packets received\s+(\d+)/);
        const sentMatch = networkStatsResult.stdout.match(/total packets sent\s+(\d+)/);
        
        if (receivedMatch && receivedMatch[1]) {
          totalReceived = parseInt(receivedMatch[1], 10);
        }
        
        if (sentMatch && sentMatch[1]) {
          totalSent = parseInt(sentMatch[1], 10);
        }
      } catch (error) {
        console.error('Error parsing network stats:', error);
      }
      
      // Collect log file sizes
      const logFiles: Record<string, number> = {};
      let totalLogSize = 0;
      
      try {
        // Get all log files in the logs directory
        const logDir = path.join(process.cwd(), 'logs');
        if (fs.existsSync(logDir)) {
          const files = fs.readdirSync(logDir);
          
          for (const file of files) {
            if (file.endsWith('.log')) {
              const filePath = path.join(logDir, file);
              const stats = fs.statSync(filePath);
              logFiles[file] = stats.size;
              totalLogSize += stats.size;
            }
          }
        }
      } catch (error) {
        console.error('Error collecting log file sizes:', error);
      }
      
      // Get WebSocket metrics
      const wsMetrics = this.getWebSocketMetrics();
      
      return {
        timestamp: new Date().toISOString(),
        database: {
          sizeBytes: databaseSizeBytes,
          sizeMB: databaseSizeBytes / (1024 * 1024),
          tables: {
            pools: parseInt(recordCounts[0]?.stdout?.trim() || '0') || 0,
            orders: parseInt(recordCounts[1]?.stdout?.trim() || '0') || 0,
            orderBookTrades: parseInt(recordCounts[2]?.stdout?.trim() || '0') || 0,
            orderBookDepth: parseInt(recordCounts[3]?.stdout?.trim() || '0') || 0,
            balances: parseInt(recordCounts[4]?.stdout?.trim() || '0') || 0,
          }
        },
        records: {
          pools: parseInt(recordCounts[0]?.stdout?.trim() || '0') || 0,
          orders: parseInt(recordCounts[1]?.stdout?.trim() || '0') || 0,
          trades: parseInt(recordCounts[2]?.stdout?.trim() || '0') || 0,
          depth: parseInt(recordCounts[3]?.stdout?.trim() || '0') || 0,
          balances: parseInt(recordCounts[4]?.stdout?.trim() || '0') || 0,
        },
        memory: {
          rss: memoryUsage.rss / (1024 * 1024),
          heapTotal: memoryUsage.heapTotal / (1024 * 1024),
          heapUsed: memoryUsage.heapUsed / (1024 * 1024),
          external: memoryUsage.external / (1024 * 1024),
        },
        systemMemory: {
          total: os.totalmem() / (1024 * 1024),
          free: os.freemem() / (1024 * 1024),
          used: (os.totalmem() - os.freemem()) / (1024 * 1024),
          percentUsed: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        },
        cpu: {
          usage: cpuUsage,
          loadAvg: os.loadavg(),
          cores: os.cpus().length
        },
        disk: diskMetrics,
        logs: {
          totalSizeBytes: totalLogSize,
          files: logFiles
        },
        network: {
          connections,
          totalReceived,
          totalSent
        },
        websocket: wsMetrics,
        uptime: Math.round(process.uptime())
      };
    } catch (error) {
      console.error('Error collecting metrics:', error);
      throw error;
    }
  }

  private logMetrics(metrics: SystemMetrics) {
    const logEntry = JSON.stringify(metrics) + '\n';
    
    fs.appendFileSync(this.logFile, logEntry);
    
    this.trimLogFile();
  }

  private trimLogFile() {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length > 1000) {
        const trimmedContent = lines.slice(-1000).join('\n') + '\n';
        fs.writeFileSync(this.logFile, trimmedContent);
      }
    } catch (error) {
      console.error('Error trimming log file:', error);
    }
  }

  start(intervalSeconds?: number) {
    if (this.isRunning) {
      console.log('System monitor already running');
      return;
    }
    
    // Check for environment variable first, then use provided value, then default to 60 seconds
    const envInterval = process.env.SYSTEM_MONITOR_INTERVAL ? 
      parseInt(process.env.SYSTEM_MONITOR_INTERVAL, 10) : undefined;
    
    // Use environment variable if available, otherwise use the provided value or synchronized default
    this.intervalSeconds = envInterval || intervalSeconds || this.TIMING_SYNC.defaultMonitoringInterval;
    
    const displayTime = this.intervalSeconds >= 60 
      ? `${Math.floor(this.intervalSeconds / 60)} minute${Math.floor(this.intervalSeconds / 60) !== 1 ? 's' : ''}` 
      : `${this.intervalSeconds} second${this.intervalSeconds !== 1 ? 's' : ''}`;
    
    console.log(`Starting system monitor, logging every ${displayTime} to ${this.logFile}`);
    this.isRunning = true;

    this.collectMetrics()
      .then(metrics => this.logMetrics(metrics))
      .catch(error => console.error('Error logging initial metrics:', error));

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.logMetrics(metrics);
      } catch (error) {
        console.error('Error in monitoring interval:', error);
      }
    }, this.intervalSeconds * 1000);
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('System monitor stopped');
  }

  getRecentMetrics(count: number = 10): SystemMetrics[] {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      return lines
        .slice(-count)
        .map(line => JSON.parse(line))
        .reverse(); // Most recent first
    } catch (error) {
      console.error('Error reading metrics log:', error);
      return [];
    }
  }
}

// Export singleton instance
export const systemMonitor = new SystemMonitor();