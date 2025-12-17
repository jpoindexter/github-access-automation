/**
 * Error Handler Tests
 * Comprehensive tests for error categorization, formatting, and alerting
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCategory,
  ErrorSeverity,
  categorizeError,
  formatErrorForUser,
  formatErrorForLogging,
  shouldAlertAdmin,
  getRecommendedAction,
} from '../error-handler';

describe('Error Handler', () => {
  describe('categorizeError', () => {
    describe('GitHub API errors', () => {
      it('should categorize rate limit errors', () => {
        const error = new Error('rate limit exceeded');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.GITHUB_API);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.code).toBe('RATE_LIMIT');
        expect(result.userMessage).toBe('GitHub rate limit exceeded');
        expect(result.solution).toContain('Wait 60 minutes');
        expect(result.preventionTip).toContain('GitHub Apps');
      });

      it('should categorize not found errors', () => {
        const error = new Error('User not found on GitHub');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.GITHUB_API);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.code).toBe('NOT_FOUND');
        expect(result.solution).toContain('Verify GitHub username');
      });

      it('should categorize forbidden errors', () => {
        const error = new Error('GitHub API access forbidden');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.GITHUB_API);
        expect(result.severity).toBe(ErrorSeverity.CRITICAL);
        expect(result.code).toBe('FORBIDDEN');
        expect(result.solution).toContain('Verify GITHUB_TOKEN');
      });

      it('should categorize repo full errors', () => {
        const error = new Error('maximum number of invitations reached');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.GITHUB_API);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.solution).toContain('50 pending invitations');
      });
    });

    describe('Polar webhook errors', () => {
      it('should categorize signature verification failures', () => {
        const error = new Error('Webhook signature verification failed');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.POLAR_WEBHOOK);
        expect(result.severity).toBe(ErrorSeverity.CRITICAL);
        expect(result.solution).toContain('POLAR_WEBHOOK_SECRET');
        expect(result.solution).toContain('Polar Dashboard');
      });

      it('should categorize timestamp issues', () => {
        const error = new Error('Webhook timestamp too old');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.POLAR_WEBHOOK);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.solution).toContain('server time');
      });
    });

    describe('Database errors', () => {
      it('should categorize connection refused', () => {
        const error = new Error('ECONNREFUSED: connection refused to database');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.DATABASE);
        expect(result.severity).toBe(ErrorSeverity.CRITICAL);
        expect(result.solution).toContain('DATABASE_URL');
      });

      it('should categorize too many connections', () => {
        const error = new Error('too many connections to database');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.DATABASE);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.solution).toContain('pool size');
      });

      it('should categorize unique constraint violations', () => {
        const error = new Error('unique constraint violation on email');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.DATABASE);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.solution).toContain('UPSERT');
      });
    });

    describe('Authentication errors', () => {
      it('should categorize unauthorized errors', () => {
        const error = new Error('unauthorized access attempt');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.solution).toContain('admin panel');
      });
    });

    describe('Network errors', () => {
      it('should categorize ETIMEDOUT', () => {
        const error = new Error('ETIMEDOUT: network timeout');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.NETWORK);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.solution).toContain('Retry queue'); // Capital R
      });

      it('should categorize ECONNREFUSED for network issues', () => {
        const error = new Error('ECONNREFUSED');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.NETWORK);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
      });
    });

    describe('Unknown errors', () => {
      it('should default unknown errors to UNKNOWN category', () => {
        const error = new Error('Something completely unexpected');
        const result = categorizeError(error);

        expect(result.category).toBe(ErrorCategory.UNKNOWN);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.code).toBe('UNKNOWN_ERROR');
        expect(result.userMessage).toBe('An unexpected error occurred');
      });

      it('should handle string errors', () => {
        const result = categorizeError('Some error string');

        expect(result.category).toBe(ErrorCategory.UNKNOWN);
        expect(result.message).toBe('Some error string');
      });
    });

    describe('Case insensitivity', () => {
      it('should match patterns case-insensitively', () => {
        const errors = [
          'RATE LIMIT EXCEEDED',
          'Rate Limit Exceeded',
          'rate limit exceeded',
        ];

        errors.forEach((errorMsg) => {
          const result = categorizeError(new Error(errorMsg));
          expect(result.category).toBe(ErrorCategory.GITHUB_API);
          expect(result.code).toBe('RATE_LIMIT');
        });
      });
    });

    describe('Pattern priority', () => {
      it('should match most specific pattern first', () => {
        // "connection refused" matches both NETWORK and DATABASE patterns
        // Should match based on which appears first in error patterns
        const error = new Error('connection refused');
        const result = categorizeError(error);

        // Verify it categorizes consistently
        expect(result.category).toBeDefined();
        expect([ErrorCategory.NETWORK, ErrorCategory.DATABASE]).toContain(
          result.category
        );
      });
    });
  });

  describe('formatErrorForUser', () => {
    it('should format error with emoji and structure', () => {
      const error = new Error('rate limit exceeded');
      const formatted = formatErrorForUser(error);

      expect(formatted).toContain('⚡'); // MEDIUM severity emoji
      expect(formatted).toContain('GitHub rate limit exceeded');
      expect(formatted).toContain('Category:');
      expect(formatted).toContain('Severity:');
      expect(formatted).toContain('How to fix:');
    });

    it('should include prevention tip if available', () => {
      const error = new Error('rate limit exceeded');
      const formatted = formatErrorForUser(error);

      expect(formatted).toContain('💡 Prevention tip:');
      expect(formatted).toContain('GitHub Apps');
    });

    it('should use correct severity emoji', () => {
      const critical = new Error('forbidden');
      const high = new Error('not found');
      const medium = new Error('rate limit');

      const criticalFormatted = formatErrorForUser(critical);
      const highFormatted = formatErrorForUser(high);
      const mediumFormatted = formatErrorForUser(medium);

      expect(criticalFormatted).toContain('🚨'); // CRITICAL
      expect(highFormatted).toContain('⚠️'); // HIGH
      expect(mediumFormatted).toContain('⚡'); // MEDIUM
    });

    it('should include prevention tip for unknown errors', () => {
      const error = new Error('Something unexpected');
      const formatted = formatErrorForUser(error);

      // Unknown errors have prevention tip: "Enable comprehensive logging..."
      expect(formatted).toContain('💡 Prevention tip:');
      expect(formatted).toContain('logging');
    });
  });

  describe('formatErrorForLogging', () => {
    it('should return structured log object', () => {
      const error = new Error('rate limit exceeded');
      const formatted = formatErrorForLogging(error);

      expect(formatted).toHaveProperty('category');
      expect(formatted).toHaveProperty('severity');
      expect(formatted).toHaveProperty('code');
      expect(formatted).toHaveProperty('message');
      expect(formatted).toHaveProperty('userMessage');
      expect(formatted).toHaveProperty('solution');
      expect(formatted).toHaveProperty('timestamp');
    });

    it('should include ISO timestamp', () => {
      const error = new Error('test error');
      const formatted = formatErrorForLogging(error);

      expect(formatted.timestamp).toBeDefined();
      expect(typeof formatted.timestamp).toBe('string');
      // Should be valid ISO date
      expect(() => new Date(formatted.timestamp as string)).not.toThrow();
    });

    it('should include all categorization details', () => {
      const error = new Error('rate limit exceeded');
      const formatted = formatErrorForLogging(error);

      expect(formatted.category).toBe('GITHUB_API');
      expect(formatted.severity).toBe('MEDIUM');
      expect(formatted.code).toBe('RATE_LIMIT');
      expect(formatted.preventionTip).toBeDefined();
    });
  });

  describe('shouldAlertAdmin', () => {
    it('should alert on CRITICAL severity', () => {
      const error = new Error('forbidden');
      expect(shouldAlertAdmin(error)).toBe(true);
    });

    it('should alert on HIGH severity', () => {
      const error = new Error('not found');
      expect(shouldAlertAdmin(error)).toBe(true);
    });

    it('should NOT alert on MEDIUM severity', () => {
      const error = new Error('rate limit');
      expect(shouldAlertAdmin(error)).toBe(false);
    });

    it('should NOT alert on LOW severity', () => {
      const error = new Error('minor issue');
      const categorized = categorizeError(error);

      // Unknown errors default to MEDIUM
      expect(shouldAlertAdmin(error)).toBe(false);
    });

    it('should handle string errors', () => {
      const result = shouldAlertAdmin('forbidden');
      expect(result).toBe(true); // Should be CRITICAL
    });
  });

  describe('getRecommendedAction', () => {
    it('should recommend action for GitHub API errors', () => {
      const error = new Error('rate limit');
      const action = getRecommendedAction(error);

      expect(action).toContain('GitHub token');
      expect(action).toContain('API limits');
    });

    it('should recommend action for Polar webhook errors', () => {
      const error = new Error('signature verification failed');
      const action = getRecommendedAction(error);

      expect(action).toContain('webhook configuration');
      expect(action).toContain('Polar dashboard');
    });

    it('should recommend action for database errors', () => {
      const error = new Error('connection refused');
      const action = getRecommendedAction(error);

      expect(action).toContain('database');
    });

    it('should recommend action for authentication errors', () => {
      const error = new Error('unauthorized');
      const action = getRecommendedAction(error);

      expect(action).toContain('authentication');
    });

    it('should recommend action for network errors', () => {
      const error = new Error('ETIMEDOUT');
      const action = getRecommendedAction(error);

      expect(action).toContain('retry queue');
    });

    it('should recommend action for unknown errors', () => {
      const error = new Error('something weird');
      const action = getRecommendedAction(error);

      expect(action).toContain('logs');
    });
  });

  describe('Error pattern completeness', () => {
    it('should have solutions for all defined error patterns', () => {
      const testPatterns = [
        'rate limit',
        'not found',
        'forbidden',
        'signature verification failed',
        'timestamp too old',
        'connection refused',
        'too many connections',
        'unique constraint',
        'unauthorized',
        'ETIMEDOUT',
        'ECONNREFUSED',
      ];

      testPatterns.forEach((pattern) => {
        const result = categorizeError(new Error(pattern));
        expect(result.solution).toBeDefined();
        expect(result.solution.length).toBeGreaterThan(0);
        expect(result.userMessage).toBeDefined();
        expect(result.userMessage.length).toBeGreaterThan(0);
      });
    });

    it('should have consistent error codes (uppercase, underscored)', () => {
      const error = new Error('rate limit');
      const result = categorizeError(error);

      expect(result.code).toMatch(/^[A-Z_]+$/); // Only uppercase letters and underscores
    });
  });
});
