import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyPolarWebhookSignature,
  validateWebhookTimestamp,
  parsePolarWebhook,
  isPaidOrderEvent,
  extractCustomerDataFromWebhook,
  formatCurrency,
} from '../polar-webhook';

// Mock environment
vi.stubEnv('POLAR_WEBHOOK_SECRET', 'test_secret');

describe('Polar Webhook', () => {
  describe('verifyPolarWebhookSignature', () => {
    it('should verify valid signature', () => {
      const payload = '{"type":"order.paid"}';
      // Calculate actual HMAC-SHA256
      const secret = 'test_secret';
      const expectedSignature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const result = verifyPolarWebhookSignature(payload, expectedSignature);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"type":"order.paid"}';
      const invalidSignature = 'invalid_signature_that_is_definitely_not_valid';

      const result = verifyPolarWebhookSignature(payload, invalidSignature);
      expect(result).toBe(false);
    });

    it('should reject signature with different length', () => {
      const payload = '{"type":"order.paid"}';
      // A shorter signature should fail
      const shortSignature = 'short';

      const result = verifyPolarWebhookSignature(payload, shortSignature);
      expect(result).toBe(false);
    });

    it('should use empty string when POLAR_WEBHOOK_SECRET is not set', async () => {
      delete process.env.POLAR_WEBHOOK_SECRET;
      vi.resetModules();

      const { verifyPolarWebhookSignature: verifySig } = await import(
        '../polar-webhook'
      );

      // Calculate HMAC with empty secret
      const payload = '{"type":"order.paid"}';
      const expectedSignature = createHmac('sha256', '')
        .update(payload)
        .digest('hex');

      const result = verifySig(payload, expectedSignature);
      expect(result).toBe(true);

      // Restore the env var
      process.env.POLAR_WEBHOOK_SECRET = 'test_secret';
    });

    it('should handle matching signatures of same length', () => {
      const payload = '{"test":"data"}';
      const secret = 'test_secret';
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Same signature should match
      const result = verifyPolarWebhookSignature(payload, signature);
      expect(result).toBe(true);
    });

    it('should reject signatures with same length but different content', () => {
      const payload = '{"type":"order.paid"}';
      // Create a valid length signature but with wrong content
      // SHA256 hex is 64 characters
      const wrongSignature =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      const result = verifyPolarWebhookSignature(payload, wrongSignature);
      expect(result).toBe(false);
    });
  });

  describe('validateWebhookTimestamp', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should accept valid recent timestamp', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      // Timestamp from 1 minute ago
      const timestamp = new Date('2024-01-01T11:59:00Z').toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(true);
    });

    it('should accept timestamp from exactly now', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const timestamp = now.toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(true);
    });

    it('should reject timestamp too far in the future (> 1 minute)', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      // Timestamp 2 minutes in the future
      const timestamp = new Date('2024-01-01T12:02:00Z').toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(false);
    });

    it('should accept timestamp slightly in the future (within 1 minute clock skew)', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      // Timestamp 30 seconds in the future (within acceptable clock skew)
      const timestamp = new Date('2024-01-01T12:00:30Z').toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(true);
    });

    it('should reject timestamp that is too old (> 5 minutes)', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      // Timestamp from 6 minutes ago
      const timestamp = new Date('2024-01-01T11:54:00Z').toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(false);
    });

    it('should accept timestamp at the edge of the 5-minute window', () => {
      const now = new Date('2024-01-01T12:05:00Z');
      vi.setSystemTime(now);

      // Timestamp exactly 5 minutes ago
      const timestamp = new Date('2024-01-01T12:00:00Z').toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(true);
    });

    it('should reject timestamp just past the 5-minute window', () => {
      const now = new Date('2024-01-01T12:05:01Z');
      vi.setSystemTime(now);

      // Timestamp 5 minutes and 1 second ago
      const timestamp = new Date('2024-01-01T12:00:00Z').toISOString();
      const result = validateWebhookTimestamp(timestamp);

      expect(result).toBe(false);
    });
  });

  describe('parsePolarWebhook', () => {
    it('should parse valid JSON payload', () => {
      const payload = JSON.stringify({
        type: 'order.paid',
        timestamp: '2025-01-01T00:00:00Z',
        data: {
          id: 'order_123',
          status: 'paid',
        },
      });

      const result = parsePolarWebhook(payload);
      expect(result.type).toBe('order.paid');
      expect(result.data.id).toBe('order_123');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parsePolarWebhook('invalid json')).toThrow(
        'Invalid JSON in webhook payload'
      );
    });
  });

  describe('isPaidOrderEvent', () => {
    it('should return true for paid order', () => {
      const webhook = {
        type: 'order.paid',
        timestamp: '2025-01-01T00:00:00Z',
        data: {
          id: 'order_123',
          status: 'paid',
          amount: 9999,
          currency: 'usd',
          customer_id: 'cust_123',
          product_id: 'prod_123',
          organization_id: 'org_123',
          created_at: '2025-01-01T00:00:00Z',
        },
      };

      expect(isPaidOrderEvent(webhook)).toBe(true);
    });

    it('should return false for other events', () => {
      const webhook = {
        type: 'order.created',
        timestamp: '2025-01-01T00:00:00Z',
        data: {
          id: 'order_123',
          status: 'pending',
          amount: 9999,
          currency: 'usd',
          customer_id: 'cust_123',
          product_id: 'prod_123',
          organization_id: 'org_123',
          created_at: '2025-01-01T00:00:00Z',
        },
      };

      expect(isPaidOrderEvent(webhook)).toBe(false);
    });
  });

  describe('extractCustomerDataFromWebhook', () => {
    it('should extract customer data from order with metadata', () => {
      const order = {
        id: 'order_123',
        status: 'paid' as const,
        amount: 9999,
        currency: 'usd',
        customer_id: 'cust_123',
        product_id: 'prod_123',
        organization_id: 'org_123',
        created_at: '2025-01-01T00:00:00Z',
        metadata: {
          github_username: 'johndoe',
          github_user_id: 12345,
          email: 'john@example.com',
          name: 'John Doe',
          company: 'Acme',
        },
      };

      const result = extractCustomerDataFromWebhook(order);
      expect(result.email).toBe('john@example.com');
      expect(result.name).toBe('John Doe');
      expect(result.company).toBe('Acme');
      expect(result.product_id).toBe('prod_123');
    });

    it('should handle missing metadata', () => {
      const order = {
        id: 'order_123',
        status: 'paid' as const,
        amount: 9999,
        currency: 'usd',
        customer_id: 'cust_123',
        product_id: 'prod_123',
        organization_id: 'org_123',
        created_at: '2025-01-01T00:00:00Z',
      };

      const result = extractCustomerDataFromWebhook(order);
      expect(result.email).toBe('');
      expect(result.name).toBe('');
    });
  });

  describe('formatCurrency', () => {
    it('should format USD correctly', () => {
      expect(formatCurrency(9999, 'usd')).toBe('$99.99');
    });

    it('should format EUR correctly', () => {
      expect(formatCurrency(5000, 'eur')).toContain('50');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0, 'usd')).toBe('$0.00');
    });
  });
});
