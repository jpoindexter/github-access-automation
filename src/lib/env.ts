/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 */

import { z } from 'zod';

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string'
    ),

  // GitHub Personal Access Token
  GITHUB_TOKEN: z
    .string()
    .min(1, 'GITHUB_TOKEN is required')
    .refine(
      (token) => token.startsWith('ghp_') || token.startsWith('github_pat_'),
      'GITHUB_TOKEN must be a valid GitHub personal access token'
    ),

  // GitHub Repository
  GITHUB_ORG_OR_USER: z.string().min(1, 'GITHUB_ORG_OR_USER is required'),
  GITHUB_REPO: z.string().min(1, 'GITHUB_REPO is required'),

  // GitHub OAuth
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1, 'GITHUB_OAUTH_CLIENT_ID is required'),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1, 'GITHUB_OAUTH_CLIENT_SECRET is required'),

  // Polar.sh
  POLAR_WEBHOOK_SECRET: z
    .string()
    .min(1, 'POLAR_WEBHOOK_SECRET is required'),

  // Resend Email (optional in development)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  // Application
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Optional
  ADMIN_EMAIL: z.string().email().optional(),
  POLAR_ACCESS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables
 * Call this at application startup
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('\n❌ Invalid environment variables:\n' + errors + '\n');

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment configuration');
    }
  }

  return result.success ? result.data : (process.env as unknown as Env);
}

/**
 * Validated environment variables
 * Use this instead of process.env for type-safe access
 */
export const env = validateEnv();

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
