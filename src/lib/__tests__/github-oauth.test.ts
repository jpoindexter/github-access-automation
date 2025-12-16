import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateState,
  validateState,
  getGitHubAuthUrl,
  exchangeCodeForToken,
  getGitHubUser,
  authenticateWithGitHub,
} from '../github-oauth';

// Mock logger
vi.mock('@/lib/logger', () => ({
  authLogger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GitHub OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_OAUTH_CLIENT_ID = 'test_client_id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test_client_secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateState', () => {
    it('should generate a non-empty string', () => {
      const state = generateState();
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
    });

    it('should generate unique states', () => {
      const states = new Set<string>();
      for (let i = 0; i < 100; i++) {
        states.add(generateState());
      }
      // All 100 should be unique
      expect(states.size).toBe(100);
    });

    it('should generate URL-safe base64 strings', () => {
      const state = generateState();
      // base64url should not contain +, /, or =
      expect(state).not.toMatch(/[+/=]/);
    });
  });

  describe('validateState', () => {
    it('should return true for matching states', () => {
      const state = 'test_state_123';
      expect(validateState(state, state)).toBe(true);
    });

    it('should return false for different states', () => {
      expect(validateState('state_a', 'state_b')).toBe(false);
    });

    it('should return false for empty received state', () => {
      expect(validateState('', 'expected_state')).toBe(false);
    });

    it('should return false for empty expected state', () => {
      expect(validateState('received_state', '')).toBe(false);
    });

    it('should return false for both empty', () => {
      expect(validateState('', '')).toBe(false);
    });

    it('should handle special characters', () => {
      const state = 'abc123-_~.!';
      expect(validateState(state, state)).toBe(true);
    });

    it('should be case-sensitive', () => {
      expect(validateState('State', 'state')).toBe(false);
    });

    it('should return false for different length states', () => {
      expect(validateState('short', 'longer_state')).toBe(false);
    });
  });

  describe('validateState error handling', () => {
    it('should return false when timingSafeEqual throws an error', async () => {
      // Reset modules to allow re-mocking crypto
      vi.resetModules();

      // Mock crypto to throw on timingSafeEqual
      vi.doMock('crypto', async (importOriginal) => {
        const original = await importOriginal<typeof import('crypto')>();
        return {
          ...original,
          timingSafeEqual: () => {
            throw new Error('Simulated crypto error');
          },
        };
      });

      // Import the module fresh with mocked crypto
      const { validateState: validateStateWithMock } = await import('../github-oauth');

      // This should trigger the catch block and return false
      const result = validateStateWithMock('same_length1', 'same_length2');
      expect(result).toBe(false);

      // Clean up
      vi.doUnmock('crypto');
      vi.resetModules();
    });
  });

  describe('getGitHubAuthUrl', () => {
    it('should generate correct authorization URL', () => {
      const url = getGitHubAuthUrl('http://localhost/callback', 'test_state');
      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test_client_id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%2Fcallback');
      expect(url).toContain('state=test_state');
      expect(url).toContain('scope=user%3Aemail');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for access token successfully', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'gho_test_token',
            token_type: 'bearer',
            scope: 'user:email',
          }),
      });

      const token = await exchangeCodeForToken('test_code');

      expect(token).toEqual({
        access_token: 'gho_test_token',
        token_type: 'bearer',
        scope: 'user:email',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            client_id: 'test_client_id',
            client_secret: 'test_client_secret',
            code: 'test_code',
          }),
        })
      );
    });

    it('should throw error on HTTP failure', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(exchangeCodeForToken('bad_code')).rejects.toThrow(
        'Failed to exchange code for token: Unauthorized'
      );
    });

    it('should throw error on OAuth error response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.',
          }),
      });

      await expect(exchangeCodeForToken('expired_code')).rejects.toThrow(
        'GitHub OAuth error: The code passed is incorrect or expired.'
      );
    });
  });

  describe('getGitHubUser', () => {
    it('should get user info successfully', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 12345,
            login: 'testuser',
            email: 'test@example.com',
            name: 'Test User',
            avatar_url: 'https://example.com/avatar.png',
          }),
      });

      const user = await getGitHubUser('gho_test_token');

      expect(user).toEqual({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer gho_test_token',
            Accept: 'application/vnd.github.v3+json',
          },
        })
      );
    });

    it('should throw error on HTTP failure', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(getGitHubUser('bad_token')).rejects.toThrow(
        'Failed to get GitHub user: Unauthorized'
      );
    });
  });

  describe('authenticateWithGitHub', () => {
    it('should complete full OAuth flow', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'gho_test_token',
              token_type: 'bearer',
              scope: 'user:email',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 12345,
              login: 'testuser',
              email: 'test@example.com',
              name: 'Test User',
              avatar_url: 'https://example.com/avatar.png',
            }),
        });

      const user = await authenticateWithGitHub('test_code');

      expect(user).toEqual({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
      });

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
