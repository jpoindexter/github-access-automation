/**
 * Admin Logout API
 * POST /api/auth/admin/logout
 * Clears admin session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { authLogger } from '@/lib/logger';

export async function POST(_request: NextRequest) {
  const origin = _request.headers.get('origin');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && origin && origin !== appUrl) {
    authLogger.warn('Logout CSRF attempt from unexpected origin', { origin });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  authLogger.info('Admin logout');

  const response = NextResponse.json({ success: true });

  // Clear the admin session cookie
  response.cookies.delete('admin_session');

  return response;
}
