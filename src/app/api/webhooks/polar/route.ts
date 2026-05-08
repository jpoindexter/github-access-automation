/**
 * Polar Webhook Handler
 * POST /api/webhooks/polar
 * Processes payment notifications from Polar
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyPolarWebhookSignature,
  parsePolarWebhook,
  isPaidOrderEvent,
  extractCustomerDataFromWebhook,
  validateWebhookTimestamp,
} from '@/lib/polar-webhook';
import { inviteToRepository, getRepositoryCloneUrl } from '@/lib/github-api';
import { sendWelcomeEmail, sendErrorNotification } from '@/lib/email';
import { db } from '@/lib/db';
import { webhookLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();

    // Check various possible header names for the signature
    const signature =
      request.headers.get('webhook-signature') ||
      request.headers.get('polar-webhook-signature') ||
      request.headers.get('x-polar-signature');

    const webhookId = request.headers.get('webhook-id');
    const webhookTimestamp = request.headers.get('webhook-timestamp');

    // Verify webhook signature
    const isValidSignature =
      signature &&
      verifyPolarWebhookSignature(
        body,
        signature,
        webhookId || undefined,
        webhookTimestamp || undefined
      );

    if (!isValidSignature) {
      webhookLogger.warn('Invalid Polar webhook signature', {
        hasSignature: !!signature,
        signatureHeader: signature ? 'present' : 'missing',
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse webhook payload — signature verified above
    const webhook = parsePolarWebhook(body);

    // Validate timestamp to prevent replay attacks
    if (webhook.timestamp && !validateWebhookTimestamp(webhook.timestamp)) {
      webhookLogger.warn('Webhook timestamp validation failed (potential replay attack)', {
        timestamp: webhook.timestamp,
        type: webhook.type,
      });
      return NextResponse.json({ error: 'Webhook expired or invalid timestamp' }, { status: 400 });
    }

    // Only process paid orders
    if (!isPaidOrderEvent(webhook)) {
      webhookLogger.debug('Skipping non-paid webhook event', { type: webhook.type });
      return NextResponse.json({ success: true, skipped: true });
    }

    const order = webhook.data;

    // Check for duplicate webhook delivery (idempotency guard)
    const existingByOrder = await db.query(
      'SELECT id FROM customers WHERE polar_order_id = $1 LIMIT 1',
      [order.id]
    );
    if (existingByOrder.rows.length > 0) {
      webhookLogger.info('Duplicate webhook - order already processed', { orderId: order.id });
      return NextResponse.json({ success: true, deduplicated: true });
    }

    // Extract customer data from webhook
    const customerData = extractCustomerDataFromWebhook(order);
    webhookLogger.info('DEBUG: Customer Email for creation', { email: customerData.email });

    // Get GitHub username from webhook metadata or custom_field_data
    // Polar puts "Checkout Fields" into custom_field_data, "Metadata" into metadata (from API)
    const metadata = order.metadata || {};
    const customFieldData = order.custom_field_data || {};

    // DEBUG: Log full metadata to debug missing fields
    webhookLogger.info('DEBUG: Received webhook data', {
      metadata,
      customFieldData,
      orderId: order.id,
    });

    // Handle string or unknown type for metadata values
    // Check both new (short) and old keys for backward compatibility
    // Check both metadata (API set) and custom_field_data (User entered)
    const githubUsername = (customFieldData.gh_username ||
      customFieldData.github_username ||
      metadata.gh_username ||
      metadata.github_username) as string | undefined;

    const githubUserId = (customFieldData.gh_user_id ||
      customFieldData.github_user_id ||
      metadata.gh_user_id ||
      metadata.github_user_id) as string | undefined;

    // Resolve verified GitHub username from OAuth session (identity binding)
    const sessionId = (customFieldData.session_id || metadata.session_id) as string | undefined;
    let verifiedUsername: string | undefined;
    if (sessionId) {
      try {
        const oauthSession = await db.getOAuthSession(sessionId);
        if (oauthSession && new Date(oauthSession.expires_at) > new Date()) {
          verifiedUsername = oauthSession.github_username;
          await db.deleteOAuthSession(sessionId); // consume — one-time use
        } else {
          webhookLogger.warn('OAuth session expired or not found', {
            sessionId,
            orderId: order.id,
          });
        }
      } catch (err) {
        webhookLogger.error('Failed to look up OAuth session', err);
      }
    }

    // Use server-verified username if available; fall back with warning
    const resolvedGithubUsername = verifiedUsername ?? githubUsername;
    if (!verifiedUsername && githubUsername) {
      webhookLogger.warn(
        'Using unverified GitHub username from checkout field — no valid OAuth session',
        { orderId: order.id, githubUsername }
      );
    }

    // Only Username is strictly required for invitation
    if (!resolvedGithubUsername) {
      webhookLogger.error('Missing GitHub username in webhook metadata', undefined, {
        orderId: order.id,
        hasMetadata: !!metadata || !!customFieldData ? 'yes' : 'no',
        metadataKeys: Object.keys(metadata || {}).concat(Object.keys(customFieldData || {})),
      });

      await sendErrorNotification(
        'Missing GitHub Username',
        'Missing GitHub username in webhook metadata. Check logs for details.',
        { orderId: order.id, hasMetadata: !!metadata || !!customFieldData ? 'yes' : 'no' }
      );

      return NextResponse.json({ error: 'Missing GitHub username' }, { status: 400 });
    }

    // Check if customer already exists
    // ...
    // Create customer in database
    const customer = await db.createCustomer({
      name: customerData.name || resolvedGithubUsername,
      email: customerData.email,
      company: customerData.company,
      use_case: customerData.useCase,
      referral_source: customerData.referralSource,
      newsletter_opted_in: customerData.newsletterOptedIn ?? false,
      github_username: resolvedGithubUsername,
      github_email: customerData.email, // Use customer email for github_email
      github_user_id: parseInt(githubUserId || '0', 10), // Ensure it's a number, default to 0
      polar_order_id: order.id,
      polar_customer_id: order.customer_id,
      amount_paid: order.amount,
      currency: order.currency,
      payment_method: (metadata.payment_method || customFieldData.payment_method) as
        | string
        | undefined,
      product_id: order.product_id,
      discount_id: order.discount_id,
      promo_code_used: customerData.promo_code,
    });

    webhookLogger.info('Created customer', { customerId: customer.id, orderId: order.id });

    // Invite to GitHub repository
    const inviteResult = await inviteToRepository(resolvedGithubUsername, 'pull');

    if (!inviteResult.success) {
      await db.updateCustomerStatus(customer.id, 'invited_failed', new Date(), inviteResult.error);

      webhookLogger.error('Failed to invite user to repository', undefined, {
        username: resolvedGithubUsername,
        customerId: customer.id,
        error: inviteResult.error,
      });

      await sendErrorNotification(
        'GitHub Invitation Failed',
        inviteResult.error || 'Unknown error',
        { customerId: customer.id, username: resolvedGithubUsername }
      );

      return NextResponse.json({ error: 'Failed to invite to repository' }, { status: 500 });
    }

    // Update customer status
    await db.updateCustomerStatus(customer.id, 'invited', new Date(), undefined);

    // Get repository clone URL
    const { https: cloneUrl } = getRepositoryCloneUrl();
    const repoUrl = `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}`;

    // Send welcome email
    const recipientEmail = customer.email;

    const emailResult = await sendWelcomeEmail(recipientEmail, customer.name, repoUrl, cloneUrl);

    if (emailResult.success) {
      await db.markWelcomeEmailSent(customer.id);
    } else {
      webhookLogger.error('Failed to send welcome email', undefined, {
        customerId: customer.id,
        error: emailResult.error,
      });
      // Don't fail the whole webhook for email failure
    }

    // Update customer to active
    await db.updateCustomerStatus(customer.id, 'active');

    webhookLogger.info('Webhook processed successfully', {
      customerId: customer.id,
      invited: inviteResult.success,
      emailSent: emailResult.success,
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      customerId: customer.id,
      invited: inviteResult.success,
      emailSent: emailResult.success,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Categorize error with actionable guidance
    const { categorizeError, formatErrorForLogging, shouldAlertAdmin } =
      await import('@/lib/error-handler');
    const errorToHandle = error instanceof Error ? error : new Error(errorMessage);
    const categorized = categorizeError(errorToHandle);

    // Log error with category and solution
    webhookLogger.error(
      'Polar webhook processing error',
      error,
      formatErrorForLogging(errorToHandle)
    );

    // Send notification only for critical/high severity errors
    if (shouldAlertAdmin(errorToHandle)) {
      await sendErrorNotification(
        `[${categorized.severity}] Webhook Processing Error`,
        `${categorized.userMessage}\n\nHow to fix:\n${categorized.solution}`,
        {
          category: categorized.category,
          code: categorized.code,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to process webhook',
        category: categorized.category,
        userMessage: categorized.userMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Polar webhook endpoint is active',
    endpoint: '/api/webhooks/polar',
  });
}
