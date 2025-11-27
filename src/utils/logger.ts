import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Enums for consistent logging
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info', 
  WARN = 'warn',
  ERROR = 'error'
}

export enum LogLabel {
  INDEXER = 'indexer',
  EVENT_HANDLER = 'event-handler',
  DATABASE = 'database',
  VALIDATION = 'validation',
  SYNC = 'sync',
  API = 'api',
  SYSTEM = 'system'
}

export enum ServiceName {
  CLOB_INDEXER = 'clob-indexer',
  CORE_CHAIN = 'core-chain',
  SIDE_CHAIN = 'side-chain'
}

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Simple structured logging without external dependencies for now
// Enhanced event error logging with transaction context
export const logEventError = (
  error: Error, 
  eventType: string,
  txHash?: string, 
  blockNumber?: bigint | number,
  eventArgs?: any,
  additionalContext?: any
) => {
  try {
    const safeError = error || new Error('Unknown event error');
    const errorInfo = {
      level: 'ERROR',
      service: 'clob-indexer',
      label: 'event-handler',
      eventType: eventType || 'unknown',
      transaction: {
        hash: txHash || 'unknown',
        blockNumber: blockNumber?.toString() || 'unknown',
      },
      error: {
        message: safeError.message,
        name: safeError.name,
        stack: safeError.stack?.split('\n').slice(0, 3).join('\n') || 'no stack',
      },
      eventData: eventArgs ? JSON.stringify(eventArgs).substring(0, 1000) : 'unavailable',
      context: additionalContext || {},
      timestamp: new Date().toISOString(),
      processId: process.pid,
    };

    // Console output with emoji for visibility
    const consoleMsg = `❌ [ERROR] Event: ${eventType} | TX: ${txHash} | Block: ${blockNumber} | ${safeError.message}`;
    console.error(consoleMsg);

    // File logging (non-blocking)
    setImmediate(() => {
      try {
        const logLine = JSON.stringify(errorInfo) + '\n';
        fs.appendFileSync(path.join(logsDir, 'events-error.log'), logLine);
      } catch {
        // File logging failed - ignore silently
      }
    });
  } catch {
    try {
      console.error(`[CRITICAL EVENT LOG FAILURE] ${eventType}:`, error?.message || 'Unknown error');
    } catch {
      // Complete failure - ignore
    }
  }
};

// Log successful event processing
export const logEventSuccess = (
  eventType: string,
  txHash?: string,
  blockNumber?: bigint | number, 
  processingTimeMs?: number,
  eventArgs?: any
) => {
  try {
    const eventInfo = {
      level: 'INFO',
      service: 'clob-indexer',
      label: 'event-handler',
      eventType: eventType || 'unknown',
      transaction: {
        hash: txHash || 'unknown',
        blockNumber: blockNumber?.toString() || 'unknown',
      },
      performance: {
        processingTimeMs: processingTimeMs || 0,
      },
      eventData: eventArgs ? JSON.stringify(eventArgs).substring(0, 500) : 'unavailable',
      timestamp: new Date().toISOString(),
    };

    // Console output with emoji
    const consoleMsg = `✅ [SUCCESS] Event: ${eventType} | TX: ${txHash} | Block: ${blockNumber}${processingTimeMs ? ` | ${processingTimeMs}ms` : ''}`;
    console.log(consoleMsg);

    setImmediate(() => {
      try {
        const logLine = JSON.stringify(eventInfo) + '\n';
        fs.appendFileSync(path.join(logsDir, 'events-success.log'), logLine);
      } catch {
        // File logging failed - ignore
      }
    });
  } catch {
    try {
      console.log(`[EVENT LOG FAILURE] ${eventType}`);
    } catch {
      // Ignore complete failure
    }
  }
};

// Log validation failures
export const logValidationError = (
  eventType: string,
  reason: string,
  blockNumber?: bigint | number,
  blockHash?: string,
  eventArgs?: any
) => {
  try {
    const validationInfo = {
      level: 'WARN',
      service: 'clob-indexer',
      label: 'validation',
      eventType: eventType || 'unknown',
      validationFailure: reason || 'unknown',
      block: {
        number: blockNumber?.toString() || 'unknown',
        hash: blockHash || 'unknown',
      },
      eventData: eventArgs ? JSON.stringify(eventArgs).substring(0, 500) : 'unavailable',
      timestamp: new Date().toISOString(),
    };

    // Console output with emoji
    const consoleMsg = `⚠️ [VALIDATION] Event: ${eventType} | Reason: ${reason} | Block: ${blockNumber}`;
    console.warn(consoleMsg);

    setImmediate(() => {
      try {
        const logLine = JSON.stringify(validationInfo) + '\n';
        fs.appendFileSync(path.join(logsDir, 'validation.log'), logLine);
      } catch {
        // File logging failed - ignore
      }
    });
  } catch {
    try {
      console.warn(`[VALIDATION LOG FAILURE] ${eventType}: ${reason}`);
    } catch {
      // Ignore complete failure
    }
  }
};

