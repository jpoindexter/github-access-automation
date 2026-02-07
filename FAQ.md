# Frequently Asked Questions (FAQ)

Common questions about the GitHub Access Automation tool.

## Table of Contents

- [General Questions](#general-questions)
- [Technical Questions](#technical-questions)
- [Security Questions](#security-questions)
- [Payment Questions](#payment-questions)
- [Integration Questions](#integration-questions)
- [Troubleshooting](#troubleshooting)

---

## General Questions

### What is GitHub Access Automation?

GitHub Access Automation is a Next.js application that automatically grants customers access to your private GitHub repository after they complete a purchase through Polar.sh. It handles the entire flow: GitHub OAuth, payment processing, repository invitations, and welcome emails.

**Perfect for:**

- Selling access to boilerplate code
- Distributing starter kits
- Providing course materials
- Sharing templates and tools

### Who is this for?

- **Solo founders** selling boilerplates or starter kits
- **Course creators** providing code to students
- **Agencies** distributing templates to clients
- **Developers** monetizing code libraries
- **Content creators** offering premium code resources

### How does it work?

1. Customer clicks "Buy" button on your site
2. GitHub OAuth popup asks for username authorization
3. Customer redirects to Polar checkout with GitHub username
4. Customer completes payment
5. Polar webhook triggers automation
6. Customer receives GitHub repository invitation
7. Welcome email sent with clone instructions
8. Customer has read-only access to your private repository

### How much does it cost?

**The tool itself is free and open-source (MIT license).**

**Costs you'll incur:**

- **Polar.sh**: 5% + payment processing fees (Stripe/PayPal)
- **Database**: Free tier available (Neon, Supabase) or ~$5/month
- **Hosting**: Free tier available (Vercel, Railway) or ~$5-20/month
- **Email**: Free tier (Resend: 3,000 emails/month) or ~$10/month
- **Domain** (optional): ~$10-15/year

**Total estimated cost**: $0-30/month depending on scale.

### Can I use this without Polar.sh?

Yes, but you'll need to modify the webhook handler. The current version is optimized for Polar.sh webhooks. You can adapt it for:

- Stripe Checkout
- Gumroad
- Lemon Squeezy
- Paddle
- Any platform that sends webhooks

See `src/app/api/webhooks/polar/route.ts` for the webhook handler implementation.

### Is this a SaaS or a boilerplate?

**It's a boilerplate/template.** You clone the repository, configure it with your credentials, and deploy it to your own infrastructure. You have full control over the code and can modify it as needed.

### Do I need coding experience?

**Basic technical knowledge is helpful but not required.** You should be comfortable with:

- Using the command line
- Setting environment variables
- Deploying to Vercel/Railway (or following deployment tutorials)

If you can follow the README instructions, you can set this up.

---

## Technical Questions

### What tech stack does it use?

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5.x (strict mode)
- **Database**: PostgreSQL (via Neon, Supabase, or self-hosted)
- **GitHub API**: Octokit REST
- **Payments**: Polar.sh webhooks
- **Email**: Resend
- **Validation**: Zod
- **Testing**: Vitest

### What are the system requirements?

- **Node.js**: 18.0.0 or higher
- **PostgreSQL**: 15 or higher
- **GitHub**: Private repository with admin access
- **Polar.sh**: Account with product created

### How many customers can it handle?

**The bottleneck is GitHub API rate limits:**

- **5,000 requests per hour** with authenticated requests
- **Each invitation = 1 request**
- **Theoretical max**: ~120,000 customers/day

**In practice:**

- Most indie products: <100 customers/day
- Database can handle millions of records
- Horizontal scaling possible if needed

### Can I customize the welcome email?

Yes! Edit `src/lib/email.ts`:

```typescript
export async function sendWelcomeEmail(
  email: string,
  name: string,
  repoUrl: string,
  cloneUrl: string
) {
  // Customize email HTML/text here
  const html = `
    <h1>Welcome, ${name}!</h1>
    <p>Your custom message...</p>
  `;

  // ...rest of function
}
```

### Can I add custom checkout fields?

Yes! Polar.sh supports custom checkout fields. To collect them:

1. **Add fields in Polar dashboard**:
   - Go to Products → Edit → Checkout fields
   - Add custom fields (company, use_case, etc.)

2. **Update database schema**:

   ```sql
   ALTER TABLE customers ADD COLUMN custom_field VARCHAR(255);
   ```

3. **Update webhook handler**:
   ```typescript
   // src/app/api/webhooks/polar/route.ts
   const customField = order.metadata?.custom_field;
   ```

### How do I change the repository customers get access to?

Set these environment variables:

```bash
GITHUB_ORG_OR_USER="your-github-username"  # or org name
GITHUB_REPO="your-private-repo"
```

You can also modify `src/lib/github-api.ts` to grant access to multiple repositories.

### Can I give customers different permission levels?

Yes! Modify `src/lib/github-api.ts`:

```typescript
// Default: read-only access
await inviteToRepository(username, 'pull');

// Read/write access
await inviteToRepository(username, 'push');

// Admin access (not recommended)
await inviteToRepository(username, 'admin');
```

You can also conditionally grant different permissions based on product tier:

```typescript
const permission = productId === 'premium' ? 'push' : 'pull';
await inviteToRepository(username, permission);
```

### Does it support refunds?

Not automatically, but you can implement this:

1. **Detect refund webhook** from Polar:

   ```typescript
   if (webhook.type === 'order.refunded') {
     await removeFromRepository(githubUsername);
   }
   ```

2. **Manual revocation**:
   ```typescript
   import { removeFromRepository } from '@/lib/github-api';
   await removeFromRepository('username-to-remove');
   ```

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#handling-refunds) for complete implementation.

### How do I track analytics?

**Built-in tracking via database:**

```sql
-- Total customers
SELECT COUNT(*) FROM customers;

-- Customers by day
SELECT DATE(created_at) as date, COUNT(*) as count
FROM customers
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Revenue by day
SELECT DATE(created_at) as date, SUM(amount_paid/100) as revenue
FROM customers
GROUP BY DATE(created_at);

-- Conversion funnel
SELECT
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM customers;
```

**External analytics:**

- Polar.sh has built-in analytics
- Add Google Analytics to landing page
- Use PostHog/Mixpanel for advanced tracking

### Can I use this with GitHub Organizations?

Yes! Set `GITHUB_ORG_OR_USER` to your organization name:

```bash
GITHUB_ORG_OR_USER="your-org-name"
GITHUB_REPO="private-repo"
```

**Note**: The GitHub token must have admin access to the organization repository.

---

## Security Questions

### How secure is the webhook endpoint?

**Very secure.** We implement multiple security layers:

1. **HMAC-SHA256 signature verification**:
   - Every webhook is cryptographically signed by Polar
   - We verify the signature before processing
   - Invalid signatures are rejected (401 Unauthorized)

2. **HTTPS required**:
   - All production deployments use SSL/TLS
   - Webhook payloads encrypted in transit

3. **Idempotency**:
   - Duplicate webhooks are detected via `order_id`
   - Prevents double-processing

4. **Environment isolation**:
   - Secrets stored as environment variables
   - Never committed to version control

See [SECURITY.md](SECURITY.md) for complete security documentation.

### How is customer data stored?

**Customer data is stored in PostgreSQL with:**

- **Encryption at rest**: Database provider handles this (Neon, Supabase)
- **Encryption in transit**: SSL connections enforced
- **Access control**: Database credentials stored as secrets
- **Minimal data collection**: Only collect necessary fields
- **PII redaction in logs**: Sensitive data never logged

**Data collected:**

- Email (for communication)
- Name (for personalization)
- GitHub username (for invitations)
- Payment metadata (for records)
- Optional: company, use case, referral source

**Data NOT collected:**

- Credit card numbers (handled by Polar/Stripe)
- Passwords (OAuth only)
- Browsing history
- Personal identifiers beyond email

### Can customers access my code history?

**No.** Customers get **read-only access** to the repository, which means:

- ✅ Can clone the repository
- ✅ Can view current code
- ✅ Can view commit history
- ✅ Can view branches
- ❌ Cannot push changes
- ❌ Cannot create branches
- ❌ Cannot modify code
- ❌ Cannot delete repository

**Repository visibility:**

- Private repository = only invited collaborators can see it
- Public repository = anyone can see it (not recommended for paid products)

### What if my GitHub token is compromised?

**Immediate actions:**

1. **Revoke the token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Click "Delete" on the compromised token

2. **Generate new token**:
   - Create new token with `repo` scope only
   - Update `GITHUB_TOKEN` environment variable
   - Redeploy application

3. **Audit repository access**:

   ```bash
   # List all collaborators
   gh api repos/OWNER/REPO/collaborators
   ```

4. **Monitor for suspicious activity**:
   - Check repository activity logs
   - Review recent invitations
   - Look for unauthorized access

**Prevention:**

- Use token with minimal required scopes (`repo` only)
- Rotate tokens periodically (every 90 days)
- Never commit tokens to version control
- Use separate token for each environment

### Is OAuth safe?

**Yes.** We implement OAuth 2.0 with best practices:

- **CSRF protection**: State parameter validation
- **Timing-safe comparison**: Prevents timing attacks
- **httpOnly cookies**: JavaScript cannot access tokens
- **Short expiration**: OAuth session expires in 15 minutes
- **Minimal scopes**: Only request `user:email` scope

**What we do NOT do:**

- Store GitHub access tokens (only use for initial auth)
- Request write permissions
- Access private user data beyond email

### What happens if your server is hacked?

**Limited damage due to architecture:**

1. **No payment data stored**: Polar/Stripe handles payments
2. **No passwords stored**: OAuth-only authentication
3. **Database contains**: Email, GitHub username, order metadata
4. **GitHub token exposure**: Could grant repository access
   - Mitigation: Token has minimal scopes
   - Response: Revoke token immediately

**Response plan:**

1. Take server offline
2. Revoke GitHub token
3. Reset all environment variables
4. Audit database for unauthorized changes
5. Notify customers (if PII accessed)
6. Restore from clean backup

**Best practices:**

- Enable 2FA on all accounts (GitHub, Polar, Hosting)
- Use strong, unique passwords
- Keep dependencies updated (`npm audit`)
- Monitor security advisories
- Regular backups

---

## Payment Questions

### What payment methods are supported?

**Through Polar.sh:**

- Credit/debit cards (Visa, Mastercard, Amex)
- Apple Pay
- Google Pay
- Bank transfers (for some regions)
- PayPal (if enabled)

**Polar.sh handles all payment processing.** You don't need a Stripe account (Polar manages it).

### How do refunds work?

**Manual process** (automatic refund detection not implemented by default):

1. **Customer requests refund**:
   - They contact you via support email
   - Or request through Polar dashboard

2. **Process refund in Polar**:
   - Go to Polar dashboard → Orders
   - Find order and click "Refund"
   - Confirm refund

3. **Remove repository access**:

   ```bash
   # Option A: Direct API call
   curl -X DELETE \
     -H "Authorization: Bearer $GITHUB_TOKEN" \
     "https://api.github.com/repos/OWNER/REPO/collaborators/USERNAME"

   # Option B: Use GitHub UI
   # Repository → Settings → Collaborators → Remove user
   ```

4. **Update database**:
   ```sql
   UPDATE customers
   SET status = 'refunded', updated_at = NOW()
   WHERE polar_order_id = 'order_id';
   ```

**To automate refunds**, implement `order.refunded` webhook:

```typescript
// src/app/api/webhooks/polar/route.ts
if (webhook.type === 'order.refunded') {
  const customer = await getCustomerByOrderId(order.id);
  await removeFromRepository(customer.github_username);
  await updateCustomerStatus(customer.id, 'refunded');
}
```

### What about chargebacks?

**Chargebacks are tracked in the database:**

```sql
-- Customers table has chargeback fields
chargebacked BOOLEAN DEFAULT FALSE
chargeback_date TIMESTAMP
payment_dispute_status VARCHAR(50)
```

**Webhook implementation** (if Polar sends chargeback events):

```typescript
if (webhook.type === 'order.disputed') {
  await recordChargeback(customerId);
  await removeFromRepository(githubUsername);
}
```

**Manual handling:**

1. Polar notifies you of chargeback
2. Remove repository access immediately
3. Update database with chargeback status
4. Contest chargeback if fraudulent (via Polar dashboard)

### Can I offer different pricing tiers?

**Yes!** Create multiple products in Polar:

**Example tiers:**

- **Basic** ($49) → Read-only access to main branch
- **Pro** ($99) → Access to main + examples branches
- **Enterprise** ($299) → Write access + priority support

**Implementation:**

```typescript
// src/app/api/webhooks/polar/route.ts
const productId = order.product_id;

if (productId === 'basic-tier-id') {
  await inviteToRepository(username, 'pull'); // Read-only
} else if (productId === 'pro-tier-id') {
  await inviteToRepository(username, 'push'); // Read/write
  // Also invite to examples repo
  await inviteToRepository(username, 'pull', 'examples-repo');
}
```

### Do you take a cut of my sales?

**No.** This is open-source software (MIT license). You pay:

- Polar.sh fees (5% + payment processing)
- Your infrastructure costs (database, hosting, email)

**No revenue share with us.**

### What currency is supported?

**All major currencies through Polar.sh:**

- USD (US Dollar)
- EUR (Euro)
- GBP (British Pound)
- CAD (Canadian Dollar)
- AUD (Australian Dollar)
- And 100+ others

Set currency in Polar product settings.

---

## Integration Questions

### Can I use this with Stripe directly?

Yes, but you'll need to modify the webhook handler. Current implementation is for Polar.sh webhooks.

**To integrate Stripe:**

1. Install Stripe SDK:

   ```bash
   npm install stripe
   ```

2. Create Stripe webhook handler:

   ```typescript
   // src/app/api/webhooks/stripe/route.ts
   import Stripe from 'stripe';

   export async function POST(req: Request) {
     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
     const sig = req.headers.get('stripe-signature')!;
     const body = await req.text();

     const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

     if (event.type === 'checkout.session.completed') {
       const session = event.data.object;
       // Extract customer data and process invitation
     }

     return Response.json({ received: true });
   }
   ```

3. Update webhook URL in Stripe dashboard

### Does it work with Gumroad?

Yes, with modifications. Gumroad sends different webhook payloads.

**Gumroad webhook example:**

```typescript
// src/app/api/webhooks/gumroad/route.ts
export async function POST(req: Request) {
  const data = await req.formData();

  const email = data.get('email') as string;
  const name = data.get('full_name') as string;
  const productId = data.get('product_id') as string;
  const saleId = data.get('sale_id') as string;

  // You'd need to collect GitHub username via Gumroad custom fields
  const githubUsername = data.get('github_username') as string;

  // Process invitation same as Polar
  await createCustomer({...});
  await inviteToRepository(githubUsername);

  return Response.json({ success: true });
}
```

### Can I integrate with my existing Next.js app?

**Yes!** Copy these files into your Next.js project:

```
Your Next.js App
├── app/
│   └── api/
│       ├── auth/
│       │   ├── github/route.ts         (copy)
│       │   └── callback/route.ts       (copy)
│       └── webhooks/
│           └── polar/route.ts          (copy)
├── lib/
│   ├── db.ts                           (copy + modify)
│   ├── github-oauth.ts                 (copy)
│   ├── github-api.ts                   (copy)
│   ├── polar-webhook.ts                (copy)
│   └── email.ts                        (copy)
```

Then:

1. Install dependencies: `@octokit/rest`, `pg`, `resend`, `zod`
2. Add environment variables to your `.env.local`
3. Run database migrations
4. Update your "Buy" button to point to `/api/auth/github`

### Can I use a different email provider?

**Yes!** Replace Resend with:

**SendGrid:**

```typescript
// src/lib/email.ts
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendWelcomeEmail(email: string, name: string, repoUrl: string) {
  await sgMail.send({
    to: email,
    from: process.env.FROM_EMAIL!,
    subject: 'Welcome!',
    html: `<p>Welcome, ${name}!</p>`,
  });
}
```

**Mailgun, Postmark, AWS SES** work similarly. Just update the email sending logic.

### Can customers get access to multiple repositories?

**Yes!** Modify the webhook handler:

```typescript
// src/app/api/webhooks/polar/route.ts
await inviteToRepository(username, 'pull', 'main-repo');
await inviteToRepository(username, 'pull', 'examples-repo');
await inviteToRepository(username, 'pull', 'docs-repo');
```

Or create a helper function:

```typescript
async function grantFullAccess(username: string) {
  const repos = ['main-repo', 'examples', 'templates', 'docs'];

  await Promise.all(repos.map((repo) => inviteToRepository(username, 'pull', repo)));
}
```

---

## Troubleshooting

### Why didn't the customer receive a GitHub invitation?

**Common causes:**

1. **Customer doesn't have a GitHub account**:
   - Solution: They need to create one first

2. **GitHub username was incorrect**:
   - Check database: `SELECT github_username FROM customers WHERE email = 'customer@email.com'`
   - If wrong, manually invite via GitHub UI

3. **Customer already has access**:
   - GitHub API returns error if user is already a collaborator
   - Check repository collaborators list

4. **GitHub token expired or invalid**:
   - Test token: `curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user`
   - Generate new token if needed

5. **Repository is public**:
   - Invitations only work for private repositories
   - Make repository private

**Debug steps:**

```bash
# Check database record
psql $DATABASE_URL -c "SELECT * FROM customers WHERE email = 'customer@email.com';"

# Check invitation_error field
# If not null, that's the error message

# Manually invite via Octokit
curl -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/OWNER/REPO/collaborators/USERNAME" \
  -d '{"permission":"pull"}'
```

### Why didn't the customer receive a welcome email?

**Common causes:**

1. **Resend API key invalid**:
   - Test: `curl -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/emails`

2. **Email domain not verified**:
   - Go to Resend dashboard → Domains
   - Verify your sending domain

3. **Email went to spam**:
   - Check customer's spam folder
   - Verify SPF/DKIM records in Resend

4. **Email address invalid**:
   - Check database: `SELECT email FROM customers WHERE id = 'customer_id'`
   - Validate email format

**Check email logs:**

- Resend dashboard → Emails
- Filter by recipient email
- Check delivery status

### How do I resend a welcome email?

**Manual resend:**

```typescript
// Create a script: scripts/resend-welcome.ts
import { sendWelcomeEmail } from '@/lib/email';
import { pool } from '@/lib/db';

const customerId = 'customer-uuid';

const result = await pool.query('SELECT * FROM customers WHERE id = $1', [customerId]);

const customer = result.rows[0];

await sendWelcomeEmail(
  customer.email,
  customer.name,
  `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}`,
  `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}.git`
);

console.log('Email resent to', customer.email);
```

```bash
# Run script
npx tsx scripts/resend-welcome.ts
```

### How do I test the complete flow locally?

See [TESTING.md](TESTING.md) for complete testing guide.

**Quick test:**

1. Start dev server: `npm run dev`
2. Visit `http://localhost:3000/api/auth/github`
3. Authorize with GitHub
4. Generate test webhook (see TESTING.md)
5. Check database for new customer record
6. Verify GitHub invitation sent
7. Check Resend for welcome email

### The webhook signature verification keeps failing

**Troubleshooting steps:**

1. **Verify secret is correct**:

   ```bash
   echo $POLAR_WEBHOOK_SECRET
   # Should match Polar dashboard exactly
   ```

2. **Check webhook URL**:
   - Must be exactly `/api/webhooks/polar`
   - Must use HTTPS in production

3. **Verify payload is raw body**:
   - Next.js App Router uses raw body by default
   - Don't JSON.parse() before verification

4. **Test signature generation**:

   ```bash
   PAYLOAD='{"type":"order.paid","data":{}}'
   SECRET="polar_whs_..."
   SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
   echo $SIGNATURE
   ```

5. **Check Polar webhook logs**:
   - Go to Polar dashboard → Webhooks
   - Check recent deliveries
   - Look for error responses

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#webhook-signature-verification-fails) for more details.

---

## Still Have Questions?

- **Documentation**: See `/docs` folder for detailed guides
- **GitHub Issues**: Report bugs or request features
- **Email Support**: jason@example.com
- **Community**: Join discussions in GitHub Discussions

**Built with Next.js 16, TypeScript, and Polar.sh**
