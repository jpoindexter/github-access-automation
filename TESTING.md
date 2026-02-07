# Testing Guide - End-to-End Polar Sandbox Flow

Complete guide for testing the GitHub access automation tool in Polar's sandbox environment.

## Pre-Testing Checklist

- [ ] `.env.local` configured with all variables
- [ ] Neon database tables created
- [ ] GitHub OAuth app created (Settings → Developer settings → OAuth Apps)
- [ ] GitHub personal access token created (Settings → Developer settings → Personal access tokens)
- [ ] Polar webhook configured (Dashboard → Settings → Webhooks)
- [ ] Resend API key configured
- [ ] All npm dependencies installed (`npm install`)
- [ ] Dev server running (`npm run dev`)

## Testing Environments

### Development (Local)

```bash
npm run dev
# Runs on http://localhost:3000
```

### Polar Sandbox

1. Go to https://sandbox.polar.sh/dashboard
2. Use test credentials (create new account)
3. Create test product and checkout

## Step-by-Step Test Flow

### 1. Test GitHub OAuth Flow

**Endpoint:** `GET http://localhost:3000/api/auth/github`

**Expected behavior:**

1. Clicking link redirects to GitHub authorization page
2. GitHub asks for permission to read user email
3. User authorizes
4. Redirected back to `/api/auth/callback`
5. GitHub username + ID stored in httpOnly cookie
6. Redirected to Polar checkout with GitHub username in params

**Test:**

```bash
# Open browser
curl -L http://localhost:3000/api/auth/github
```

**Check cookies:**

```javascript
// In browser console
document.cookie; // Should see: github_user={...}
```

### 2. Test Polar Webhook Signature Verification

**Endpoint:** `POST http://localhost:3000/api/webhooks/polar`

**Test with cURL:**

```bash
# Get webhook secret from .env.local
WEBHOOK_SECRET="your_polar_webhook_secret"

# Create test payload
PAYLOAD='{"type":"order.paid","data":{"id":"test-order-123","status":"paid","amount":9999,"currency":"usd","customer_id":"cust-123","product_id":"prod-123","metadata":{"email":"test@example.com","name":"Test User","github_username":"testuser","github_user_id":12345}}}'

# Calculate HMAC signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)

# Send webhook
curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Expected response:**

```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "customerId": "uuid",
  "invited": true,
  "emailSent": true
}
```

### 3. Test Complete User Flow (Sandbox)

#### A. Start GitHub OAuth

1. Visit `http://localhost:3000/api/auth/github`
2. Authorize with your GitHub account
3. Check browser cookies for `github_user`

#### B. Complete Polar Sandbox Payment

1. You're redirected to Polar sandbox checkout
2. Fill in test payment details:
   - Email: test@example.com
   - Cardholder: Test User
   - Card number: `4242 4242 4242 4242`
   - Expiry: 12/25
   - CVC: 123
3. Click "Pay"

#### C. Verify Webhook Processing

1. Check your email (or Resend logs) for welcome email
2. Verify in GitHub that you're invited to the repo
3. Check database:
   ```bash
   psql $DATABASE_URL
   SELECT * FROM customers WHERE email = 'test@example.com';
   ```

**Database should show:**

- status: 'active'
- invitation_sent_at: (timestamp)
- welcome_email_sent: true
- github_username: (your username)

### 4. Test Error Scenarios

#### A. Invalid Webhook Signature

```bash
curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: invalid_signature" \
  -d '{"type":"order.paid","data":{}}'
```

**Expected:** 401 Unauthorized

#### B. Missing GitHub User Data

```bash
PAYLOAD='{"type":"order.paid","data":{"id":"test-2","status":"paid","amount":9999,"currency":"usd"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)

curl -X POST http://localhost:3000/api/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "x-polar-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Expected:** 400 Bad Request with error message

#### C. User Already Invited

```bash
# Run the same webhook twice with same order ID
# Second request should return: "Customer already processed"
```

### 5. Monitor Logs

**GitHub OAuth logs:**

```bash
# Check for: "GitHub OAuth success for user: ..."
npm run dev | grep "GitHub OAuth"
```

**Webhook processing logs:**

```bash
# Check for: "Webhook processed successfully"
npm run dev | grep "Webhook processed"
```

**Database queries:**

```bash
psql $DATABASE_URL

# View all customers
SELECT id, email, github_username, status, created_at FROM customers;

# View failed invitations
SELECT * FROM customers WHERE invitation_error IS NOT NULL;

# View customers by status
SELECT status, COUNT(*) FROM customers GROUP BY status;
```

### 6. Test GitHub Invitation

After successful webhook, verify GitHub invitation:

1. **Check GitHub Notifications**
   - Go to https://github.com/notifications
   - Should see "Repository invitation" from GITHUB_ORG_OR_USER

2. **Accept Invitation**
   - Click on invitation notification
   - Click "Accept invitation"

3. **Verify Access**
   ```bash
   git clone https://github.com/GITHUB_ORG_OR_USER/GITHUB_REPO.git
   cd GITHUB_REPO
   ```

### 7. Test Email Delivery

**Resend Dashboard:**

1. Go to https://resend.com/emails
2. Filter by your test email
3. Verify email rendered correctly
4. Check links work

**Check email content includes:**

- Customer name
- Repository clone URL
- GitHub repository link
- Getting started instructions

## Common Issues & Solutions

### Issue: Webhook signature invalid

**Cause:** Secret key mismatch or payload encoding

**Solution:**

1. Verify `POLAR_WEBHOOK_SECRET` in `.env.local`
2. Ensure payload is raw body (not stringified)
3. Check signature calculation uses SHA256

### Issue: GitHub invitation fails

**Causes:**

- Token doesn't have `repo` scope
- User already a collaborator
- Invalid repository name

**Solution:**

1. Verify `GITHUB_TOKEN` has `repo` scope
2. Check `GITHUB_ORG_OR_USER` and `GITHUB_REPO` are correct
3. Test with: `curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user`

### Issue: Welcome email not sent

**Causes:**

- Invalid `RESEND_API_KEY`
- Email domain not verified in Resend
- Typo in `RESEND_FROM_EMAIL`

**Solution:**

1. Test Resend API: `curl -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/emails`
2. Verify sender domain in Resend dashboard
3. Check email address matches verified domain

### Issue: Database connection fails

**Cause:** `DATABASE_URL` incorrect or database down

**Solution:**

```bash
# Test connection
psql $DATABASE_URL -c "SELECT version();"

# Check Neon dashboard for status
```

## Performance Testing

### Load Test (Optional)

```bash
# Install artillery
npm install -g artillery

# Create test file: load-test.yml
# Run: artillery run load-test.yml
```

## Checklist Before Production

- [ ] All tests pass locally
- [ ] GitHub invitations work
- [ ] Emails deliver correctly
- [ ] Database stores data properly
- [ ] Error handling works
- [ ] Logs are clean (no errors)
- [ ] Webhook signature verification passes
- [ ] Customer data is complete and correct
- [ ] Welcome email links work
- [ ] GitHub clone URLs are correct
- [ ] No hardcoded localhost URLs
- [ ] Environment variables documented

## Next Steps

Once testing passes:

1. Deploy to production server (Vercel, Railway, etc.)
2. Update Polar webhook URL to production domain
3. Test with real payment in Polar production
4. Monitor logs for first few transactions
