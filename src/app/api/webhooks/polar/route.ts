/**
 * Polar Webhook Handler
 * POST /api/webhooks/polar
 * Processes payment notifications from Polar
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPolarWebhookSignature, parsePolarWebhook, isPaidOrderEvent, extractCustomerDataFromWebhook, validateWebhookTimestamp } from '@/lib/polar-webhook';
import { inviteToRepository, getRepositoryCloneUrl } from '@/lib/github-api';
import { sendWelcomeEmail, sendErrorNotification } from '@/lib/email';
import { db } from '@/lib/db';
import { webhookLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-polar-signature');

    // Verify webhook signature
    if (!signature || !verifyPolarWebhookSignature(body, signature)) {
      webhookLogger.warn('Invalid Polar webhook signature', {
        hasSignature: !!signature,
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse webhook payload
    const webhook = parsePolarWebhook(body);

    // Validate timestamp to prevent replay attacks
    if (webhook.timestamp && !validateWebhookTimestamp(webhook.timestamp)) {
      webhookLogger.warn('Webhook timestamp validation failed (potential replay attack)', {
        timestamp: webhook.timestamp,
        type: webhook.type,
      });
      return NextResponse.json(
        { error: 'Webhook expired or invalid timestamp' },
        { status: 400 }
      );
    }

    // Only process paid orders
    if (!isPaidOrderEvent(webhook)) {
      webhookLogger.debug('Skipping non-paid webhook event', { type: webhook.type });
      return NextResponse.json({ success: true, skipped: true });
    }

    const order = webhook.data;

    // Extract customer data from webhook
    const customerData = extractCustomerDataFromWebhook(order);

    // Get GitHub username from webhook metadata (set during checkout via Polar custom fields)
    const metadata = webhook.data.metadata;
    const githubUsername = metadata?.github_username;
    const githubUserId = metadata?.github_user_id;

    if (!githubUsername || !githubUserId) {
      webhookLogger.error('Missing GitHub user data in webhook metadata', undefined, {
        orderId: order.id,
        hasMetadata: metadata ? 'yes' : 'no',
      });

      await sendErrorNotification(
        'Missing GitHub User Data',
        'Missing GitHub user data in webhook metadata',
        { orderId: order.id, hasMetadata: metadata ? 'yes' : 'no' }
      );

      return NextResponse.json(
        { error: 'Missing GitHub user data' },
        { status: 400 }
      );
    }

    // Check if customer already exists
    const existing = await db.getCustomerByOrderId(order.id);
    if (existing) {
      webhookLogger.info('Customer already exists for order', { orderId: order.id, customerId: existing.id });
      return NextResponse.json({
        success: true,
        message: 'Customer already processed',
        customerId: existing.id,
      });
    }

    // Create customer in database
    const customer = await db.createCustomer({
      name: customerData.name || githubUsername,
      email: customerData.email,
      company: customerData.company,
      use_case: customerData.useCase,
      referral_source: customerData.referralSource,
      newsletter_opted_in: customerData.newsletterOptedIn ?? false,
      github_username: githubUsername,
      github_user_id: githubUserId,
      polar_order_id: order.id,
      polar_customer_id: order.customer_id,
      amount_paid: order.amount,
      currency: order.currency,
      payment_method: metadata?.payment_method,
      product_id: order.product_id,
      discount_id: order.discount_id,
      promo_code_used: customerData.promo_code,
    });

    webhookLogger.info('Created customer', { customerId: customer.id, orderId: order.id });

    // Invite to GitHub repository with READ-ONLY access (permission: 'pull')
    // This ensures customers can clone and pull, but cannot push or modify
    const inviteResult = await inviteToRepository(githubUsername, 'pull');

    if (!inviteResult.success) {
      // Update customer with error
      await db.updateCustomerStatus(
        customer.id,
        'invited_failed',
        new Date(),
        inviteResult.error
      );

      webhookLogger.error('Failed to invite user to repository', undefined, {
        username: githubUsername,
        customerId: customer.id,
        error: inviteResult.error,
      });

      await sendErrorNotification(
        'GitHub Invitation Failed',
        inviteResult.error || 'Unknown error',
        { customerId: customer.id, username: githubUsername }
      );

      return NextResponse.json(
        { error: 'Failed to invite to repository' },
        { status: 500 }
      );
    }

    // Update customer status
    await db.updateCustomerStatus(
      customer.id,
      'invited',
      new Date(),
      undefined
    );

    // Get repository clone URL
    const { https: cloneUrl } = getRepositoryCloneUrl();
    const repoUrl = `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}`;

    // Send welcome email
    const emailResult = await sendWelcomeEmail(
      customer.email,
      customer.name,
      repoUrl,
      cloneUrl
    );

    if (emailResult.success) {
      await db.markWelcomeEmailSent(customer.id);
    } else {
      webhookLogger.error('Failed to send welcome email', undefined, {
        customerId: customer.id,
        error: emailResult.error,
      });

      await sendErrorNotification(
        'Welcome Email Failed',
        emailResult.error || 'Unknown error',
        { customerId: customer.id }
      );
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
    webhookLogger.error('Polar webhook processing error', error);

    await sendErrorNotification(
      'Webhook Processing Error',
      errorMessage,
      { error: error instanceof Error ? error.stack : 'No stack trace' }
    );

    return NextResponse.json(
      { error: 'Failed to process webhook' },
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
