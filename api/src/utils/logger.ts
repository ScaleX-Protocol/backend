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
  SYSTEM = 'system',
  FAUCET = 'faucet',
  RATE_LIMIT = 'rate-limit',
  REQUEST = 'request'
}

export enum ServiceName {
  CLOB_INDEXER = 'clob-indexer',
  CORE_CHAIN = 'core-chain',
  SIDE_CHAIN = 'side-chain',
  SCALEX_API = 'scalex-api'
}

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}


// General safe logging function (matching mm-bot structure)
export const log = (
  level: LogLevel,
  message: string,
  label: LogLabel,
  serviceName: ServiceName,
  data: any,
  filename: string,
  functionName: string,
  fileLoggingEnabled: boolean = false
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
export const createLogger = (filename: string, serviceName: ServiceName = ServiceName.SCALEX_API) => {
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
  log,
  createLogger,
  LogLevel,
  LogLabel,
  ServiceName
};