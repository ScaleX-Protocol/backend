import { log, LogLevel, LogLabel } from './logger';

// Environment-aware logging levels
const LOG_LEVELS = {
  SILENT: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
} as const;

const currentLogLevel = process.env.NODE_ENV === 'production'
  ? LOG_LEVELS.INFO
  : process.env.LOG_LEVEL === 'debug'
    ? LOG_LEVELS.DEBUG
    : LOG_LEVELS.INFO;

export class SimpleLogger {
  private moduleName: string;
  private functionName: string;

  constructor(module: string, functionName?: string) {
    this.moduleName = module;
    this.functionName = functionName || 'unknown';
  }

  private shouldLog(level: keyof typeof LOG_LEVELS): boolean {
    return LOG_LEVELS[level] <= currentLogLevel;
  }

  // Map module name to LogLabel
  private getLabel(): LogLabel {
    const moduleLower = this.moduleName.toLowerCase();
    if (moduleLower.includes('event') || moduleLower.includes('handler')) return LogLabel.EVENT_HANDLER;
    if (moduleLower.includes('db') || moduleLower.includes('database')) return LogLabel.DATABASE;
    if (moduleLower.includes('sync')) return LogLabel.SYNC;
    if (moduleLower.includes('api')) return LogLabel.API;
    if (moduleLower.includes('valid')) return LogLabel.VALIDATION;
    return LogLabel.INDEXER;
  }

  // Log error - sends to console, file, and OTEL
  error(message: string, error?: Error, meta?: Record<string, any>) {
    if (this.shouldLog('ERROR')) {
      const data = {
        ...meta,
        ...(error && {
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack?.substring(0, 500),
        }),
      };
      log(LogLevel.ERROR, message, this.getLabel(), data, this.moduleName, this.functionName);
    }
  }

  // Log warning - sends to console, file, and OTEL
  warn(message: string, meta?: Record<string, any>) {
    if (this.shouldLog('WARN')) {
      log(LogLevel.WARN, message, this.getLabel(), meta || {}, this.moduleName, this.functionName);
    }
  }

  // Log info - sends to console, file, and OTEL
  info(message: string, meta?: Record<string, any>) {
    if (this.shouldLog('INFO')) {
      log(LogLevel.INFO, message, this.getLabel(), meta || {}, this.moduleName, this.functionName);
    }
  }

  // Log debug - sends to console, file, and OTEL
  debug(message: string, meta?: Record<string, any>) {
    if (this.shouldLog('DEBUG')) {
      log(LogLevel.DEBUG, message, this.getLabel(), meta || {}, this.moduleName, this.functionName);
    }
  }

  // Backward compatibility methods
  log(event: any, step: string) {
    this.info(step, { event: typeof event === 'object' ? event : { value: event } });
  }

  logSimple(blockNumber: number | undefined, step: string) {
    this.info(step, { blockNumber });
  }

  writeError(error: Error, functionParameters?: any, event?: any) {
    this.error(error.message, error, { functionParameters, event });
  }
}

// Factory function for consistent logger creation
export const getLogger = (module: string, functionName?: string) => {
  return new SimpleLogger(module, functionName);
};
