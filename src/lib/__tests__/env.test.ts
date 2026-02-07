/**
 * Environment Validation Tests
 * Tests for Zod-based environment variable validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Valid test values that meet all format requirements
const VALID_TEST_ENV = {
  DATABASE_URL: 'postgresql://localhost:5432/test',
  GITHUB_TOKEN: 'ghp_' + 'a'.repeat(40), // 40+ chars, starts with ghp_
  GITHUB_ORG_OR_USER: 'test-org',
  GITHUB_REPO: 'test-repo',
  GITHUB_OAUTH_CLIENT_ID: 'Ov23' + 'a'.repeat(20), // Starts with Ov23
  GITHUB_OAUTH_CLIENT_SECRET: 'a'.repeat(40), // 30+ chars
  POLAR_WEBHOOK_SECRET: 'polar_whs_' + 'a'.repeat(20), // 20+ chars, starts with polar_whs_
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NODE_ENV: 'development',
  ADMIN_PASSWORD: 'a'.repeat(12), // 12+ chars minimum
};

describe('Environment Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Clear modules to get fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('validateEnv', () => {
    it('should validate correct environment variables', async () => {
      Object.assign(process.env, VALID_TEST_ENV);

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.DATABASE_URL).toBe(VALID_TEST_ENV.DATABASE_URL);
      expect(result.GITHUB_TOKEN).toBe(VALID_TEST_ENV.GITHUB_TOKEN);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept postgres:// prefix for DATABASE_URL', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.DATABASE_URL).toBe('postgres://localhost:5432/test');
    });

    it('should accept github_pat_ token prefix', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.GITHUB_TOKEN = 'github_pat_' + 'a'.repeat(40);

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.GITHUB_TOKEN).toBe('github_pat_' + 'a'.repeat(40));
    });

    it('should accept optional RESEND_API_KEY', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.RESEND_API_KEY = 're_' + 'a'.repeat(20);
      process.env.RESEND_FROM_EMAIL = 'test@example.com';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.RESEND_API_KEY).toBe('re_' + 'a'.repeat(20));
      expect(result.RESEND_FROM_EMAIL).toBe('test@example.com');
    });

    it('should default NODE_ENV to development', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      delete process.env.NODE_ENV;

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.NODE_ENV).toBe('development');
    });
  });

  describe('validation failures', () => {
    it('should fail when DATABASE_URL is missing', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      delete process.env.DATABASE_URL;

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment Variable Validation Failed')
      );
      // Missing required field shows "Required" in Zod
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Required'));
    });

    it('should fail when DATABASE_URL has invalid format', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.DATABASE_URL = 'mysql://localhost:3306/test';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL has invalid format')
      );
    });

    it('should fail when GITHUB_TOKEN has invalid format', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.GITHUB_TOKEN = 'invalid_token';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN'));
    });

    it('should fail when GITHUB_ORG_OR_USER is missing', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      delete process.env.GITHUB_ORG_OR_USER;

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      // Missing required field shows "Required" in Zod
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Required'));
    });

    it('should fail when NEXT_PUBLIC_APP_URL is not a valid URL', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.NEXT_PUBLIC_APP_URL = 'not-a-url';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('valid URL'));
    });

    it('should fail when RESEND_FROM_EMAIL is invalid', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.RESEND_FROM_EMAIL = 'invalid-email';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_FROM_EMAIL'));
    });

    it('should throw in production when validation fails', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      vi.resetModules();

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not throw in development when validation fails', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_URL;

      const { validateEnv } = await import('@/lib/env');

      expect(() => validateEnv()).not.toThrow();
    });

    it('should show multiple validation errors', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      delete process.env.DATABASE_URL;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_ORG_OR_USER;

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      const errorCall = consoleErrorSpy.mock.calls[0][0];
      // Multiple missing fields all show "Required" in error output
      expect(errorCall).toContain('Environment Variable Validation Failed');
      expect(errorCall).toContain('Required');
    });
  });

  describe('exported env constant', () => {
    it('should export validated environment', async () => {
      Object.assign(process.env, VALID_TEST_ENV);

      const { env } = await import('@/lib/env');

      expect(env.DATABASE_URL).toBe(VALID_TEST_ENV.DATABASE_URL);
      expect(env.GITHUB_TOKEN).toBe(VALID_TEST_ENV.GITHUB_TOKEN);
    });
  });

  describe('utility functions', () => {
    it('should correctly identify production environment', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.NODE_ENV = 'production';

      const { isProduction } = await import('@/lib/env');

      expect(isProduction()).toBe(true);
    });

    it('should correctly identify development environment', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.NODE_ENV = 'development';

      const { isDevelopment } = await import('@/lib/env');

      expect(isDevelopment()).toBe(true);
    });

    it('should correctly identify test environment', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.NODE_ENV = 'test';

      const { isTest } = await import('@/lib/env');

      expect(isTest()).toBe(true);
    });

    it('should return false for non-matching environments', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.NODE_ENV = 'production';

      const { isDevelopment, isTest } = await import('@/lib/env');

      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(false);
    });
  });

  describe('optional fields', () => {
    it('should handle optional ADMIN_EMAIL', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.ADMIN_EMAIL = 'admin@example.com';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.ADMIN_EMAIL).toBe('admin@example.com');
    });

    it('should handle optional POLAR_ACCESS_TOKEN', async () => {
      Object.assign(process.env, VALID_TEST_ENV);
      process.env.POLAR_ACCESS_TOKEN = 'polar_token_123';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.POLAR_ACCESS_TOKEN).toBe('polar_token_123');
    });
  });
});
