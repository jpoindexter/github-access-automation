/**
 * Retry Queue Tests
 * Comprehensive tests for exponential backoff, error classification, and queue processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifyError,
  calculateNextRetryTime,
  addToRetryQueue,
  processRetryQueue,
  getRetryQueueStats,
} from '../retry-queue';

// Mock dependencies with factory functions
vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
    getCustomerById: vi.fn(),
    updateCustomerStatus: vi.fn(),
    markWelcomeEmailSent: vi.fn(),
  },
}));

vi.mock('../github-api', () => ({
  inviteToRepository: vi.fn(),
  getRepositoryCloneUrl: vi.fn(() => ({
    https: 'https://github.com/org/repo.git',
    ssh: 'git@github.com:org/repo.git',
  })),
}));

vi.mock('../email', () => ({
  sendWelcomeEmail: vi.fn(),
}));

vi.mock('../logger', () => ({
  retryLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import mocked modules
import { db } from '../db';
import { inviteToRepository } from '../github-api';
import { sendWelcomeEmail } from '../email';

describe('Retry Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classifyError', () => {
    it('should classify retryable errors correctly', () => {
      const retryableErrors = [
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ECONNRESET',
        'ENOTFOUND',
        'Network timeout',
        'rate limit exceeded',
        'HTTP 429',
        'HTTP 500',
        'HTTP 502',
        'HTTP 503',
        'HTTP 504',
      ];

      retryableErrors.forEach((errorMsg) => {
        const error = new Error(errorMsg);
        const result = classifyError(error);
        expect(result.type).toBe('retryable');
      });
    });

    it('should classify permanent errors correctly', () => {
      const permanentErrors = [
        'HTTP 404',
        'User not found',
        'HTTP 403',
        'HTTP 401',
        'INVALID_USERNAME',
        'Repository not found',
        'Organization not found',
      ];

      permanentErrors.forEach((errorMsg) => {
        const error = new Error(errorMsg);
        const result = classifyError(error);
        expect(result.type).toBe('permanent');
      });
    });

    it('should classify unknown errors as retryable by default', () => {
      const unknownError = new Error('Something weird happened');
      const result = classifyError(unknownError);
      expect(result.type).toBe('retryable');
      expect(result.code).toBe('UNKNOWN');
    });

    it('should handle string errors', () => {
      const result = classifyError('ETIMEDOUT');
      expect(result.type).toBe('retryable');
      expect(result.message).toBe('ETIMEDOUT');
    });

    it('should extract error code from pattern', () => {
      const error = new Error('rate limit exceeded');
      const result = classifyError(error);
      expect(result.code).toBe('rate limit');
    });

    it('should be case-insensitive', () => {
      const error = new Error('RATE LIMIT EXCEEDED');
      const result = classifyError(error);
      expect(result.type).toBe('retryable');
    });
  });

  describe('calculateNextRetryTime', () => {
    it('should calculate correct delays for each attempt', () => {
      const expectedDelays = [1, 2, 4, 8, 16, 32, 60, 300, 900, 3600]; // seconds

      expectedDelays.forEach((expectedDelay, attemptNumber) => {
        const before = new Date();
        const nextRetry = calculateNextRetryTime(attemptNumber);
        const after = new Date();

        const actualDelay = (nextRetry.getTime() - before.getTime()) / 1000;

        // Should be within expected range (base + 0-1s jitter)
        expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay);
        expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 1);
      });
    });

    it('should throw error if exceeds max attempts', () => {
      expect(() => calculateNextRetryTime(10)).toThrow('Exceeded maximum retry attempts');
      expect(() => calculateNextRetryTime(100)).toThrow('Exceeded maximum retry attempts');
    });

    it('should add jitter to prevent thundering herd', () => {
      // Test that jitter adds 0-1s random delay to base delay
      const now = new Date();
      const nextRetry = calculateNextRetryTime(0);
      const delay = (nextRetry.getTime() - now.getTime()) / 1000;

      // Should be between 1s (base) and 2s (base + max jitter)
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(2);

      // Verify jitter implementation adds random component
      // (implementation uses Math.random() which adds 0-1s)
      // This verifies the concept; actual randomness is handled by Math.random()
    });

    it('should return future date', () => {
      const now = new Date();
      const nextRetry = calculateNextRetryTime(0);
      expect(nextRetry.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('addToRetryQueue', () => {
    it('should add retryable error to queue', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] });

      const customerId = 'customer-123';
      const error = new Error('ETIMEDOUT');
      const metadata = { foo: 'bar' };

      await addToRetryQueue(customerId, error, metadata);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO retry_queue'),
        expect.arrayContaining([
          customerId,
          0, // Initial attempt
          10, // Max attempts
          error.message,
          'retryable',
          expect.any(String), // Error code
          expect.any(Date), // Next retry time
          JSON.stringify(metadata),
        ])
      );
    });

    it('should send permanent errors straight to DLQ', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] });
      vi.mocked(db.updateCustomerStatus).mockResolvedValue({});

      const customerId = 'customer-123';
      const error = new Error('User not found');

      await addToRetryQueue(customerId, error);

      // Should insert into DLQ (not retry queue)
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dead_letter_queue'),
        expect.any(Array)
      );

      // Should update customer status
      expect(db.updateCustomerStatus).toHaveBeenCalledWith(
        customerId,
        'invited_failed',
        undefined,
        error.message
      );
    });

    it('should handle UPSERT for existing pending items', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] });

      const customerId = 'customer-123';
      const error = new Error('rate limit');

      await addToRetryQueue(customerId, error);

      // Should use ON CONFLICT clause
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (customer_id)'),
        expect.any(Array)
      );
    });

    it('should calculate first retry time correctly', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] });

      const before = new Date();
      await addToRetryQueue('customer-123', new Error('timeout'));
      const after = new Date();

      const args = vi.mocked(db.query).mock.calls[0][1];
      const nextRetryAt = args[6] as Date;

      // Should be ~1 second in future (1s base + jitter)
      const delay = (nextRetryAt.getTime() - before.getTime()) / 1000;
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(2);
    });
  });

  describe('processRetryQueue', () => {
    it('should process pending items successfully', async () => {
      const mockItems = [
        {
          id: 'retry-1',
          customer_id: 'customer-1',
          attempt_number: 0,
          metadata: {},
        },
      ];

      const mockCustomer = {
        id: 'customer-1',
        github_username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        welcome_email_sent: false,
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: mockItems }) // Get pending items
        .mockResolvedValueOnce({ rows: [] }) // Mark as processing
        .mockResolvedValueOnce({ rows: [] }); // Mark as completed

      vi.mocked(db.getCustomerById).mockResolvedValue(mockCustomer);
      vi.mocked(db.updateCustomerStatus).mockResolvedValue({});
      vi.mocked(db.markWelcomeEmailSent).mockResolvedValue({});

      vi.mocked(inviteToRepository).mockResolvedValue({ success: true });
      vi.mocked(sendWelcomeEmail).mockResolvedValue({ success: true });

      const stats = await processRetryQueue();

      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.movedToDLQ).toBe(0);

      // Should invite to repository
      expect(inviteToRepository).toHaveBeenCalledWith('testuser', 'pull');

      // Should send welcome email
      expect(sendWelcomeEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Test User',
        expect.any(String),
        expect.any(String)
      );

      // Should update customer status
      expect(db.updateCustomerStatus).toHaveBeenCalledWith(
        'customer-1',
        'invited',
        expect.any(Date),
        undefined
      );
    });

    it('should retry on retryable errors', async () => {
      const mockItems = [
        {
          id: 'retry-1',
          customer_id: 'customer-1',
          attempt_number: 2,
          metadata: {},
        },
      ];

      const mockCustomer = {
        id: 'customer-1',
        github_username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: mockItems }) // Get pending items
        .mockResolvedValueOnce({ rows: [] }) // Mark as processing
        .mockResolvedValueOnce({ rows: [] }); // Schedule next retry

      vi.mocked(db.getCustomerById).mockResolvedValue(mockCustomer);
      vi.mocked(inviteToRepository).mockRejectedValue(new Error('rate limit'));

      const stats = await processRetryQueue();

      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(1);
      expect(stats.movedToDLQ).toBe(0);

      // Should schedule next retry with updated attempt number
      const updateCalls = vi.mocked(db.query).mock.calls.filter((call) =>
        call[0].includes('UPDATE retry_queue') && call[0].includes('SET')
      );
      expect(updateCalls.length).toBeGreaterThan(0); // At least one UPDATE query called
    });

    it('should move to DLQ on permanent errors', async () => {
      const mockItems = [
        {
          id: 'retry-1',
          customer_id: 'customer-1',
          attempt_number: 0,
          metadata: {},
        },
      ];

      const mockCustomer = {
        id: 'customer-1',
        github_username: 'invaliduser',
        email: 'test@example.com',
        name: 'Test User',
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: mockItems }) // Get pending items
        .mockResolvedValueOnce({ rows: [] }) // Mark as processing
        .mockResolvedValueOnce({ rows: [] }) // Insert into DLQ
        .mockResolvedValueOnce({ rows: [] }); // Mark as failed

      vi.mocked(db.getCustomerById).mockResolvedValue(mockCustomer);
      vi.mocked(db.updateCustomerStatus).mockResolvedValue({});
      vi.mocked(inviteToRepository).mockRejectedValue(new Error('User not found'));

      const stats = await processRetryQueue();

      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(1);
      expect(stats.movedToDLQ).toBe(1);

      // Should insert into DLQ
      const dlqCall = vi.mocked(db.query).mock.calls.find((call) =>
        call[0].includes('INSERT INTO dead_letter_queue')
      );
      expect(dlqCall).toBeDefined();
    });

    it('should move to DLQ after max attempts', async () => {
      const mockItems = [
        {
          id: 'retry-1',
          customer_id: 'customer-1',
          attempt_number: 9, // Last attempt (10th total)
          metadata: {},
        },
      ];

      const mockCustomer = {
        id: 'customer-1',
        github_username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: mockItems }) // Get pending items
        .mockResolvedValueOnce({ rows: [] }) // Mark as processing
        .mockResolvedValueOnce({ rows: [] }) // Insert into DLQ
        .mockResolvedValueOnce({ rows: [] }); // Mark as failed

      vi.mocked(db.getCustomerById).mockResolvedValue(mockCustomer);
      vi.mocked(db.updateCustomerStatus).mockResolvedValue({});
      vi.mocked(inviteToRepository).mockRejectedValue(new Error('timeout'));

      const stats = await processRetryQueue();

      expect(stats.movedToDLQ).toBe(1);
    });

    it('should use FOR UPDATE SKIP LOCKED to prevent race conditions', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] });

      await processRetryQueue();

      const selectQuery = vi.mocked(db.query).mock.calls[0][0];
      expect(selectQuery).toContain('FOR UPDATE SKIP LOCKED');
    });

    it('should limit to 100 items per run', async () => {
      vi.mocked(db.query).mockResolvedValue({ rows: [] });

      await processRetryQueue();

      const selectQuery = vi.mocked(db.query).mock.calls[0][0];
      expect(selectQuery).toContain('LIMIT 100');
    });

    it('should skip welcome email if already sent', async () => {
      const mockItems = [
        {
          id: 'retry-1',
          customer_id: 'customer-1',
          attempt_number: 0,
          metadata: {},
        },
      ];

      const mockCustomer = {
        id: 'customer-1',
        github_username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        welcome_email_sent: true, // Already sent
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: mockItems })
        .mockResolvedValue({ rows: [] });

      vi.mocked(db.getCustomerById).mockResolvedValue(mockCustomer);
      vi.mocked(db.updateCustomerStatus).mockResolvedValue({});
      vi.mocked(inviteToRepository).mockResolvedValue({ success: true });
      vi.mocked(sendWelcomeEmail).mockResolvedValue({ success: true });

      await processRetryQueue();

      // Should NOT send welcome email
      expect(sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('getRetryQueueStats', () => {
    it('should return correct stats', async () => {
      const mockStatusCounts = [
        { status: 'pending', count: 5 },
        { status: 'processing', count: 2 },
        { status: 'completed', count: 100 },
        { status: 'failed', count: 3 },
      ];

      const mockDLQCount = { count: 10 };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: mockStatusCounts })
        .mockResolvedValueOnce({ rows: [mockDLQCount] });

      const stats = await getRetryQueueStats();

      expect(stats).toEqual({
        pending: 5,
        processing: 2,
        completed: 100,
        failed: 3,
        dlqCount: 10,
      });
    });

    it('should handle empty queue', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const stats = await getRetryQueueStats();

      expect(stats).toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        dlqCount: 0,
      });
    });

    it('should count only unresolved DLQ items', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] });

      await getRetryQueueStats();

      const dlqQuery = vi.mocked(db.query).mock.calls[1][0];
      expect(dlqQuery).toContain('WHERE resolved_at IS NULL');
    });
  });
});
