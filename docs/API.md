# API Documentation

Complete API reference for the GitHub Access Automation tool.

## Base URL

```
Development: http://localhost:3000
Production:  https://your-domain.com
```

## Authentication

Most endpoints use OAuth-based authentication via cookies. The Polar webhook endpoint uses HMAC-SHA256 signature verification.

---

## Endpoints

### GitHub OAuth

#### Initiate OAuth Flow

```http
GET /api/auth/github
```

Redirects user to GitHub for authorization. Stores CSRF state in secure cookie.

**Response:** `302 Redirect`

```
Location: https://github.com/login/oauth/authorize?client_id=...&scope=read:user,user:email&state=...
Set-Cookie: oauth_state=...; HttpOnly; Secure; SameSite=Lax; Max-Age=600
```

**Error Response:**

```json
{
  "error": "Failed to initiate GitHub authentication"
}
```

---

#### OAuth Callback

```http
GET /api/auth/callback?code={code}&state={state}
```

Handles GitHub OAuth callback, validates CSRF state, creates session, redirects to Polar checkout.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | GitHub authorization code |
| `state` | string | Yes | CSRF state token |

**Success Response:** `302 Redirect`

```
Location: https://polar.sh/checkout?github_username=johndoe
Set-Cookie: github_user={"id":123,"login":"johndoe","email":"john@example.com"}; HttpOnly; Secure; SameSite=Strict; Max-Age=900
```

**Error Responses:**

```json
// 400 - Missing code
{
  "error": "Missing authorization code"
}

// 403 - CSRF validation failed
{
  "error": "Invalid state parameter - possible CSRF attack"
}

// 400 - GitHub OAuth error
{
  "error": "GitHub authentication failed",
  "details": "access_denied"
}

// 500 - Server error
{
  "error": "Failed to complete GitHub authentication"
}
```

---

### Webhooks

#### Polar Payment Webhook

```http
POST /api/webhooks/polar
```

Processes Polar.sh payment webhooks. Creates customer record, invites to GitHub repository, sends welcome email.

**Headers:**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |
| `x-polar-signature` | string | Yes | HMAC-SHA256 signature |

**Request Body:**

```json
{
  "type": "order.paid",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "id": "order_abc123",
    "status": "paid",
    "amount": 9999,
    "currency": "usd",
    "customer_id": "cust_xyz789",
    "product_id": "prod_123",
    "discount_id": null,
    "metadata": {
      "github_username": "johndoe",
      "github_user_id": 12345678,
      "email": "john@example.com",
      "name": "John Doe",
      "company": "Acme Inc",
      "use_case": "Building a SaaS",
      "referral_source": "Twitter",
      "newsletter_opted_in": true,
      "promo_code": "LAUNCH20"
    }
  }
}
```

**Success Response:** `200 OK`

```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "invited": true,
  "emailSent": true
}
```

**Skipped Response (non-paid event):** `200 OK`

```json
{
  "success": true,
  "skipped": true
}
```

**Already Processed Response:** `200 OK`

```json
{
  "success": true,
  "message": "Customer already processed",
  "customerId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**

```json
// 401 - Invalid signature
{
  "error": "Invalid signature"
}

// 400 - Missing GitHub user data
{
  "error": "Missing GitHub user data"
}

// 500 - Processing error
{
  "error": "Failed to process webhook"
}

// 500 - GitHub invitation failed
{
  "error": "Failed to invite to repository"
}
```

---

#### Webhook Health Check

```http
GET /api/webhooks/polar
```

Simple health check for the webhook endpoint.

**Response:** `200 OK`

```json
{
  "status": "ok",
  "message": "Polar webhook endpoint is active",
  "endpoint": "/api/webhooks/polar"
}
```

---

### Health Check

#### Application Health

```http
GET /api/health
```

Returns application health status and service connectivity.

**Response:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "database": true,
    "github": true,
    "email": true
  },
  "environment": {
    "nodeVersion": "v18.19.0",
    "nodeEnv": "production"
  }
}
```

**Unhealthy Response:** `503 Service Unavailable`

```json
{
  "status": "degraded",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "database": false,
    "github": true,
    "email": true
  },
  "environment": {
    "nodeVersion": "v18.19.0",
    "nodeEnv": "production"
  }
}
```

---

## Webhook Signature Verification

