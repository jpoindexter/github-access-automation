/**
 * Health Check Endpoint
 * Used for monitoring and deployment readiness checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: boolean;
    github: boolean;
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
      database: false,
      github: false,
    },
    environment: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  // Database connectivity check
  try {
    await db.query('SELECT 1');
    checks.services.database = true;
  } catch (error) {
    logger.error('Database health check failed', error);
  }

  // GitHub API check - use unauthenticated endpoint to avoid token exposure
  // The rate_limit endpoint works without auth (returns lower limits)
  try {
    const githubResponse = await fetch('https://api.github.com/zen', {
      headers: {
        'User-Agent': 'github-access-automation',
        Accept: 'application/vnd.github.v3+json',
      },
    });
    checks.services.github = githubResponse.ok;
  } catch (error) {
    logger.error('GitHub health check failed', error);
  }

  // Determine overall status
  const allHealthy = Object.values(checks.services).every((v) => v === true);
  const anyHealthy = Object.values(checks.services).some((v) => v === true);

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
