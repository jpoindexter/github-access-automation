/**
 * Database Operations Tests
 * Tests for all database CRUD operations with mocked pg Pool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResult } from 'pg';

// Create mock functions that will be shared
const mockQuery = vi.fn();
const mockEnd = vi.fn();

// Store event handlers for testing
const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
const mockOn = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  if (!eventHandlers[event]) {
    eventHandlers[event] = [];
  }
  eventHandlers[event].push(handler);
});

// Helper to emit events for testing
function emitPoolEvent(event: string, ...args: unknown[]) {
  if (eventHandlers[event]) {
    eventHandlers[event].forEach(handler => handler(...args));
  }
}

// Mock the entire pg module with a factory function
vi.mock('pg', () => {
  return {
    Pool: class MockPool {
      query = mockQuery;
      on = mockOn;
      end = mockEnd;
    },
  };
});

// Mock logger
vi.mock('@/lib/logger', () => ({
  dbLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

// Import db after mocks are set up
const { db } = await import('@/lib/db');

describe('Database Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a new customer with all fields', async () => {
      const mockCustomer = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'John Doe',
        email: 'john@example.com',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: 'ord_123',
        amount_paid: 9900,
        currency: 'USD',
        status: 'pending',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.createCustomer({
        name: 'John Doe',
        email: 'john@example.com',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: 'ord_123',
        amount_paid: 9900,
        currency: 'USD',
      });

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO customers'),
        expect.arrayContaining([
          'John Doe',
          'john@example.com',
          null, // company
          null, // use_case
          null, // referral_source
          false, // newsletter_opted_in
          'johndoe',
          null, // github_email
          12345,
          'ord_123',
          null, // polar_customer_id
          9900,
          'USD',
          null, // payment_method
          null, // product_id
          null, // discount_id
          null, // promo_code_used
        ])
      );
    });

    it('should create customer with optional fields', async () => {
      const mockCustomer = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Jane Smith',
        email: 'jane@example.com',
        company: 'ACME Corp',
        use_case: 'Building SaaS',
        github_username: 'janesmith',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.createCustomer({
        name: 'Jane Smith',
        email: 'jane@example.com',
        company: 'ACME Corp',
        use_case: 'Building SaaS',
        referral_source: 'Twitter',
        newsletter_opted_in: true,
        github_username: 'janesmith',
        github_email: 'jane@gh.com',
        github_user_id: 54321,
        polar_order_id: 'ord_456',
        amount_paid: 14900,
        currency: 'EUR',
      });

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO customers'),
        expect.arrayContaining(['ACME Corp', 'Building SaaS', 'Twitter', true])
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(
        db.createCustomer({
          name: 'Test',
          email: 'test@example.com',
          github_username: 'test',
          github_user_id: 999,
          polar_order_id: 'ord_999',
          amount_paid: 9900,
          currency: 'USD',
        })
      ).rejects.toThrow('Connection failed');
    });
  });

  describe('getCustomerByEmail', () => {
    it('should return customer when found', async () => {
      const mockCustomer = {
        id: '123',
        email: 'john@example.com',
        name: 'John Doe',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.getCustomerByEmail('john@example.com');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM customers WHERE email = $1;',
        ['john@example.com']
      );
    });

    it('should return null when customer not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await db.getCustomerByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('getCustomerByOrderId', () => {
    it('should return customer by order ID', async () => {
      const mockCustomer = {
        id: '123',
        polar_order_id: 'ord_123',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.getCustomerByOrderId('ord_123');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM customers WHERE polar_order_id = $1;',
        ['ord_123']
      );
    });

    it('should return null when order not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await db.getCustomerByOrderId('nonexistent_order');

      expect(result).toBeNull();
    });
  });

  describe('getCustomerByGitHubUsername', () => {
    it('should return customer by GitHub username', async () => {
      const mockCustomer = {
        id: '123',
        github_username: 'johndoe',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.getCustomerByGitHubUsername('johndoe');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM customers WHERE github_username = $1;',
        ['johndoe']
      );
    });

    it('should return null when username not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      const result = await db.getCustomerByGitHubUsername('nonexistent_user');

      expect(result).toBeNull();
    });
  });

  describe('updateCustomerStatus', () => {
    it('should update customer status without optional fields', async () => {
      const mockCustomer = {
        id: '123',
        status: 'invited',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.updateCustomerStatus('123', 'invited');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers'),
        ['123', 'invited', null, null]
      );
    });

    it('should update customer status with invitation details', async () => {
      const invitedAt = new Date();
      const mockCustomer = {
        id: '123',
        status: 'invited',
        invitation_sent_at: invitedAt,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.updateCustomerStatus('123', 'invited', invitedAt);

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers'),
        ['123', 'invited', invitedAt, null]
      );
    });

    it('should update status with error message', async () => {
      const mockCustomer = {
        id: '123',
        status: 'invited_failed',
        invitation_error: 'User not found',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.updateCustomerStatus(
        '123',
        'invited_failed',
        undefined,
        'User not found'
      );

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers'),
        ['123', 'invited_failed', null, 'User not found']
      );
    });
  });

  describe('markWelcomeEmailSent', () => {
    it('should mark welcome email as sent', async () => {
      const mockCustomer = {
        id: '123',
        welcome_email_sent: true,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.markWelcomeEmailSent('123');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('welcome_email_sent = true'),
        ['123']
      );
    });
  });

  describe('recordChargeback', () => {
    it('should record chargeback without reason', async () => {
      const mockCustomer = {
        id: '123',
        chargebacked: true,
        payment_dispute_status: 'open',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.recordChargeback('123');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chargebacked = true'),
        ['123', null]
      );
    });

    it('should record chargeback with reason', async () => {
      const mockCustomer = {
        id: '123',
        chargebacked: true,
        payment_issue_notes: 'Fraudulent transaction',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.recordChargeback('123', 'Fraudulent transaction');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        ['123', 'Fraudulent transaction']
      );
    });
  });

  describe('revokeAccess', () => {
    it('should revoke customer access with reason', async () => {
      const mockCustomer = {
        id: '123',
        access_revoked: true,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.revokeAccess('123', 'Chargeback initiated');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('access_revoked = true'),
        ['123', 'Chargeback initiated']
      );
    });

    it('should revoke customer access without reason', async () => {
      const mockCustomer = {
        id: '456',
        access_revoked: true,
        internal_notes: null,
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCustomer],
        rowCount: 1,
      } as QueryResult);

      const result = await db.revokeAccess('456');

      expect(result).toEqual(mockCustomer);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('access_revoked = true'),
        ['456', null]
      );
    });
  });

  describe('listCustomers', () => {
    it('should list customers with default pagination', async () => {
      const mockCustomers = [
        { id: '1', name: 'Customer 1' },
        { id: '2', name: 'Customer 2' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockCustomers,
        rowCount: 2,
      } as QueryResult);

      const result = await db.listCustomers();

      expect(result).toEqual(mockCustomers);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [50, 0]
      );
    });

    it('should list customers with custom pagination', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      await db.listCustomers(100, 20);

      expect(mockQuery).toHaveBeenCalledWith(expect.anything(), [20, 100]);
    });
  });

  describe('OAuth Session operations', () => {
    describe('createOAuthSession', () => {
      it('should create OAuth session', async () => {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const mockSession = {
          id: 'session_123',
          github_username: 'johndoe',
          github_user_id: 12345,
          expires_at: expiresAt,
        };

        mockQuery.mockResolvedValueOnce({
          rows: [mockSession],
          rowCount: 1,
        } as QueryResult);

        const result = await db.createOAuthSession('johndoe', 12345, expiresAt);

        expect(result).toEqual(mockSession);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO oauth_sessions'),
          ['johndoe', 12345, expiresAt]
        );
      });
    });

    describe('getOAuthSession', () => {
      it('should return session when found', async () => {
        const mockSession = {
          id: 'session_123',
          github_username: 'johndoe',
        };

        mockQuery.mockResolvedValueOnce({
          rows: [mockSession],
          rowCount: 1,
        } as QueryResult);

        const result = await db.getOAuthSession('session_123');

        expect(result).toEqual(mockSession);
      });

      it('should return null when session not found', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as QueryResult);

        const result = await db.getOAuthSession('invalid_session');

        expect(result).toBeNull();
      });
    });

    describe('deleteOAuthSession', () => {
      it('should delete OAuth session', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as QueryResult);

        await db.deleteOAuthSession('session_123');

        expect(mockQuery).toHaveBeenCalledWith(
          'DELETE FROM oauth_sessions WHERE id = $1;',
          ['session_123']
        );
      });
    });

    describe('cleanupExpiredSessions', () => {
      it('should return count of deleted sessions', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 5,
        } as QueryResult);

        const result = await db.cleanupExpiredSessions();

        expect(result).toBe(5);
        expect(mockQuery).toHaveBeenCalledWith(
          'DELETE FROM oauth_sessions WHERE expires_at < NOW();'
        );
      });

      it('should return 0 when no sessions deleted', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: null,
        } as QueryResult);

        const result = await db.cleanupExpiredSessions();

        expect(result).toBe(0);
      });
    });
  });

  describe('Raw query', () => {
    it('should execute raw query', async () => {
      const mockResult = {
        rows: [{ count: 10 }],
        rowCount: 1,
      } as QueryResult;

      mockQuery.mockResolvedValueOnce(mockResult);

      const result = await db.query('SELECT COUNT(*) FROM customers');

      expect(result).toEqual(mockResult);
    });

    it('should execute query with values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult);

      await db.query('SELECT * FROM customers WHERE id = $1', ['123']);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM customers WHERE id = $1',
        ['123']
      );
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      mockEnd.mockResolvedValueOnce(undefined);

      await db.close();

      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('pool event handlers', () => {
    it('should handle pool error events', async () => {
      const { dbLogger } = await import('@/lib/logger');

      // Emit an error event to trigger the handler
      emitPoolEvent('error', new Error('Unexpected error on idle client'));

      expect(dbLogger.error).toHaveBeenCalledWith(
        'Unexpected error on idle client',
        expect.any(Error)
      );
    });

    it('should handle pool connect events', async () => {
      const { dbLogger } = await import('@/lib/logger');

      // Emit a connect event to trigger the handler
      emitPoolEvent('connect');

      expect(dbLogger.debug).toHaveBeenCalledWith(
        'New database connection established'
      );
    });
  });

  describe('SSL configuration warnings', () => {
    it('should warn in production when SSL verification is skipped on non-Neon database', async () => {
      // Store original env values
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDatabaseUrl = process.env.DATABASE_URL;
      const originalSslSkip = process.env.DATABASE_SSL_SKIP_VERIFY;

      // Set up production environment with SSL skip on non-Neon database
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
      process.env.DATABASE_SSL_SKIP_VERIFY = 'true';

      // Clear module cache and reimport to trigger initialization
      vi.resetModules();

      // Re-mock dependencies after reset
      vi.doMock('pg', () => ({
        Pool: class MockPool {
          query = vi.fn();
          on = vi.fn();
          end = vi.fn();
        },
      }));

      vi.doMock('@/lib/logger', () => ({
        dbLogger: {
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          info: vi.fn(),
        },
      }));

      // Import the module which should trigger the warning
      await import('@/lib/db');
      const { dbLogger } = await import('@/lib/logger');

      expect(dbLogger.warn).toHaveBeenCalledWith(
        'SSL certificate verification is disabled in production. This is a security risk!'
      );

      // Restore original env
      process.env.NODE_ENV = originalNodeEnv;
      process.env.DATABASE_URL = originalDatabaseUrl;
      process.env.DATABASE_SSL_SKIP_VERIFY = originalSslSkip;
    });
  });

  describe('SSL configuration branches', () => {
    it('should disable SSL for non-postgres URLs', async () => {
      const originalDatabaseUrl = process.env.DATABASE_URL;

      // Set a non-postgres URL
      process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/db';

      vi.resetModules();

      let capturedSslConfig: unknown = undefined;
      vi.doMock('pg', () => ({
        Pool: class MockPool {
          constructor(config: { ssl?: unknown }) {
            capturedSslConfig = config.ssl;
          }
          query = vi.fn();
          on = vi.fn();
          end = vi.fn();
        },
      }));

      vi.doMock('@/lib/logger', () => ({
        dbLogger: {
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          info: vi.fn(),
        },
      }));

      await import('@/lib/db');

      // SSL should be false for non-postgres URLs
      expect(capturedSslConfig).toBe(false);

      process.env.DATABASE_URL = originalDatabaseUrl;
    });

    it('should set rejectUnauthorized to true for non-Neon postgres without skip flag', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDatabaseUrl = process.env.DATABASE_URL;
      const originalSslSkip = process.env.DATABASE_SSL_SKIP_VERIFY;

      // Non-Neon postgres database without skip flag
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
      delete process.env.DATABASE_SSL_SKIP_VERIFY;

      vi.resetModules();

      let capturedSslConfig: unknown = undefined;
      vi.doMock('pg', () => ({
        Pool: class MockPool {
          constructor(config: { ssl?: unknown }) {
            capturedSslConfig = config.ssl;
          }
          query = vi.fn();
          on = vi.fn();
          end = vi.fn();
        },
      }));

      vi.doMock('@/lib/logger', () => ({
        dbLogger: {
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          info: vi.fn(),
        },
      }));

      await import('@/lib/db');

      // rejectUnauthorized should be true for non-Neon postgres without skip flag
      expect(capturedSslConfig).toEqual({ rejectUnauthorized: true });

      process.env.NODE_ENV = originalNodeEnv;
      process.env.DATABASE_URL = originalDatabaseUrl;
      process.env.DATABASE_SSL_SKIP_VERIFY = originalSslSkip;
    });

    it('should set rejectUnauthorized to false for Neon database', async () => {
      const originalDatabaseUrl = process.env.DATABASE_URL;
      const originalSslSkip = process.env.DATABASE_SSL_SKIP_VERIFY;

      // Neon database URL
      process.env.DATABASE_URL = 'postgres://user:pass@ep-xyz.neon.tech:5432/db';
      delete process.env.DATABASE_SSL_SKIP_VERIFY;

      vi.resetModules();

      let capturedSslConfig: unknown = undefined;
      vi.doMock('pg', () => ({
        Pool: class MockPool {
          constructor(config: { ssl?: unknown }) {
            capturedSslConfig = config.ssl;
          }
          query = vi.fn();
          on = vi.fn();
          end = vi.fn();
        },
      }));

      vi.doMock('@/lib/logger', () => ({
        dbLogger: {
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          info: vi.fn(),
        },
      }));

      await import('@/lib/db');

      // rejectUnauthorized should be false for Neon databases
      expect(capturedSslConfig).toEqual({ rejectUnauthorized: false });

      process.env.DATABASE_URL = originalDatabaseUrl;
      process.env.DATABASE_SSL_SKIP_VERIFY = originalSslSkip;
    });
  });
});
