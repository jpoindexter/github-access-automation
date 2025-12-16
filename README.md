# GitHub Access Automation

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js->=18-green.svg)](https://nodejs.org/)

Automated GitHub repository access provisioning after purchase via Polar.sh. Perfect for selling access to boilerplates, starter kits, and private repositories.

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-username/github-access-automation.git
cd github-access-automation
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
# Visit http://localhost:3000
```

## Features

- **GitHub OAuth Login** - Secure user authentication before purchase
- **Polar.sh Integration** - Payment processing with webhook verification
- **Automatic Invitations** - Instant GitHub repo access after payment
- **Customer Management** - 33-field customer database schema
- **Email Notifications** - Welcome emails via Resend
- **CSRF Protection** - Secure OAuth state validation
- **Rate Limiting** - API endpoint protection
- **Structured Logging** - Production-ready logging with PII redaction

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.x (strict mode) |
| Database | PostgreSQL (Neon) |
| GitHub API | Octokit REST |
| Payments | Polar.sh Webhooks |
| Email | Resend |
| Validation | Zod |
| Testing | Vitest |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Flow                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. User clicks "Buy" → GitHub OAuth popup                      │
│                              ↓                                   │
│   2. Authorize → Get username + store state                      │
│                              ↓                                   │
│   3. Redirect to Polar checkout (username in session)            │
│                              ↓                                   │
│   4. Complete payment                                            │
│                              ↓                                   │
│   5. Polar webhook fires (HMAC-SHA256 verified)                  │
│                              ↓                                   │
│   6. Create customer → Invite to repo → Send welcome email       │
│                              ↓                                   │
│   7. User has READ-ONLY access (can clone/pull, cannot push)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Model

Your boilerplate repository must be:

- **PRIVATE** - Only invited customers can access
- **Branch Protected** - Only you can push to main
- **Read-Only Access** - Customers get `pull` permission only

See [SECURITY.md](SECURITY.md) for complete security architecture including:
- HMAC-SHA256 webhook signature verification
- CSRF protection with timing-safe state validation
- Rate limiting per endpoint
- PII redaction in logs

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/github` | GET | Initiate GitHub OAuth flow |
| `/api/auth/callback` | GET | Handle GitHub OAuth callback |
| `/api/webhooks/polar` | POST | Process Polar payment webhooks |
| `/api/webhooks/polar` | GET | Health check endpoint |
| `/api/health` | GET | Application health check |

See [docs/API.md](docs/API.md) for complete API documentation with request/response examples.

## Environment Variables

```bash
# Required
DATABASE_URL="postgresql://..."        # Neon PostgreSQL connection string
GITHUB_TOKEN="ghp_..."                 # Personal access token (repo scope)
GITHUB_ORG_OR_USER="your-org"          # GitHub org or username
GITHUB_REPO="your-repo"                # Repository to grant access to
POLAR_WEBHOOK_SECRET="polar_whs_..."   # Webhook signing secret

# OAuth (required for user flow)
GITHUB_OAUTH_CLIENT_ID="Ov23li..."
GITHUB_OAUTH_CLIENT_SECRET="..."

# Email (optional but recommended)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@yourdomain.com"
ADMIN_EMAIL="admin@yourdomain.com"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

## Database Schema

### Customers Table (33 fields)

Comprehensive customer data from Polar webhook + GitHub OAuth + custom checkout fields.

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer Info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  company VARCHAR(255),
  use_case VARCHAR(255),
  referral_source VARCHAR(255),

  -- Newsletter
  newsletter_opted_in BOOLEAN DEFAULT FALSE,
  unsubscribed_at TIMESTAMP,

  -- GitHub OAuth
  github_username VARCHAR(255) NOT NULL,
  github_email VARCHAR(255),
  github_user_id INT NOT NULL,

  -- Polar Payment
  polar_order_id VARCHAR(255) NOT NULL UNIQUE,
  polar_customer_id UUID,
  amount_paid DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  payment_method VARCHAR(50),
  product_id UUID,
  discount_id UUID,
  promo_code_used VARCHAR(255),

  -- Repo Access
  status VARCHAR(50) DEFAULT 'pending',
  invitation_sent_at TIMESTAMP,
  invitation_error TEXT,
  welcome_email_sent BOOLEAN DEFAULT FALSE,

  -- Chargebacks
  chargebacked BOOLEAN DEFAULT FALSE,
  chargeback_date TIMESTAMP,
  payment_dispute_status VARCHAR(50),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server

# Code Quality
npm run lint             # ESLint
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier format
npm run type-check       # TypeScript type check
npm run validate         # Run all checks

# Database
npm run db:migrate       # Run migrations
npm run db:backup        # Backup database

# Testing
npm test                 # Run Vitest tests
npm run test:coverage    # Tests with coverage
```

## Testing Webhooks Locally

```bash
# Generate webhook signature
PAYLOAD='{"type":"order.paid","data":{"id":"order_123"}}'
SECRET="your_polar_webhook_secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# Send test webhook
curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Add webhook URL to Polar: https://your-domain.vercel.app/api/webhooks/polar
```

### Docker

```bash
# Build image
docker build -t github-access-automation .

# Run container
docker run -p 3000:3000 --env-file .env.local github-access-automation
```

### Railway / Render

See deployment configuration files:
- `vercel.json` - Vercel configuration
- `Dockerfile` - Docker multi-stage build
- `docker-compose.yml` - Local development

## Troubleshooting

### Port 3000 already in use

```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

### Webhook signature fails

1. Verify `POLAR_WEBHOOK_SECRET` matches Polar dashboard
2. Check webhook URL is exactly `/api/webhooks/polar`
3. Ensure raw body is used for signature verification

### GitHub invitation fails

1. Verify `GITHUB_TOKEN` has `repo` scope
2. Check repository is PRIVATE
3. Ensure user isn't already a collaborator

### Database connection issues

```bash
# Test connection
npx pg-connection-string "$DATABASE_URL"

# Run migrations
npm run db:migrate
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) - Built for selling access to GitHub repositories.

## Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Email**: jason@example.com

---

Built with Next.js 16, TypeScript, and Polar.sh
