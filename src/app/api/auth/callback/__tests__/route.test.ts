/**
 * OAuth Callback Route Tests
 * Tests for GitHub OAuth callback handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoisted mocks - these run before any imports
const {
  mockAuthenticateWithGitHub,
  mockValidateState,
  mockDb,
  mockAuthLogger,
} = vi.hoisted(() => ({
  mockAuthenticateWithGitHub: vi.fn(),
  mockValidateState: vi.fn(),
  mockDb: {
    createOAuthSession: vi.fn(),
  },
  mockAuthLogger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('@/lib/github-oauth', () => ({
  authenticateWithGitHub: mockAuthenticateWithGitHub,
  validateState: mockValidateState,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/logger', () => ({
  authLogger: mockAuthLogger,
}));

describe('OAuth Callback Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POLAR_CHECKOUT_URL = 'https://polar.sh/checkout';
  });

  describe('GET handler', () => {
    it('should handle GitHub OAuth errors', async () => {
      const { GET } = await import('../route');

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?error=access_denied&error_description=User+cancelled',
        { method: 'GET' }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('GitHub authentication failed');
      expect(data.details).toBe('User cancelled');
      expect(mockAuthLogger.warn).toHaveBeenCalledWith(
        'GitHub OAuth error from provider',
        expect.any(Object)
      );
    });

    it('should reject requests without authorization code', async () => {
      const { GET } = await import('../route');

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?state=test123',
        { method: 'GET' }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing authorization code');
      expect(mockAuthLogger.warn).toHaveBeenCalledWith(
        'Missing authorization code in callback'
      );
    });

    it('should reject invalid state (CSRF protection)', async () => {
      const { GET } = await import('../route');

      mockValidateState.mockReturnValueOnce(false);

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test123&state=invalid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=expected_state',
          },
        }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('CSRF attack');
      expect(mockAuthLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid OAuth state'),
        expect.any(Object)
      );
    });

    it('should reject when state cookie is missing', async () => {
      const { GET } = await import('../route');

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test123&state=some_state',
        { method: 'GET' }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('CSRF attack');
      expect(mockAuthLogger.warn).toHaveBeenCalled();
    });

    it('should successfully authenticate and redirect to Polar', async () => {
      const { GET } = await import('../route');

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('polar.sh/checkout');
      expect(response.headers.get('location')).toContain('gh_username=testuser');
      expect(response.headers.get('location')).toContain('gh_user_id=12345');

      expect(mockAuthLogger.info).toHaveBeenCalledWith('GitHub OAuth successful', {
        username: 'testuser',
      });

      expect(mockDb.createOAuthSession).toHaveBeenCalledWith(
        'testuser',
        12345,
        expect.any(Date)
      );
    });

    it('should set secure cookies with user data', async () => {
      const { GET } = await import('../route');

      process.env.NODE_ENV = 'production';

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('github_user');
      expect(setCookieHeader?.toLowerCase()).toContain('httponly');
      expect(setCookieHeader?.toLowerCase()).toContain('secure');
      expect(setCookieHeader?.toLowerCase()).toContain('samesite=strict');
    });

    it('should clear oauth_state cookie after success', async () => {
      const { GET } = await import('../route');

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('oauth_state');
    });

    it('should reject redirects to untrusted domains (open redirect protection)', async () => {
      const { GET } = await import('../route');

      process.env.POLAR_CHECKOUT_URL = 'https://evil.com/checkout';

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid redirect destination');
      expect(mockAuthLogger.warn).toHaveBeenCalledWith(
        'Attempted redirect to untrusted domain',
        expect.any(Object)
      );
    });

    it('should allow redirect to www.polar.sh', async () => {
      const { GET } = await import('../route');

      process.env.POLAR_CHECKOUT_URL = 'https://www.polar.sh/checkout';

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('www.polar.sh');
    });

    it('should handle authentication failures', async () => {
      const { GET } = await import('../route');

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockRejectedValueOnce(
        new Error('GitHub API error')
      );

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to complete GitHub authentication. Please try again.');
      expect(mockAuthLogger.error).toHaveBeenCalledWith(
        'GitHub OAuth callback failed',
        expect.any(Error)
      );
    });

    it('should handle database errors when creating session', async () => {
      const { GET } = await import('../route');

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
      });
      mockDb.createOAuthSession.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to complete GitHub authentication. Please try again.');
      expect(mockAuthLogger.error).toHaveBeenCalled();
    });

    it('should create session with 15 minute expiry', async () => {
      const { GET } = await import('../route');

      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(now + 15 * 60 * 1000),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      await GET(mockRequest);

      expect(mockDb.createOAuthSession).toHaveBeenCalledWith(
        'testuser',
        12345,
        new Date(now + 15 * 60 * 1000)
      );

      vi.useRealTimers();
    });

    it('should handle user without email', async () => {
      const { GET } = await import('../route');

      mockValidateState.mockReturnValueOnce(true);
      mockAuthenticateWithGitHub.mockResolvedValueOnce({
        id: 12345,
        login: 'testuser',
        email: undefined,
        name: undefined,
      });
      mockDb.createOAuthSession.mockResolvedValueOnce({
        id: 'session_123',
        github_username: 'testuser',
        github_user_id: 12345,
        created_at: new Date(),
        expires_at: new Date(),
      });

      const mockRequest = new NextRequest(
        'http://localhost/api/auth/callback?code=test_code&state=valid_state',
        {
          method: 'GET',
          headers: {
            cookie: 'oauth_state=valid_state',
          },
        }
      );

      const response = await GET(mockRequest);

      expect(response.status).toBe(302);
    });
  });
});
