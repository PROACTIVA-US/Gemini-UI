# Email Authentication Limitation

## Problem
Email-based sign-in requires email verification. The user must:
1. Enter email/password on veria.cc
2. Receive verification email
3. Click link in email to verify
4. Then access dashboard

## Workaround
Automated tests cannot access email inbox to click verification links.

## Solutions
1. **Use OAuth providers** (Google, GitHub) which don't require email verification
2. **Pre-verify test account** manually and use session cookies
3. **Disable email verification** in development environment

## Current Status
Email provider disabled in test config. Use Google or GitHub for automated testing.
