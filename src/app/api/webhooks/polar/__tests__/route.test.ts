/**
 * Polar Webhook Route Tests
 * Tests for webhook handler with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoisted mocks - these run before any imports
const {
  mockVerifyPolarWebhookSignature,
  mockParsePolarWebhook,
  mockIsPaidOrderEvent,
  mockExtractCustomerDataFromWebhook,
  mockValidateWebhookTimestamp,
  mockInviteToRepository,
  mockGetRepositoryCloneUrl,
  mockSendWelcomeEmail,
  mockSendErrorNotification,
  mockDb,
  mockWebhookLogger,
} = vi.hoisted(() => ({
  mockVerifyPolarWebhookSignature: vi.fn(),
  mockParsePolarWebhook: vi.fn(),
  mockIsPaidOrderEvent: vi.fn(),
  mockExtractCustomerDataFromWebhook: vi.fn(),
  mockValidateWebhookTimestamp: vi.fn(),
  mockInviteToRepository: vi.fn(),
  mockGetRepositoryCloneUrl: vi.fn(),
  mockSendWelcomeEmail: vi.fn(),
  mockSendErrorNotification: vi.fn(),
  mockDb: {
    getCustomerByOrderId: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomerStatus: vi.fn(),
    markWelcomeEmailSent: vi.fn(),
  },
  mockWebhookLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock all dependencies
vi.mock('@/lib/polar-webhook', () => ({
  verifyPolarWebhookSignature: mockVerifyPolarWebhookSignature,
  parsePolarWebhook: mockParsePolarWebhook,
  isPaidOrderEvent: mockIsPaidOrderEvent,
  extractCustomerDataFromWebhook: mockExtractCustomerDataFromWebhook,
  validateWebhookTimestamp: mockValidateWebhookTimestamp,
}));

vi.mock('@/lib/github-api', () => ({
  inviteToRepository: mockInviteToRepository,
  getRepositoryCloneUrl: mockGetRepositoryCloneUrl,
}));

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
  sendErrorNotification: mockSendErrorNotification,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/logger', () => ({
  webhookLogger: mockWebhookLogger,
}));

// Import route after mocks are set up
import { GET, POST } from '../route';

describe('Polar Webhook Handler', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_ORG_OR_USER = 'test-org';
    process.env.GITHUB_REPO = 'test-repo';

    // Set default mock implementations
    mockVerifyPolarWebhookSignature.mockReturnValue(false);
    mockValidateWebhookTimestamp.mockReturnValue(true);
    mockIsPaidOrderEvent.mockReturnValue(false);
  });

  describe('POST handler', () => {
    it('should reject requests with invalid signature', async () => {
      // Default mock already returns false for signature verification

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
        headers: {
          'x-polar-signature': 'invalid_signature',
        },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
      expect(mockWebhookLogger.warn).toHaveBeenCalledWith(
        'Invalid Polar webhook signature',
        expect.any(Object)
      );
    });

    it('should reject requests without signature', async () => {
      // Default mock already returns false for signature verification

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(401);
    });

    it('should reject expired webhooks (replay attack protection)', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.paid',
        timestamp: '2024-01-01T00:00:00Z',
        data: { id: 'ord_123', status: 'paid' } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(false);

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'order.paid', timestamp: '2024-01-01T00:00:00Z' }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Webhook expired or invalid timestamp');
      expect(mockWebhookLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('timestamp validation failed'),
        expect.any(Object)
      );
    });

    it('should skip non-paid order events', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.created',
        timestamp: new Date().toISOString(),
        data: { id: 'ord_123', status: 'pending' } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(true);
      mockIsPaidOrderEvent.mockReturnValue(false);

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'order.created' }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(mockWebhookLogger.debug).toHaveBeenCalledWith(
        'Skipping non-paid webhook event',
        expect.any(Object)
      );
    });

    it('should reject webhooks missing GitHub username', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.paid',
        timestamp: new Date().toISOString(),
        data: {
          id: 'ord_123',
          status: 'paid',
          metadata: {},
        } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(true);
      mockIsPaidOrderEvent.mockReturnValue(true);
      mockExtractCustomerDataFromWebhook.mockReturnValue({
        email: 'test@example.com',
      } as never);

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'order.paid', data: { id: 'ord_123', metadata: {} } }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing GitHub user data');
      expect(mockWebhookLogger.error).toHaveBeenCalled();
      expect(mockSendErrorNotification).toHaveBeenCalled();
    });

    it('should skip if customer already exists', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.paid',
        timestamp: new Date().toISOString(),
        data: {
          id: 'ord_123',
          status: 'paid',
          metadata: { github_username: 'testuser', github_user_id: 12345 },
        } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(true);
      mockIsPaidOrderEvent.mockReturnValue(true);
      mockExtractCustomerDataFromWebhook.mockReturnValue({
        email: 'test@example.com',
      } as never);
      mockDb.getCustomerByOrderId.mockResolvedValue({
        id: 'cust_123',
      } as never);

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({
          type: 'order.paid',
          data: { id: 'ord_123', metadata: { github_username: 'testuser', github_user_id: 12345 } },
        }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Customer already processed');
      expect(mockWebhookLogger.info).toHaveBeenCalledWith(
        'Customer already exists for order',
        expect.any(Object)
      );
    });

    it('should process successful webhook end-to-end', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.paid',
        timestamp: new Date().toISOString(),
        data: {
          id: 'ord_123',
          customer_id: 'cust_polar_123',
          status: 'paid',
          amount: 9900,
          currency: 'USD',
          product_id: 'prod_123',
          metadata: {
            github_username: 'testuser',
            github_user_id: 12345,
            email: 'test@example.com',
            name: 'Test User',
          },
        } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(true);
      mockIsPaidOrderEvent.mockReturnValue(true);
      mockExtractCustomerDataFromWebhook.mockReturnValue({
        email: 'test@example.com',
        name: 'Test User',
      } as never);
      mockDb.getCustomerByOrderId.mockResolvedValue(null);
      mockDb.createCustomer.mockResolvedValue({
        id: 'cust_123',
        email: 'test@example.com',
        name: 'Test User',
      } as never);
      mockInviteToRepository.mockResolvedValue({
        success: true,
        message: 'Invited',
      });
      mockGetRepositoryCloneUrl.mockReturnValue({
        https: 'https://github.com/test-org/test-repo.git',
        ssh: 'git@github.com:test-org/test-repo.git',
      });
      mockSendWelcomeEmail.mockResolvedValue({
        success: true,
      });

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({
          type: 'order.paid',
          data: {
            id: 'ord_123',
            metadata: { github_username: 'testuser', github_user_id: 12345 },
          },
        }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.customerId).toBe('cust_123');
      expect(data.invited).toBe(true);
      expect(data.emailSent).toBe(true);

      expect(mockDb.createCustomer).toHaveBeenCalled();
      expect(mockInviteToRepository).toHaveBeenCalledWith('testuser', 'pull');
      expect(mockDb.updateCustomerStatus).toHaveBeenCalledWith(
        'cust_123',
        'active'
      );
      expect(mockSendWelcomeEmail).toHaveBeenCalled();
      expect(mockDb.markWelcomeEmailSent).toHaveBeenCalledWith('cust_123');
    });

    it('should handle GitHub invitation failure', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.paid',
        timestamp: new Date().toISOString(),
        data: {
          id: 'ord_123',
          metadata: { github_username: 'testuser', github_user_id: 12345 },
        } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(true);
      mockIsPaidOrderEvent.mockReturnValue(true);
      mockExtractCustomerDataFromWebhook.mockReturnValue({
        email: 'test@example.com',
      } as never);
      mockDb.getCustomerByOrderId.mockResolvedValue(null);
      mockDb.createCustomer.mockResolvedValue({
        id: 'cust_123',
      } as never);
      mockInviteToRepository.mockResolvedValue({
        success: false,
        message: 'Failed',
        error: 'User not found',
      });

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({
          type: 'order.paid',
          data: { id: 'ord_123', metadata: { github_username: 'testuser', github_user_id: 12345 } },
        }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to invite to repository');
      expect(mockDb.updateCustomerStatus).toHaveBeenCalledWith(
        'cust_123',
        'invited_failed',
        expect.any(Date),
        'User not found'
      );
      expect(mockSendErrorNotification).toHaveBeenCalled();
    });

    it('should continue if welcome email fails', async () => {
      mockVerifyPolarWebhookSignature.mockReturnValue(true);
      mockParsePolarWebhook.mockReturnValue({
        type: 'order.paid',
        timestamp: new Date().toISOString(),
        data: {
          id: 'ord_123',
          metadata: { github_username: 'testuser', github_user_id: 12345 },
        } as never,
      });
      mockValidateWebhookTimestamp.mockReturnValue(true);
      mockIsPaidOrderEvent.mockReturnValue(true);
      mockExtractCustomerDataFromWebhook.mockReturnValue({
        email: 'test@example.com',
        name: 'Test User',
      } as never);
      mockDb.getCustomerByOrderId.mockResolvedValue(null);
      mockDb.createCustomer.mockResolvedValue({
        id: 'cust_123',
        email: 'test@example.com',
        name: 'Test User',
      } as never);
      mockInviteToRepository.mockResolvedValue({
        success: true,
        message: 'Invited',
      });
      mockGetRepositoryCloneUrl.mockReturnValue({
        https: 'https://github.com/test-org/test-repo.git',
        ssh: 'git@github.com:test-org/test-repo.git',
      });
      mockSendWelcomeEmail.mockResolvedValue({
        success: false,
        error: 'Email service down',
      });

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({
          type: 'order.paid',
          data: { id: 'ord_123', metadata: { github_username: 'testuser', github_user_id: 12345 } },
        }),
        headers: { 'x-polar-signature': 'valid_sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.emailSent).toBe(false);
      expect(mockWebhookLogger.error).toHaveBeenCalledWith(
        'Failed to send welcome email',
        undefined,
        expect.any(Object)
      );
      expect(mockSendErrorNotification).toHaveBeenCalled();
      expect(mockDb.markWelcomeEmailSent).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors', async () => {
      mockVerifyPolarWebhookSignature.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
        headers: { 'x-polar-signature': 'sig' },
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process webhook');
      expect(mockWebhookLogger.error).toHaveBeenCalledWith(
        'Polar webhook processing error',
        expect.any(Error)
      );
      expect(mockSendErrorNotification).toHaveBeenCalled();
    });
  });

  describe('GET handler', () => {
    it('should return health check status', async () => {
      mockRequest = new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'GET',
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.endpoint).toBe('/api/webhooks/polar');
    });
  });
});
