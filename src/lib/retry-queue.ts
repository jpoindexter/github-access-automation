/**
 * Retry Queue Service
 * Implements exponential backoff retry strategy with dead letter queue
 * Based on industry best practices (Stripe, AWS SQS)
 */

import { db } from './db';
import { inviteToRepository } from './github-api';
import { sendWelcomeEmail } from './email';
import { retryLogger } from './logger';

/**
 * Exponential backoff schedule (in seconds)
 * Industry standard retry intervals
 */
const BACKOFF_SCHEDULE = [
  1, // 1 second
  2, // 2 seconds
  4, // 4 seconds
  8, // 8 seconds
  16, // 16 seconds
  32, // 32 seconds
  60, // 1 minute
  300, // 5 minutes
  900, // 15 minutes
  3600, // 1 hour
];

const MAX_ATTEMPTS = BACKOFF_SCHEDULE.length; // 10 attempts

/**
 * Retryable error patterns (temporary failures)
 */
const RETRYABLE_ERRORS = [
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'Network timeout',
  'rate limit',
  '429', // Rate limit
  '500', // Internal server error
  '502', // Bad gateway
  '503', // Service unavailable
  '504', // Gateway timeout
];

/**
 * Permanent error patterns (won't succeed on retry)
 */
const PERMANENT_ERRORS = [
  '404', // Not found
  '403', // Forbidden / Repo full
  '401', // Unauthorized
  'INVALID_USERNAME',
  'User not found',
  'Repository not found',
  'Organization not found',
];

/**
 * Error classification
 */
interface ErrorClassification {
  type: 'retryable' | 'permanent';
  code: string;
  message: string;
}

/**
 * Classify error as retryable or permanent
 */
export function classifyError(error: Error | string): ErrorClassification {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorString = errorMessage.toLowerCase();

  // Check permanent errors first
  for (const pattern of PERMANENT_ERRORS) {
    if (errorString.includes(pattern.toLowerCase())) {
      return {
        type: 'permanent',
        code: pattern,
        message: errorMessage,
      };
    }
  }

  // Check retryable errors
  for (const pattern of RETRYABLE_ERRORS) {
    if (errorString.includes(pattern.toLowerCase())) {
      return {
        type: 'retryable',
        code: pattern,
        message: errorMessage,
      };
    }
  }

  // Default to retryable for unknown errors (safer to retry)
  return {
    type: 'retryable',
    code: 'UNKNOWN',
    message: errorMessage,
  };
}

/**
 * Calculate next retry time with exponential backoff + jitter
 */
export function calculateNextRetryTime(attemptNumber: number): Date {
  if (attemptNumber >= MAX_ATTEMPTS) {
    throw new Error('Exceeded maximum retry attempts');
  }

  const baseDelay = BACKOFF_SCHEDULE[attemptNumber];

  // Add jitter (0-1 second random delay) to prevent thundering herd
  const jitter = Math.random();
  const totalDelay = baseDelay + jitter;

  const nextRetry = new Date();
  nextRetry.setSeconds(nextRetry.getSeconds() + totalDelay);

  return nextRetry;
}

/**
 * Add failed invitation to retry queue
 */
export async function addToRetryQueue(
  customerId: string,
  error: Error | string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const classification = classifyError(error);

  retryLogger.info('Adding to retry queue', {
    customerId,
    errorType: classification.type,
    errorCode: classification.code,
  });

  // If permanent error, go straight to DLQ
  if (classification.type === 'permanent') {
    await moveToDLQ(customerId, classification.message, 0, classification.type);
    retryLogger.warn('Permanent error - moved to DLQ', { customerId });
    return;
  }

  // Calculate first retry time (1 second + jitter)
  const nextRetryAt = calculateNextRetryTime(0);

  await db.query(
    `
    INSERT INTO retry_queue (
      customer_id,
      attempt_number,
      max_attempts,
      last_error,
      error_type,
      error_code,
      next_retry_at,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (customer_id) WHERE status = 'pending' OR status = 'processing'
    DO UPDATE SET
      last_error = EXCLUDED.last_error,
      error_code = EXCLUDED.error_code,
      next_retry_at = EXCLUDED.next_retry_at,
      updated_at = NOW()
  `,
    [
      customerId,
      0, // Initial attempt
      MAX_ATTEMPTS,
      classification.message,
      classification.type,
      classification.code,
      nextRetryAt,
      JSON.stringify(metadata || {}),
    ]
  );
}

/**
 * Process retry queue (called by cron job)
 */
