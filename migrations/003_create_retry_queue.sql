-- Migration: Create Retry Queue and Dead Letter Queue
-- Date: 2025-12-17
-- Description: Implements auto-retry queue with exponential backoff and DLQ

-- Retry Queue Table
-- Stores failed operations that need to be retried with exponential backoff
CREATE TABLE IF NOT EXISTS retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Retry tracking
  attempt_number INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,

  -- Error details
  last_error TEXT,
  error_type VARCHAR(20) CHECK (error_type IN ('retryable', 'permanent')),
  error_code VARCHAR(50), -- HTTP status code or error name

  -- Scheduling
  next_retry_at TIMESTAMP NOT NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Additional context (GitHub username, operation type, etc.)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Dead Letter Queue Table
-- Stores operations that exceeded max retries or encountered permanent errors
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  original_retry_id UUID REFERENCES retry_queue(id),

  -- Failure details
  final_error TEXT NOT NULL,
  error_type VARCHAR(20) NOT NULL,
  attempts_made INTEGER NOT NULL,

  -- Resolution tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  resolved_by VARCHAR(100), -- 'manual', 'auto', or admin email

  -- Original context
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_retry_queue_next_retry
  ON retry_queue(next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_retry_queue_customer
  ON retry_queue(customer_id);

CREATE INDEX IF NOT EXISTS idx_retry_queue_status
  ON retry_queue(status);

CREATE INDEX IF NOT EXISTS idx_dlq_customer
  ON dead_letter_queue(customer_id);

CREATE INDEX IF NOT EXISTS idx_dlq_resolved
  ON dead_letter_queue(resolved_at)
  WHERE resolved_at IS NULL;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_retry_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call update function
DROP TRIGGER IF EXISTS retry_queue_updated_at_trigger ON retry_queue;
CREATE TRIGGER retry_queue_updated_at_trigger
  BEFORE UPDATE ON retry_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_retry_queue_updated_at();

-- Comments for documentation
COMMENT ON TABLE retry_queue IS 'Queue for retrying failed GitHub invitation operations with exponential backoff';
COMMENT ON TABLE dead_letter_queue IS 'Permanent storage for operations that exceeded max retries or encountered permanent errors';
COMMENT ON COLUMN retry_queue.attempt_number IS 'Current retry attempt (0-10)';
COMMENT ON COLUMN retry_queue.error_type IS 'Whether error is retryable (temporary) or permanent';
COMMENT ON COLUMN retry_queue.next_retry_at IS 'Timestamp when next retry should be attempted';
COMMENT ON COLUMN retry_queue.metadata IS 'JSON object with GitHub username, operation type, and other context';
