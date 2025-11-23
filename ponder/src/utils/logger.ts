import dotenv from "dotenv";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

dotenv.config();

// Configurable logging options
export interface LogConfig {
  includeBlockNumber?: boolean;
  includeTransactionHash?: boolean;
  includeFile?: boolean;
  includeFunction?: boolean;
  includeStep?: boolean;
}

// Get log configuration from environment variables
const getLogConfigFromEnv = (): LogConfig => {
  return {
    includeBlockNumber: process.env.LOG_INCLUDE_BLOCK_NUMBER !== 'false',
    includeTransactionHash: process.env.LOG_INCLUDE_TRANSACTION_HASH !== 'false',
    includeFile: process.env.LOG_INCLUDE_FILE !== 'false',
    includeFunction: process.env.LOG_INCLUDE_FUNCTION !== 'false',
    includeStep: process.env.LOG_INCLUDE_STEP !== 'false'
  };
};

// Default log configuration from environment
export const DEFAULT_LOG_CONFIG: LogConfig = getLogConfigFromEnv();

// Helper function to format log prefix with configurable fields
export const formatLogPrefix = (
  event: any, 
  fileName: string, 
  functionName: string, 
  step?: string, 
  config: LogConfig = DEFAULT_LOG_CONFIG
) => {
  const parts: string[] = [];
  
  if (config.includeBlockNumber && event?.block?.number) {
    parts.push(`Block number: ${event.block.number}`);
  }
  
  if (config.includeTransactionHash && event?.transaction?.hash) {
    parts.push(`Transaction hash: ${event.transaction.hash}`);
  }
  
  if (config.includeFile) {
    parts.push(`File: ${fileName}`);
  }
  
  if (config.includeFunction) {
    parts.push(`Function: ${functionName}`);
  }
  
  if (config.includeStep && step) {
    parts.push(step);
  }
  
  return parts.join(', ');
};

// Utility function for functions without event context
export const formatLogPrefixSimple = (
  blockNumber: number | undefined,
  fileName: string,
  functionName: string,
  step?: string,
  config: LogConfig = DEFAULT_LOG_CONFIG
) => {
  const parts: string[] = [];
  
  if (config.includeBlockNumber && blockNumber !== undefined) {
    parts.push(`Block number: ${blockNumber}`);
  }
  
  if (config.includeFile) {
    parts.push(`File: ${fileName}`);
  }
  
  if (config.includeFunction) {
    parts.push(`Function: ${functionName}`);
  }
  
  if (config.includeStep && step) {
    parts.push(step);
  }
  
  return parts.join(', ');
};

// Utility function to safely stringify objects containing BigInt values
export const safeStringify = (obj: any, space?: string | number): string => {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, space);
};

// Error logging interface
export interface ErrorLogEntry {
  timestamp: string;
  functionName: string;
  fileName: string;
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  context: {
    blockNumber?: number;
    transactionHash?: string;
    eventArgs?: any;
    functionParameters?: any;
  };
}

// Write error to log file
export const writeErrorToFile = (
  functionName: string,
  fileName: string,
  error: Error,
  functionParameters: any = {},
  event?: any
) => {
  const errorLogPath = join(process.cwd(), 'error-logs.json');
  
  const errorEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    functionName,
    fileName,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context: {
      blockNumber: event?.block?.number,
      transactionHash: event?.transaction?.hash,
      eventArgs: event ? safeStringify(event.args) : undefined,
      functionParameters: safeStringify(functionParameters)
    }
  };

  let existingLogs: ErrorLogEntry[] = [];
  
  if (existsSync(errorLogPath)) {
    try {
      const fileContent = readFileSync(errorLogPath, 'utf8');
      existingLogs = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('Failed to parse existing error log file:', parseError);
      existingLogs = [];
    }
  }

  existingLogs.push(errorEntry);
  
  try {
    // Use a custom replacer function to handle BigInt serialization
    const jsonString = JSON.stringify(existingLogs, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    writeFileSync(errorLogPath, jsonString);
  } catch (writeError) {
    console.error('Failed to write error to log file:', writeError);
  }
};

// Helper to create a log function for a specific file and function
export const createLogger = (fileName: string, functionName: string) => {
  return {
    // For functions with event context
    log: (event: any, step: string) => formatLogPrefix(event, fileName, functionName, step),
    // For functions without event context
    logSimple: (blockNumber: number | undefined, step: string) => formatLogPrefixSimple(blockNumber, fileName, functionName, step),
    // For error logging
    writeError: (error: Error, functionParameters: any = {}, event?: any) => 
      writeErrorToFile(functionName, fileName, error, functionParameters, event)
  };
};