export async function processRetryQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  movedToDLQ: number;
}> {
  const stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    movedToDLQ: 0,
  };

  // Get items ready for retry
  const result = await db.query(
    `
    SELECT id, customer_id, attempt_number, metadata
    FROM retry_queue
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
    ORDER BY next_retry_at ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  `
  );

  const items = result.rows as Array<{
    id: string;
    customer_id: string;
    attempt_number: number;
    metadata: Record<string, unknown>;
  }>;

  retryLogger.info('Processing retry queue', { count: items.length });

  for (const item of items) {
    stats.processed++;

    try {
      // Mark as processing
      await db.query(
        `
        UPDATE retry_queue
        SET status = 'processing'
        WHERE id = $1
      `,
        [item.id]
      );

      // Get customer details
      const customer = await db.getCustomerById(item.customer_id);

      if (!customer || !customer.github_username) {
        throw new Error('Customer not found or missing GitHub username');
      }

      // Attempt GitHub invitation
      retryLogger.info('Retrying GitHub invitation', {
        customerId: item.customer_id,
        attempt: item.attempt_number + 1,
        githubUsername: customer.github_username,
      });

      const inviteResult = await inviteToRepository(customer.github_username, 'pull');

      if (!inviteResult.success) {
        throw new Error(inviteResult.error || 'GitHub invitation failed');
      }

      // Success! Update customer and remove from queue
      await db.updateCustomerStatus(item.customer_id, 'invited', new Date(), undefined);

      // Send welcome email if not already sent
      if (!customer.welcome_email_sent) {
        await sendWelcomeEmail(customer.email, customer.name, '', '');
        await db.markWelcomeEmailSent(item.customer_id);
      }

      // Mark as completed
      await db.query(
        `
        UPDATE retry_queue
        SET status = 'completed', completed_at = NOW()
        WHERE id = $1
      `,
        [item.id]
      );

      stats.succeeded++;

      retryLogger.info('Retry succeeded', {
        customerId: item.customer_id,
        attempt: item.attempt_number + 1,
      });
    } catch (error) {
      stats.failed++;

      const classification = classifyError(error as Error);
      const nextAttempt = item.attempt_number + 1;

      retryLogger.error('Retry failed', {
        customerId: item.customer_id,
        attempt: nextAttempt,
        error: classification.message,
        errorType: classification.type,
      });

      // Check if we should retry again or move to DLQ
      if (classification.type === 'permanent' || nextAttempt >= MAX_ATTEMPTS) {
        // Move to dead letter queue
        await moveToDLQ(
          item.customer_id,
          classification.message,
          nextAttempt,
          classification.type
        );

        await db.query(
          `
          UPDATE retry_queue
          SET status = 'failed', completed_at = NOW()
          WHERE id = $1
        `,
          [item.id]
        );

        stats.movedToDLQ++;

        retryLogger.warn('Moved to DLQ', {
          customerId: item.customer_id,
          reason:
            classification.type === 'permanent' ? 'permanent error' : 'max attempts exceeded',
        });
      } else {
        // Schedule next retry
        const nextRetryAt = calculateNextRetryTime(nextAttempt);

        await db.query(
          `
          UPDATE retry_queue
          SET
            status = 'pending',
            attempt_number = $2,
            last_error = $3,
            error_code = $4,
            next_retry_at = $5,
            updated_at = NOW()
          WHERE id = $1
        `,
          [item.id, nextAttempt, classification.message, classification.code, nextRetryAt]
        );

        retryLogger.info('Scheduled next retry', {
          customerId: item.customer_id,
          nextAttempt: nextAttempt + 1,
          nextRetryAt,
        });
      }
    }
  }

  retryLogger.info('Retry queue processing complete', stats);

  return stats;
}

/**
 * Move item to dead letter queue
 */
async function moveToDLQ(
  customerId: string,
  finalError: string,
  attemptsMade: number,
  errorType: 'retryable' | 'permanent'
): Promise<void> {
  await db.query(
    `
    INSERT INTO dead_letter_queue (
      customer_id,
      final_error,
      error_type,
      attempts_made,
      metadata
    )
    SELECT
      customer_id,
      $2,
      $3,
      $4,
      metadata
    FROM retry_queue
    WHERE customer_id = $1
    ON CONFLICT (customer_id) DO NOTHING
  `,
    [customerId, finalError, errorType, attemptsMade]
  );

  // Update customer status
  await db.updateCustomerStatus(customerId, 'invited_failed', undefined, finalError);
}

/**
 * Get retry queue stats
 */
export async function getRetryQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dlqCount: number;
}> {
  const result = await db.query(`
    SELECT status, COUNT(*)::int as count
    FROM retry_queue
    GROUP BY status
  `);

  const dlqResult = await db.query(`
    SELECT COUNT(*)::int as count
    FROM dead_letter_queue
    WHERE resolved_at IS NULL
  `);

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dlqCount: (dlqResult.rows[0] as { count: number })?.count || 0,
  };

  for (const row of result.rows as Array<{ status: string; count: number }>) {
    const key = row.status as keyof Omit<typeof stats, 'dlqCount'>;
    if (key in stats) {
      stats[key] = row.count;
    }
  }

  return stats;
}
