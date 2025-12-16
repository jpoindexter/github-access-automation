-- Database Seed Data
-- Sample customers for development and testing
-- Run with: psql $DATABASE_URL -f database/seed.sql

-- Clear existing data (development only!)
-- TRUNCATE customers, oauth_sessions RESTART IDENTITY CASCADE;

INSERT INTO customers (
  name, email, company, use_case, referral_source,
  newsletter_opted_in, github_username, github_user_id,
  polar_order_id, polar_customer_id, amount_paid, currency, status
) VALUES
  (
    'John Developer',
    'john@example.com',
    'Acme Corp',
    'Building a SaaS product',
    'Twitter',
    true,
    'johndeveloper',
    12345,
    'order_test_001',
    'cust_test_001',
    9900,
    'usd',
    'active'
  ),
  (
    'Jane Engineer',
    'jane@example.com',
    'StartupXYZ',
    'Internal tools',
    'Product Hunt',
    false,
    'janeengineer',
    67890,
    'order_test_002',
    'cust_test_002',
    4900,
    'usd',
    'active'
  ),
  (
    'Bob Builder',
    'bob@example.com',
    NULL,
    'Side project',
    'Google',
    true,
    'bobbuilder',
    11111,
    'order_test_003',
    'cust_test_003',
    9900,
    'usd',
    'invited'
  )
ON CONFLICT (polar_order_id) DO NOTHING;

-- Verify seed data
SELECT id, name, email, status, created_at FROM customers ORDER BY created_at;
