/**
 * Cron Job: Process Retry Queue
 * POST /api/cron/process-retry-queue
 * Processes pending retries with exponential backoff
 *
 * Deployment:
 * - Vercel Cron: Configure in vercel.json
 * - GitHub Actions: Schedule workflow every 5 minutes
 * - Manual: External cron service (cron-job.org) calls this endpoint
 *
 * Security: Requires CRON_SECRET header to prevent unauthorized access
 */

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processRetryQueue } from '@/lib/retry-queue';
import { retryLogger } from '@/lib/logger';

function verifyCronSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const provided = authHeader.replace(/^Bearer\s+/, '');
  if (provided.length === 0) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expectedSecret);
  const maxLen = Math.max(a.length, b.length);
  const aBuf = Buffer.alloc(maxLen);
  const bBuf = Buffer.alloc(maxLen);
  a.copy(aBuf);
  b.copy(bBuf);
  return timingSafeEqual(aBuf, bBuf) && a.length === b.length;
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      retryLogger.error('CRON_SECRET environment variable is not configured');
      return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
    }

    if (!verifyCronSecret(request)) {
      retryLogger.warn('Unauthorized cron job attempt', {
        ip: request.headers.get('x-vercel-forwarded-for') || 'unknown',
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    retryLogger.info('Starting retry queue processing');

    // Process the queue
    const stats = await processRetryQueue();

    retryLogger.info('Retry queue processing complete', stats);

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    retryLogger.error('Cron job failed', error);

    return NextResponse.json(
      {
        error: 'Failed to process retry queue',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET is authenticated — same cron secret required
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    retryLogger.error('CRON_SECRET environment variable is not configured');
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
  }

  if (!verifyCronSecret(request)) {
    retryLogger.warn('Unauthorized GET to retry-queue-processor', {
      ip: request.headers.get('x-vercel-forwarded-for') || 'unknown',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    service: 'retry-queue-processor',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
}
