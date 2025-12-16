/**
 * Logger Tests
 * Tests for structured logging with PII redaction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  describe('debug logging', () => {
    it('should log debug messages in development', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      logger.debug('Debug message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
    });

    it('should not log debug messages in production', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      logger.debug('Debug message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should include context in debug logs', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      logger.debug('Debug with context', { userId: '123', action: 'test' });

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('userId')
      );
    });
  });

  describe('info logging', () => {
    it('should log info messages', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );
    });

    it('should include context in info logs', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Request received', { method: 'POST', path: '/api/test' });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Request received')
      );
    });
  });

  describe('warn logging', () => {
    it('should log warning messages', async () => {
      const { logger } = await import('@/lib/logger');

      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning message')
      );
    });
  });

  describe('error logging', () => {
    it('should log error messages', async () => {
      const { logger } = await import('@/lib/logger');

      logger.error('Error occurred');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred')
      );
    });

    it('should include Error object details', async () => {
      const { logger } = await import('@/lib/logger');

      const error = new Error('Test error');
      logger.error('Failed to process', error);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('Failed to process');
      expect(logOutput).toContain('Test error');
    });

    it('should include stack trace in development', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      const error = new Error('Test error');
      logger.error('Failed', error);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('stack');
    });

    it('should not include stack trace in production', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      const error = new Error('Test error');
      logger.error('Failed', error);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('stack');
    });

    it('should handle non-Error objects', async () => {
      const { logger } = await import('@/lib/logger');

      logger.error('Failed', 'string error');

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('string error');
    });

    it('should handle null/undefined errors', async () => {
      const { logger } = await import('@/lib/logger');

      logger.error('Failed', undefined, { context: 'test' });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('PII redaction', () => {
    it('should redact password fields', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('User login', { username: 'john', password: 'secret123' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('john');
      expect(logOutput).not.toContain('secret123');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact token fields', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('API call', { token: 'ghp_1234567890abcdef' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('ghp_1234567890abcdef');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact API keys', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Config', { api_key: 'sk_live_123456789' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('sk_live_123456789');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact email fields', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('User data', { email: 'user@example.com' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('user@example.com');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact secret fields', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Webhook', { webhook_secret: 'whsec_abc123' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('whsec_abc123');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact authorization headers', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Request', { authorization: 'Bearer token123' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('Bearer token123');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact GitHub tokens in strings', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Config', {
        githubToken: 'ghp_veryLongTokenString1234567890',
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('ghp_veryLongTokenString');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact Stripe keys in strings', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Payment', { stripeKey: 'sk_test_veryLongStripeKey123456789' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('sk_test_veryLongStripeKey');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact Polar tokens in strings', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Webhook', {
        polarToken: 'polar_test_veryLongToken123456789',
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('polar_test_veryLongToken');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should redact nested sensitive fields', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Nested data', {
        user: {
          name: 'John',
          password: 'secret',
        },
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('John');
      expect(logOutput).not.toContain('secret');
    });

    it('should redact sensitive fields in arrays', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Array data', {
        users: [{ name: 'John', password: 'secret1' }, { name: 'Jane', token: 'secret2' }],
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('secret1');
      expect(logOutput).not.toContain('secret2');
    });

    it('should handle deep nesting without stack overflow', async () => {
      const { logger } = await import('@/lib/logger');

      const deepObject: Record<string, unknown> = {};
      let current = deepObject;
      for (let i = 0; i < 20; i++) {
        current.next = {};
        current = current.next as Record<string, unknown>;
      }

      logger.info('Deep nesting', deepObject);

      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should handle null and undefined values', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Null values', { nullValue: null, undefinedValue: undefined });

      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should preserve non-sensitive data', async () => {
      const { logger } = await import('@/lib/logger');

      logger.info('Safe data', {
        username: 'johndoe',
        userId: 123,
        action: 'login',
        timestamp: new Date().toISOString(),
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('johndoe');
      expect(logOutput).toContain('123');
      expect(logOutput).toContain('login');
    });

    it('should redact token-like strings by content pattern (not just field name)', async () => {
      const { logger } = await import('@/lib/logger');

      // Test strings that match token patterns in non-sensitive field names
      logger.info('Token test', {
        safeFieldName: 'ghp_abcdefghij1234567890abc', // > 20 chars, starts with ghp_
        anotherField: 'sk_live_abcdefghij1234567890abc', // starts with sk_
        thirdField: 'pk_test_abcdefghij1234567890abc', // starts with pk_
        resendToken: 're_abcdefghij1234567890abcdef', // starts with re_
        polarField: 'polar_abcdefghij1234567890abc', // starts with polar_
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      // These should all be redacted because the STRING VALUE matches the pattern
      expect(logOutput).not.toContain('ghp_abcdefghij1234567890abc');
      expect(logOutput).not.toContain('sk_live_abcdefghij1234567890abc');
      expect(logOutput).not.toContain('pk_test_abcdefghij1234567890abc');
      expect(logOutput).not.toContain('re_abcdefghij1234567890abcdef');
      expect(logOutput).not.toContain('polar_abcdefghij1234567890abc');
    });

    it('should not redact short strings even if they start with token prefix', async () => {
      const { logger } = await import('@/lib/logger');

      // Short strings (< 20 chars) should NOT be redacted even if they look like token prefixes
      logger.info('Short strings', {
        field1: 'ghp_short', // < 20 chars
        field2: 'sk_test',   // < 20 chars
      });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('ghp_short');
      expect(logOutput).toContain('sk_test');
    });
  });

  describe('child logger', () => {
    it('should create child logger with base context', async () => {
      const { logger } = await import('@/lib/logger');

      const childLogger = logger.child({ service: 'api', version: '1.0' });
      childLogger.info('API request');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('service');
      expect(logOutput).toContain('api');
      expect(logOutput).toContain('version');
    });

    it('should merge child context with log context', async () => {
      const { logger } = await import('@/lib/logger');

      const childLogger = logger.child({ service: 'webhook' });
      childLogger.info('Processing', { orderId: '123' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('webhook');
      expect(logOutput).toContain('123');
    });

    it('should support all log levels', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      const childLogger = logger.child({ component: 'test' });

      childLogger.debug('Debug');
      childLogger.info('Info');
      childLogger.warn('Warn');
      childLogger.error('Error');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('component-specific loggers', () => {
    it('should export webhookLogger', async () => {
      const { webhookLogger } = await import('@/lib/logger');

      webhookLogger.info('Webhook received');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('webhook');
    });

    it('should export dbLogger', async () => {
      const { dbLogger } = await import('@/lib/logger');

      dbLogger.info('Database query');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('database');
    });

    it('should export githubLogger', async () => {
      const { githubLogger } = await import('@/lib/logger');

      githubLogger.info('GitHub API call');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('github');
    });

    it('should export emailLogger', async () => {
      const { emailLogger } = await import('@/lib/logger');

      emailLogger.info('Email sent');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('email');
    });

    it('should export authLogger', async () => {
      const { authLogger } = await import('@/lib/logger');

      authLogger.info('User authenticated');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('auth');
    });
  });

  describe('log formatting', () => {
    it('should format logs as JSON in production', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      logger.info('Test message', { key: 'value' });

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(() => JSON.parse(logOutput)).not.toThrow();
      const parsed = JSON.parse(logOutput);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
    });

    it('should format logs for readability in development', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { logger } = await import('@/lib/logger');

      logger.info('Test message');

      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('INFO');
      expect(logOutput).toContain('Test message');
    });
  });
});
