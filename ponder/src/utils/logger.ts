import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// OTEL configuration
const OTEL_BASE_URL = process.env.OTEL_BASE_URL;
const OTEL_LOGS_ENDPOINT = OTEL_BASE_URL ? `${OTEL_BASE_URL}/v1/logs` : null;

// Service name from environment variable
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'unknown-service';

// Map log levels to OTEL severity numbers
const severityMap: Record<string, { number: number; text: string }> = {
  debug: { number: 5, text: 'DEBUG' },
  info: { number: 9, text: 'INFO' },
  warn: { number: 13, text: 'WARN' },
  error: { number: 17, text: 'ERROR' },
};

// Send log to OTEL collector (non-blocking)
const sendToOtel = async (logEntry: {
  timestamp: string;
  level: string;
  service: string;
  label: string;
  filename: string;
  function: string;
  message: string;
  data: any;
}) => {
  if (!OTEL_LOGS_ENDPOINT) return;

  try {
    const severity = severityMap[logEntry.level.toLowerCase()] ?? { number: 9, text: 'INFO' };
    const timeUnixNano = BigInt(new Date(logEntry.timestamp).getTime()) * BigInt(1_000_000);

    // Safely stringify data
    let dataString = '{}';
    try {
      dataString = JSON.stringify(logEntry.data || {});
    } catch {
      dataString = '{"error": "Failed to stringify data"}';
    }

    const otelPayload = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: logEntry.service } },
              { key: 'service.label', value: { stringValue: logEntry.label } },
            ],
          },
          scopeLogs: [
            {
              scope: {
                name: 'ponder-logger',
                version: '1.0.0',
              },
              logRecords: [
                {
                  timeUnixNano: timeUnixNano.toString(),
                  observedTimeUnixNano: timeUnixNano.toString(),
                  severityNumber: severity.number,
                  severityText: severity.text,
                  body: { stringValue: logEntry.message },
                  attributes: [
                    { key: 'filename', value: { stringValue: logEntry.filename || 'unknown' } },
                    { key: 'function', value: { stringValue: logEntry.function || 'unknown' } },
                    { key: 'label', value: { stringValue: logEntry.label || 'general' } },
                    { key: 'data', value: { stringValue: dataString } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // const response = await fetch(OTEL_LOGS_ENDPOINT, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(otelPayload),
    // });

    // // Log OTEL errors to console for debugging
    // if (!response.ok) {
    //   const responseText = await response.text().catch(() => 'Unable to read response');
    //   console.error(`[OTEL] Failed to send log to ${OTEL_LOGS_ENDPOINT}`);
    //   console.error(`[OTEL] Status: ${response.status} ${response.statusText}`);
    //   console.error(`[OTEL] Response: ${responseText}`);
    //   console.error(`[OTEL] Payload: ${JSON.stringify(otelPayload, null, 2)}`);
    // }
  } catch (error) {
    // Log OTEL connection errors for debugging
    console.error(`[OTEL] Connection error to ${OTEL_LOGS_ENDPOINT}`);
    console.error(`[OTEL] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error && error.stack) {
      console.error(`[OTEL] Stack: ${error.stack}`);
    }
  }
};

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
      service: SERVICE_NAME,
      label: String(label?.valueOf() || 'general'),
      filename: safeFilename,
      function: safeFunctionName,
      message: safeMessage,
      data: safeData,
    };

    // Console output with emojis for visibility (matching mm-bot format)
    const emoji = level === LogLevel.ERROR ? '❌' : level === LogLevel.WARN ? '⚠️' : level === LogLevel.INFO ? 'ℹ️' : '🔍';
    const shortTimestamp = currentTimestamp.substring(11, 19); // Extract HH:MM:SS
    const consoleMessage = `${emoji} [${level.toUpperCase()}] [${shortTimestamp}] [${SERVICE_NAME}/${label}] ${safeFilename}:${safeFunctionName}() - ${safeMessage}`;

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

    // Send to OTEL collector (non-blocking, fire and forget)
    sendToOtel(logEntry).catch(() => {
      // Silently ignore - OTEL failures should never affect the application
    });
  } catch {
    try {
      console.log(`[CRITICAL LOG ERROR] ${message}`);
    } catch {
      // Complete logging failure - ignore
    }
  }
};

// Helper function to create logging functions with pre-filled filename
export const createLogger = (filename: string) => {
  return {
    debug: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.DEBUG, message, label, data || {}, filename, functionName),

    info: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.INFO, message, label, data || {}, filename, functionName),

    warn: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.WARN, message, label, data || {}, filename, functionName),

    error: (message: string, label: LogLabel, functionName: string, data?: any) =>
      log(LogLevel.ERROR, message, label, data || {}, filename, functionName),
  };
};

export default {
  log,
  createLogger,
  LogLevel,
  LogLabel
};