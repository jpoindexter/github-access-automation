/**
 * Enhanced Error Handler
 * Categorizes errors and provides actionable guidance for fixes
 * Applies Nielsen's Heuristic #9: Help users recognize, diagnose, and recover from errors
 */

export enum ErrorCategory {
  GITHUB_API = 'GITHUB_API',
  POLAR_WEBHOOK = 'POLAR_WEBHOOK',
  DATABASE = 'DATABASE',
  AUTHENTICATION = 'AUTHENTICATION',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  CRITICAL = 'CRITICAL', // System down, requires immediate action
  HIGH = 'HIGH', // Feature broken, affects users
  MEDIUM = 'MEDIUM', // Degraded experience, has workaround
  LOW = 'LOW', // Minor issue, doesn't block functionality
}

export interface CategorizedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  userMessage: string; // User-friendly explanation
  solution: string; // Step-by-step fix
  preventionTip?: string; // How to avoid in future
  docsLink?: string; // Link to documentation
}

/**
 * Error patterns for automatic categorization
 */
const ERROR_PATTERNS: Record<
  string,
  {
    category: ErrorCategory;
    severity: ErrorSeverity;
    userMessage: string;
    solution: string;
    preventionTip?: string;
  }
> = {
  // GitHub API Errors
  'rate limit': {
    category: ErrorCategory.GITHUB_API,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'GitHub rate limit exceeded',
    solution:
      '1. Wait 60 minutes for rate limit reset\n' +
      '2. Check current limit: https://api.github.com/rate_limit\n' +
      '3. Consider upgrading GitHub token scopes\n' +
      '4. Enable retry queue (automatic recovery)',
    preventionTip:
      'Use GitHub Apps (5000 req/hr) instead of Personal Access Tokens (1000 req/hr)',
  },

  'not found': {
    category: ErrorCategory.GITHUB_API,
    severity: ErrorSeverity.HIGH,
    userMessage: 'GitHub user or repository not found',
    solution:
      '1. Verify GitHub username is correct (case-sensitive)\n' +
      '2. Check if user/org exists: https://github.com/USERNAME\n' +
      '3. Ensure repository exists: https://github.com/ORG/REPO\n' +
      '4. Confirm GITHUB_ORG_OR_USER and GITHUB_REPO in .env.local',
    preventionTip: 'Validate GitHub usernames before processing payments',
  },

  'forbidden': {
    category: ErrorCategory.GITHUB_API,
    severity: ErrorSeverity.CRITICAL,
    userMessage: 'GitHub API access denied',
    solution:
      '1. Verify GITHUB_TOKEN has "repo" scope (not just "public_repo")\n' +
      '2. Check token at: GitHub Settings → Developer settings → Personal access tokens\n' +
      '3. Ensure token is not expired\n' +
      '4. Verify repository is private (invitations only work for private repos)',
    preventionTip: 'Use fine-grained tokens with minimal required permissions',
  },

  'maximum number of invitations': {
    category: ErrorCategory.GITHUB_API,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Repository invitation limit reached',
    solution:
      '1. GitHub limits: 50 pending invitations per repository\n' +
      '2. Ask users to accept pending invitations\n' +
      '3. Remove expired/unused invitations manually\n' +
      '4. Consider using GitHub Teams for larger scale',
    preventionTip: 'Monitor pending invitation count and clean up regularly',
  },

  // Polar Webhook Errors
  'signature verification failed': {
    category: ErrorCategory.POLAR_WEBHOOK,
    severity: ErrorSeverity.CRITICAL,
    userMessage: 'Polar webhook signature invalid',
    solution:
      '1. Verify POLAR_WEBHOOK_SECRET matches Polar dashboard\n' +
      '2. Go to: Polar Dashboard → Webhooks → Click "Reveal Secret"\n' +
      '3. Copy exact value (starts with "polar_whs_")\n' +
      '4. Update .env.local and redeploy\n' +
      '5. Check webhook endpoint is using HTTPS (required)',
    preventionTip: 'Never commit webhook secrets to git',
  },

  'timestamp too old': {
    category: ErrorCategory.POLAR_WEBHOOK,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'Webhook timestamp outside valid window',
    solution:
      '1. Check server time is synchronized (use NTP)\n' +
      '2. Webhook must arrive within 5 minutes of creation\n' +
      '3. Verify hosting provider clock is accurate\n' +
      '4. If using tunneling (ngrok), latency may cause issues',
    preventionTip: 'Use production hosting (not localhost tunnels) for webhooks',
  },

  // Database Errors
  'connection refused': {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.CRITICAL,
    userMessage: 'Database connection failed',
    solution:
      '1. Verify DATABASE_URL is correct in .env.local\n' +
      '2. Check database server is running\n' +
      '3. For Neon: Verify project is active (not suspended)\n' +
      '4. Test connection: psql <DATABASE_URL>\n' +
      '5. Check firewall/network rules allow connection',
    preventionTip: 'Use connection pooling and implement health checks',
  },

  'too many connections': {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Database connection pool exhausted',
    solution:
      '1. Reduce max pool size in db.ts (currently 20)\n' +
      '2. Check for connection leaks (always close connections)\n' +
      '3. For Neon: Upgrade plan for more connections\n' +
      '4. Enable connection pooling (PgBouncer for Neon)\n' +
      '5. Review long-running queries',
    preventionTip: 'Always use pool.query() instead of creating new clients',
  },

  'unique constraint': {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'Duplicate record detected',
    solution:
      '1. Customer with this email already exists\n' +
      '2. Use UPSERT instead of INSERT to update existing record\n' +
      '3. Check customer table for existing entry\n' +
      '4. This is handled automatically by ON CONFLICT clause',
    preventionTip: 'Use UPSERT (INSERT ... ON CONFLICT) for idempotency',
  },

  // Authentication Errors
  'unauthorized': {
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Authentication required',
    solution:
      '1. Log in to admin panel: /admin/login\n' +
      '2. Verify ADMIN_PASSWORD is set in .env.local\n' +
      '3. Check session cookie is not expired (24 hours)\n' +
      '4. Clear cookies and log in again',
    preventionTip: 'Use strong passwords (min 12 characters)',
  },

  // Network Errors
  ETIMEDOUT: {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'Network request timed out',
    solution:
      '1. Check internet connection\n' +
      '2. Verify API endpoint is accessible\n' +
      '3. Increase timeout in configuration\n' +
      '4. Retry queue will automatically retry this',
    preventionTip: 'Enable retry queue for automatic recovery',
  },

  ECONNREFUSED: {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Connection refused by server',
    solution:
      '1. Verify server is running\n' +
      '2. Check URL/port is correct\n' +
      '3. Ensure firewall allows connection\n' +
      '4. For localhost: Use 127.0.0.1 instead of localhost',
    preventionTip: 'Always use production URLs in .env.local (not localhost)',
  },
};

