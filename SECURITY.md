# Security Guide - GitHub Access Automation

Complete security architecture for the GitHub access automation tool.

## Repository Security Model

### Access Control Hierarchy

```
Your GitHub Account (Owner)
├── Personal Access Token (GITHUB_TOKEN)
│   └── Read/Write access to boilerplate repo
│
└── Boilerplate Repository (PRIVATE)
    ├── Branch Protection on main
    │   ├── Enforce admin approval
    │   ├── No force pushes
    │   └── No branch deletions
    │
    └── Customers (Read-Only Collaborators)
        ├── Permission: 'pull'
        ├── Can CLONE
        ├── Can PULL updates
        ├── Cannot PUSH
        └── Cannot DELETE
```

### Repository Configuration Checklist

**Your boilerplate repo MUST be:**

- [ ] **Visibility: PRIVATE**
  - Only you can see it
  - Customers invited individually
  - No accidental public exposure

- [ ] **Branch Protection: ENABLED on main**
  ```bash
  # Verify with:
  gh api repos/OWNER/REPO/branches/main/protection
  ```

- [ ] **Enforce Admin: YES**
  - Only repository owner (you) can push to main
  - All others blocked, even with write access

- [ ] **Force Push: DISABLED**
  - Prevents accidental history rewriting
  - Protects customer clones from corruption

- [ ] **Branch Deletion: DISABLED**
  - Prevents accidental main branch deletion
  - Protects repository stability

---

## Permission Levels Explained

### What 'pull' (Read-Only) Means

When a customer is invited with `permission: 'pull'`:

| Action | Allowed? | Why |
|--------|----------|-----|
| Clone repo | ✅ YES | They need the code |
| Pull updates | ✅ YES | They need latest version |
| View code | ✅ YES | They own a license |
| Create local branches | ✅ YES | On their machine only |
| Push to main | ❌ NO | Branch protection blocks |
| Create pull requests | ❌ NO | No write permission |
| Delete branches | ❌ NO | Read-only access |
| Modify issues/PRs | ❌ NO | No write permission |
| Access Settings | ❌ NO | No admin access |

---

## Webhook Security

### Signature Verification

Every webhook from Polar is HMAC-SHA256 signed with your webhook secret.

**Verification Flow:**
```
Polar sends: {payload} + X-Polar-Signature header
↓
Our backend calculates: HMAC-SHA256(payload, POLAR_WEBHOOK_SECRET)
↓
Compares: calculated_hash == received_signature
↓
Result: Accept webhook OR reject with 401
```

**Implementation:** `src/lib/polar-webhook.ts`

### Webhook Secret Rotation

**Important:** If your webhook secret is exposed:

1. Go to Polar Dashboard → Settings → Webhooks
2. Regenerate webhook secret
3. Update `.env.local` with new secret
4. No existing webhooks will be processed until updated
5. Redeploy to production

---

## Environment Variables Security

### What Each Variable Controls

| Variable | Impact | Risk Level |
|----------|--------|-----------|
| `GITHUB_TOKEN` | Can add collaborators to your repo | 🔴 CRITICAL |
| `POLAR_WEBHOOK_SECRET` | Validates webhook authenticity | 🔴 CRITICAL |
| `DATABASE_URL` | Access to all customer data | 🔴 CRITICAL |
| `RESEND_API_KEY` | Can send emails as you | 🟡 HIGH |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth identity verification | 🟡 HIGH |

### Best Practices

**NEVER:**
- ❌ Commit `.env.local` to git
- ❌ Log environment variables
- ❌ Share variables in Slack/email
- ❌ Use same variables across environments

**DO:**
- ✅ Use `.env.example` as template
- ✅ Store secrets in production environment manager (Vercel/Railway)
- ✅ Rotate secrets regularly
- ✅ Use separate credentials per environment

---

## Customer Data Security

### What We Collect

```
customers table
├── PII: name, email, company
├── GitHub: username, email, user_id
├── Payment: order_id, amount, currency, payment_method
├── Tracking: status, invitation_sent_at, welcome_email_sent
└── Admin: internal_notes, tags, chargebacks, disputes
```

### Data Protection

- **Database:** Neon PostgreSQL (encrypted at rest)
- **Connection:** SSL/TLS required
- **Backups:** Automatic daily backups
- **Retention:** Keep indefinitely (needed for chargebacks)
- **Deletion:** No automatic deletion (keep for legal/tax)

### Access Control

Only the backend can access:
- ✅ Neon database (via CONNECTION_URL)
- ✅ Polar webhooks (via WEBHOOK_SECRET)
- ✅ GitHub API (via GITHUB_TOKEN)

Frontend cannot:
- ❌ Query database directly
- ❌ Access payment details
- ❌ See other customers' data

---

## GitHub Invitation Security

### Threat Model

**Threat:** What if someone tries to exploit the GitHub invitation?

**Attack Vectors:**

1. **Webhook Replay**
   - Attacker re-sends same order webhook multiple times
   - **Mitigation:** Check if customer exists before creating
   - **Code:** `getCustomerByOrderId()` prevents duplicates

2. **Webhook Tampering**
   - Attacker modifies webhook payload
   - **Mitigation:** HMAC signature verification
   - **Code:** `verifyPolarWebhookSignature()` rejects unsigned

3. **Invalid GitHub Username**
   - Attacker sends webhook with fake GitHub username
   - **Mitigation:** GitHub API returns error, we catch it
   - **Code:** `invitation_error` field tracks failures

