# GitHub Access Automation - Architecture Overview

Complete system architecture for the GitHub access automation tool.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    User's Browser                               │
│                                                                 │
│  1. Click "Buy" Button                                         │
│     ↓                                                            │
│  2. GitHub OAuth Authorization                                 │
│     ↓                                                            │
│  3. Redirect to Polar Checkout                                 │
│     ↓                                                            │
│  4. Enter Payment Details & Pay                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                   Our Backend (Next.js)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ GitHub OAuth Flow                                       │  │
│  │ - GET /api/auth/github                                 │  │
│  │ - GET /api/auth/callback                               │  │
│  │ Stores: github_username, github_user_id (in cookie)   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Polar Webhook Handler                                  │  │
│  │ - POST /api/webhooks/polar                             │  │
│  │ - Verify webhook signature                             │  │
│  │ - Extract customer data                                │  │
│  │ - Create database record                               │  │
│  │ - Invite to GitHub                                     │  │
│  │ - Send welcome email                                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ GitHub API Client                                      │  │
│  │ - inviteToRepository(username)                         │  │
│  │ - checkIfCollaborator(username)                        │  │
│  │ - removeFromRepository(username)                       │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
    GitHub API      Resend API          Neon PostgreSQL
   (Invitations)   (Email Service)      (Customer Data)
```

## Data Flow

### 1. GitHub OAuth (Before Checkout)

```
User Browser
    ↓
GET /api/auth/github
    ↓ (redirect)
GitHub OAuth
    ↓ (user authorizes)
GET /api/auth/callback?code=...
    ↓
Exchange code for access token
    ↓
Get user info (id, login, email)
    ↓
Store in oauth_sessions (15 min expiry)
    ↓
Set github_user cookie (httpOnly, 15 min)
    ↓
Redirect to Polar checkout
```

### 2. Polar Payment

```
User Browser
    ↓
Polar Checkout (with github_username in params)
    ↓
User enters email + payment details
    ↓
User clicks "Pay"
    ↓
Polar processes payment
    ↓
Payment successful
    ↓
Polar sends webhook to /api/webhooks/polar
```

### 3. Webhook Processing (Most Critical)

```
Polar Webhook
    ↓
Verify signature (HMAC-SHA256)
    ↓ (signature valid)
Extract customer data
    ├─ From Polar webhook: email, order_id, amount, currency
    ├─ From Polar metadata: name, company, use_case, referral_source, newsletter_opted_in
    └─ From request: github_username, github_user_id
    ↓
