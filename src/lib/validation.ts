/**
 * Input Validation with Zod
 * Runtime validation for webhook payloads and API inputs
 */

import { z } from 'zod';

/**
 * GitHub username validation
 * - 1-39 characters
 * - Alphanumeric and hyphens only
 * - Cannot start or end with hyphen
 * - Cannot have consecutive hyphens
 */
export const GitHubUsernameSchema = z
  .string()
  .min(1, 'GitHub username is required')
  .max(39, 'GitHub username must be 39 characters or less')
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/, 'Invalid GitHub username format');

/**
 * Polar webhook metadata schema
 */
export const PolarMetadataSchema = z.object({
  github_username: GitHubUsernameSchema,
  github_user_id: z.number().int().positive(),
  email: z.string().email().optional(),
  name: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  use_case: z.string().max(500).optional(),
  referral_source: z.string().max(255).optional(),
  newsletter_opted_in: z.boolean().optional(),
  payment_method: z.string().max(50).optional(),
  promo_code: z.string().max(100).optional(),
});

export type PolarMetadata = z.infer<typeof PolarMetadataSchema>;

/**
 * Polar order schema
 */
export const PolarOrderSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  modified_at: z.string().datetime().optional(),
  status: z.enum(['pending', 'paid', 'refunded']),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  customer_id: z.string().uuid(),
  subscription_id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  discount_id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  metadata: PolarMetadataSchema.optional(),
});

export type PolarOrder = z.infer<typeof PolarOrderSchema>;

/**
 * Polar webhook payload schema
 */
export const PolarWebhookSchema = z.object({
  type: z.string(),
  timestamp: z.string().datetime(),
  data: PolarOrderSchema,
});

export type PolarWebhookPayload = z.infer<typeof PolarWebhookSchema>;

/**
 * Customer creation request schema
 */
export const CreateCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  company: z.string().max(255).optional(),
  use_case: z.string().max(500).optional(),
  referral_source: z.string().max(255).optional(),
  newsletter_opted_in: z.boolean().default(false),
  github_username: GitHubUsernameSchema,
  github_email: z.string().email().optional(),
  github_user_id: z.number().int().positive(),
  polar_order_id: z.string().uuid(),
  polar_customer_id: z.string().uuid().optional(),
  amount_paid: z.number().int().nonnegative(),
  currency: z.string().length(3),
  payment_method: z.string().max(50).optional(),
  product_id: z.string().uuid().optional(),
  discount_id: z.string().uuid().optional(),
  promo_code_used: z.string().max(100).optional(),
});

export type CreateCustomerRequest = z.infer<typeof CreateCustomerSchema>;

/**
 * Validate webhook metadata
 */
export function validateWebhookMetadata(metadata: unknown): {
  success: boolean;
  data?: PolarMetadata;
  error?: string;
} {
  const result = PolarMetadataSchema.safeParse(metadata);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    return { success: false, error: errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate full webhook payload
 */
export function validateWebhookPayload(payload: unknown): {
  success: boolean;
  data?: PolarWebhookPayload;
  error?: string;
} {
  const result = PolarWebhookSchema.safeParse(payload);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    return { success: false, error: errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate customer creation request
 */
export function validateCustomerRequest(data: unknown): {
  success: boolean;
  data?: CreateCustomerRequest;
  error?: string;
} {
  const result = CreateCustomerSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    return { success: false, error: errors };
  }

  return { success: true, data: result.data };
}