4. **Man-in-the-Middle**
   - Attacker intercepts webhook
   - **Mitigation:** HTTPS + signature verification
   - **Code:** GitHub only sends to HTTPS endpoints

### Security Implementation

```typescript
// 1. Verify webhook signature
if (!signature || !verifyPolarWebhookSignature(body, signature)) {
  return 401 Unauthorized; // ✅ Reject forged webhooks
}

// 2. Check for duplicate orders
const existing = await db.getCustomerByOrderId(order.id);
if (existing) {
  return 'Already processed'; // ✅ Prevent replay attacks
}

// 3. Create customer record
const customer = await db.createCustomer(data);

// 4. Attempt GitHub invitation
const result = await inviteToRepository(githubUsername);

// 5. Handle failures gracefully
if (!result.success) {
  recordError(customer.id, result.error); // ✅ Log for investigation
  sendAdminAlert(result.error); // ✅ Notify team
}

// 6. Update status and send email
await db.updateCustomerStatus(customer.id, 'active');
```

---

## Production Deployment Security

### Pre-Launch Checklist

- [ ] All environment variables set in production
- [ ] `GITHUB_REPO` is PRIVATE (not public)
- [ ] Branch protection enabled on main
- [ ] Webhook secret matches Polar dashboard
- [ ] HTTPS enabled (required by GitHub)
- [ ] Database backups enabled
- [ ] Error alerting configured (email address)
- [ ] Rate limiting enabled if needed
- [ ] Logs retention policy set
- [ ] GDPR/Privacy compliance reviewed

### Production Environment Variables

Set these in your deployment platform (Vercel, Railway, etc.):

```bash
# Required (secrets)
GITHUB_TOKEN=ghp_...
POLAR_WEBHOOK_SECRET=polar_whs_...
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=... (if using sessions)

# GitHub OAuth
GITHUB_OAUTH_CLIENT_ID=Ov23li...
GITHUB_OAUTH_CLIENT_SECRET=...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Configuration
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

**NEVER:**
- Store secrets in code
- Use same tokens across environments
- Log secrets to stdout
- Share through version control

---

## Incident Response

### If Webhook Secret is Compromised

1. **Immediately:**
   ```bash
   # Stop the service temporarily
   Disable webhook endpoint OR rotate secret
   ```

2. **On Polar Dashboard:**
   - Settings → Webhooks → Regenerate Secret
   - Update your `.env` with new secret

3. **Verify:**
   ```bash
   # Test new secret works
   npm run test -- webhook.test.ts
   ```

4. **Deploy:**
   - Push updated environment variables
   - Redeploy application
   - Monitor logs for new webhooks

### If GitHub Token is Compromised

1. **Immediately:**
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Delete the compromised token

2. **Create New Token:**
   - Scopes: `repo` (minimum)
   - Name it clearly: `fabrk-access-automation-2025`

3. **Update Application:**
   - Update `.env.local` with new token
   - Redeploy to production

4. **Audit:**
   - Check GitHub audit log for unexpected invitations
   - Verify who was added to the repo
   - Remove unauthorized users if needed

### If Database is Compromised

1. **Assess:**
   - What data was accessed?
   - When did the breach occur?
   - How many customers affected?

2. **Immediate Actions:**
   - Rotate database credentials
   - Create new database user with limited permissions
   - Enable all logging/monitoring

3. **Notify:**
   - Contact Neon support
   - Document incident for GDPR compliance
   - Notify affected users if needed

4. **Prevent Recurrence:**
   - Review database access logs
   - Update security group rules
   - Enable audit logging

---

## Compliance & Legal

### GDPR Compliance

We collect and store personal data:
- Name, email, company (from Polar)
- GitHub username and ID (from GitHub)

**Your obligations:**
- ✅ Privacy policy discloses what data you collect
- ✅ Data is only used for GitHub invitations
- ✅ Data is not sold or shared
- ✅ Users can request deletion
- ✅ Implement data retention policy

### License Enforcement

Each customer's access is tied to:
- GitHub account (username/ID)
- Polar order (order_id)
- Our database record (customer_id)

**You can:**
- ✅ Remove them from the repo if they refund/chargeback
- ✅ Track who has access via database
- ✅ Audit GitHub collaborators anytime
- ✅ Require license acceptance

---

## Security Checklist

**Before Deploying:**
- [ ] Repository is PRIVATE
- [ ] Branch protection enabled on main
- [ ] Webhook signature verification implemented
- [ ] Environment variables in `.env.example` (no secrets)
- [ ] Database backups enabled
- [ ] HTTPS enabled for webhook endpoint
- [ ] Rate limiting configured
- [ ] Error logging and alerting set up
- [ ] GDPR privacy policy updated
- [ ] Tested webhook flow with Polar sandbox

**After Deploying:**
- [ ] Monitor logs for errors
- [ ] Verify first few webhooks succeed
- [ ] Test GitHub invitation with test customer
- [ ] Check database has customer records
- [ ] Verify welcome emails sent
- [ ] Monitor for security incidents

---

## Getting Help

**If something seems insecure:**
1. Check this guide
2. Review code in `src/lib/`
3. Enable debug logging
4. Contact support with full error message

**Red Flags:**
- ❌ Webhook signature mismatch (401 errors)
- ❌ GitHub invitation failures
- ❌ Database connection errors
- ❌ Missing environment variables

These indicate security issues that need immediate attention.

---

**Last Updated:** 2025-12-16
**Security Level:** High
**Status:** Production Ready