Check if customer exists (by order_id)
    ↓ (doesn't exist)
Create customer record in database
    ↓
Invite to GitHub repo via GitHub API
    ├─ Success: Update status to "invited"
    └─ Failure: Record error, send alert
    ↓
Send welcome email via Resend
    ├─ Success: Mark welcome_email_sent = true
    └─ Failure: Record error, send alert
    ↓
Update customer status to "active"
    ↓
Return success response
```

## File Structure

```
github-access-automation/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── github/
│   │       │   │   └── route.ts          (GitHub OAuth initiation)
│   │       │   └── callback/
│   │       │       └── route.ts          (GitHub OAuth callback)
│   │       └── webhooks/
│   │           └── polar/
│   │               └── route.ts          (Polar webhook handler)
│   ├── lib/
│   │   ├── db.ts                         (Database client + queries)
│   │   ├── github-oauth.ts               (GitHub OAuth utilities)
│   │   ├── github-api.ts                 (GitHub API client via Octokit)
│   │   ├── polar-webhook.ts              (Polar webhook utilities)
│   │   └── email.ts                      (Resend email service)
│   └── types/
│       └── index.ts                      (TypeScript type definitions)
├── .env.example                          (Environment variables template)
├── package.json                          (Dependencies)
├── README.md                             (Full documentation)
├── SETUP.md                              (Setup & deployment guide)
├── TESTING.md                            (Testing instructions)
└── ARCHITECTURE.md                       (This file)
```

## Key Components

### 1. Database (`src/lib/db.ts`)

**Purpose:** Wrapper around Neon PostgreSQL connection pool

**Key methods:**

- `createCustomer(data)` - Create customer record
- `getCustomerByOrderId(orderId)` - Lookup by Polar order
- `updateCustomerStatus(id, status)` - Track invitation status
- `recordChargeback(customerId)` - Handle payment issues
- `listCustomers(offset, limit)` - Pagination for admin

**Tables:**

- `customers` - 33 fields, comprehensive customer tracking
- `oauth_sessions` - Temporary GitHub OAuth state

### 2. GitHub OAuth (`src/lib/github-oauth.ts`)

**Purpose:** Handle GitHub OAuth 2.0 flow

**Key functions:**

- `getGitHubAuthUrl(redirectUri)` - Generate auth URL
- `exchangeCodeForToken(code)` - Exchange auth code for token
- `getGitHubUser(accessToken)` - Get user info
- `authenticateWithGitHub(code)` - Complete flow

**Flow:**

1. User clicks GitHub OAuth link
2. Redirect to GitHub authorize endpoint
3. GitHub redirects back with authorization code
4. Exchange code for access token
5. Get user info (id, login, email)
6. Return user object

### 3. GitHub API Client (`src/lib/github-api.ts`)

**Purpose:** Interact with GitHub API for collaborator management

**Key functions:**

- `inviteToRepository(username, permission)` - Send repo invitation
- `checkIfCollaborator(username)` - Check if already invited
- `removeFromRepository(username)` - Revoke access
- `getRepositoryInfo()` - Get repo details
- `getRepositoryCloneUrl()` - Get HTTPS/SSH clone URLs

**Permissions:**

- 'pull' = Read-only (default)
- 'push' = Read/Write
- 'admin' = Full admin access

### 4. Polar Webhook (`src/lib/polar-webhook.ts`)

**Purpose:** Validate and parse Polar webhook payloads

**Key functions:**

- `verifyPolarWebhookSignature(payload, signature)` - HMAC-SHA256 verification
- `parsePolarWebhook(payload)` - Parse JSON
- `isPaidOrderEvent(webhook)` - Check if order.paid event
- `extractCustomerDataFromWebhook(order)` - Extract metadata

**Webhook Format:**

```json
{
  "type": "order.paid",
  "timestamp": "2025-01-01T12:00:00Z",
  "data": {
    "id": "order_uuid",
    "status": "paid",
    "amount": 9999,
    "currency": "usd",
    "customer_id": "customer_uuid",
    "metadata": {
      "email": "user@example.com",
      "name": "User Name",
      "github_username": "username",
      "github_user_id": 12345
    }
  }
}
```

### 5. Email Service (`src/lib/email.ts`)

**Purpose:** Send transactional emails via Resend

**Key functions:**

- `sendEmail(options)` - Send raw email
- `sendWelcomeEmail(email, name, repoUrl, cloneUrl)` - Welcome email
- `sendErrorNotification(subject, error)` - Alert admins

**Email types:**

- Welcome email: Sent immediately after successful GitHub invite
- Error notification: Sent to admin if errors occur

### 6. API Routes

#### GitHub OAuth Routes

```
GET /api/auth/github
  ↓ Redirect to GitHub OAuth
GET /api/auth/callback
  ↓ Handle callback, store user, redirect to Polar
```

#### Polar Webhook Route

```
POST /api/webhooks/polar
  ├─ Verify signature
  ├─ Create customer
  ├─ Invite to GitHub
  ├─ Send email
  └─ Return success
```

## Security Considerations

### 1. Webhook Signature Verification

**Implementation:** HMAC-SHA256

```typescript
hash = HMAC - SHA256(payload, POLAR_WEBHOOK_SECRET);
verify: hash == signature;
```

**Why:** Ensures webhook came from Polar

### 2. OAuth CSRF Protection

**Implementation:** State parameter in OAuth request

```typescript
state = random();
// OAuth request includes state
// Callback verifies state matches
```

### 3. Secure Cookies

**Implementation:** httpOnly flag for sensitive data

```typescript
response.cookies.set({
  name: 'github_user',
  httpOnly: true, // Can't be accessed by JavaScript
  secure: true, // Only sent over HTTPS
  sameSite: 'lax', // CSRF protection
  maxAge: 15 * 60, // 15 minute expiry
});
```

### 4. Environment Secrets

**Never commit:**

- `.env.local`
- API keys
- Webhook secrets
- Database credentials

**Use `.env.example` as template**

## Error Handling

### Webhook Processing Errors

All errors trigger:

1. Database record with error details
2. Admin notification email
3. Error response to Polar

**Scenarios:**

- Invalid signature → 401
- Missing GitHub data → 400
- GitHub API error → 500 (but recorded)
- Email send error → 500 (but recorded)

### Recovery

**Manual intervention may be needed for:**

- Failed GitHub invitations (user exists, permissions issue)
- Failed emails (invalid email address)
- Chargebacks (payment dispute)

**Admin dashboard (future) will:**

- Show failed records
- Allow retry / manual action
- Track payment issues

## Monitoring & Logs

**Key logs to monitor:**

```
"GitHub OAuth success for user: {username}"
"Webhook processed successfully"
"Failed to invite {username} to repo"
"Failed to send welcome email"
"Invalid Polar webhook signature"
```

**Database queries for monitoring:**

```sql
-- Pending invitations
SELECT * FROM customers WHERE status = 'pending';

-- Failed invitations
SELECT * FROM customers WHERE invitation_error IS NOT NULL;

-- Chargebacks
SELECT * FROM customers WHERE chargebacked = true;

-- Customers by status
SELECT status, COUNT(*) FROM customers GROUP BY status;
```

## Scalability

### Current Limitations

- Single database connection pool
- Synchronous processing (blocks while sending email)

### Future Improvements

- Message queue (Bull, RabbitMQ) for async processing
- Rate limiting on webhook endpoint
- Database read replicas for reporting
- CDN for static assets
- Caching layer (Redis)

## Dependencies

**Core:**

- `next`: Framework
- `pg`: PostgreSQL client
- `@octokit/rest`: GitHub API client
- `resend`: Email service

**Development:**

- `typescript`
- `@types/node`
- `@types/react`

See `package.json` for full list and versions.

## Deployment Checklist

- [ ] All environment variables set in production
- [ ] Database credentials updated (production Neon database)
- [ ] GitHub OAuth app configured for production domain
- [ ] Polar webhook URL updated to production domain
- [ ] Resend email domain verified
- [ ] HTTPS enabled (required by GitHub OAuth)
- [ ] Error notifications email configured
- [ ] Database backups configured
- [ ] Monitoring/alerting set up
- [ ] First few transactions tested
