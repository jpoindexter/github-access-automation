/**
 * Admin Manual Retry API
 * POST /api/admin/retry
 * Manually retry failed GitHub invitations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inviteToRepository, getRepositoryCloneUrl } from '@/lib/github-api';
import { sendWelcomeEmail } from '@/lib/email';
import { authLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { customerId } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    // Get customer details
    const customer = await db.getCustomerById(customerId);

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (!customer.github_username) {
      return NextResponse.json({ error: 'Customer has no GitHub username' }, { status: 400 });
    }

    authLogger.info('Manual retry initiated', {
      customerId,
      githubUsername: customer.github_username,
    });

    // Attempt GitHub invitation
    const inviteResult = await inviteToRepository(customer.github_username, 'pull');

    if (!inviteResult.success) {
      // Update customer with error (keep current status)
      await db.updateCustomerStatus(
        customerId,
        customer.status, // Keep current status
        undefined,
        inviteResult.error || 'Manual retry failed'
      );

      authLogger.error('Manual retry failed', {
        customerId,
        error: inviteResult.error,
      });

      return NextResponse.json(
        { error: inviteResult.error || 'Invitation failed' },
        { status: 500 }
      );
    }

    // Update customer status to invited (clear error)
    await db.updateCustomerStatus(customerId, 'invited', new Date(), undefined);

    // Send welcome email if not already sent
    if (!customer.welcome_email_sent) {
      const { https: cloneUrl } = getRepositoryCloneUrl();
      const repoUrl = `https://github.com/${process.env.GITHUB_ORG_OR_USER}/${process.env.GITHUB_REPO}`;

      const emailResult = await sendWelcomeEmail(customer.email, customer.name, repoUrl, cloneUrl);

      if (emailResult.success) {
        await db.markWelcomeEmailSent(customerId);
      }
    }

    authLogger.info('Manual retry succeeded', { customerId });

    return NextResponse.json({ success: true });
  } catch (error) {
    authLogger.error('Manual retry error', error);

    return NextResponse.json({ error: 'Retry failed. Please check logs.' }, { status: 500 });
  }
}
