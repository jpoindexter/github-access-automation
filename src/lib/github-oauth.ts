/**
 * GitHub OAuth Utilities
 * Handles GitHub OAuth 2.0 flow for user authentication
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import { GitHubUser, GitHubOAuthToken } from '@/types';
import { authLogger } from '@/lib/logger';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

/**
 * Generate cryptographically secure state for CSRF protection
 */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Validate OAuth state using constant-time comparison (CSRF protection)
 * Prevents timing attacks
 */
export function validateState(receivedState: string, expectedState: string): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }

  try {
    const received = Buffer.from(receivedState, 'utf8');
    const expected = Buffer.from(expectedState, 'utf8');

    if (received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

/**
 * Generate GitHub OAuth authorization URL with state
 */
export function getGitHubAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID || '',
    redirect_uri: redirectUri,
    scope: 'user:email',
    state,
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<GitHubOAuthToken> {
  authLogger.info('Exchanging code for token');

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    authLogger.error('Token exchange failed', new Error(response.statusText));
    throw new Error(`Failed to exchange code for token: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    authLogger.error('GitHub OAuth error', new Error(data.error_description));
    throw new Error(`GitHub OAuth error: ${data.error_description}`);
  }

  authLogger.info('Token exchange successful');

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    scope: data.scope,
  };
}

/**
 * Get GitHub user info from access token
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  authLogger.info('Fetching GitHub user info');

  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    authLogger.error('Failed to get user info', new Error(response.statusText));
    throw new Error(`Failed to get GitHub user: ${response.statusText}`);
  }

  const user = await response.json();

  authLogger.info('GitHub user info retrieved', { username: user.login });

  return {
    id: user.id,
    login: user.login,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
  };
}

/**
 * Complete OAuth flow: code → token → user info
 */
export async function authenticateWithGitHub(code: string): Promise<GitHubUser> {
  const token = await exchangeCodeForToken(code);
  const user = await getGitHubUser(token.access_token);
  return user;
}
