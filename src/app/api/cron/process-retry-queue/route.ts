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

import { NextRequest, NextResponse } from 'next/server';
import { processRetryQueue } from '@/lib/retry-queue';
import { retryLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET || 'dev-secret';

    if (cronSecret !== expectedSecret) {
      retryLogger.warn('Unauthorized cron job attempt', {
        ip: request.headers.get('x-forwarded-for') || 'unknown',
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

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({
    service: 'retry-queue-processor',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
}
