import { describe, it, expect } from 'vitest';
import {
  GitHubUsernameSchema,
  PolarMetadataSchema,
  PolarOrderSchema,
  PolarWebhookSchema,
  CreateCustomerSchema,
  validateWebhookMetadata,
  validateWebhookPayload,
  validateCustomerRequest,
} from '../validation';

describe('Validation', () => {
  describe('GitHubUsernameSchema', () => {
    it('should accept valid GitHub usernames', () => {
      const validUsernames = ['john', 'john-doe', 'john123', 'j', 'a'.repeat(39)];

      validUsernames.forEach((username) => {
        const result = GitHubUsernameSchema.safeParse(username);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid GitHub usernames', () => {
      const invalidUsernames = [
        '',
        'a'.repeat(40),
        '-john',
        'john-',
        'john--doe',
        'john_doe',
        'john.doe',
      ];

      invalidUsernames.forEach((username) => {
        const result = GitHubUsernameSchema.safeParse(username);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('PolarMetadataSchema', () => {
    it('should validate complete metadata', () => {
      const metadata = {
        github_username: 'johndoe',
        github_user_id: 12345,
        email: 'john@example.com',
        name: 'John Doe',
        company: 'Acme Inc',
        newsletter_opted_in: true,
      };

      const result = PolarMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should validate minimal metadata', () => {
      const metadata = {
        github_username: 'johndoe',
        github_user_id: 12345,
      };

      const result = PolarMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should reject invalid github_user_id', () => {
      const metadata = {
        github_username: 'johndoe',
        github_user_id: -1,
      };

      const result = PolarMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const metadata = {
        email: 'john@example.com',
      };

      const result = PolarMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('validateWebhookMetadata', () => {
    it('should return success for valid metadata', () => {
      const metadata = {
        github_username: 'johndoe',
        github_user_id: 12345,
      };

      const result = validateWebhookMetadata(metadata);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(metadata);
    });

    it('should return error for invalid metadata', () => {
      const metadata = {
        github_username: '',
        github_user_id: 12345,
      };

      const result = validateWebhookMetadata(metadata);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('PolarOrderSchema', () => {
    it('should validate complete order', () => {
      const order = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
        status: 'paid',
        amount: 9900,
        currency: 'USD',
        customer_id: '550e8400-e29b-41d4-a716-446655440001',
        product_id: '550e8400-e29b-41d4-a716-446655440002',
        organization_id: '550e8400-e29b-41d4-a716-446655440003',
        metadata: {
          github_username: 'johndoe',
          github_user_id: 12345,
        },
      };

      const result = PolarOrderSchema.safeParse(order);
      expect(result.success).toBe(true);
    });

    it('should validate order without optional fields', () => {
      const order = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: '2024-01-01T00:00:00Z',
        status: 'pending',
        amount: 0,
        currency: 'USD',
        customer_id: '550e8400-e29b-41d4-a716-446655440001',
        product_id: '550e8400-e29b-41d4-a716-446655440002',
        organization_id: '550e8400-e29b-41d4-a716-446655440003',
      };

      const result = PolarOrderSchema.safeParse(order);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const order = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: '2024-01-01T00:00:00Z',
        status: 'invalid_status',
        amount: 9900,
        currency: 'USD',
        customer_id: '550e8400-e29b-41d4-a716-446655440001',
        product_id: '550e8400-e29b-41d4-a716-446655440002',
        organization_id: '550e8400-e29b-41d4-a716-446655440003',
      };

      const result = PolarOrderSchema.safeParse(order);
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const order = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: '2024-01-01T00:00:00Z',
        status: 'paid',
        amount: -100,
        currency: 'USD',
        customer_id: '550e8400-e29b-41d4-a716-446655440001',
        product_id: '550e8400-e29b-41d4-a716-446655440002',
        organization_id: '550e8400-e29b-41d4-a716-446655440003',
      };

      const result = PolarOrderSchema.safeParse(order);
      expect(result.success).toBe(false);
    });

    it('should reject invalid currency length', () => {
      const order = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: '2024-01-01T00:00:00Z',
        status: 'paid',
        amount: 9900,
        currency: 'US',
        customer_id: '550e8400-e29b-41d4-a716-446655440001',
        product_id: '550e8400-e29b-41d4-a716-446655440002',
        organization_id: '550e8400-e29b-41d4-a716-446655440003',
      };

      const result = PolarOrderSchema.safeParse(order);
      expect(result.success).toBe(false);
    });
  });

  describe('PolarWebhookSchema', () => {
    it('should validate complete webhook payload', () => {
      const payload = {
        type: 'order.paid',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2024-01-01T00:00:00Z',
          status: 'paid',
          amount: 9900,
          currency: 'USD',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          organization_id: '550e8400-e29b-41d4-a716-446655440003',
        },
      };

      const result = PolarWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid timestamp format', () => {
      const payload = {
        type: 'order.paid',
        timestamp: 'invalid-date',
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2024-01-01T00:00:00Z',
          status: 'paid',
          amount: 9900,
          currency: 'USD',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          organization_id: '550e8400-e29b-41d4-a716-446655440003',
        },
      };

      const result = PolarWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject missing data', () => {
      const payload = {
        type: 'order.paid',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = PolarWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateCustomerSchema', () => {
    it('should validate complete customer request', () => {
      const customer = {
        name: 'John Doe',
        email: 'john@example.com',
        company: 'Acme Inc',
        use_case: 'Building a SaaS',
        referral_source: 'Twitter',
        newsletter_opted_in: true,
        github_username: 'johndoe',
        github_email: 'john@github.com',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        polar_customer_id: '550e8400-e29b-41d4-a716-446655440001',
        amount_paid: 9900,
        currency: 'USD',
        payment_method: 'card',
        product_id: '550e8400-e29b-41d4-a716-446655440002',
        discount_id: '550e8400-e29b-41d4-a716-446655440003',
        promo_code_used: 'LAUNCH50',
      };

      const result = CreateCustomerSchema.safeParse(customer);
      expect(result.success).toBe(true);
    });

    it('should validate minimal customer request', () => {
      const customer = {
        name: 'John Doe',
        email: 'john@example.com',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        amount_paid: 0,
        currency: 'USD',
      };

      const result = CreateCustomerSchema.safeParse(customer);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newsletter_opted_in).toBe(false); // default value
      }
    });

    it('should reject invalid email', () => {
      const customer = {
        name: 'John Doe',
        email: 'invalid-email',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        amount_paid: 0,
        currency: 'USD',
      };

      const result = CreateCustomerSchema.safeParse(customer);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const customer = {
        name: '',
        email: 'john@example.com',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        amount_paid: 0,
        currency: 'USD',
      };

      const result = CreateCustomerSchema.safeParse(customer);
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const customer = {
        name: 'John Doe',
        email: 'john@example.com',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        amount_paid: -100,
        currency: 'USD',
      };

      const result = CreateCustomerSchema.safeParse(customer);
      expect(result.success).toBe(false);
    });
  });

  describe('validateWebhookPayload', () => {
    it('should return success for valid webhook payload', () => {
      const payload = {
        type: 'order.paid',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2024-01-01T00:00:00Z',
          status: 'paid',
          amount: 9900,
          currency: 'USD',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          organization_id: '550e8400-e29b-41d4-a716-446655440003',
          metadata: {
            github_username: 'johndoe',
            github_user_id: 12345,
          },
        },
      };

      const result = validateWebhookPayload(payload);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.type).toBe('order.paid');
    });

    it('should return error for invalid payload', () => {
      const payload = {
        type: 'order.paid',
        timestamp: 'not-a-valid-date',
        data: {},
      };

      const result = validateWebhookPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('timestamp');
    });

    it('should return error for missing required fields', () => {
      const payload = {
        type: 'order.paid',
      };

      const result = validateWebhookPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for invalid data structure', () => {
      const payload = {
        type: 'order.paid',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          id: 'not-a-uuid',
          created_at: '2024-01-01T00:00:00Z',
          status: 'paid',
          amount: 9900,
          currency: 'USD',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          organization_id: '550e8400-e29b-41d4-a716-446655440003',
        },
      };

      const result = validateWebhookPayload(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('id');
    });
  });

  describe('validateCustomerRequest', () => {
    it('should return success for valid customer request', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        amount_paid: 9900,
        currency: 'USD',
      };

      const result = validateCustomerRequest(data);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe('John Doe');
    });

    it('should return error for invalid customer request', () => {
      const data = {
        name: '',
        email: 'invalid',
        github_username: '--invalid--',
        github_user_id: -1,
        polar_order_id: 'not-a-uuid',
        amount_paid: -100,
        currency: 'INVALID',
      };

      const result = validateCustomerRequest(data);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for missing required fields', () => {
      const data = {
        name: 'John Doe',
      };

      const result = validateCustomerRequest(data);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error with formatted error messages', () => {
      const data = {
        name: 'John Doe',
        email: 'invalid-email',
        github_username: 'johndoe',
        github_user_id: 12345,
        polar_order_id: '550e8400-e29b-41d4-a716-446655440000',
        amount_paid: 0,
        currency: 'USD',
      };

      const result = validateCustomerRequest(data);
      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
    });
  });
});
