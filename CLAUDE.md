# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GitHub Access Automation** is a production-ready system that automatically grants GitHub repository access to customers after they complete a Polar.sh payment. The system handles the complete flow: GitHub OAuth → Payment processing → Automatic GitHub invitation → Welcome email.

**Live repo**: https://github.com/jpoindexter/github-access-automation.git

**Key constraint**: This is a **boilerplate tool** - customers buy access to a private repo by completing a Polar checkout. The system must verify webhook signatures, manage GitHub permissions securely, and track comprehensive customer data.

## Quick Commands

```bash
# Development
npm run dev              # Start Next.js dev server (port 3000)
npm run build            # Production build
npm run start            # Production server
npm run clean            # Clear .next cache

# Code Quality
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run type-check       # TypeScript validation
npm run format           # Prettier formatting
npm run validate         # All checks (lint + type + format)

# Testing
npm test                 # Run Vitest (watch mode)
npm run test:run         # Single run
npm run test:coverage    # Coverage report
npm run test:watch       # Watch mode

# Run a single test file (for TDD workflow)
npm test src/lib/__tests__/github-api.test.ts

# Run a single test by name pattern
npm test -- -t "should invite user successfully"

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Load test data
npm run db:backup        # Backup database
npm run db:reset         # Migrate + seed

# Local Testing
npm run dev              # Start server
# In another terminal:
ngrok http 3000          # Create public tunnel for webhook testing
```

## Status & Production Features

**Status**: Production Ready ✅

- 243/243 tests passing (100% coverage on core libraries)
- All pre-commit/pre-push hooks passing
- End-to-end flow verified (Polar → GitHub → Email)
- Production build successful

**Production Features**:

1. **Enhanced Error Handler** (Phase 3) - Categorizes errors with actionable step-by-step solutions
2. **Auto-Retry Queue** (Phase 2) - Exponential backoff retry for transient failures (network, rate limits)
3. **Dead Letter Queue** - Permanent failures tracked separately for manual review
4. **Health Check Endpoint** - Monitors database, retry queue, and DLQ status
5. **Admin Retry Panel** - Manual retry trigger for failed invitations

**Recent Fixes** (integrated from project debugging):

1. **Webhook signature verification** - Strictly enforces secret presence and uses timing-safe comparison
2. **Custom field data extraction** - Robustly handles GitHub username from both `metadata` (API-driven) and `custom_field_data` (user-input during checkout)
3. **Customer UPSERT logic** - Gracefully handles repeat purchases instead of failing on email uniqueness
4. **GitHub OAuth endpoints** - Uses correct `github.com` token endpoint (not `api.github.com`)
5. **Polar checkout prefill** - Passes `gh_username` and `gh_user_id` query parameters correctly

## Critical Architecture Patterns

### 1. Webhook Signature Verification (HMAC-SHA256)

**Location**: `src/lib/polar-webhook.ts`

**Pattern** - This is production-critical and must NOT be modified without full understanding:

```typescript
// HMAC-SHA256 signature verification (timing-safe)
// CRITICAL: Uses raw request body (not parsed JSON) for signature verification
function verifyPolarWebhookSignature(payload: string, signature: string): boolean {
  if (!POLAR_WEBHOOK_SECRET) {
    throw new Error('POLAR_WEBHOOK_SECRET not set');
  }

  const expectedSignature = createHmac('sha256', POLAR_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
```

**Important Notes**:

- Ensures webhook came from Polar, not attackers
- Never use simple string comparison (`===`)
- Must use raw request body, not parsed JSON
- Always verify secret is set before using

### 2. GitHub OAuth Flow with CSRF Protection

**Location**: `src/app/api/auth/github/route.ts` and `src/app/api/auth/callback/route.ts`

**Pattern**:

- Generate random `state` parameter (32 bytes, base64url encoded)
- Store `state` in secure httpOnly cookie with 10-minute expiry
- On callback, verify `state` parameter matches cookie (timing-safe comparison)
- Extract GitHub user info and store in separate httpOnly cookie for use in webhook

**Critical**: State validation prevents CSRF attacks. The timing-safe comparison must be used.

### 3. Secure Cookie Handling

**Pattern** - httpOnly cookies store sensitive GitHub user data:

```typescript
response.cookies.set({
  name: 'github_user',
  value: JSON.stringify({ id, login, email }),
  httpOnly: true, // Can't be accessed by JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict', // CSRF protection
  maxAge: 15 * 60, // 15 minutes
  path: '/',
});
```

### 4. Customer Data Extraction from Polar Webhooks

**Location**: `src/lib/polar-webhook.ts`

**Important Pattern** - GitHub username can come from TWO places:

```typescript
// 1. From metadata (API-driven custom fields)
const username = data.metadata?.github_username || data.metadata?.gh_username;

// 2. From custom_field_data (User-input during checkout)
const username = data.custom_field_data?.gh_username || data.custom_field_data?.github_username;
```

**Must support**:

- `github_username`, `gh_username`, `github_user_id`, `gh_user_id` (all variants)
- Handles both API-driven metadata and user-input custom fields

### 5. Customer UPSERT Logic (Repeat Purchases)

