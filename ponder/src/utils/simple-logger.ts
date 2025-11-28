import { createLogger } from '../utils/logger';

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
  private logger: ReturnType<typeof createLogger>;
  private moduleName: string;
  private functionName: string;
  
  constructor(module: string, functionName?: string) {
    this.moduleName = module;
    this.functionName = functionName || '';
    this.logger = createLogger(module, this.functionName);
  }

  private shouldLog(level: keyof typeof LOG_LEVELS): boolean {
    return LOG_LEVELS[level] <= currentLogLevel;
  }

  // Only log critical errors
  error(message: string, error?: Error, meta?: Record<string, any>) {
    if (this.shouldLog('ERROR')) {
      this.logger.writeError(error || new Error(message), meta);
    }
  }

  // Only log important warnings
  warn(message: string, meta?: Record<string, any>) {
    if (this.shouldLog('WARN')) {
      console.warn(`[${this.moduleName}:${this.functionName}] ${message}`, meta);
    }
  }

  // Only log important business events
  info(message: string, meta?: Record<string, any>) {
    if (this.shouldLog('INFO')) {
      console.info(`[${this.moduleName}:${this.functionName}] ${message}`, meta);
    }
  }

  // Minimal debug logging for troubleshooting
  debug(message: string, meta?: Record<string, any>) {
    if (this.shouldLog('DEBUG')) {
      console.debug(`[${this.moduleName}:${this.functionName}] ${message}`, meta);
    }
  }

  // Original methods for backward compatibility
  log(event: any, step: string) {
    return this.logger.log(event, step);
  }

  logSimple(blockNumber: number | undefined, step: string) {
    return this.logger.logSimple(blockNumber, step);
  }

  writeError(error: Error, functionParameters?: any, event?: any) {
    return this.logger.writeError(error, functionParameters, event);
  }
}

// Factory function for consistent logger creation
export const getLogger = (module: string, functionName?: string) => {
  return new SimpleLogger(module, functionName);
};