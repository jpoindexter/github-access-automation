/**
 * Database Client
 * Connects to Neon PostgreSQL via connection pool
 */

import { Pool, QueryResult } from 'pg';
import { Customer, OAuthSession, CreateCustomerRequest } from '@/types';
import { dbLogger } from '@/lib/logger';

// SSL Configuration:
// - Production: Use SSL with certificate verification when possible
// - Neon serverless: Requires rejectUnauthorized: false due to their proxy architecture
// - Development: Skip SSL for local databases
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL || '';
const isNeonDatabase = databaseUrl.includes('neon.tech');
const skipSslVerification = process.env.DATABASE_SSL_SKIP_VERIFY === 'true';

// Neon requires rejectUnauthorized: false due to their connection pooling
const sslConfig = databaseUrl.startsWith('postgres')
  ? {
      rejectUnauthorized: isNeonDatabase || skipSslVerification ? false : true,
    }
  : false;

if (isProduction && !isNeonDatabase && skipSslVerification) {
  dbLogger.warn(
    'SSL certificate verification is disabled in production. This is a security risk!'
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfig,
  max: 20, // Maximum connections in pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout after 10 seconds
});

pool.on('error', (err) => {
  dbLogger.error('Unexpected error on idle client', err);
  // Don't crash the app - log and let Next.js handle gracefully
});

pool.on('connect', () => {
  dbLogger.debug('New database connection established');
});

/**
 * Customer operations
 */

export const db = {
  /**
   * Create new customer from Polar webhook
   */
  async createCustomer(data: CreateCustomerRequest): Promise<Customer> {
    const query = `
      INSERT INTO customers (
        name,
        email,
        company,
        use_case,
        referral_source,
        newsletter_opted_in,
        github_username,
        github_email,
        github_user_id,
        polar_order_id,
        polar_customer_id,
        amount_paid,
        currency,
        payment_method,
        product_id,
        discount_id,
        promo_code_used
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      ON CONFLICT (email) DO UPDATE SET
        polar_order_id = EXCLUDED.polar_order_id,
        amount_paid = EXCLUDED.amount_paid,
        product_id = EXCLUDED.product_id,
        github_username = EXCLUDED.github_username,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      data.name,
      data.email,
      data.company || null,
      data.use_case || null,
      data.referral_source || null,
      data.newsletter_opted_in ?? false,
      data.github_username,
      data.github_email || null,
      data.github_user_id,
      data.polar_order_id,
      data.polar_customer_id || null,
      data.amount_paid,
      data.currency,
      data.payment_method || null,
      data.product_id || null,
      data.discount_id || null,
      data.promo_code_used || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0] as Customer;
  },

  /**
   * Get customer by email
   */
  async getCustomerByEmail(email: string): Promise<Customer | null> {
    const query = 'SELECT * FROM customers WHERE email = $1;';
    const result = await pool.query(query, [email]);
    return (result.rows[0] as Customer) || null;
  },

  /**
   * Get customer by Polar order ID
   */
  async getCustomerByOrderId(orderId: string): Promise<Customer | null> {
    const query = 'SELECT * FROM customers WHERE polar_order_id = $1;';
    const result = await pool.query(query, [orderId]);
    return (result.rows[0] as Customer) || null;
  },

  /**
   * Get customer by GitHub username
   */
  async getCustomerByGitHubUsername(username: string): Promise<Customer | null> {
    const query = 'SELECT * FROM customers WHERE github_username = $1;';
    const result = await pool.query(query, [username]);
    return (result.rows[0] as Customer) || null;
  },

  /**
   * Update customer status
   */
  async updateCustomerStatus(
    customerId: string,
    status: string,
    invitationSentAt?: Date,
    invitationError?: string
  ): Promise<Customer> {
    const query = `
      UPDATE customers
      SET
        status = $2,
        invitation_sent_at = $3,
        invitation_error = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [
      customerId,
      status,
      invitationSentAt || null,
      invitationError || null,
    ]);

    return result.rows[0] as Customer;
  },

  /**
   * Mark welcome email as sent
   */
  async markWelcomeEmailSent(customerId: string): Promise<Customer> {
    const query = `
      UPDATE customers
      SET
        welcome_email_sent = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [customerId]);
    return result.rows[0] as Customer;
  },

  /**
   * Record chargeback
   */
  async recordChargeback(
    customerId: string,
    reason?: string
  ): Promise<Customer> {
    const query = `
      UPDATE customers
      SET
        chargebacked = true,
        chargeback_date = NOW(),
        payment_dispute_status = 'open',
        payment_issue_notes = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [customerId, reason || null]);
    return result.rows[0] as Customer;
  },

  /**
   * Revoke customer access
   */
  async revokeAccess(customerId: string, reason?: string): Promise<Customer> {
    const query = `
      UPDATE customers
      SET
        access_revoked = true,
        internal_notes = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [customerId, reason || null]);
    return result.rows[0] as Customer;
  },

  /**
   * List all customers (pagination)
   */
  async listCustomers(offset = 0, limit = 50): Promise<Customer[]> {
    const query = `
      SELECT * FROM customers
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2;
    `;

    const result = await pool.query(query, [limit, offset]);
    return result.rows as Customer[];
  },

  /**
   * Admin: Get all customers with key fields (no pagination)
   */
  async getAllCustomers(): Promise<Customer[]> {
    const query = `
      SELECT
        id,
        email,
        name,
        github_username,
        github_user_id,
        status,
        invitation_sent_at,
        invitation_error,
        welcome_email_sent,
        created_at,
        updated_at,
        amount_paid,
        currency
      FROM customers
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query);
    return result.rows as Customer[];
  },

  /**
   * Admin: Get customer by ID
   */
  async getCustomerById(id: string): Promise<Customer | null> {
    const query = 'SELECT * FROM customers WHERE id = $1;';
    const result = await pool.query(query, [id]);
    return (result.rows[0] as Customer) || null;
  },

  /**
   * OAuth Session operations
   */

  async createOAuthSession(
    githubUsername: string,
    githubUserId: number,
    expiresAt: Date
  ): Promise<OAuthSession> {
    const query = `
      INSERT INTO oauth_sessions (github_username, github_user_id, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      githubUsername,
      githubUserId,
      expiresAt,
    ]);

    return result.rows[0] as OAuthSession;
  },

  async getOAuthSession(id: string): Promise<OAuthSession | null> {
    const query = 'SELECT * FROM oauth_sessions WHERE id = $1;';
    const result = await pool.query(query, [id]);
    return (result.rows[0] as OAuthSession) || null;
  },

  async deleteOAuthSession(id: string): Promise<void> {
    const query = 'DELETE FROM oauth_sessions WHERE id = $1;';
    await pool.query(query, [id]);
  },

  /**
   * Cleanup expired OAuth sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const query = 'DELETE FROM oauth_sessions WHERE expires_at < NOW();';
    const result = await pool.query(query);
    return result.rowCount ?? 0;
  },

  /**
   * Raw query (use with caution)
   */
  async query(
    text: string,
    values?: (string | number | boolean | Date | null | undefined)[]
  ): Promise<QueryResult> {
    return pool.query(text, values);
  },

  /**
   * Close pool connection
   */
  async close(): Promise<void> {
    await pool.end();
  },
};

export default db;
