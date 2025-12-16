# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-16

### Added

- **GitHub OAuth Flow**: Secure authentication to collect GitHub username before purchase
- **Polar.sh Webhook Integration**: Automated payment processing via HMAC-SHA256 signed webhooks
- **Automatic Repository Invitations**: Instant read-only access upon successful payment
- **Customer Database**: Comprehensive 33-field PostgreSQL schema with Neon
- **Email Notifications**: Welcome emails via Resend with professional templates
- **Error Notifications**: Admin alerts for failed invitations or webhook issues

### Security

- Webhook signature verification using constant-time comparison
- Read-only (`pull`) permission for all customer invitations
- HttpOnly secure cookies for OAuth session management
- Parameterized SQL queries (no SQL injection)
- Environment variable isolation for all secrets

### Documentation

- Comprehensive README with setup instructions
- ARCHITECTURE.md with system design and data flow
- SECURITY.md with threat model and incident response
- SETUP.md with step-by-step environment configuration
- TESTING.md with sandbox testing procedures

### Technical

- Next.js 16 with App Router
- TypeScript with strict mode
- PostgreSQL (Neon) with connection pooling
- @octokit/rest for GitHub API
- Resend for transactional email
- Zod for runtime validation
