/**
 * Admin Logout API
 * POST /api/auth/admin/logout
 * Clears admin session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { authLogger } from '@/lib/logger';

export async function POST(_request: NextRequest) {
  authLogger.info('Admin logout');

  const response = NextResponse.json({ success: true });

  // Clear the admin session cookie
  response.cookies.delete('admin_session');

  return response;
}
