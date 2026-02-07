# Troubleshooting Guide

Comprehensive troubleshooting guide for the GitHub Access Automation tool.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Webhook Issues](#webhook-issues)
- [GitHub Integration Problems](#github-integration-problems)
- [Email Delivery Issues](#email-delivery-issues)
- [Database Connection Errors](#database-connection-errors)
- [OAuth Flow Problems](#oauth-flow-problems)
- [Performance Issues](#performance-issues)
- [Common Error Messages](#common-error-messages)
- [Emergency Recovery](#emergency-recovery)

---

## Quick Diagnostics

Run these quick checks first to identify the problem area.

### Health Check

```bash
# Check application is running
curl https://your-domain.com/api/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2025-12-16T12:00:00.000Z",
#   "database": "connected",
#   "environment": "production"
# }
```

### Database Connection Test

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT version();"

# Check tables exist
psql $DATABASE_URL -c "\dt"

# Expected tables: customers, oauth_sessions
```

### Environment Variables Check

```bash
# Verify all required variables are set
node -e "
const required = [
  'DATABASE_URL',
  'GITHUB_TOKEN',
  'GITHUB_ORG_OR_USER',
  'GITHUB_REPO',
  'POLAR_WEBHOOK_SECRET',
  'GITHUB_OAUTH_CLIENT_ID',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'NEXT_PUBLIC_APP_URL'
];

required.forEach(key => {
  if (!process.env[key]) {
    console.error('❌ Missing:', key);
  } else {
    console.log('✅', key);
  }
});
"
```

### GitHub Token Test

```bash
# Verify GitHub token is valid
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user

# Check token scopes
curl -i -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user \
  | grep -i x-oauth-scopes

# Expected: x-oauth-scopes: repo
```

### Recent Logs Check

**Vercel:**

```bash
vercel logs --prod --since 1h
```

**Railway:**

```bash
railway logs --tail 100
```

**Docker:**

```bash
docker logs github-access-automation --tail 100 -f
```

**Look for:**

- Error messages
- Failed webhook processing
- Database connection errors
- GitHub API errors

---

## Webhook Issues

### Webhook Signature Verification Fails

**Symptoms:**

- Webhook returns 401 Unauthorized
- Log message: "Invalid Polar webhook signature"
- Polar dashboard shows failed deliveries

**Causes & Solutions:**

#### 1. Wrong Webhook Secret

**Diagnosis:**

```bash
# Check your secret
echo $POLAR_WEBHOOK_SECRET

# Compare with Polar dashboard → Settings → Webhooks
```

**Solution:**

```bash
# Update environment variable
# Vercel:
vercel env add POLAR_WEBHOOK_SECRET production

# Railway:
railway variables set POLAR_WEBHOOK_SECRET=polar_whs_...

# Docker:
# Update .env.production and restart container
docker restart github-access-automation
```

#### 2. Payload Encoding Issue

**Diagnosis:**

```typescript
// Check how body is read in webhook handler
const text = await req.text(); // ✅ Correct
const json = await req.json(); // ❌ Wrong for signature verification
```

**Solution:**
Ensure raw body is used for signature verification. The default Next.js App Router implementation is correct.

#### 3. Header Name Mismatch

**Diagnosis:**

```bash
# Check Polar webhook logs for header name
# Could be: x-polar-signature, x-signature, signature
```

**Solution:**

```typescript
// src/app/api/webhooks/polar/route.ts
const signature = req.headers.get('x-polar-signature'); // Adjust if needed
```

#### 4. Test Signature Locally

```bash
# Generate valid signature for testing
WEBHOOK_SECRET="your_polar_webhook_secret"
PAYLOAD='{"type":"order.paid","data":{"id":"test-123"}}'

# Calculate signature (macOS/Linux)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)

echo "Signature: $SIGNATURE"

# Send test webhook
curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Webhook Payload Missing Data

**Symptoms:**

- Webhook processes but missing customer data
- Error: "Missing required field: github_username"

**Diagnosis:**

```bash
# Check Polar webhook logs
# Go to Polar dashboard → Webhooks → Recent deliveries
# Click on webhook → View payload

# Check what metadata was sent
```

**Solution:**

1. **Verify GitHub OAuth completed before checkout:**
   - User must click "Buy" → GitHub OAuth → Polar checkout
   - Check `github_user` cookie exists

2. **Check Polar checkout includes metadata:**

   ```typescript
   // Verify redirect to Polar includes GitHub username
   const checkoutUrl = `${polarCheckoutUrl}?metadata[github_username]=${username}`;
   ```

3. **Add fallback for missing data:**

   ```typescript
   // src/app/api/webhooks/polar/route.ts
   const githubUsername = order.metadata?.github_username;

   if (!githubUsername) {
     console.error('Missing GitHub username for order:', order.id);
     // Send email to customer asking for GitHub username
     // Or log for manual processing
     return Response.json({ error: 'Missing GitHub username' }, { status: 400 });
   }
   ```

### Webhook Timeout

**Symptoms:**

- Polar shows "Timed out" in webhook logs
- Customer charged but not invited
- Database record created but status = 'pending'

**Diagnosis:**

```sql
-- Check for pending customers
SELECT id, email, github_username, status, invitation_error, created_at
FROM customers
WHERE status = 'pending'
ORDER BY created_at DESC;
```

**Causes:**

1. **Slow GitHub API response** (rare)
2. **Database connection pool exhausted**
3. **Email sending timeout**

**Solutions:**

1. **Increase webhook timeout** (platform-specific):

   **Vercel:**

   ```typescript
   // src/app/api/webhooks/polar/route.ts
   export const maxDuration = 60; // seconds (Pro plan required for >10s)
   ```

   **Railway:** Timeout is 300s by default (sufficient)

2. **Process asynchronously** (recommended for scale):

   ```typescript
   // Quick response to Polar
   export async function POST(req: Request) {
     // Verify signature
     // Queue for background processing
     await addToQueue(webhookData);

     return Response.json({ received: true });
   }

   // Separate worker processes queue
   // (Requires job queue like Bull, BullMQ, or Inngest)
   ```

3. **Retry failed invitations:**

   ```bash
   # Script: scripts/retry-failed-invitations.ts
   import { pool } from '@/lib/db';
   import { inviteToRepository } from '@/lib/github-api';

   const result = await pool.query(`
     SELECT * FROM customers
     WHERE status = 'pending'
     AND invitation_error IS NULL
     AND created_at > NOW() - INTERVAL '24 hours'
   `);

   for (const customer of result.rows) {
     try {
       await inviteToRepository(customer.github_username);
       await pool.query(
         'UPDATE customers SET status = $1 WHERE id = $2',
         ['active', customer.id]
       );
       console.log('✅ Invited:', customer.github_username);
     } catch (error) {
       console.error('❌ Failed:', customer.github_username, error);
     }
   }
   ```

### Duplicate Webhook Processing

**Symptoms:**

- Customer invited multiple times
- Multiple welcome emails sent
- Multiple database records with same order_id

**Diagnosis:**

```sql
-- Check for duplicate order IDs
SELECT polar_order_id, COUNT(*) as count
FROM customers
GROUP BY polar_order_id
HAVING COUNT(*) > 1;
```

**Solution:**

Already implemented via `UNIQUE` constraint on `polar_order_id`:

```sql
ALTER TABLE customers
ADD CONSTRAINT customers_polar_order_id_unique
UNIQUE (polar_order_id);
```

If duplicates exist:

```typescript
// src/app/api/webhooks/polar/route.ts
const existing = await getCustomerByOrderId(order.id);

if (existing) {
  console.log('Order already processed:', order.id);
  return Response.json({
    success: true,
    message: 'Order already processed',
    customerId: existing.id,
  });
}
```

---

## GitHub Integration Problems

### Customer Not Receiving GitHub Invitation

**Diagnosis Checklist:**

```bash
# 1. Verify customer's GitHub username is correct
psql $DATABASE_URL -c "SELECT github_username, email FROM customers WHERE email = 'customer@email.com';"

# 2. Check GitHub token is valid
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# 3. Check token has repo scope
curl -i -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user \
  | grep -i x-oauth-scopes

# 4. Verify repository exists and is private
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_ORG_OR_USER/$GITHUB_REPO"

# 5. Check if user already has access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_ORG_OR_USER/$GITHUB_REPO/collaborators/USERNAME"
```

**Common Causes:**

#### 1. GitHub Username Doesn't Exist

**Error in database:**

```sql
SELECT invitation_error FROM customers WHERE email = 'customer@email.com';
-- Result: "Not Found" or "404"
```

**Solution:**

- Ask customer for correct GitHub username
- Manually invite: Repository → Settings → Collaborators → Add people

#### 2. User Already a Collaborator

**Error in database:**

```sql
SELECT invitation_error FROM customers WHERE email = 'customer@email.com';
-- Result: "Validation Failed" or "already a collaborator"
```

**Solution:**

- Verify in GitHub: Repository → Settings → Collaborators
- If they have access, send welcome email manually
- Update database: `UPDATE customers SET status = 'active' WHERE email = 'customer@email.com';`

#### 3. Repository is Public

**Diagnosis:**

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_ORG_OR_USER/$GITHUB_REPO" \
  | grep '"private"'

# Should show: "private": true
```

**Solution:**

```bash
# Make repository private
gh repo edit OWNER/REPO --visibility private

# Or via GitHub UI:
# Repository → Settings → Danger Zone → Change visibility → Private
```

#### 4. GitHub Token Expired or Invalid

**Diagnosis:**

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# If expired, returns:
# {
#   "message": "Bad credentials",
#   "documentation_url": "https://docs.github.com/..."
# }
```

**Solution:**

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Tokens (classic) → Generate new token
3. Select `repo` scope
4. Copy token
5. Update environment variable:
   ```bash
   vercel env add GITHUB_TOKEN production
   railway variables set GITHUB_TOKEN=ghp_...
   ```

#### 5. GitHub Rate Limit Exceeded

**Diagnosis:**

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Check remaining requests:
# {
#   "resources": {
#     "core": {
#       "limit": 5000,
#       "remaining": 0,  // ❌ Rate limit exceeded
#       "reset": 1703088000
#     }
#   }
# }
```

**Solution:**

- Wait for rate limit reset (1 hour)
- Authenticated requests have 5,000/hour limit (should be sufficient)
- If hitting limit regularly, implement caching or request batching

### Manual Invitation Process

If automation fails, invite manually:

**Via GitHub CLI:**

```bash
# Invite user
gh api repos/OWNER/REPO/collaborators/USERNAME -X PUT \
  -f permission=pull

# Verify invitation sent
gh api repos/OWNER/REPO/invitations
```

**Via GitHub UI:**

1. Go to repository
2. Settings → Collaborators and teams
3. Click "Add people"
4. Enter GitHub username
5. Select "Read" permission
6. Click "Add USERNAME to this repository"

**Update database after manual invitation:**

```sql
UPDATE customers
SET status = 'active',
    invitation_sent_at = NOW(),
    invitation_error = NULL
WHERE github_username = 'username';
```

---

## Email Delivery Issues

### Welcome Email Not Sent

**Diagnosis:**

```bash
# 1. Check database
psql $DATABASE_URL -c "SELECT email, welcome_email_sent FROM customers WHERE email = 'customer@email.com';"

# 2. Check Resend dashboard
# Go to https://resend.com/emails
# Filter by recipient email

# 3. Test Resend API key
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "'"$RESEND_FROM_EMAIL"'",
    "to": "test@example.com",
    "subject": "Test",
    "html": "<p>Test email</p>"
  }'
```

**Common Causes:**

#### 1. Resend API Key Invalid

**Error:** 401 Unauthorized from Resend API

**Solution:**

1. Go to Resend dashboard → API Keys
2. Generate new key
3. Update environment variable:
   ```bash
   vercel env add RESEND_API_KEY production
   railway variables set RESEND_API_KEY=re_...
   ```

#### 2. Sender Domain Not Verified

**Error:** "Domain not verified" or similar

**Solution:**

1. Go to Resend dashboard → Domains
2. Add your domain
3. Add DNS records (SPF, DKIM, DMARC)
4. Wait for verification (can take up to 48 hours)
5. Use verified domain in `RESEND_FROM_EMAIL`

**For testing, use Resend's default domain:**

```bash
RESEND_FROM_EMAIL="onboarding@resend.dev"
```

#### 3. Email Address Invalid

**Diagnosis:**

```sql
-- Check email format
SELECT email FROM customers WHERE email NOT LIKE '%@%.%';
```

**Solution:**

- Validate email format before saving to database
- Add Zod validation:

  ```typescript
  import { z } from 'zod';

  const emailSchema = z.string().email();
  emailSchema.parse(customerEmail);
  ```

#### 4. Email Went to Spam

**Diagnosis:**

- Check customer's spam/junk folder
- Check Resend dashboard for delivery status

**Solution:**

1. **Improve email content:**
   - Avoid spam trigger words ("free", "click here", etc.)
   - Include plain text version
   - Add unsubscribe link

2. **Set up proper DNS records:**
   - SPF: `v=spf1 include:_spf.resend.com ~all`
   - DKIM: Provided by Resend
   - DMARC: `v=DMARC1; p=none; rua=mailto:admin@yourdomain.com`

3. **Use dedicated sending domain:**
   ```bash
   RESEND_FROM_EMAIL="noreply@mail.yourdomain.com"
   # Not: "noreply@yourdomain.com"
   ```

### Resend a Welcome Email

```typescript
// scripts/resend-welcome-email.ts
import { sendWelcomeEmail } from '@/lib/email';
import { pool } from '@/lib/db';

const customerId = 'customer-uuid';

const result = await pool.query('SELECT * FROM customers WHERE id = $1', [customerId]);

const customer = result.rows[0];

if (!customer) {
  console.error('Customer not found');
  process.exit(1);
}

const repoUrl = `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}`;
const cloneUrl = `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}.git`;

try {
  await sendWelcomeEmail(customer.email, customer.name, repoUrl, cloneUrl);

  await pool.query('UPDATE customers SET welcome_email_sent = true WHERE id = $1', [customerId]);

  console.log('✅ Email resent to:', customer.email);
} catch (error) {
  console.error('❌ Failed to send email:', error);
}
```

```bash
# Run script
npx tsx scripts/resend-welcome-email.ts
```

---

## Database Connection Errors

### Connection Refused

**Error:**

```
Error: connect ECONNREFUSED
```

**Causes:**

1. **Database is down**
   - Check database provider status page (Neon, Supabase)

2. **Wrong connection string**

   ```bash
   # Test connection
   psql "$DATABASE_URL"
   ```

3. **IP not whitelisted**
   - Some providers require IP whitelisting
   - Check database settings for allowed IPs

**Solution:**

```bash
# Verify DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:password@host:port/database

# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"

# If using Neon, check dashboard for connection string
# If using Supabase, use "Transaction" mode pooler
```

### Too Many Connections

**Error:**

```
Error: remaining connection slots are reserved for non-replication superuser connections
```

**Causes:**

- Connection pool not properly configured
- Too many concurrent requests
- Connections not being released

**Solution:**

1. **Configure connection pool:**

   ```typescript
   // src/lib/db.ts
   export const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 20, // Maximum pool size
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

2. **Use connection pooler** (Neon, Supabase):

   ```bash
   # Neon pooled connection
   DATABASE_URL="postgresql://user:pass@pooler.region.neon.tech/db?sslmode=require"
   ```

3. **Close connections properly:**
   ```typescript
   // Always release connections
   const client = await pool.connect();
   try {
     const result = await client.query('SELECT * FROM customers');
     return result.rows;
   } finally {
     client.release(); // Important!
   }
   ```

### SSL/TLS Errors

**Error:**

```
Error: no pg_hba.conf entry for host
```

**Solution:**

Add SSL mode to connection string:

```bash
# For Neon
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# For Supabase
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# For local development
DATABASE_URL="postgresql://user:pass@localhost:5432/db?sslmode=disable"
```

### Migration Failures

**Error:**

```
Error: relation "customers" already exists
```

**Solution:**

```bash
# Check if tables exist
psql $DATABASE_URL -c "\dt"

# If tables exist, skip creation
# Or drop and recreate (DANGER: loses data)
psql $DATABASE_URL -c "DROP TABLE IF EXISTS customers CASCADE;"
npm run db:migrate
```

---

## OAuth Flow Problems

### Redirect Loop After GitHub Auth

**Symptoms:**

- User authorizes GitHub
- Redirected back to callback
- Infinite redirect loop

**Diagnosis:**

```bash
# Check callback URL in GitHub OAuth app
# Should be: https://your-domain.com/api/auth/callback
```

**Solution:**

1. **Update GitHub OAuth app:**
   - Go to GitHub Settings → Developer settings → OAuth Apps
   - Update Authorization callback URL to exact production URL
   - Must be HTTPS (not HTTP)

2. **Check callback handler:**
   ```typescript
   // src/app/api/auth/callback/route.ts
   // Should redirect to Polar checkout, not back to auth
   return NextResponse.redirect(polarCheckoutUrl);
   ```

### State Validation Fails

**Error:**

```
Invalid state parameter
```

**Causes:**

- State cookie expired (15 min TTL)
- Cookie not set properly
- User took too long to authorize

**Solution:**

1. **Increase state expiration:**

   ```typescript
   // src/lib/github-oauth.ts
   const stateExpiration = 30 * 60 * 1000; // 30 minutes instead of 15
   ```

2. **Check cookie settings:**
   ```typescript
   response.cookies.set({
     name: 'oauth_state',
     value: state,
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'lax',
     maxAge: 30 * 60, // 30 minutes
   });
   ```

### GitHub Username Not Captured

**Symptoms:**

- OAuth completes successfully
- Redirected to Polar
- No GitHub username in database

**Diagnosis:**

```bash
# Check oauth_sessions table
psql $DATABASE_URL -c "SELECT * FROM oauth_sessions ORDER BY created_at DESC LIMIT 5;"
```

**Solution:**

1. **Verify GitHub OAuth scopes:**

   ```typescript
   // src/lib/github-oauth.ts
   const scopes = 'user:email'; // Add 'read:user' if needed
   ```

2. **Check user data extraction:**

   ```typescript
   // src/app/api/auth/callback/route.ts
   const userData = await getGitHubUser(accessToken);
   console.log('GitHub user data:', userData); // Debug log

   // Should include:
   // { id: 12345, login: 'username', email: 'user@example.com' }
   ```

---

## Performance Issues

### Slow Webhook Processing

**Diagnosis:**

```typescript
// Add timing logs
// src/app/api/webhooks/polar/route.ts
const start = Date.now();

// ... webhook processing ...

console.log('Webhook processed in', Date.now() - start, 'ms');
```

**Common bottlenecks:**

1. **Database queries**
   - Add indexes: `CREATE INDEX idx_customers_order_id ON customers(polar_order_id);`
   - Use connection pooling

2. **GitHub API calls**
   - Usually fast (< 1s)
   - Can be slow during GitHub outages

3. **Email sending**
   - Usually fast with Resend
   - Can timeout if Resend is down

**Solutions:**

1. **Process asynchronously:**

   ```typescript
   // Quick webhook response
   await addToQueue({ orderId: order.id, githubUsername });
   return Response.json({ received: true });

   // Background worker processes queue
   ```

2. **Cache GitHub API responses:**
   ```typescript
   // Check if user already exists before inviting
   const isCollaborator = await checkIfCollaborator(username);
   if (isCollaborator) {
     // Skip invitation
   }
   ```

### High Memory Usage

**Diagnosis:**

```bash
# Vercel
vercel logs --prod | grep "memory"

# Railway
railway logs | grep -i memory

# Docker
docker stats github-access-automation
```

**Solutions:**

1. **Optimize database queries:**

   ```typescript
   // Use specific fields instead of SELECT *
   const result = await pool.query(
     'SELECT id, email, github_username FROM customers WHERE polar_order_id = $1',
     [orderId]
   );
   ```

2. **Close connections:**

   ```typescript
   // Always release database connections
   client.release();
   ```

3. **Increase memory limit** (if needed):

   **Vercel:**
   - Upgrade to Pro plan for 1 GB functions

   **Railway:**
   - Increase memory in service settings

   **Docker:**

   ```bash
   docker run -m 512m github-access-automation
   ```

---

## Common Error Messages

### "Missing required environment variable: GITHUB_TOKEN"

**Fix:**

```bash
# Add environment variable
vercel env add GITHUB_TOKEN production
railway variables set GITHUB_TOKEN=ghp_...

# Verify set correctly
vercel env ls
railway variables
```

### "Repository not found or no permission"

**Fix:**

1. Verify repository name is correct
2. Check GitHub token has access to repository
3. Ensure repository is private
4. Check token has `repo` scope

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_ORG_OR_USER/$GITHUB_REPO"
```

### "Bad credentials" from GitHub API

**Fix:**

1. GitHub token expired or invalid
2. Generate new token
3. Update environment variable
4. Redeploy application

### "Database schema not migrated"

**Fix:**

```bash
# Run migrations
npm run db:migrate

# Or manually create tables
psql $DATABASE_URL < database/schema.sql
```

### "Cannot read properties of undefined (reading 'github_username')"

**Fix:**

Check webhook payload includes GitHub username:

```typescript
// src/app/api/webhooks/polar/route.ts
const githubUsername = order.metadata?.github_username;

if (!githubUsername) {
  console.error('Missing GitHub username in webhook payload');
  return Response.json({ error: 'Missing GitHub username' }, { status: 400 });
}
```

---

## Emergency Recovery

### Complete Service Outage

**Immediate actions:**

1. **Check status pages:**
   - Vercel: https://www.vercel-status.com
   - Railway: https://status.railway.app
   - Neon: https://neon.statuspage.io
   - GitHub: https://www.githubstatus.com

2. **Rollback deployment:**

   ```bash
   # Vercel
   vercel rollback

   # Railway
   railway rollback
   ```

3. **Check application logs:**

   ```bash
   vercel logs --prod --since 1h
   railway logs --tail 100
   ```

4. **Verify environment variables:**
   ```bash
   vercel env ls
   railway variables
   ```

### Database Corruption

**Recovery:**

1. **Stop writes:**
   - Take application offline
   - Or disable webhook endpoint temporarily

2. **Assess damage:**

   ```sql
   -- Check table integrity
   SELECT COUNT(*) FROM customers;

   -- Look for corrupted records
   SELECT * FROM customers WHERE email IS NULL OR github_username IS NULL;
   ```

3. **Restore from backup:**

   ```bash
   # Neon: Go to dashboard → Backups → Restore
   # Supabase: Go to dashboard → Database → Backups → Restore

   # Manual restore
   psql $DATABASE_URL < backup_YYYY-MM-DD.sql
   ```

4. **Verify data:**

   ```sql
   SELECT COUNT(*) FROM customers;
   SELECT MAX(created_at) FROM customers;
   ```

5. **Resume service**

### Lost Customer Data

**Recovery options:**

1. **Database backups** (primary)
   - Restore from most recent backup
   - May lose recent data (depends on backup frequency)

2. **Polar webhook history**
   - Go to Polar dashboard → Webhooks → Deliveries
   - Replay webhooks manually
   - Recreate customer records

3. **Email logs** (partial)
   - Resend dashboard has email delivery history
   - Extract customer emails and manually process

### Handling Refunds

**Manual process:**

1. **Customer requests refund**

2. **Process refund in Polar:**
   - Go to Orders → Find order → Refund

3. **Remove repository access:**

   ```bash
   gh api repos/OWNER/REPO/collaborators/USERNAME -X DELETE
   ```

4. **Update database:**
   ```sql
   UPDATE customers
   SET status = 'refunded',
       updated_at = NOW()
   WHERE polar_order_id = 'order_id';
   ```

**Automated refund handling:**

```typescript
// src/app/api/webhooks/polar/route.ts
if (webhook.type === 'order.refunded') {
  const customer = await getCustomerByOrderId(order.id);

  // Remove GitHub access
  await removeFromRepository(customer.github_username);

  // Update database
  await updateCustomerStatus(customer.id, 'refunded');

  // Send refund confirmation email
  await sendRefundEmail(customer.email, customer.name);
}
```

---

## Getting Help

### Before Asking for Help

Collect this information:

1. **Error message** (exact text)
2. **Application logs** (last 100 lines)
3. **Environment** (Vercel, Railway, Docker, local)
4. **Steps to reproduce**
5. **Expected vs actual behavior**
6. **Environment variables** (redact secrets)

### Debug Mode

Enable verbose logging:

```bash
# Add to environment variables
LOG_LEVEL=debug

# Or in code
console.debug('Webhook payload:', JSON.stringify(payload, null, 2));
```

### Test in Isolation

**Test each component separately:**

```bash
# 1. Database connection
psql $DATABASE_URL -c "SELECT 1;"

# 2. GitHub token
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# 3. Resend API
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -d '{"from":"test@resend.dev","to":"test@example.com","subject":"Test","html":"Test"}'

# 4. Webhook signature
# (See webhook troubleshooting section)
```

### Support Resources

- **Documentation**: `/docs` folder
- **GitHub Issues**: Report bugs
- **GitHub Discussions**: Ask questions
- **Email**: jason@example.com

---

## Preventive Maintenance

### Weekly Checks

- [ ] Review application logs for errors
- [ ] Check database backup status
- [ ] Review Polar webhook delivery success rate
- [ ] Verify no customers stuck in "pending" status
- [ ] Check GitHub API rate limit usage

### Monthly Checks

- [ ] Update dependencies: `npm update`
- [ ] Run security audit: `npm audit`
- [ ] Review and rotate API keys (if needed)
- [ ] Test backup restore process
- [ ] Review error notification emails

### Quarterly Checks

- [ ] Performance review (webhook processing time)
- [ ] Database optimization (vacuum, reindex)
- [ ] Review customer feedback
- [ ] Update documentation
- [ ] Test disaster recovery process

---

**Built with Next.js 16, TypeScript, and Polar.sh**
