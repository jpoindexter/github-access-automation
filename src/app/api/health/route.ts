/**
 * Health Check Endpoint
 * Used for monitoring and deployment readiness checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRetryQueueStats } from '@/lib/retry-queue';

export const dynamic = 'force-dynamic';

interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: {
      healthy: boolean;
      responseTime?: number;
      error?: string;
    };
    github: {
      healthy: boolean;
      responseTime?: number;
      rateLimit?: {
        limit: number;
        remaining: number;
        reset: string;
      };
      error?: string;
    };
  };
  retryQueue?: {
    pending: number;
    processing: number;
    dlqCount: number;
  };
  environment: {
    nodeVersion: string;
    nodeEnv: string | undefined;
  };
}

export async function GET(_request: NextRequest) {
  const checks: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: {
        healthy: false,
      },
      github: {
        healthy: false,
      },
    },
    environment: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  // Database connectivity check with response time
  try {
    const dbStart = Date.now();
    await db.query('SELECT 1');
    const dbTime = Date.now() - dbStart;

    checks.services.database = {
      healthy: true,
      responseTime: dbTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Database health check failed', error);
    checks.services.database = {
      healthy: false,
      error: errorMessage,
    };
  }

  // GitHub API check with rate limit info
  try {
    const githubStart = Date.now();
    const githubResponse = await fetch('https://api.github.com/rate_limit', {
      headers: {
        'User-Agent': 'github-access-automation',
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
    });
    const githubTime = Date.now() - githubStart;

    if (githubResponse.ok) {
      const rateData = (await githubResponse.json()) as {
        rate: { limit: number; remaining: number; reset: number };
      };

      checks.services.github = {
        healthy: true,
        responseTime: githubTime,
        rateLimit: {
          limit: rateData.rate.limit,
          remaining: rateData.rate.remaining,
          reset: new Date(rateData.rate.reset * 1000).toISOString(),
        },
      };
    } else {
      checks.services.github = {
        healthy: false,
        responseTime: githubTime,
        error: `HTTP ${githubResponse.status}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('GitHub health check failed', error);
    checks.services.github = {
      healthy: false,
      error: errorMessage,
    };
  }

  // Retry queue stats
  try {
    const stats = await getRetryQueueStats();
    checks.retryQueue = {
      pending: stats.pending,
      processing: stats.processing,
      dlqCount: stats.dlqCount,
    };
  } catch (error) {
    logger.error('Retry queue stats check failed', error);
    // Don't fail health check if retry queue stats unavailable
  }

  // Determine overall status
  const allHealthy =
    checks.services.database.healthy && checks.services.github.healthy;
  const anyHealthy =
    checks.services.database.healthy || checks.services.github.healthy;

  if (allHealthy) {
    checks.status = 'ok';
  } else if (anyHealthy) {
    checks.status = 'degraded';
  } else {
    checks.status = 'unhealthy';
  }

  return NextResponse.json(checks, {
    status: checks.status === 'unhealthy' ? 503 : 200,
  });
}
