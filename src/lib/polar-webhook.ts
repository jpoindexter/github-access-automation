/**
 * Polar Webhook Utilities
 * Handles Polar payment webhook verification and processing
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { PolarWebhookPayload, PolarOrder } from '@/types';

// Maximum age for webhook timestamps (5 minutes)
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

/**
 * Verify Polar webhook signature
 * Ensures webhook came from Polar and hasn't been tampered with
 */
export function verifyPolarWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.POLAR_WEBHOOK_SECRET || '';

  // Calculate HMAC-SHA256 of payload using secret
  const hash = createHmac('sha256', secret).update(payload).digest('hex');

  // Use Node.js built-in timing-safe comparison
  return constantTimeCompare(hash, signature);
}

/**
 * Constant-time string comparison using Node.js crypto.timingSafeEqual
 * Prevents timing attacks by ensuring comparison takes the same amount of time
 * regardless of where strings differ
 */
function constantTimeCompare(a: string, b: string): boolean {
  // timingSafeEqual requires equal length buffers
  // Pad shorter string to prevent length-based timing leaks
  const maxLen = Math.max(a.length, b.length);
  const bufferA = Buffer.alloc(maxLen);
  const bufferB = Buffer.alloc(maxLen);

  bufferA.write(a);
  bufferB.write(b);

  // First compare lengths, then contents (both in constant time)
  const lengthsMatch = a.length === b.length;
  const contentsMatch = timingSafeEqual(bufferA, bufferB);

  return lengthsMatch && contentsMatch;
}

/**
 * Validate webhook timestamp to prevent replay attacks
 * Rejects webhooks older than MAX_WEBHOOK_AGE_MS
 */
export function validateWebhookTimestamp(timestamp: string): boolean {
  const webhookTime = new Date(timestamp).getTime();
  const now = Date.now();

  // Reject if timestamp is in the future (clock skew > 1 minute)
  if (webhookTime > now + 60000) {
    return false;
  }

  // Reject if webhook is too old
  if (now - webhookTime > MAX_WEBHOOK_AGE_MS) {
    return false;
  }

  return true;
}

/**
 * Parse Polar webhook payload
 */
export function parsePolarWebhook(payload: string): PolarWebhookPayload {
  try {
    return JSON.parse(payload) as PolarWebhookPayload;
  } catch {
    throw new Error('Invalid JSON in webhook payload');
  }
}

/**
 * Extract customer data from Polar webhook
 */
export function extractCustomerDataFromWebhook(order: PolarOrder): {
  email: string;
  name?: string;
  company?: string;
  useCase?: string;
  referralSource?: string;
  newsletterOptedIn?: boolean;
  promo_code?: string;
  product_id?: string;
  discount_id?: string;
} {
  const metadata = order.metadata;

  return {
    email: metadata?.email || '',
    name: metadata?.name || '',
    company: metadata?.company || undefined,
    useCase: metadata?.use_case || undefined,
    referralSource: metadata?.referral_source || undefined,
    newsletterOptedIn: metadata?.newsletter_opted_in ?? false,
    promo_code: metadata?.promo_code || undefined,
    product_id: order.product_id,
    discount_id: order.discount_id,
  };
}

/**
 * Check if webhook is for a paid order
 */
export function isPaidOrderEvent(webhook: PolarWebhookPayload): boolean {
  return webhook.type === 'order.paid' && webhook.data.status === 'paid';
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  return formatter.format(amount / 100); // Polar amount is in cents
}
