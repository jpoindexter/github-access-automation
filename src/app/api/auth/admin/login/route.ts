/**
 * Admin Login API
 * POST /api/auth/admin/login
 * Simple password-based authentication for single admin user
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';
import { authLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password) {
      authLogger.warn('Admin login attempt with no password');
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Timing-safe comparison to prevent timing attacks
    const providedPassword = Buffer.from(password);
    const actualPassword = Buffer.from(env.ADMIN_PASSWORD);

    // Ensure buffers are same length before comparison
    if (providedPassword.length !== actualPassword.length) {
      authLogger.warn('Admin login failed - invalid password length');
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const isValid = timingSafeEqual(providedPassword, actualPassword);

    if (!isValid) {
      authLogger.warn('Admin login failed - incorrect password');
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Create response with success
    const response = NextResponse.json({ success: true });

    // Set secure session cookie (24-hour expiry)
    response.cookies.set({
      name: 'admin_session',
      value: 'authenticated', // Simple flag for single admin
      httpOnly: true, // Cannot be accessed by JavaScript
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict', // CSRF protection
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    authLogger.info('Admin login successful');

    return response;
  } catch (error) {
    authLogger.error('Admin login error', error);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
