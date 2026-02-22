# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x (current development) | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in OpenLintel, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@openlintel.dev**

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Affected component (web app, API, service name)
- Potential impact assessment
- Any suggested fix (optional)

## What to Expect

- **Acknowledgment** within 48 hours of your report
- **Initial assessment** within 5 business days
- **Resolution timeline** communicated after assessment
- **Credit** given in the security advisory (unless you prefer anonymity)

## Scope

The following are in scope:

- All application code in this repository
- API endpoints and authentication flows
- File upload and processing pipelines
- Database queries and data access patterns
- Docker and infrastructure configurations
- Dependency vulnerabilities

The following are out of scope:

- Third-party services we integrate with (report to them directly)
- Social engineering attacks
- Denial of service attacks against development/staging environments

## Security Best Practices for Contributors

When contributing code, please ensure:

- All user input is validated and sanitized
- Database queries use parameterized statements (via ORM)
- File uploads are validated for type, size, and content
- Authentication tokens are not logged or exposed
- Secrets are never committed to the repository
- Dependencies are kept up to date

## Disclosure Policy

We follow coordinated disclosure. We ask that you:

1. Allow us reasonable time to fix the issue before public disclosure
2. Make a good faith effort to avoid data destruction or service disruption
3. Do not access or modify other users' data

We commit to:

1. Not pursuing legal action against good-faith security researchers
2. Working with you to understand and resolve the issue
3. Publicly crediting you (with your permission) when the fix is released
