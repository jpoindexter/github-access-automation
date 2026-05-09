/**
 * Next.js Middleware
 * Handles rate limiting and security for API routes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// In-memory rate limiting store (use Redis in production for distributed systems)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  '/api/webhooks': { windowMs: 60000, maxRequests: 30 }, // 30 requests per minute
  '/api/auth': { windowMs: 60000, maxRequests: 10 }, // 10 requests per minute
  '/api/health': { windowMs: 60000, maxRequests: 60 }, // 60 requests per minute
  default: { windowMs: 60000, maxRequests: 100 }, // 100 requests per minute
};

/**
 * Get client IP address from request
 */
function getClientIp(request: NextRequest): string {
  // x-vercel-forwarded-for is set by Vercel's edge network and cannot be spoofed
  // by clients — unlike x-forwarded-for which is a client-controlled header.
  const vercelIp = request.headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    return vercelIp.split(',')[0]?.trim() ?? '127.0.0.1';
  }
  return '127.0.0.1';
}

/**
 * Check rate limit for a given key
 */
function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    // Create new window
    const resetTime = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: maxRequests - 1, resetTime };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(key, record);
  return { allowed: true, remaining: maxRequests - record.count, resetTime: record.resetTime };
}

/**
 * Get rate limit config for path
 */
function getRateLimitConfig(pathname: string): { windowMs: number; maxRequests: number } {
  for (const [prefix, config] of Object.entries(RATE_LIMIT_CONFIG)) {
    if (prefix !== 'default' && pathname.startsWith(prefix)) {
      return config;
    }
  }
  return RATE_LIMIT_CONFIG.default;
}

/**
 * Clean up expired rate limit entries (prevent memory leak)
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate limit API routes
  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const clientIp = getClientIp(request);
  const rateLimitKey = `${clientIp}:${pathname}`;
  const config = getRateLimitConfig(pathname);

  const { allowed, remaining, resetTime } = checkRateLimit(
    rateLimitKey,
    config.windowMs,
    config.maxRequests
  );

  // Add rate limit headers
  const response = allowed
    ? NextResponse.next()
    : NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

  if (!allowed) {
    response.headers.set('Retry-After', Math.ceil((resetTime - Date.now()) / 1000).toString());
  }

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
