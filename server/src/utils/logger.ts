import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists in the server root
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format to generate local time timestamp: YYYY-MM-DD HH:mm:ss.SSS
const localTimestamp = winston.format((info) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  info.timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  return info;
});

const consoleFormat = winston.format.combine(
  localTimestamp(),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}]: ${message}${metaStr}`;
  })
);

const fileFormat = winston.format.combine(
  localTimestamp(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaStr}`;
  })
);

const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  format: fileFormat,
});

const errorFileRotateTransport = new DailyRotateFile({
  level: 'error',
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  format: fileFormat,
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    fileRotateTransport,
    errorFileRotateTransport,
  ],
});

/**
 * Every failure a user met, one JSON object per line: refusals the server raised (`source:
 * 'server'`) and failures the client reported (`source: 'client'`) — timeouts, being offline, replies
 * it could not read — which the server never sees on its own (SYNC-2). Kept apart from the prose
 * logs, and kept longer, because it is written to be analysed: what fails, how often, for whom, on
 * which action. The fault analyser in FUTURE_IDEAS.md reads this file.
 */
const failureLogger = winston.createLogger({
  level: 'info',
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'failures-%DATE%.jsonl'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',
      format: winston.format.printf(({ message }) => String(message)),
    }),
  ],
});

export interface FailureRecord {
  source: 'server' | 'client';
  /** Why it failed: the server refused it, no answer came back, or the reply could not be read. */
  kind: 'refused' | 'no-answer' | 'unexpected-reply';
  actionType?: string;
  message: string;
  userId?: string | null;
  requestId?: string;
  /** Client only: when it happened on the device, the platform and the screen. */
  occurredAt?: string;
  platform?: string;
  screen?: string;
}

export function recordFailure(record: FailureRecord): void {
  failureLogger.info(JSON.stringify({ at: new Date().toISOString(), ...record }));
}

// Helper function to stringify arguments passed to console logging methods
const formatArgs = (args: any[]): string => {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
};

// Override standard console logging methods so all existing server logs
// automatically include local timestamps and are written to log files.
console.log = (...args: any[]) => {
  logger.info(formatArgs(args));
};

console.info = (...args: any[]) => {
  logger.info(formatArgs(args));
};

console.warn = (...args: any[]) => {
  logger.warn(formatArgs(args));
};

console.error = (...args: any[]) => {
  logger.error(formatArgs(args));
};

console.debug = (...args: any[]) => {
  logger.debug(formatArgs(args));
};

export default logger;
