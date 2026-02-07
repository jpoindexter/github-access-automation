/**
 * Email Service Tests
 * Tests for Resend email functionality with mocked Resend client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks - these run before any imports
const { mockSend, mockEmailLogger } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockEmailLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Resend
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  emailLogger: mockEmailLogger,
}));

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test_api_key';
    process.env.RESEND_FROM_EMAIL = 'test@example.com';
    process.env.ADMIN_EMAIL = 'admin@example.com';
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'email_123' },
        error: null,
      });

      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<p>Hello World</p>',
        text: 'Hello World',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email_123');
    });

    it('should send email without text content', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'email_456' },
        error: null,
      });

      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'HTML Only',
        html: '<p>HTML content</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email_456');
    });

    it('should handle Resend API errors', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'validation_error',
          message: 'Invalid email address',
        },
      });

      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'invalid-email',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });

    it('should handle network errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network timeout'));

      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('should handle unknown errors', async () => {
      mockSend.mockRejectedValueOnce('String error');

      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct content', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'welcome_123' },
        error: null,
      });

      const { sendWelcomeEmail } = await import('@/lib/email');
      const result = await sendWelcomeEmail(
        'customer@example.com',
        'John Doe',
        'https://github.com/org/repo',
        'https://github.com/org/repo.git'
      );

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'customer@example.com',
        })
      );
    });

    it('should include all required sections in welcome email', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'welcome_456' },
        error: null,
      });

      const { sendWelcomeEmail } = await import('@/lib/email');
      await sendWelcomeEmail(
        'test@example.com',
        'Test User',
        'https://github.com/test/repo',
        'https://github.com/test/repo.git'
      );

      const callArgs = mockSend.mock.calls[0][0];
      // HTML content includes personalized greeting
      expect(callArgs.html).toContain('Test User');
      // Text content includes repo URL
      expect(callArgs.text).toContain('https://github.com/test/repo.git');
    });

    it('should handle send failures', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'rate_limit_exceeded',
          message: 'Rate limit exceeded',
        },
      });

      const { sendWelcomeEmail } = await import('@/lib/email');
      const result = await sendWelcomeEmail(
        'test@example.com',
        'Test',
        'https://github.com/test/repo',
        'https://github.com/test/repo.git'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });
  });

  describe('sendErrorNotification', () => {
    it('should send error notification to admin', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'error_123' },
        error: null,
      });

      const { sendErrorNotification } = await import('@/lib/email');
      const result = await sendErrorNotification('GitHub Invitation Failed', 'User not found', {
        username: 'johndoe',
        customerId: '123',
      });

      expect(result.success).toBe(true);
    });

    it('should send error notification without context', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'error_456' },
        error: null,
      });

      const { sendErrorNotification } = await import('@/lib/email');
      const result = await sendErrorNotification('Database Error', 'Connection timeout');

      expect(result.success).toBe(true);
    });

    it('should handle complex context objects', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'error_complex' },
        error: null,
      });

      const { sendErrorNotification } = await import('@/lib/email');
      await sendErrorNotification('Complex Error', 'Multiple failures', {
        orderId: 'ord_123',
        amount: 9900,
      });

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('ord_123');
    });

    it('should handle send failures gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Email service down'));

      const { sendErrorNotification } = await import('@/lib/email');
      const result = await sendErrorNotification('Test', 'Test error');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email service down');
    });
  });

  describe('default email fallbacks', () => {
    it('should use default FROM_EMAIL when env var is not set', async () => {
      // Clear the env vars and reset modules
      delete process.env.RESEND_FROM_EMAIL;
      vi.resetModules();

      mockSend.mockResolvedValueOnce({
        data: { id: 'fallback_from_123' },
        error: null,
      });

      const { sendEmail } = await import('@/lib/email');
      await sendEmail({
        to: 'user@example.com',
        subject: 'Test with default from',
        html: '<p>Test</p>',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
        })
      );
    });

    it('should use default ADMIN_EMAIL when env var is not set', async () => {
      // Keep FROM_EMAIL set but remove ADMIN_EMAIL
      process.env.RESEND_FROM_EMAIL = 'test@example.com';
      delete process.env.ADMIN_EMAIL;
      vi.resetModules();

      mockSend.mockResolvedValueOnce({
        data: { id: 'fallback_admin_123' },
        error: null,
      });

      const { sendErrorNotification } = await import('@/lib/email');
      await sendErrorNotification('Test Error', 'Error details');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@example.com',
        })
      );
    });
  });
});