**Location**: `src/lib/db.ts`

**Critical Pattern** - Handles repeat purchases gracefully:

```sql
INSERT INTO customers (email, name, amount_paid, ...)
VALUES (...)
ON CONFLICT (email) DO UPDATE SET
  amount_paid = EXCLUDED.amount_paid,
  polar_order_id = EXCLUDED.polar_order_id,
  updated_at = NOW()
  -- ... update other fields
```

**Why**: Without UPSERT, repeat purchases fail with "unique constraint violation on email". UPSERT updates existing records instead of failing.

### 6. Database Connection Pool (Neon PostgreSQL)

**Location**: `src/lib/db.ts`

**Pattern** - Single persistent connection pool instance:

```typescript
const pool = new Pool({ connectionString: DATABASE_URL });

// Export queries as methods
export const db = {
  createCustomer: async (data) => {
    /* ... */
  },
  getCustomerByOrderId: async (id) => {
    /* ... */
  },
  // etc.
};
```

**Why**: Reusing pool prevents "too many connections" errors. Never create new Pool instances.

## File Structure & Key Components

```
src/
├── app/
│   └── api/
│       ├── auth/
│       │   ├── github/route.ts        → Initiate GitHub OAuth (redirect to GitHub)
│       │   └── callback/route.ts      → GitHub OAuth callback (verify state, store user)
│       ├── health/route.ts            → Health check endpoint for monitoring
│       └── webhooks/
│           └── polar/route.ts         → Polar payment webhook handler (verify sig, invite user)
│
├── lib/
│   ├── db.ts                          → PostgreSQL connection pool + query methods
│   ├── email.ts                       → Resend email service
│   ├── env.ts                         → Environment variable validation
│   ├── github-api.ts                  → GitHub API client (Octokit): invite, remove, check status
│   ├── github-oauth.ts                → OAuth flow: generate URL, exchange code, get user
│   ├── logger.ts                      → Structured logging with PII redaction
│   ├── polar-webhook.ts               → Webhook verification + parsing
│   ├── validation.ts                  → Input validation utilities (Zod schemas)
│   └── __tests__/                     → Unit tests for all lib modules
│
├── middleware.ts                      → Next.js middleware (request logging, security headers)
│
└── types/
    └── index.ts                       → All TypeScript interfaces (30+ fields in Polar metadata)
```

## Data Models

### Customer Record (33 fields)

Every customer gets a record in `customers` table with:

- **Core**: id, email, name, company, created_at
- **GitHub**: github_username, github_user_id, github_email
- **Polar**: polar_order_id, amount_paid, currency, payment_method
- **Status**: status (pending/invited/active), invitation_sent_at, invitation_error, welcome_email_sent
- **Metadata**: referral_source, use_case, newsletter_opted_in, promo_code_used, tags
- **Disputes**: chargebacked, chargeback_date, payment_dispute_status

See `ARCHITECTURE.md` for complete schema.

### Webhook Payload Structure

```json
{
  "type": "order.paid",
  "data": {
    "id": "order_uuid",
    "status": "paid",
    "amount": 9999,
    "currency": "usd",
    "customer_id": "cust_uuid",
    "product_id": "prod_uuid",
    "metadata": {
      "email": "user@example.com",
      "name": "User Name",
      "github_username": "username",
      "github_user_id": 12345,
      "company": "Company Inc",
      "use_case": "Why they want access",
      "referral_source": "reddit|twitter|referral|direct"
    }
  }
}
```

## Environment Variables

**Required** (must be set before running):

- `DATABASE_URL` - Neon PostgreSQL (with `?sslmode=require`)
- `GITHUB_TOKEN` - Personal access token with `repo` scope
- `GITHUB_OAUTH_CLIENT_ID` - From GitHub OAuth app
- `GITHUB_OAUTH_CLIENT_SECRET` - From GitHub OAuth app
- `POLAR_WEBHOOK_SECRET` - From Polar dashboard webhooks

**Optional but recommended**:

- `RESEND_API_KEY` - Email service
- `RESEND_FROM_EMAIL` - Verified sender email
- `GITHUB_ORG_OR_USER` - GitHub username/org
- `GITHUB_REPO` - Repository name

See `.env.example` for full list.

## Testing

### Running Tests

```bash
npm test                 # Watch mode (Vitest)
npm run test:run         # Single run
npm run test:coverage    # Coverage report
```

### Testing Webhooks Locally

