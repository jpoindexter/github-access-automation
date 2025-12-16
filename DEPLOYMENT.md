# Deployment Guide

Comprehensive guide for deploying the GitHub Access Automation tool to production environments.

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Vercel Deployment](#vercel-deployment-recommended)
- [Docker Deployment](#docker-deployment)
- [Railway Deployment](#railway-deployment)
- [Environment Variables](#environment-variables)
- [Post-Deployment Verification](#post-deployment-verification)
- [Production Monitoring](#production-monitoring)
- [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

Before deploying to production, ensure you have:

### GitHub Setup
- [ ] GitHub OAuth App created for production domain
  - Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
  - **Homepage URL**: `https://your-domain.com`
  - **Authorization callback URL**: `https://your-domain.com/api/auth/callback`
  - Save Client ID and Client Secret
- [ ] GitHub Personal Access Token created with `repo` scope
  - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
  - Select `repo` scope (full control of private repositories)
  - Generate token and save securely
- [ ] Private repository created for boilerplate/product
- [ ] Repository branch protection enabled (optional but recommended)

### Polar.sh Setup
- [ ] Polar.sh account created
- [ ] Product created with pricing
- [ ] Checkout page configured
- [ ] Webhook secret generated (Dashboard → Settings → Webhooks)
- [ ] Test payment completed in sandbox

### Database Setup
- [ ] PostgreSQL database provisioned (Neon, Supabase, or self-hosted)
- [ ] Database connection string obtained
- [ ] Database accessible from deployment platform
- [ ] Tables created (run migration script)

### Email Setup
- [ ] Resend account created
- [ ] Domain verified in Resend (for production emails)
- [ ] API key generated
- [ ] Test email sent successfully

### Code Preparation
- [ ] All tests passing (`npm test`)
- [ ] TypeScript compilation successful (`npm run type-check`)
- [ ] Linting passed (`npm run lint`)
- [ ] Production build successful (`npm run build`)
- [ ] All environment variables documented

---

## Vercel Deployment (Recommended)

Vercel provides zero-config deployment with excellent Next.js support.

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Configure Project

Create `vercel.json` in project root (already included):

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

### Step 4: Deploy to Vercel

```bash
# First deployment (creates project)
vercel

# Production deployment
vercel --prod
```

### Step 5: Set Environment Variables

**Via Vercel Dashboard:**

1. Go to project settings → Environment Variables
2. Add all required variables (see [Environment Variables](#environment-variables) section)
3. Set scope to "Production", "Preview", or "All"
4. Click "Save"

**Via Vercel CLI:**

```bash
# Set production environment variables
vercel env add DATABASE_URL production
vercel env add GITHUB_TOKEN production
vercel env add GITHUB_OAUTH_CLIENT_ID production
vercel env add GITHUB_OAUTH_CLIENT_SECRET production
vercel env add POLAR_WEBHOOK_SECRET production
vercel env add RESEND_API_KEY production

# For each command, paste the value when prompted
```

### Step 6: Configure Custom Domain

1. Go to project settings → Domains
2. Add your domain (e.g., `app.yourdomain.com`)
3. Update DNS records as instructed
4. Wait for SSL certificate provisioning (automatic)

### Step 7: Update Webhook URLs

**In Polar.sh Dashboard:**
1. Go to Settings → Webhooks
2. Update webhook URL to: `https://your-domain.com/api/webhooks/polar`
3. Save changes

**In GitHub OAuth App:**
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Update Homepage URL to: `https://your-domain.com`
3. Update Authorization callback URL to: `https://your-domain.com/api/auth/callback`
4. Save changes

### Step 8: Verify Deployment

```bash
# Test health endpoint
curl https://your-domain.com/api/health

# Test webhook endpoint (GET request)
curl https://your-domain.com/api/webhooks/polar

# Expected: {"status":"ok","timestamp":"..."}
```

---

## Docker Deployment

For self-hosted environments or platforms that support Docker.

### Step 1: Build Docker Image

```bash
# Build image
docker build -t github-access-automation:latest .

# Tag for registry (optional)
docker tag github-access-automation:latest your-registry/github-access-automation:latest
```

### Step 2: Push to Registry (Optional)

```bash
# Docker Hub
docker push your-registry/github-access-automation:latest

# GitHub Container Registry
docker tag github-access-automation:latest ghcr.io/your-username/github-access-automation:latest
docker push ghcr.io/your-username/github-access-automation:latest
```

### Step 3: Run Container

**Using environment file:**

```bash
# Create production .env file
cp .env.example .env.production

# Edit .env.production with production values
nano .env.production

# Run container
docker run -d \
  --name github-access-automation \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  github-access-automation:latest
```

**Using docker-compose:**

```yaml
# docker-compose.production.yml
version: '3.8'
services:
  app:
    image: github-access-automation:latest
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

```bash
# Start services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop services
docker-compose -f docker-compose.production.yml down
```

### Step 4: Configure Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/github-access-automation
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Next.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Webhook endpoint - increase timeout
    location /api/webhooks/polar {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/github-access-automation /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 5: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

---

## Railway Deployment

Railway provides simple deployment with built-in PostgreSQL.

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

### Step 2: Login to Railway

```bash
railway login
```

### Step 3: Initialize Project

```bash
# In project directory
railway init

# Select "Create new project"
# Name your project: github-access-automation
```

### Step 4: Add PostgreSQL Database

```bash
# Add PostgreSQL service
railway add postgresql

# Railway automatically sets DATABASE_URL
```

### Step 5: Set Environment Variables

```bash
# Set variables via Railway CLI
railway variables set GITHUB_TOKEN=ghp_...
railway variables set GITHUB_OAUTH_CLIENT_ID=Ov23li...
railway variables set GITHUB_OAUTH_CLIENT_SECRET=...
railway variables set GITHUB_ORG_OR_USER=your-org
railway variables set GITHUB_REPO=your-repo
railway variables set POLAR_WEBHOOK_SECRET=polar_whs_...
railway variables set RESEND_API_KEY=re_...
railway variables set RESEND_FROM_EMAIL=noreply@yourdomain.com
railway variables set ADMIN_EMAIL=admin@yourdomain.com
railway variables set NEXT_PUBLIC_APP_URL=https://your-app.railway.app
railway variables set NODE_ENV=production
```

### Step 6: Deploy

```bash
# Deploy to Railway
railway up

# Open in browser
railway open
```

### Step 7: Configure Custom Domain

1. Go to Railway dashboard → Project → Settings → Domains
2. Click "Generate Domain" or "Custom Domain"
3. Update DNS records (CNAME)
4. Update `NEXT_PUBLIC_APP_URL` environment variable
5. Update Polar webhook URL and GitHub OAuth callback URL

### Step 8: Run Database Migrations

```bash
# Connect to Railway shell
railway run npm run db:migrate
```

---

## Environment Variables

Complete list of required and optional environment variables.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `GITHUB_TOKEN` | Personal access token with `repo` scope | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `GITHUB_ORG_OR_USER` | GitHub organization or username | `your-org` |
| `GITHUB_REPO` | Repository name to grant access to | `your-boilerplate-repo` |
| `POLAR_WEBHOOK_SECRET` | Webhook signing secret from Polar | `polar_whs_xxxxxxxxxxxx` |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth app client ID | `Ov23liXXXXXXXXXXXXXX` |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth app client secret | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `NEXT_PUBLIC_APP_URL` | Production domain URL | `https://your-domain.com` |

### Email Variables (Recommended)

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key for transactional emails | `re_xxxxxxxxxxxxxxxxxxxx` |
| `RESEND_FROM_EMAIL` | Sender email address | `noreply@yourdomain.com` |
| `ADMIN_EMAIL` | Admin email for error notifications | `admin@yourdomain.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (production/development) | `development` |
| `PORT` | Server port | `3000` |
| `LOG_LEVEL` | Logging verbosity (info/debug/error) | `info` |

### Environment Variable Validation

The app validates environment variables on startup. Missing required variables will cause the app to exit with an error.

**Test validation locally:**

```bash
# This will fail if required variables are missing
npm run build
```

---

## Post-Deployment Verification

After deployment, verify all functionality works correctly.

### 1. Health Check

```bash
curl https://your-domain.com/api/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-16T12:00:00.000Z",
  "database": "connected",
  "environment": "production"
}
```

### 2. Webhook Endpoint

```bash
curl https://your-domain.com/api/webhooks/polar
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-16T12:00:00.000Z"
}
```

### 3. Test GitHub OAuth Flow

1. Visit `https://your-domain.com/api/auth/github`
2. Authorize with GitHub
3. Should redirect to Polar checkout
4. Check browser cookies contain `github_user`

### 4. Test Complete Purchase Flow

**Option A: Use Polar Test Mode**

1. Create test product in Polar dashboard
2. Complete test purchase with test card: `4242 4242 4242 4242`
3. Verify webhook received (check application logs)
4. Check GitHub for repository invitation
5. Verify welcome email sent (check Resend dashboard)
6. Query database:

```sql
SELECT * FROM customers ORDER BY created_at DESC LIMIT 1;
```

**Option B: Manual Webhook Test**

```bash
# Generate test webhook payload
WEBHOOK_SECRET="your_polar_webhook_secret"
PAYLOAD='{"type":"order.paid","data":{"id":"test-prod-123","status":"paid","amount":9999,"currency":"usd","customer_id":"cust-123","product_id":"prod-123","metadata":{"email":"test@example.com","name":"Test User","company":"Test Co","use_case":"Testing","referral_source":"Google","newsletter_opted_in":true,"github_username":"testuser","github_user_id":12345}}}'

# Calculate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)

# Send webhook
curl -X POST https://your-domain.com/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### 5. Database Connection

```bash
# Connect to production database
psql $DATABASE_URL

# Check tables exist
\dt

# Check customer count
SELECT COUNT(*) FROM customers;

# Exit
\q
```

### 6. Email Delivery

Check Resend dashboard:
- Go to https://resend.com/emails
- Verify test emails were sent
- Check delivery status
- Review email content

### 7. Application Logs

**Vercel:**
```bash
vercel logs --prod
```

**Railway:**
```bash
railway logs
```

**Docker:**
```bash
docker logs github-access-automation -f
```

Look for:
- Successful webhook processing
- GitHub invitation confirmations
- Email send confirmations
- No error messages

---

## Production Monitoring

Set up monitoring to track application health and performance.

### 1. Uptime Monitoring

**UptimeRobot (Free):**

1. Create account at https://uptimerobot.com
2. Add monitor: `https://your-domain.com/api/health`
3. Check interval: 5 minutes
4. Alert contacts: Your email
5. Enable notifications for downtime

**Alternative: Better Uptime, Pingdom, StatusCake**

### 2. Application Performance Monitoring

**Vercel Analytics (Built-in):**
- Go to Vercel dashboard → Analytics
- Monitor Web Vitals (Core Web Vitals)
- Track real user metrics

**Sentry (Error Tracking):**

```bash
npm install @sentry/nextjs
```

```javascript
// sentry.server.config.js
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

### 3. Database Monitoring

**Neon Dashboard:**
- Monitor connection pool usage
- Track query performance
- Review slow queries
- Check storage usage

**PostgreSQL Queries:**

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';

-- Database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Table sizes
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text))
FROM pg_tables
WHERE schemaname = 'public';
```

### 4. Webhook Monitoring

Create dashboard to track:
- Webhook success rate
- Processing time
- Failed invitations
- Failed emails

**Query for monitoring:**

```sql
-- Webhook success rate (last 24 hours)
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM customers
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Failed invitations (last 7 days)
SELECT email, github_username, invitation_error, created_at
FROM customers
WHERE invitation_error IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Customers without welcome email
SELECT email, github_username, created_at
FROM customers
WHERE welcome_email_sent = false
  AND created_at > NOW() - INTERVAL '7 days';
```

### 5. Alerts Setup

**Email Alerts (via Resend):**
- Error notifications sent to `ADMIN_EMAIL`
- Triggered on webhook failures
- Includes error details for debugging

**Vercel Deployment Alerts:**
- Go to project settings → Notifications
- Enable email notifications for:
  - Deployment failures
  - Production errors
  - Performance issues

---

## Rollback Procedures

If issues occur in production, follow these rollback steps.

### Vercel Rollback

**Via Dashboard:**
1. Go to Deployments
2. Find last working deployment
3. Click "..." → Promote to Production
4. Confirm promotion

**Via CLI:**
```bash
# List deployments
vercel ls

# Rollback to specific deployment
vercel rollback [deployment-url]
```

### Railway Rollback

**Via Dashboard:**
1. Go to project → Deployments
2. Find last working deployment
3. Click "Redeploy"

**Via CLI:**
```bash
railway rollback
```

### Docker Rollback

```bash
# Stop current container
docker stop github-access-automation
docker rm github-access-automation

# Pull previous image version
docker pull your-registry/github-access-automation:previous-tag

# Run previous version
docker run -d \
  --name github-access-automation \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  your-registry/github-access-automation:previous-tag
```

### Database Rollback

**Restore from backup:**

```bash
# List backups (Neon)
neon branches list

# Restore from backup
neon restore --backup-id [backup-id] --target-branch main

# Or manual restore (if you have SQL dump)
psql $DATABASE_URL < backup_YYYY-MM-DD.sql
```

### Emergency Actions

**If webhooks are failing:**
1. Check Polar dashboard → Webhooks → Recent deliveries
2. Retry failed webhooks manually
3. Check application logs for errors
4. Verify `POLAR_WEBHOOK_SECRET` is correct

**If GitHub invitations are failing:**
1. Verify `GITHUB_TOKEN` hasn't expired
2. Check token has `repo` scope
3. Verify repository name is correct
4. Check if rate limit is exceeded (5000 requests/hour)

**If database is unavailable:**
1. Check database provider status page
2. Verify connection string is correct
3. Check database hasn't hit connection limit
4. Restart database (if self-hosted)

---

## Deployment Troubleshooting

### Build Failures

**Error: TypeScript compilation failed**

```bash
# Check for type errors locally
npm run type-check

# Fix errors and redeploy
```

**Error: Missing environment variables**

```bash
# Verify all required variables are set
vercel env ls

# Add missing variables
vercel env add VARIABLE_NAME production
```

### Runtime Errors

**Error: Database connection refused**

- Check `DATABASE_URL` is correct
- Verify database is running
- Check IP whitelist (if applicable)
- Test connection: `psql $DATABASE_URL`

**Error: Webhook signature invalid**

- Verify `POLAR_WEBHOOK_SECRET` matches Polar dashboard
- Check webhook URL is correct
- Ensure using raw body for verification

**Error: GitHub API rate limit exceeded**

- Wait for rate limit reset (1 hour)
- Implement request caching
- Use authenticated requests (already implemented)

### Performance Issues

**Slow webhook processing:**

1. Check database query performance
2. Review application logs
3. Monitor database connection pool
4. Consider adding caching layer (Redis)

**High memory usage:**

1. Check for memory leaks
2. Review Node.js memory settings
3. Monitor Vercel function logs
4. Consider upgrading Vercel plan

---

## Security Checklist

Before going live, ensure:

- [ ] HTTPS enabled (automatic with Vercel/Railway)
- [ ] All secrets stored as environment variables (never in code)
- [ ] Database uses SSL connection
- [ ] CORS configured correctly
- [ ] Rate limiting enabled on sensitive endpoints
- [ ] Webhook signature verification working
- [ ] OAuth CSRF protection enabled
- [ ] Error messages don't leak sensitive data
- [ ] Logging doesn't include PII
- [ ] Security headers configured (CSP, HSTS, etc.)
- [ ] Dependencies updated (`npm audit`)
- [ ] GitHub token has minimal required scopes
- [ ] Database backups enabled
- [ ] Monitoring and alerts configured

---

## Production Checklist

Final verification before launch:

- [ ] Domain configured and SSL working
- [ ] All environment variables set correctly
- [ ] Database migrations completed
- [ ] GitHub OAuth app updated for production domain
- [ ] Polar webhook URL updated to production
- [ ] Test purchase completed successfully
- [ ] Welcome email sends correctly
- [ ] GitHub invitations work
- [ ] Error notifications configured
- [ ] Monitoring setup complete
- [ ] Backups configured
- [ ] Rollback procedure tested
- [ ] Documentation updated
- [ ] Team trained on monitoring
- [ ] Support email/process established

---

## Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Email**: jason@example.com

**Built with Next.js 16, TypeScript, and Polar.sh**
