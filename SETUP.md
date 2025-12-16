# GitHub Access Automation - Setup Guide

Complete setup instructions for the GitHub access automation tool.

## 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in all required values:

```bash
cp .env.example .env.local
```

### Required Variables

```bash
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# GitHub
GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"           # Personal access token (repo invite scope)
GITHUB_ORG_OR_USER="jpoindexter"                  # Your GitHub username (personal repo)
GITHUB_REPO="fabrk"                               # Repository name

# GitHub OAuth (for user login before Polar)
GITHUB_OAUTH_CLIENT_ID="Ov23lixxxxxxxxxxxxxxxx"
GITHUB_OAUTH_CLIENT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxx"

# Polar.sh
POLAR_WEBHOOK_SECRET="polar_whs_xxxxxxxxxxxxxxxxxxxxxxxx"
POLAR_ACCESS_TOKEN="polar_oat_xxxxxxxxxxxxxxxxxxxxxxxx"

# Resend (Email)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

## 2. Database Schema

Database schema is automatically created when you first connect to Neon. The schema includes:

- **customers** - Customer records from Polar + GitHub OAuth
- **oauth_sessions** - Temporary GitHub OAuth state
- Indexes on: email, polar_order_id, github_username, status

All fields documented in README.md → Database Schema section.

## 3. API Endpoints

### GitHub OAuth Flow
```
GET /api/auth/github
  → Redirects to GitHub OAuth authorization

GET /api/auth/callback
  → Handles GitHub OAuth callback
  → Stores username + user_id in session
  → Redirects to Polar checkout
```

### Polar Webhook
```
POST /api/webhooks/polar
  → Receives payment notification
  → Creates customer in database
  → Invites to GitHub repo
  → Sends welcome email
```

### Customer Management
```
GET /api/customers
  → List all customers (with pagination)

GET /api/customers?status=pending
  → Filter by status (pending, invited, accepted, active)

POST /api/customers/:id/revoke
  → Revoke access for customer

POST /api/customers/:id/chargeback
  → Record chargeback
```

## 4. Polar Webhook Setup

1. Go to Polar dashboard
2. Navigate to Settings → Webhooks
3. Add endpoint: `https://yourdomain.com/api/webhooks/polar`
4. Select events: `order.paid`
5. Copy webhook secret to `.env.local` as `POLAR_WEBHOOK_SECRET`

## 5. Repository Security Requirements

**CRITICAL:** Before deploying, ensure your boilerplate repository is configured correctly:

```bash
# Repository must be PRIVATE
- Visibility: Private
- Branch Protection: Enabled on main
- Allow Force Pushes: NO
- Allow Deletions: NO
- Enforce Admin: YES
```

Customers will be added as **read-only collaborators** (permission: `pull`).

They can:
- ✅ Clone the repo
- ✅ Pull the code
- ❌ Cannot push changes
- ❌ Cannot delete branches
- ❌ Cannot modify original

## 6. Polar Custom Checkout Fields

Configure these custom fields in Polar checkout:

1. **name** (text) - Customer name
2. **company** (text) - Company name
3. **use_case** (text) - Why they want access
4. **referral_source** (dropdown) - How they found you
5. **newsletter_opted_in** (checkbox) - Newsletter signup

These will be included in the webhook `metadata` field.

## 6. GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`
4. Copy token to `.env.local` as `GITHUB_TOKEN`

## 7. Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

Visit `http://localhost:3000` to test the flow.

## 8. User Flow (Testing)

1. Click "Buy" button
2. GitHub OAuth popup appears
3. Authorize → redirected back
4. Redirected to Polar checkout with GitHub username in session
5. Complete payment on Polar
6. Polar webhook fires
7. Customer created in database
8. GitHub API invites user to repo
9. Welcome email sent to customer
10. Customer checks email for access link

## 9. Monitoring

### Check customer status
```bash
psql $DATABASE_URL
SELECT * FROM customers WHERE status = 'pending';
```

### View webhook logs
```bash
# Logs in src/app/api/webhooks/polar/route.ts
```

### Check for failed invitations
```bash
SELECT * FROM customers WHERE invitation_error IS NOT NULL;
```

## 10. Troubleshooting

**Issue: GitHub invitation fails**
- Check `invitation_error` field in database
- Verify `GITHUB_TOKEN` has `repo` scope
- Verify user isn't already a collaborator

**Issue: Webhook not firing**
- Check Polar webhook settings
- Verify `POLAR_WEBHOOK_SECRET` is correct
- Check server logs for errors

**Issue: Customer email not working**
- Verify `RESEND_API_KEY` is valid
- Check `RESEND_FROM_EMAIL` is verified in Resend

## 11. Deployment

Deploy to Vercel:

```bash
git push origin main
# Vercel auto-deploys

# Set environment variables in Vercel dashboard
# Make sure DATABASE_URL points to production Neon database
```

Update Polar webhook URL to production domain.