```bash
# 1. Start dev server
npm run dev

# 2. In another terminal, start ngrok tunnel
ngrok http 3000
# Note the public URL (e.g., https://xxx.ngrok.io)

# 3. Update Polar webhook URL to: https://xxx.ngrok.io/api/webhooks/polar

# 4. Send test webhook
PAYLOAD='{"type":"order.paid","data":{"id":"order_123",...}}'
SECRET="your_polar_webhook_secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Common Development Tasks

### Adding a New Webhook Event Type

1. Update type definitions in `src/types/index.ts`
2. Add parser in `src/lib/polar-webhook.ts`
3. Add handler in `src/app/api/webhooks/polar/route.ts`
4. Add tests in `src/app/api/webhooks/polar/__tests__/`

### Modifying Customer Fields

1. Update database schema migration
2. Update `PolarWebhookMetadata` interface in `src/types/index.ts`
3. Update webhook parser in `src/lib/polar-webhook.ts`
4. Update database insert query in `src/lib/db.ts`

### Adding Custom Email Templates

1. Create template in `src/lib/email.ts`
2. Export send function
3. Call from webhook handler

## Security Checklist

Before deploying:

- [ ] `.env.local` never committed (in `.gitignore`)
- [ ] HTTPS enabled (required by GitHub OAuth)
- [ ] All environment variables set in production
- [ ] GitHub OAuth app callback URL matches production domain
- [ ] Polar webhook URL updated to production domain
- [ ] Resend sender email verified
- [ ] Database backups configured
- [ ] Error notifications email configured
- [ ] HMAC signature verification enabled
- [ ] CSRF state parameter validation enabled

## Dependencies

| Package       | Version | Purpose                |
| ------------- | ------- | ---------------------- |
| next          | ^16.0.0 | Framework (App Router) |
| react         | ^19.0.0 | UI library             |
| pg            | ^8.11.0 | PostgreSQL client      |
| @octokit/rest | ^20.1.2 | GitHub API client      |
| resend        | ^3.0.0  | Email service          |
| zod           | ^3.22.0 | Schema validation      |
| typescript    | ^5.3.0  | Type checking          |
| vitest        | ^4.0.16 | Testing framework      |

## Deployment

### Vercel (Recommended)

```bash
vercel env add DATABASE_URL <neon-url>
vercel env add GITHUB_TOKEN <token>
# ... add all other env vars
vercel deploy
```

### Docker

```bash
docker build -t github-access-automation .
docker run -p 3000:3000 --env-file .env.local github-access-automation
```

## Key Gotchas & Important Implementation Notes

1. **GitHub OAuth token endpoint** - MUST use `github.com`, NOT `api.github.com` for token exchange
   - Wrong: `https://api.github.com/login/oauth/access_token`
   - Correct: `https://github.com/login/oauth/access_token`

2. **GitHub OAuth state timeout** - 10 minutes, user must complete OAuth quickly

3. **GitHub token scope** - Must have `repo` scope, not `public_repo` (for private repo access)

4. **Repository must be private** - Public repos don't need invitation

5. **Permission level** - Default is 'pull' (read-only), 'push' adds write access

6. **Webhook signature** - Must use raw request body (not parsed JSON) for HMAC verification

7. **Custom field data extraction** - Support all variants: `gh_username`, `github_username`, `gh_user_id`, `github_user_id`

8. **Repeat purchases** - UPSERT logic required to update existing customers by email

9. **Timezone issues** - All timestamps use UTC

10. **Email domain verification** - Resend requires domain verification before sending from custom domain

11. **Polar checkout prefill** - Pass `gh_username` and `gh_user_id` as query parameters to prefill checkout fields

## Production Deployment Checklist

**Before deploying to production**:

- [ ] Set `NODE_ENV="production"` in hosting provider
- [ ] Configure all environment variables in hosting provider dashboard (see below)
- [ ] Verify GitHub OAuth app callback URL matches production domain (HTTPS required)
- [ ] Update Polar webhook URL in Polar dashboard to production domain
- [ ] Verify Resend sender email domain is verified
- [ ] Test with real payment in Polar production (not sandbox)
- [ ] Monitor logs for first few transactions
- [ ] Set up error notifications to admin email
- [ ] Configure database backups
- [ ] Enable HTTPS (required for GitHub OAuth)

**Required Environment Variables (Production)**:

```bash
# Application
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://your-production-domain.com"

# Database
DATABASE_URL="postgresql://..."  # Production Neon database

# Polar.sh
POLAR_WEBHOOK_SECRET="polar_whs_..."
POLAR_ACCESS_TOKEN="polar_oat_..."
POLAR_CHECKOUT_URL="https://polar.sh/checkout"

# GitHub (Classic Token with 'repo' scope)
GITHUB_TOKEN="ghp_..."
GITHUB_ORG_OR_USER="your-org-name"
GITHUB_REPO="your-repo-name"

# GitHub OAuth
GITHUB_OAUTH_CLIENT_ID="Ov23..."
GITHUB_OAUTH_CLIENT_SECRET="..."

# Email (Resend)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@your-verified-domain.com"
ADMIN_EMAIL="admin@your-domain.com"
```

## Further Reading

- `README.md` - User-facing documentation
- `ARCHITECTURE.md` - Complete system design
- `SETUP.md` - Setup and deployment
- `TESTING.md` - Testing guide
- `TROUBLESHOOTING.md` - Common issues
- `PROJECT_REPORT.md` - Development progress and fixes

---

**Status**: ✅ Production Ready
**Last Updated**: December 16, 2025
**Tests**: 243/243 passing (100% coverage)
**Build**: ✅ Successful
**Built with**: Next.js 16, TypeScript, Octokit, Resend
**Database**: PostgreSQL (Neon)
**Node Version**: >=18.0.0
**Repo**: https://github.com/jpoindexter/github-access-automation
