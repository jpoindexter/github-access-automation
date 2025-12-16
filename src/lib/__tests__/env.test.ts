/**
 * Environment Validation Tests
 * Tests for Zod-based environment variable validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Environment Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.NODE_ENV = 'development';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.DATABASE_URL).toBe('postgresql://localhost:5432/test');
      expect(result.GITHUB_TOKEN).toBe('ghp_testtoken123');
      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept postgres:// prefix for DATABASE_URL', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.DATABASE_URL).toBe('postgres://localhost:5432/test');
    });

    it('should accept github_pat_ token prefix', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'github_pat_1234567890';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.GITHUB_TOKEN).toBe('github_pat_1234567890');
    });

    it('should accept optional RESEND_API_KEY', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.RESEND_API_KEY = 're_123456';
      process.env.RESEND_FROM_EMAIL = 'test@example.com';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.RESEND_API_KEY).toBe('re_123456');
      expect(result.RESEND_FROM_EMAIL).toBe('test@example.com');
    });

    it('should default NODE_ENV to development', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      delete process.env.NODE_ENV;

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.NODE_ENV).toBe('development');
    });
  });

  describe('validation failures', () => {
    it('should fail when DATABASE_URL is missing', async () => {
      delete process.env.DATABASE_URL;
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.NODE_ENV = 'development';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment variables')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL')
      );
    });

    it('should fail when DATABASE_URL has invalid format', async () => {
      process.env.DATABASE_URL = 'mysql://localhost:3306/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('PostgreSQL connection string')
      );
    });

    it('should fail when GITHUB_TOKEN has invalid format', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'invalid_token';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('valid GitHub personal access token')
      );
    });

    it('should fail when GITHUB_ORG_OR_USER is missing', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      delete process.env.GITHUB_ORG_OR_USER;
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_ORG_OR_USER')
      );
    });

    it('should fail when NEXT_PUBLIC_APP_URL is not a valid URL', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'not-a-url';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('valid URL')
      );
    });

    it('should fail when RESEND_FROM_EMAIL is invalid', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.RESEND_FROM_EMAIL = 'invalid-email';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment variables')
      );
    });

    it('should throw in production when validation fails', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      vi.resetModules();

      // validateEnv() is called at module load, so we need to catch the import error
      await expect(import('@/lib/env')).rejects.toThrow('Invalid environment configuration');
    });

    it('should not throw in development when validation fails', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_URL;

      const { validateEnv } = await import('@/lib/env');

      expect(() => validateEnv()).not.toThrow();
    });

    it('should show multiple validation errors', async () => {
      delete process.env.DATABASE_URL;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_ORG_OR_USER;
      process.env.NODE_ENV = 'development';

      const { validateEnv } = await import('@/lib/env');
      validateEnv();

      const errorCall = consoleErrorSpy.mock.calls[0][0];
      expect(errorCall).toContain('DATABASE_URL');
      expect(errorCall).toContain('GITHUB_TOKEN');
      expect(errorCall).toContain('GITHUB_ORG_OR_USER');
    });
  });

  describe('exported env constant', () => {
    it('should export validated environment', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

      const { env } = await import('@/lib/env');

      expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/test');
      expect(env.GITHUB_TOKEN).toBe('ghp_testtoken123');
    });
  });

  describe('utility functions', () => {
    it('should correctly identify production environment', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.NODE_ENV = 'production';

      const { isProduction } = await import('@/lib/env');

      expect(isProduction()).toBe(true);
    });

    it('should correctly identify development environment', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.NODE_ENV = 'development';

      const { isDevelopment } = await import('@/lib/env');

      expect(isDevelopment()).toBe(true);
    });

    it('should correctly identify test environment', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.NODE_ENV = 'test';

      const { isTest } = await import('@/lib/env');

      expect(isTest()).toBe(true);
    });

    it('should return false for non-matching environments', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.NODE_ENV = 'production';

      const { isDevelopment, isTest } = await import('@/lib/env');

      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(false);
    });
  });

  describe('optional fields', () => {
    it('should handle optional ADMIN_EMAIL', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.ADMIN_EMAIL = 'admin@example.com';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.ADMIN_EMAIL).toBe('admin@example.com');
    });

    it('should handle optional POLAR_ACCESS_TOKEN', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.GITHUB_TOKEN = 'ghp_testtoken123';
      process.env.GITHUB_ORG_OR_USER = 'test-org';
      process.env.GITHUB_REPO = 'test-repo';
      process.env.GITHUB_OAUTH_CLIENT_ID = 'client123';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'secret123';
      process.env.POLAR_WEBHOOK_SECRET = 'webhook_secret';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      process.env.POLAR_ACCESS_TOKEN = 'polar_token_123';

      const { validateEnv } = await import('@/lib/env');
      const result = validateEnv();

      expect(result.POLAR_ACCESS_TOKEN).toBe('polar_token_123');
    });
  });
});
