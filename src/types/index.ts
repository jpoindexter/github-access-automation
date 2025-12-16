/**
 * Database Types
 * Generated from Neon PostgreSQL schema
 */

/**
 * Customer metadata stored in JSONB column
 */
export interface CustomerMetadata {
  referral_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  browser?: string;
  device?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface Customer {
  id: string; // UUID
  name: string;
  email: string;
  company?: string;
  use_case?: string;
  referral_source?: string;

  // Newsletter
  newsletter_opted_in: boolean;
  unsubscribed_at?: Date;
  email_verification_sent: boolean;

  // GitHub
  github_username: string;
  github_email?: string;
  github_user_id: number;

  // Polar Payment
  polar_order_id: string;
  polar_customer_id?: string; // UUID
  amount_paid: number; // in cents
  currency: string; // ISO code
  payment_method?: string;
  product_id?: string; // UUID
  discount_id?: string; // UUID
  promo_code_used?: string;
  metadata?: CustomerMetadata;

  // Repo Access
  status: 'pending' | 'invited' | 'accepted' | 'active' | 'invited_failed';
  access_revoked: boolean;
  invitation_sent_at?: Date;
  invitation_error?: string;
  welcome_email_sent: boolean;

  // Support/Admin
  internal_notes?: string;
  tags?: string[];

  // Payment Issues
  chargebacked: boolean;
  chargeback_date?: Date;
  payment_dispute_status?: 'open' | 'resolved' | 'won' | 'lost';
  payment_issue_notes?: string;

  created_at: Date;
  updated_at: Date;
}

export interface OAuthSession {
  id: string; // UUID
  github_username: string;
  github_user_id: number;
  created_at: Date;
  expires_at: Date;
}

/**
 * Polar Webhook Metadata
 * Data passed from checkout to webhook via Polar metadata
 */
export interface PolarWebhookMetadata {
  github_username?: string; // Made optional as it might be in custom_field_data
  github_user_id?: number; // Made optional as it might be in custom_field_data
  email?: string;
  name?: string;
  company?: string;
  use_case?: string;
  referral_source?: string;
  newsletter_opted_in?: boolean;
  payment_method?: string;
  promo_code?: string;
  // Allow other arbitrary properties
  [key: string]: any;
}

export interface PolarCustomFieldData {
  gh_username?: string;
  gh_user_id?: string; // Can be string as it's from input field
  // Allow other arbitrary custom fields
  [key: string]: any;
}

/**
 * Webhook Types
 */

export interface PolarWebhookPayload {
  type: string;
  timestamp: string; // ISO date-time
  data: PolarOrder;
}

export interface PolarOrder {
  id: string; // UUID
  created_at: string; // ISO date-time
  modified_at?: string; // ISO date-time
  status: 'pending' | 'paid' | 'refunded';
  amount: number; // cents
  currency: string; // ISO code
  customer_id: string; // UUID
  subscription_id?: string; // UUID
  product_id: string; // UUID
  discount_id?: string; // UUID
  organization_id: string; // UUID
  metadata?: PolarWebhookMetadata;
  custom_field_data?: PolarCustomFieldData; // Add custom field data
}

/**
 * GitHub OAuth Types
 */

export interface GitHubUser {
  id: number;
  login: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

export interface GitHubOAuthToken {
  access_token: string;
  token_type: string;
  scope: string;
}

/**
 * API Request/Response Types
 */

export interface CreateCustomerRequest {
  name: string;
  email: string;
  company?: string;
  use_case?: string;
  referral_source?: string;
  newsletter_opted_in?: boolean;
  github_username: string;
  github_email?: string;
  github_user_id: number;
  polar_order_id: string;
  polar_customer_id?: string;
  amount_paid: number;
  currency: string;
  payment_method?: string;
  product_id?: string;
  discount_id?: string;
  promo_code_used?: string;
}

export interface WebhookResponse {
  success: boolean;
  message: string;
  customerId?: string;
  error?: string;
}

/**
 * GitHub API Response Types
 */

export interface GitHubCollaborator {
  username: string;
  permission: string;
}

export interface InviteResult {
  success: boolean;
  error?: string;
}

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}