All Polar webhooks must be verified using HMAC-SHA256 signature.

### Signature Format

```
x-polar-signature: sha256=<hex_encoded_signature>
```

### Verification Steps

1. Get the raw request body (do not parse JSON)
2. Get the `x-polar-signature` header
3. Extract the signature after `sha256=`
4. Compute HMAC-SHA256 of the raw body using your webhook secret
5. Compare signatures using constant-time comparison

### Example (Node.js)

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.POLAR_WEBHOOK_SECRET;

  // Extract hash from signature header
  const expectedSignature = signature.replace('sha256=', '');

  // Compute HMAC-SHA256
  const computedSignature = createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');

  // Constant-time comparison
  return timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(computedSignature, 'hex')
  );
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/webhooks/*` | 30 requests | 1 minute |
| `/api/auth/*` | 10 requests | 1 minute |
| `/api/health` | 60 requests | 1 minute |

**Rate Limit Headers:**

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1705315200
```

**Rate Limited Response:** `429 Too Many Requests`

```json
{
  "error": "Rate limit exceeded. Try again in 60 seconds."
}
```

---

## Error Codes

| HTTP Code | Error | Description |
|-----------|-------|-------------|
| `400` | Bad Request | Missing or invalid parameters |
| `401` | Unauthorized | Invalid webhook signature |
| `403` | Forbidden | CSRF validation failed |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server-side processing error |
| `503` | Service Unavailable | Health check failed |

---

## Testing

### Test Webhook Locally

```bash
# 1. Set your webhook secret
export POLAR_WEBHOOK_SECRET="your_secret_here"

# 2. Create test payload
PAYLOAD='{"type":"order.paid","timestamp":"2025-01-15T10:30:00Z","data":{"id":"test_order_123","status":"paid","amount":9999,"currency":"usd","customer_id":"cust_123","product_id":"prod_123","metadata":{"github_username":"testuser","github_user_id":12345}}}'

# 3. Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$POLAR_WEBHOOK_SECRET" -hex | cut -d' ' -f2)

# 4. Send test request
curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### Test OAuth Flow

```bash
# 1. Start local server
npm run dev

# 2. Open in browser
open http://localhost:3000/api/auth/github

# 3. Authorize with GitHub
# 4. Check redirect to Polar checkout URL
```

### Test Health Check

```bash
curl http://localhost:3000/api/health | jq
```

---

## Polar Webhook Events

The webhook endpoint processes the following Polar.sh event types:

| Event Type | Processed | Description |
|------------|-----------|-------------|
| `order.paid` | Yes | Payment completed successfully |
| `order.created` | No | Order created but not paid |
| `order.refunded` | No | Order was refunded |
| `subscription.created` | No | Subscription started |
| `subscription.cancelled` | No | Subscription cancelled |

Only `order.paid` events trigger customer creation and GitHub invitations.

---

## Customer Data Flow

```
Polar Webhook (order.paid)
         │
         ▼
┌─────────────────────────────────┐
│  Extract Customer Data          │
│  - metadata.github_username     │
│  - metadata.github_user_id      │
│  - metadata.email               │
│  - metadata.name                │
│  - metadata.company             │
│  - order.amount, currency       │
│  - order.id, customer_id        │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Create Customer Record         │
│  (PostgreSQL - 33 fields)       │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  GitHub Invitation              │
│  (permission: 'pull')           │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Send Welcome Email             │
│  (via Resend)                   │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Update Customer Status         │
│  (status: 'active')             │
└─────────────────────────────────┘
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
// Example: Send webhook using fetch
async function sendWebhook(payload: object, secret: string) {
  const body = JSON.stringify(payload);
  const signature = await computeHmacSignature(body, secret);

  const response = await fetch('https://your-domain.com/api/webhooks/polar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-polar-signature': `sha256=${signature}`,
    },
    body,
  });

  return response.json();
}
```

### cURL

```bash
# Health check
curl -s https://your-domain.com/api/health | jq

# Webhook (with signature)
curl -X POST https://your-domain.com/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: sha256=$SIGNATURE" \
  -d '{"type":"order.paid","data":{...}}'
```

---

## Changelog

### v1.0.0

- Initial release
- GitHub OAuth flow
- Polar webhook processing
- Customer management
- Email notifications
- Rate limiting
- Health checks
