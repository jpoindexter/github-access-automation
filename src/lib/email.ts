/**
 * Email Service
 * Handles sending transactional emails via Resend
 */

import { Resend } from 'resend';
import { emailLogger } from '@/lib/logger';
import { env } from '@/lib/env';

const resend = new Resend(env.RESEND_API_KEY);
const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'noreply@example.com';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (result.error) {
      emailLogger.error('Resend API error', new Error(result.error.message), {
        errorName: result.error.name,
      });
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    emailLogger.error('Failed to send email', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send welcome email with GitHub repo access
 */
export async function sendWelcomeEmail(
  customerEmail: string,
  customerName: string,
  repoUrl: string,
  cloneUrl: string
): Promise<{ success: boolean; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f5f5f5; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
          .content { margin: 20px 0; }
          .button { display: inline-block; background: #0366d6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
          .code { background: #f5f5f5; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 14px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Fabrk!</h1>
          </div>

          <div class="content">
            <p>Hi ${customerName},</p>

            <p>Thank you for your purchase! Your payment has been received and you now have access to our repository.</p>

            <h2>Your Repository Access</h2>
            <p>You can now clone the repository using:</p>
            <div class="code">${cloneUrl}</div>

            <p>Or visit it on GitHub:</p>
            <a href="${repoUrl}" class="button">View on GitHub</a>

            <h2>Getting Started</h2>
            <ol>
              <li>Check your GitHub account - you should see an invitation</li>
              <li>Accept the invitation to gain access</li>
              <li>Clone the repository using the HTTPS or SSH URL above</li>
              <li>Follow the README.md for setup instructions</li>
            </ol>

            <h2>Need Help?</h2>
            <p>If you don't see the GitHub invitation or need any assistance, reply to this email and we'll help you right away.</p>

            <p>Happy coding!</p>
          </div>

          <div class="footer">
            <p>Questions? Reply to this email or contact us at support.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Welcome to Fabrk!

Thank you for your purchase! Your payment has been received and you now have access to our repository.

Your Repository Access:
Clone URL: ${cloneUrl}
GitHub URL: ${repoUrl}

Getting Started:
1. Check your GitHub account - you should see an invitation
2. Accept the invitation to gain access
3. Clone the repository using the URL above
4. Follow the README.md for setup instructions

Need Help?
If you don't see the GitHub invitation or need any assistance, reply to this email and we'll help you right away.

Happy coding!
  `.trim();

  return sendEmail({
    to: customerEmail,
    subject: 'Your Fabrk Repository Access is Ready',
    html: htmlContent,
    text: textContent,
  });
}

/**
 * Send error notification to admin
 */
export async function sendErrorNotification(
  subject: string,
  error: string,
  context?: Record<string, string | number | boolean | null | undefined>
): Promise<{ success: boolean; error?: string }> {
  const adminEmail = env.ADMIN_EMAIL || 'admin@example.com';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: monospace; }
          .container { max-width: 600px; }
          .header { color: #d73a49; font-size: 18px; margin-bottom: 10px; }
          .code { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">⚠️ ${subject}</div>
          <p>An error occurred in the GitHub Access Automation system.</p>

          <h3>Error Details:</h3>
          <div class="code">${error}</div>

          ${context ? `<h3>Context:</h3><div class="code">${JSON.stringify(context, null, 2)}</div>` : ''}

          <p>Please investigate and take appropriate action.</p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[ERROR] ${subject}`,
    html: htmlContent,
  });
}
