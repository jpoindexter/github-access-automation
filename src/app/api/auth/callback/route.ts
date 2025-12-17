/**
 * GitHub OAuth Callback
 * GET /api/auth/callback?code=...&state=...
 * Handles GitHub authorization callback and redirects to Polar checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithGitHub, validateState } from '@/lib/github-oauth';
import { db } from '@/lib/db';
import { authLogger } from '@/lib/logger';

// Allowed redirect domains for open redirect protection
const ALLOWED_REDIRECT_DOMAINS = ['polar.sh', 'www.polar.sh', 'sandbox.polar.sh', 'sandbox-api.polar.sh'];

export async function GET(request: NextRequest) {
  try {
    // Extract code and state from query params
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const receivedState = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors from GitHub
    if (error) {
      const errorDescription = searchParams.get('error_description') || 'Unknown error';
      authLogger.warn('GitHub OAuth error from provider', { error, errorDescription });

      return NextResponse.json(
        {
          error: 'GitHub authentication failed',
          details: errorDescription,
        },
        { status: 400 }
      );
    }

    // Validate code exists
    if (!code) {
      authLogger.warn('Missing authorization code in callback');
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    // Validate state for CSRF protection
    const expectedState = request.cookies.get('oauth_state')?.value;

    if (!receivedState || !expectedState || !validateState(receivedState, expectedState)) {
      authLogger.warn('Invalid OAuth state - possible CSRF attack', {
        hasReceivedState: !!receivedState,
        hasExpectedState: !!expectedState,
      });

      return NextResponse.json(
        { error: 'Invalid state parameter - possible CSRF attack' },
        { status: 403 }
      );
    }

    // Authenticate with GitHub
    const user = await authenticateWithGitHub(code);

    // Store user info in database oauth_sessions for linking later
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minute expiry
    await db.createOAuthSession(user.login, user.id, expiresAt);

    // Build secure redirect URL to Polar checkout
    // Using environment variable with fallback to production Polar URL
    const checkoutBaseUrl = process.env.POLAR_CHECKOUT_URL || 'https://polar.sh/checkout';
    const redirectUrl = new URL(checkoutBaseUrl);

    // Validate redirect domain to prevent open redirect attacks
    if (!ALLOWED_REDIRECT_DOMAINS.includes(redirectUrl.hostname)) {
      authLogger.warn('Attempted redirect to untrusted domain', {
        hostname: redirectUrl.hostname,
        url: checkoutBaseUrl,
      });
      return NextResponse.json(
        { error: 'Invalid redirect destination' },
        { status: 400 }
      );
    }

    // Pass GitHub username as query param for Polar custom field prefill
    // Using shorter keys to avoid conflict with potentially deleted fields in Polar
    redirectUrl.searchParams.set('gh_username', user.login);
    redirectUrl.searchParams.set('gh_user_id', user.id.toString());

    authLogger.info('Redirecting to Polar checkout', { url: redirectUrl.toString() });

    const response = NextResponse.redirect(redirectUrl.toString(), { status: 302 });

    // Clear the oauth_state cookie
    response.cookies.delete('oauth_state');

    // Store GitHub user info in secure httpOnly cookie for post-checkout verification
    response.cookies.set({
      name: 'github_user',
      value: JSON.stringify({
        id: user.id,
        login: user.login,
        email: user.email,
        name: user.name,
      }),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // Strict for sensitive data
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    authLogger.info('GitHub OAuth successful', { username: user.login });

    return response;
  } catch (error) {
    // Log error securely with full details (not exposed to user)
    authLogger.error('GitHub OAuth callback failed', error);

    // Return generic error message (no stack trace, no internal details)
    return NextResponse.json(
      {
        error: 'Failed to complete GitHub authentication. Please try again.',
      },
      { status: 500 }
    );
  }
}
