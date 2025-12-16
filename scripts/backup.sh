#!/bin/bash

# ==========================================
# Database Backup Script
# Creates a timestamped backup of the database
# ==========================================

set -e

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/github_access_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set"
  exit 1
fi

echo "📦 Creating database backup..."

# Create backup
pg_dump "$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --format=plain \
  > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE.gz"

# Upload to S3 if configured
if [ -n "$AWS_S3_BUCKET" ]; then
  echo "☁️  Uploading to S3..."
  aws s3 cp "$BACKUP_FILE.gz" "s3://$AWS_S3_BUCKET/backups/"
  echo "✅ Backup uploaded to S3"
fi

# Clean up old backups (keep last 30 days)
echo "🧹 Cleaning up old backups..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "✅ Backup process completed"
