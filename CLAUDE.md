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

## Critical Architecture Patterns

### 1. Webhook Signature Verification (HMAC-SHA256)

**Location**: `src/lib/polar-webhook.ts`

**Pattern** - This is production-critical and must NOT be modified without full understanding:

```typescript
// HMAC-SHA256 signature verification (timing-safe)
function verifyPolarWebhookSignature(payload: string, signature: string): boolean {
  const expectedSignature = createHmac('sha256', POLAR_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
```

**Why**: Ensures webhook came from Polar, not attackers. Never use simple string comparison (`===`).

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

### 4. Database Connection Pool (Neon PostgreSQL)

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
│       └── webhooks/
│           └── polar/route.ts         → Polar payment webhook handler (verify sig, invite user)
│
├── lib/
│   ├── db.ts                          → PostgreSQL connection pool + query methods
│   ├── github-oauth.ts                → OAuth flow: generate URL, exchange code, get user
│   ├── github-api.ts                  → GitHub API client (Octokit): invite, remove, check status
│   ├── polar-webhook.ts               → Webhook verification + parsing
│   ├── email.ts                       → Resend email service
│   ├── logger.ts                      → Structured logging with PII redaction
│   └── types.ts                       → TypeScript interfaces (read before modifying)
│
└── types/
    └── index.ts                       → All TypeScript interfaces (critical: 30+ fields in Polar metadata)
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

## Key Gotchas

1. **GitHub OAuth state timeout** - 10 minutes, user must complete OAuth quickly
2. **GitHub token scope** - Must have `repo` scope, not `public_repo`
3. **Repository must be private** - Public repos don't need invitation
4. **Permission level** - Default is 'pull' (read-only), 'push' adds write access
5. **Webhook signature format** - Must match Polar's HMAC-SHA256 exactly
6. **Timezone issues** - All timestamps use UTC
7. **Email domain verification** - Resend requires domain verification before sending

## Further Reading

- `README.md` - User-facing documentation
- `ARCHITECTURE.md` - Complete system design
- `SETUP.md` - Setup and deployment
- `TESTING.md` - Testing guide
- `TROUBLESHOOTING.md` - Common issues

---

**Built with**: Next.js 16, TypeScript, Octokit, Resend
**Database**: PostgreSQL (Neon)
**Node Version**: >=18.0.0
