/**
 * Structured Logger
 * Production-ready logging with PII redaction
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  context?: LogContext;
}

// Sensitive fields to redact
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'email',
  'ssn',
  'credit_card',
  'api_key',
];

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(data: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH]';

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Redact strings that look like tokens/keys
    if (data.length > 20 && /^(ghp_|sk_|pk_|re_|polar_)/.test(data)) {
      return '[REDACTED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return redacted;
  }

  return data;
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    // JSON format for production (log aggregation)
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] ?? entry.timestamp;
  const levelColors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';
  const color = levelColors[entry.level];

  let output = `${timestamp} ${color}${entry.level.toUpperCase().padEnd(5)}${reset} ${entry.message}`;

  if (entry.context && Object.keys(entry.context).length > 0) {
    output += ` ${JSON.stringify(entry.context)}`;
  }

  return output;
}

/**
 * Create log entry
 */
function createLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'github-access-automation',
    environment: process.env.NODE_ENV || 'development',
    context: context ? (redactSensitiveData(context) as LogContext) : undefined,
  };
}

/**
 * Logger instance
 */
export const logger = {
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'production') return;
    const entry = createLogEntry('debug', message, context);
    console.debug(formatLogEntry(entry));
  },

  info(message: string, context?: LogContext): void {
    const entry = createLogEntry('info', message, context);
    console.info(formatLogEntry(entry));
  },

  warn(message: string, context?: LogContext): void {
    const entry = createLogEntry('warn', message, context);
    console.warn(formatLogEntry(entry));
  },

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = { ...context };

    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.errorName = error.name;
      if (process.env.NODE_ENV !== 'production') {
        errorContext.stack = error.stack?.split('\n').slice(0, 5).join('\n');
      }
    } else if (error) {
      errorContext.error = String(error);
    }

    const entry = createLogEntry('error', message, errorContext);
    console.error(formatLogEntry(entry));
  },

  /**
   * Create a child logger with preset context
   */
  child(baseContext: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        logger.debug(message, { ...baseContext, ...context }),
      info: (message: string, context?: LogContext) =>
        logger.info(message, { ...baseContext, ...context }),
      warn: (message: string, context?: LogContext) =>
        logger.warn(message, { ...baseContext, ...context }),
      error: (message: string, error?: Error | unknown, context?: LogContext) =>
        logger.error(message, error, { ...baseContext, ...context }),
    };
  },
};

// Component-specific loggers
export const webhookLogger = logger.child({ component: 'webhook' });
export const dbLogger = logger.child({ component: 'database' });
export const githubLogger = logger.child({ component: 'github' });
export const emailLogger = logger.child({ component: 'email' });
export const authLogger = logger.child({ component: 'auth' });

export default logger;
