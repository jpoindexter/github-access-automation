-- ==========================================
-- GitHub Access Automation - Database Schema
-- PostgreSQL (Neon)
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Customers Table
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Customer Information
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  use_case VARCHAR(500),
  referral_source VARCHAR(255),

  -- Newsletter
  newsletter_opted_in BOOLEAN DEFAULT FALSE,
  unsubscribed_at TIMESTAMP,
  email_verification_sent BOOLEAN DEFAULT FALSE,

  -- GitHub OAuth
  github_username VARCHAR(255) NOT NULL,
  github_email VARCHAR(255),
  github_user_id INTEGER NOT NULL,

  -- Polar Payment
  polar_order_id VARCHAR(255) NOT NULL UNIQUE,
  polar_customer_id UUID,
  amount_paid DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  payment_method VARCHAR(50),
  product_id UUID,
  discount_id UUID,
  promo_code_used VARCHAR(255),
  metadata JSONB,

  -- Repository Access
  status VARCHAR(50) DEFAULT 'pending',
  access_revoked BOOLEAN DEFAULT FALSE,
  invitation_sent_at TIMESTAMP,
  invitation_error TEXT,
  welcome_email_sent BOOLEAN DEFAULT FALSE,

  -- Support/Admin
  internal_notes TEXT,
  tags VARCHAR(255)[],

  -- Payment Issues
  chargebacked BOOLEAN DEFAULT FALSE,
  chargeback_date TIMESTAMP,
  payment_dispute_status VARCHAR(50),
  payment_issue_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- OAuth Sessions Table
-- ==========================================
CREATE TABLE IF NOT EXISTS oauth_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  github_username VARCHAR(255) NOT NULL,
  github_user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- ==========================================
-- Audit Log Table
-- ==========================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(100) NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- Webhook Events Table (for idempotency)
-- ==========================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id VARCHAR(255) UNIQUE NOT NULL,
  webhook_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  payload JSONB
);

-- ==========================================
-- Indexes
-- ==========================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_polar_order_id ON customers(polar_order_id);
CREATE INDEX IF NOT EXISTS idx_customers_github_username ON customers(github_username);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

-- OAuth sessions indexes
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_github_user_id ON oauth_sessions(github_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires_at ON oauth_sessions(expires_at);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_customer_id ON audit_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Webhook events indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id ON webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at DESC);

-- ==========================================
-- Functions
-- ==========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==========================================
-- Triggers
-- ==========================================

-- Customers updated_at trigger
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