// Log database operations
export const logDatabaseOperation = (
  operation: string,
  tableName?: string,
  recordCount?: number,
  durationMs?: number,
  error?: Error
) => {
  try {
    const dbInfo = {
      level: error ? 'ERROR' : 'DEBUG',
      service: 'clob-indexer',
      label: 'database',
      database: {
        operation: operation || 'unknown',
        table: tableName || 'unknown',
        recordCount: recordCount || 0,
        durationMs: durationMs || 0,
      },
      error: error ? {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 2).join('\n') || 'no stack',
      } : null,
      timestamp: new Date().toISOString(),
    };

    // Console output with emoji
    const emoji = error ? '💀' : '🗃️';
    const consoleMsg = `${emoji} [DB] ${operation} | Table: ${tableName} | Records: ${recordCount}${error ? ` | ERROR: ${error.message}` : ''}`;
    
    if (error) {
      console.error(consoleMsg);
    } else {
      console.debug(consoleMsg);
    }

    setImmediate(() => {
      try {
        const logFile = error ? 'database-error.log' : 'database.log';
        const logLine = JSON.stringify(dbInfo) + '\n';
        fs.appendFileSync(path.join(logsDir, logFile), logLine);
      } catch {
        // File logging failed - ignore
      }
    });
  } catch {
    try {
      console.log(`[DB LOG FAILURE] ${operation}`);
    } catch {
      // Ignore complete failure  
    }
  }
};

// General safe logging function (matching mm-bot structure)
export const log = (
  level: LogLevel,
  message: string,
  label: LogLabel,
  serviceName: ServiceName,
  data: any,
  filename: string,
  functionName: string,
  fileLoggingEnabled: boolean = true
) => {
  try {
    const safeMessage = String(message || '').substring(0, 10000);
    const safeData = data && typeof data === 'object' ? data : { value: String(data || '') };
    const safeFunctionName = String(functionName || 'unknown').substring(0, 100);
    const safeFilename = String(filename || 'unknown').substring(0, 100);
    const currentTimestamp = new Date().toISOString();

    const logEntry = {
      timestamp: currentTimestamp,
      level: level.toUpperCase(),
      service: String(serviceName?.valueOf() || 'unknown'),
      label: String(label?.valueOf() || 'general'),
      filename: safeFilename,
      function: safeFunctionName,
      message: safeMessage,
      data: safeData,
    };

    // Console output with emojis for visibility (matching mm-bot format)
    const emoji = level === LogLevel.ERROR ? '❌' : level === LogLevel.WARN ? '⚠️' : level === LogLevel.INFO ? 'ℹ️' : '🔍';
    const shortTimestamp = currentTimestamp.substring(11, 19); // Extract HH:MM:SS
    const consoleMessage = `${emoji} [${level.toUpperCase()}] [${shortTimestamp}] [${serviceName}/${label}] ${safeFilename}:${safeFunctionName}() - ${safeMessage}`;
    
    try {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(consoleMessage);
          break;
        case LogLevel.INFO:
          console.log(consoleMessage);
          break;
        case LogLevel.WARN:
          console.warn(consoleMessage);
          break;
        case LogLevel.ERROR:
          console.error(consoleMessage);
          break;
        default:
          console.log(consoleMessage);
      }
    } catch {
      console.log(`[LOG ERROR] ${safeMessage}`);
    }

    // File logging (non-blocking) - only if enabled
    if (fileLoggingEnabled) {
      setImmediate(() => {
        try {
          const logFile = level === LogLevel.ERROR ? 'general-error.log' : 'general.log';
          const logLine = JSON.stringify(logEntry) + '\n';
          fs.appendFileSync(path.join(logsDir, logFile), logLine);
        } catch {
          // File logging failed - ignore silently
        }
      });
    }
  } catch {
    try {
      console.log(`[CRITICAL LOG ERROR] ${message}`);
    } catch {
      // Complete logging failure - ignore
    }
  }
};

// Helper function to create logging functions with pre-filled filename
export const createLogger = (filename: string, serviceName: ServiceName = ServiceName.CORE_CHAIN) => {
  return {
    debug: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.DEBUG, message, label, serviceName, data || {}, filename, functionName),
    
    info: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.INFO, message, label, serviceName, data || {}, filename, functionName),
    
    warn: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.WARN, message, label, serviceName, data || {}, filename, functionName),
    
    error: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.ERROR, message, label, serviceName, data || {}, filename, functionName),
  };
};

export default {
  logEventError,
  logEventSuccess,
  logValidationError,
  logDatabaseOperation,
  log,
  createLogger,
  LogLevel,
  LogLabel,
  ServiceName
};