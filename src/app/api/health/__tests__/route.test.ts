/**
 * Health Check Route Tests
 * Tests for health check endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    query: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/retry-queue', () => ({
  getRetryQueueStats: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn() as never;

describe('Health Check Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET handler', () => {
    it('should return healthy status when all services are up', async () => {
      const { db } = await import('@/lib/db');
      const { getRetryQueueStats } = await import('@/lib/retry-queue');
      const { GET } = await import('../route');

      // Mock successful database query
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      // Mock retry queue stats
      vi.mocked(getRetryQueueStats).mockResolvedValueOnce({
        pending: 0,
        processing: 0,
        completed: 100,
        failed: 0,
        dlqCount: 0,
      });

      // Mock successful GitHub API check
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          rate: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
          },
        }),
      } as never);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.services.database.healthy).toBe(true);
      expect(data.services.database.responseTime).toBeDefined();
      expect(data.services.github.healthy).toBe(true);
      expect(data.services.github.responseTime).toBeDefined();
      expect(data.services.github.rateLimit).toBeDefined();
      expect(data.retryQueue).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.environment.nodeVersion).toBe(process.version);
      expect(data.environment.nodeEnv).toBeDefined();
    });

    it('should return degraded status when database is down', async () => {
      const { db } = await import('@/lib/db');
      const { logger } = await import('@/lib/logger');
      const { GET } = await import('../route');

      // Mock failed database query
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Connection refused'));

      // Mock successful GitHub API check
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.services.database).toBe(false);
      expect(data.services.github).toBe(true);
      expect(logger.error).toHaveBeenCalledWith('Database health check failed', expect.any(Error));
    });

    it('should return degraded status when GitHub is down', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      // Mock successful database query
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      // Mock failed GitHub API check (ok: false doesn't throw, just returns false)
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.services.database).toBe(true);
      expect(data.services.github).toBe(false);
    });

    it('should return unhealthy status when all services are down', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      // Mock failed database query
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB down'));

      // Mock failed GitHub API check
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data.services.database).toBe(false);
      expect(data.services.github).toBe(false);
    });

    it('should include process uptime', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof data.uptime).toBe('number');
    });

    it('should include ISO timestamp', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should execute simple database query', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      await GET(mockRequest);

      expect(db.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should check GitHub zen endpoint', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      await GET(mockRequest);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/zen',
        expect.objectContaining({
          headers: {
            'User-Agent': 'github-access-automation',
            Accept: 'application/vnd.github.v3+json',
          },
        })
      );
    });

    it('should handle GitHub fetch network errors', async () => {
      const { db } = await import('@/lib/db');
      const { logger } = await import('@/lib/logger');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockRejectedValueOnce(new Error('fetch failed'));

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data.services.github).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('GitHub health check failed', expect.any(Error));
    });

    it('should include environment information', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      process.env.NODE_ENV = 'production';

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data.environment.nodeEnv).toBe('production');
      expect(data.environment.nodeVersion).toContain('v');
    });

    it('should handle concurrent health checks', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValue({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest1 = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });
      const mockRequest2 = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });
      const mockRequest3 = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const [response1, response2, response3] = await Promise.all([
        GET(mockRequest1),
        GET(mockRequest2),
        GET(mockRequest3),
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);
    });

    it('should handle partial service failures gracefully', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      // Database succeeds
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      // GitHub fails with timeout
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Request timeout'));

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.services.database).toBe(true);
      expect(data.services.github).toBe(false);
    });

    it('should return consistent response structure', async () => {
      const { db } = await import('@/lib/db');
      const { GET } = await import('../route');

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
      } as never);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const mockRequest = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('services');
      expect(data).toHaveProperty('environment');
      expect(data.services).toHaveProperty('database');
      expect(data.services).toHaveProperty('github');
      expect(data.environment).toHaveProperty('nodeVersion');
      expect(data.environment).toHaveProperty('nodeEnv');
    });
  });
});
