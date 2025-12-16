/**
 * GitHub OAuth Initiation
 * GET /api/auth/github
 * Redirects to GitHub for user authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubAuthUrl, generateState } from '@/lib/github-oauth';
import { authLogger } from '@/lib/logger';

export async function GET(_request: NextRequest) {
  try {
    // Get redirect URI from environment or construct from request
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/auth/callback`;

    // Generate cryptographically secure state for CSRF protection
    const state = generateState();

    // Generate GitHub OAuth authorization URL with state
    const authUrl = getGitHubAuthUrl(redirectUri, state);

    authLogger.info('Initiating GitHub OAuth flow');

    // Create redirect response
    const response = NextResponse.redirect(authUrl);

    // Store state in secure httpOnly cookie for validation in callback
    response.cookies.set({
      name: 'oauth_state',
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    authLogger.error('GitHub OAuth initiation failed', error);

    return NextResponse.json(
      {
        error: 'Failed to initiate GitHub authentication',
      },
      { status: 500 }
    );
  }
}
