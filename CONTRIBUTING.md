# Contributing to GitHub Access Automation

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Reporting Issues](#reporting-issues)
- [Security Vulnerabilities](#security-vulnerabilities)

## Code of Conduct

This project follows a standard code of conduct. Be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a feature branch

## Development Setup

### Prerequisites

- Node.js 18+ (see `.nvmrc`)
- PostgreSQL 15+ (or Neon account)
- GitHub account with OAuth app
- Polar.sh account (for webhook testing)
- Resend account (for email testing)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/github-access-automation.git
cd github-access-automation

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Fill in your credentials in .env.local
# See SETUP.md for detailed instructions

# Start development server
npm run dev
```

### Running Tests

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Format check
npm run format:check

# All validations
npm run validate
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-webhook-retry` - New features
- `fix/oauth-state-validation` - Bug fixes
- `docs/update-readme` - Documentation
- `refactor/extract-email-service` - Code refactoring

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(webhook): add retry logic for failed invitations
fix(oauth): validate state parameter to prevent CSRF
docs(readme): add troubleshooting section
```

## Submitting Changes

1. Ensure all tests pass locally
2. Update documentation if needed
3. Push to your fork
4. Create a Pull Request with:
   - Clear title describing the change
   - Description of what and why
   - Link to related issues
   - Screenshots if UI changes

### Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] TypeScript compiles without errors
- [ ] ESLint passes without warnings
- [ ] Documentation updated if needed
- [ ] No sensitive data in commits

## Code Style

### TypeScript

- Use strict mode
- Avoid `any` types - define proper interfaces
- Use JSDoc comments for public functions

### Formatting

- 2 space indentation
- Single quotes for strings
- Trailing commas in multiline
- See `.prettierrc` for full config

### File Organization

```
src/
├── app/              # Next.js App Router pages and API routes
│   ├── api/          # API endpoints
│   └── page.tsx      # Main page
├── lib/              # Utility libraries
│   ├── db.ts         # Database client
│   ├── email.ts      # Email service
│   └── github-api.ts # GitHub API client
└── types/            # TypeScript definitions
```

## Reporting Issues

### Bug Reports

Include:
1. Description of the issue
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Environment details (Node version, OS)
6. Relevant logs (redact sensitive data)

### Feature Requests

Include:
1. Problem you're trying to solve
2. Proposed solution
3. Alternative solutions considered
4. Additional context

## Security Vulnerabilities

**Do NOT report security vulnerabilities through public GitHub issues.**

Instead, please email security concerns directly. Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

## Questions?

Open a discussion in GitHub Discussions or reach out via issues for general questions about the project.

---

Thank you for contributing!
