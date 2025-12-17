/**
 * Environment Variable Error Formatter
 * Formats Zod validation errors using Nielsen's Usability Heuristics
 * - #5 (Error Prevention): Validate format before runtime failures
 * - #9 (Error Recovery): Clear messages explaining WHAT's wrong and HOW to fix
 */

import { ZodError } from 'zod';

/**
 * Formats Zod validation errors in a user-friendly way
 * Following Nielsen's heuristic #9: Help users recognize, diagnose, and recover from errors
 */
export function formatEnvValidationError(error: ZodError): string {
  const messages = error.errors.map((err) => {
    return `\n${err.message}\n`;
  });

  return `
╔═══════════════════════════════════════════════════════════════╗
║  ⚠️  Environment Variable Validation Failed                   ║
║                                                               ║
║  Please fix the following issues in your .env.local file:    ║
╚═══════════════════════════════════════════════════════════════╝
${messages.join('\n')}

💡 Need help?
   → Check .env.example for a working reference
   → Docs: README.md → Environment Variables section
   → Support: https://github.com/jpoindexter/github-access-automation/issues
`;
}
