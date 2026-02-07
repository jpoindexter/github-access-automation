/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 * Applies Nielsen's Usability Heuristics:
 * - #5 (Error Prevention): Validate format before runtime failures
 * - #9 (Error Recovery): Clear messages explaining WHAT's wrong and HOW to fix
 */

import { z } from 'zod';
import { formatEnvValidationError } from './env-error-formatter';

/**
 * Environment variable schema with user-friendly error messages
 */
const envSchema = z.object({
  // GitHub Configuration
  GITHUB_TOKEN: z
    .string()
    .min(40, {
      message:
        '❌ GITHUB_TOKEN is too short.\n' +
        'Expected: At least 40 characters starting with "ghp_" or "github_pat_"\n' +
        'Example: ghp_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t\n' +
        'Where to find: GitHub Settings → Developer settings → Personal access tokens\n' +
        'Required scopes: repo (full control of private repositories)',
    })
    .regex(/^(ghp_|github_pat_)/, {
      message:
        '❌ GITHUB_TOKEN has invalid format.\n' +
        'Expected: Must start with "ghp_" (classic) or "github_pat_" (fine-grained)\n' +
        'Got: A token not starting with the correct prefix\n' +
        'Where to find: GitHub Settings → Developer settings → Personal access tokens',
    }),

  GITHUB_ORG_OR_USER: z.string().min(1, {
    message:
      '❌ GITHUB_ORG_OR_USER is required.\n' +
      'Expected: Your GitHub username or organization name\n' +
      'Example: "octocat" or "github"\n' +
      'Where to find: Your GitHub profile URL (github.com/YOUR-USERNAME)',
  }),

  GITHUB_REPO: z.string().min(1, {
    message:
      '❌ GITHUB_REPO is required.\n' +
      'Expected: Repository name (not full URL)\n' +
      'Example: "my-private-repo"\n' +
      'Where to find: Your repository URL (github.com/USER/REPO-NAME)',
  }),

  // Polar Configuration
  POLAR_WEBHOOK_SECRET: z
    .string()
    .min(20, {
      message:
        '❌ POLAR_WEBHOOK_SECRET is too short.\n' +
        'Expected: At least 20 characters starting with "polar_whs_"\n' +
        'Example: polar_whs_1a2b3c4d5e6f7g8h9i0j\n' +
        'Where to find: Polar Dashboard → Webhooks → Click "Reveal Secret"',
    })
    .regex(/^polar_whs_/, {
      message:
        '❌ POLAR_WEBHOOK_SECRET has invalid format.\n' +
        'Expected: Must start with "polar_whs_"\n' +
        'Got: A string not starting with "polar_whs_"\n' +
        'Common mistake: Copied the wrong value (webhook URL vs secret)',
    }),

  // Database
  DATABASE_URL: z
    .string()
    .url({ message: '❌ DATABASE_URL must be a valid URL' })
    .regex(/^postgresql:\/\//, {
      message:
        '❌ DATABASE_URL has invalid format.\n' +
        'Expected: Must start with "postgresql://"\n' +
        'Example: postgresql://user:password@host:5432/database?sslmode=require\n' +
        'Common mistakes:\n' +
        '  - Missing "postgresql://" prefix (check for typo)\n' +
        '  - Using "postgres://" instead of "postgresql://" (wrong protocol)\n' +
        '  - Missing "?sslmode=require" for Neon databases\n' +
        'Where to find: Neon Dashboard → Connection String',
    }),

  // Email (Resend)
  RESEND_API_KEY: z
    .string()
    .min(20, {
      message:
        '❌ RESEND_API_KEY is too short.\n' +
        'Expected: At least 20 characters starting with "re_"\n' +
        'Example: re_1a2b3c4d5e6f7g8h9i0j\n' +
        'Where to find: Resend Dashboard → API Keys → Create API Key',
    })
    .regex(/^re_/, {
      message:
        '❌ RESEND_API_KEY has invalid format.\n' +
        'Expected: Must start with "re_"\n' +
        'Got: A string not starting with "re_"\n' +
        'Where to find: Resend Dashboard → API Keys',
    })
    .optional(),

  RESEND_FROM_EMAIL: z
    .string()
    .email({
      message:
        '❌ RESEND_FROM_EMAIL is not a valid email address.\n' +
        'Expected: A verified email address or domain\n' +
        'Example: noreply@yourdomain.com\n' +
        'Where to verify: Resend Dashboard → Domains → Verify your domain',
    })
    .optional(),

  ADMIN_EMAIL: z
    .string()
    .email({
      message:
        '❌ ADMIN_EMAIL is not a valid email address.\n' +
        'Expected: Your email address for error notifications\n' +
        'Example: admin@yourdomain.com\n' +
        'Purpose: Receives alerts when:\n' +
        '  - Webhook signature verification fails\n' +
        '  - GitHub invitation errors occur\n' +
        '  - Database connection issues arise',
    })
    .optional(),

  // GitHub OAuth (Optional but recommended)
  GITHUB_OAUTH_CLIENT_ID: z
    .string()
    .optional()
    .refine((val) => !val || val.startsWith('Ov23'), {
      message:
        '❌ GITHUB_OAUTH_CLIENT_ID has invalid format.\n' +
        'Expected: Starts with "Ov23" (GitHub OAuth app client ID)\n' +
        'Where to find: GitHub Settings → Developer settings → OAuth Apps',
    }),

  GITHUB_OAUTH_CLIENT_SECRET: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 30, {
      message:
        '❌ GITHUB_OAUTH_CLIENT_SECRET is too short.\n' +
        'Expected: At least 30 characters\n' +
        'Where to find: GitHub Settings → Developer settings → OAuth Apps',
    }),

  // Application
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Admin Authentication
  ADMIN_PASSWORD: z.string().min(12, {
    message:
      '❌ ADMIN_PASSWORD is too short.\n' +
      'Expected: At least 12 characters for security\n' +
      'Recommendation: Use a strong password with mixed characters\n' +
      'Purpose: Protects access to admin panel\n' +
      'Security: Never commit this to git or share publicly',
  }),

  // Optional
  POLAR_ACCESS_TOKEN: z.string().optional(),
  CRON_SECRET: z
    .string()
    .min(16, {
      message:
        '❌ CRON_SECRET is too short.\n' +
        'Expected: At least 16 characters for security\n' +
        'Purpose: Protects cron job endpoints from unauthorized access\n' +
        'Example: Generate with: openssl rand -hex 32',
    })
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables
 * Call this at application startup
 * Uses Nielsen-style error messages for better UX
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Format errors with user-friendly messages
    console.error(formatEnvValidationError(result.error));

    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  return result.success ? result.data : (process.env as unknown as Env);
}

/**
 * Validated environment variables
 * Use this instead of process.env for type-safe access
 * Skips validation during Next.js build phase (env vars aren't needed at build time)
 */
export const env =
  process.env.NEXT_PHASE === 'phase-production-build'
    ? (process.env as unknown as Env)
    : validateEnv();

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return env.NODE_ENV === 'test';
}

export default env;