/**
 * Categorize error and provide actionable guidance
 */
export function categorizeError(error: Error | string): CategorizedError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorLower = errorMessage.toLowerCase();

  // Try to match against known patterns
  for (const [pattern, config] of Object.entries(ERROR_PATTERNS)) {
    if (errorLower.includes(pattern.toLowerCase())) {
      return {
        category: config.category,
        severity: config.severity,
        code: pattern.toUpperCase().replace(/\s+/g, '_'),
        message: errorMessage,
        userMessage: config.userMessage,
        solution: config.solution,
        preventionTip: config.preventionTip,
      };
    }
  }

  // Default categorization for unknown errors
  return {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    code: 'UNKNOWN_ERROR',
    message: errorMessage,
    userMessage: 'An unexpected error occurred',
    solution:
      '1. Check application logs for details\n' +
      '2. Verify all environment variables are set correctly\n' +
      '3. Try restarting the application\n' +
      '4. Contact support if issue persists',
    preventionTip: 'Enable comprehensive logging to help diagnose issues',
  };
}

/**
 * Format error for display to user
 */
export function formatErrorForUser(error: Error | string): string {
  const categorized = categorizeError(error);

  const severityEmoji = {
    [ErrorSeverity.CRITICAL]: '🚨',
    [ErrorSeverity.HIGH]: '⚠️',
    [ErrorSeverity.MEDIUM]: '⚡',
    [ErrorSeverity.LOW]: 'ℹ️',
  };

  let formatted = `\n${severityEmoji[categorized.severity]} ${categorized.userMessage}\n\n`;
  formatted += `Category: ${categorized.category}\n`;
  formatted += `Severity: ${categorized.severity}\n\n`;
  formatted += `How to fix:\n${categorized.solution}\n`;

  if (categorized.preventionTip) {
    formatted += `\n💡 Prevention tip:\n${categorized.preventionTip}\n`;
  }

  if (categorized.docsLink) {
    formatted += `\n📚 Documentation: ${categorized.docsLink}\n`;
  }

  return formatted;
}

/**
 * Format error for logging (includes full details)
 */
export function formatErrorForLogging(error: Error | string): Record<string, unknown> {
  const categorized = categorizeError(error);

  return {
    category: categorized.category,
    severity: categorized.severity,
    code: categorized.code,
    message: categorized.message,
    userMessage: categorized.userMessage,
    solution: categorized.solution,
    preventionTip: categorized.preventionTip,
    docsLink: categorized.docsLink,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if error should trigger admin alert
 */
export function shouldAlertAdmin(error: Error | string): boolean {
  const categorized = categorizeError(error);

  // Alert on critical and high severity errors
  return (
    categorized.severity === ErrorSeverity.CRITICAL ||
    categorized.severity === ErrorSeverity.HIGH
  );
}

/**
 * Get recommended action for error
 */
export function getRecommendedAction(error: Error | string): string {
  const categorized = categorizeError(error);

  const actions: Record<ErrorCategory, string> = {
    [ErrorCategory.GITHUB_API]: 'Check GitHub token permissions and API limits',
    [ErrorCategory.POLAR_WEBHOOK]: 'Verify webhook configuration in Polar dashboard',
    [ErrorCategory.DATABASE]: 'Check database connection and health',
    [ErrorCategory.AUTHENTICATION]: 'Review authentication configuration',
    [ErrorCategory.VALIDATION]: 'Fix validation errors in request',
    [ErrorCategory.NETWORK]: 'Enable retry queue for automatic recovery',
    [ErrorCategory.UNKNOWN]: 'Review application logs for details',
  };

  return actions[categorized.category];
}
