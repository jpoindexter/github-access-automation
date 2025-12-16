# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GitHub Access Automation** is a Next.js application that automatically provisions GitHub repository access after customers purchase through Polar.sh. It handles the complete flow: GitHub OAuth authentication, payment processing via webhooks, automatic repository invitations, and welcome email delivery.

**Tech Stack:** Next.js 16 (App Router) • TypeScript 5 • PostgreSQL (Neon) • GitHub OAuth 2.0 • Polar.sh Webhooks • Resend Email • Zod Validation

**Requirements:** Node.js 18+ • PostgreSQL 15+ • npm

## Quick Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run type-check       # TypeScript validation
npm run lint             # ESLint check
npm run lint:fix         # Fix linting issues
npm run format           # Prettier formatting

# Database
npm run db:migrate       # Run migrations
npm run db:backup        # Backup database

# Testing
npm test                 # Run Vitest tests
npm run test:coverage    # Run tests with coverage
```

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── auth/callback/route.ts    # GitHub OAuth callback
│   │   ├── health/route.ts           # Health check endpoint
│   │   └── webhooks/polar/route.ts   # Polar payment webhook
│   └── page.tsx                       # Landing page
├── lib/
│   ├── db.ts                         # PostgreSQL connection pool
│   ├── email.ts                      # Resend email service
│   ├── env.ts                        # Environment validation
│   ├── github-api.ts                 # GitHub API client
│   ├── github-oauth.ts               # OAuth flow utilities
│   ├── logger.ts                     # Structured logging with PII redaction
│   ├── polar-webhook.ts              # Webhook verification and parsing
│   └── validation.ts                 # Zod schemas
└── types/
    └── index.ts                      # TypeScript type definitions
```

## Critical Patterns

### Environment Validation

All environment variables are validated at startup using Zod. Use `process.env` directly - validation runs on import:

```typescript
// Environment is validated on module load
const githubToken = process.env.GITHUB_TOKEN;  // Safe to use
```

### Database Singleton

The database uses a connection pool singleton. Never create new Pool instances:

```typescript
import { db } from '@/lib/db';

// CORRECT: Use the db object
await db.createCustomer(data);
await db.query('SELECT * FROM customers');

// WRONG: Don't create new Pool instances
const pool = new Pool(...)  // Never do this
```

### Structured Logging

Use the logger utilities for all logging. Never use console.log:

```typescript
import { webhookLogger, dbLogger, authLogger } from '@/lib/logger';

// CORRECT
webhookLogger.info('Webhook processed', { orderId: '123' });
dbLogger.error('Query failed', error, { query: 'SELECT...' });

// WRONG
console.log('Webhook processed');  // No console.log
```

### Webhook Security

Polar webhooks use HMAC-SHA256 signature verification with timing-safe comparison:

```typescript
import { verifyPolarWebhookSignature, validateWebhookTimestamp } from '@/lib/polar-webhook';

// Always verify signature
if (!verifyPolarWebhookSignature(body, signature)) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
}

// Always validate timestamp (prevents replay attacks)
if (!validateWebhookTimestamp(webhook.timestamp)) {
  return NextResponse.json({ error: 'Webhook expired' }, { status: 400 });
}
```

## Security Considerations

1. **CSRF Protection**: OAuth flow uses cryptographically secure state parameter
2. **Timing Attacks**: Signature verification uses `crypto.timingSafeEqual`
3. **Replay Attacks**: Webhooks validated within 5-minute window
4. **Open Redirect**: Redirect URLs validated against allowed domains
5. **SSL/TLS**: Database connections use SSL (Neon requires `rejectUnauthorized: false`)
6. **PII Redaction**: Logger automatically redacts sensitive fields

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/callback` | GET | GitHub OAuth callback handler |
| `/api/webhooks/polar` | POST | Polar payment webhook |
| `/api/webhooks/polar` | GET | Webhook health check |
| `/api/health` | GET | Application health check |

## Customer Flow

1. User clicks "Buy" → Redirected to GitHub OAuth
2. User authorizes → Callback exchanges code for token
3. User data stored → Redirect to Polar checkout
4. User pays → Polar sends webhook to `/api/webhooks/polar`
5. Webhook verified → Customer created in database
6. GitHub invitation sent → Repository access granted (read-only)
7. Welcome email sent → Customer notified with clone URL

## Database Schema

The `customers` table has 33 fields including:
- Customer info: `id`, `name`, `email`, `company`
- GitHub: `github_username`, `github_user_id`, `github_email`
- Payment: `polar_order_id`, `amount_paid`, `currency`
- Status: `status`, `invitation_sent_at`, `welcome_email_sent`

See `database/schema.sql` for complete schema.

## Git Hooks (Husky)

Pre-commit hooks enforce quality:

```bash
# Runs automatically on git commit
npm run type-check     # TypeScript must pass
npx lint-staged        # Staged files are linted

# Pre-push hook runs build verification
npm run build
```

Commit messages must follow conventional format:
```
feat: add feature
fix: bug fix
docs: documentation
chore: maintenance
```

## Testing

Tests use Vitest and are located in `src/lib/__tests__/`:

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

## Deployment

### Vercel (Recommended)

1. Connect GitHub repository
2. Set environment variables (see `.env.example`)
3. Deploy automatically on push to main

### Docker

```bash
docker build -t github-access-automation .
docker run -p 3000:3000 --env-file .env.local github-access-automation
```

## Common Issues

| Issue | Solution |
|-------|----------|
| TypeScript errors | `npm run type-check` to see errors |
| Build fails | Check environment variables |
| Webhook fails | Verify `POLAR_WEBHOOK_SECRET` matches |
| Database connection | Ensure `DATABASE_URL` is valid Neon URL |
| OAuth fails | Check GitHub OAuth app credentials |

## Resources

- **README.md** - Quick start and overview
- **ARCHITECTURE.md** - System design documentation
- **SECURITY.md** - Security implementation details
- **SETUP.md** - Detailed setup guide
- **TESTING.md** - Testing guide
- **docs/API.md** - API documentation
