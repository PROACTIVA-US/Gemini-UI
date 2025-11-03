# Test Credentials Setup Guide

This document explains how test credentials are configured and used in the gemini-ui-testing tool.

## Overview

The tool uses **test@veria.cc** with password **G3tup1N1t!** to test OAuth flows for both GitHub and Google sign-in on veria.cc.

## Environment Variables

### Required Test Credentials

Add these to your `.env` file:

```bash
# Test account credentials (shared for all OAuth providers)
TEST_GITHUB_USER=test@veria.cc
TEST_GITHUB_PASS=G3tup1N1t!
TEST_GOOGLE_EMAIL=test@veria.cc
TEST_GOOGLE_PASS=G3tup1N1t!
```

### Complete .env Example

```bash
# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Test Accounts
TEST_GITHUB_USER=test@veria.cc
TEST_GITHUB_PASS=G3tup1N1t!
TEST_GOOGLE_EMAIL=test@veria.cc
TEST_GOOGLE_PASS=G3tup1N1t!

# Vercel (optional - for log fetching)
VERCEL_TOKEN=your_vercel_token
VERCEL_PROJECT_ID=veria-website

# Veria Project Path (optional)
VERIA_PROJECT_PATH=/path/to/veria/project
```

## How Credentials Work

### 1. Configuration File

The test scenarios are defined in `src/scenarios/veria-oauth-flows.json`:

```json
{
  "providers": [
    {
      "name": "github",
      "enabled": true,
      "testAccount": {
        "username": "process.env.TEST_GITHUB_USER",
        "password": "process.env.TEST_GITHUB_PASS"
      }
    },
    {
      "name": "google",
      "enabled": true,
      "testAccount": {
        "email": "process.env.TEST_GOOGLE_EMAIL",
        "password": "process.env.TEST_GOOGLE_PASS"
      }
    }
  ]
}
```

### 2. Runtime Resolution

The orchestrator resolves environment variables at runtime:

```javascript
// src/orchestrator.js (lines 107-113)
const testCredentials = {};
if (providerConfig.testAccount) {
  for (const [key, value] of Object.entries(providerConfig.testAccount)) {
    testCredentials[key] = this.resolveEnvVar(value, providerConfig);
  }
}
```

The `resolveEnvVar()` method (lines 217-224) converts:
- `"process.env.TEST_GITHUB_USER"` → actual value from environment

### 3. Passing to Computer Use Agent

Credentials are passed to Gemini's Computer Use API in two ways:

**A. In the goal/prompt string:**
```javascript
// For GitHub provider_auth state:
"You are testing github OAuth flow on veria.cc. You are now on github's login page.
Enter credentials: {\"username\":\"test@veria.cc\",\"password\":\"G3tup1N1t!\"} and submit the form."
```

**B. In the context object:**
```javascript
{
  state: "provider_auth",
  url: "https://github.com/login",
  provider: "github",
  credentials: {
    username: "test@veria.cc",
    password: "G3tup1N1t!"
  }
}
```

### 4. Gemini Actions

The Computer Use API then uses these credentials to:
1. Find login form fields (username/email and password)
2. Type the credentials into the fields
3. Submit the form

## State-Based Prompts

The orchestrator provides different instructions based on the OAuth flow state:

### Landing State
```
"You are testing github OAuth flow on veria.cc.
Look for the 'Sign in with github' button and click it."
```
- **Goal**: Find and click the OAuth provider button
- **Credentials**: Not needed yet

### Provider Auth State
```
"You are testing github OAuth flow on veria.cc.
You are now on github's login page.
Enter credentials: {\"username\":\"test@veria.cc\",\"password\":\"G3tup1N1t!\"} and submit the form."
```
- **Goal**: Enter credentials and log in
- **Credentials**: Explicitly provided in prompt

### Callback State
```
"You are testing github OAuth flow on veria.cc.
Wait for redirect back to veria.cc after authentication."
```
- **Goal**: Handle redirect/callback
- **Credentials**: Not needed

### Dashboard State
```
"You are testing github OAuth flow on veria.cc.
You should now be logged in to veria.cc dashboard."
```
- **Goal**: Verify successful login
- **Credentials**: Not needed

## Security Considerations

### ⚠️ Important Security Notes

1. **Never commit .env files**: The `.env` file is in `.gitignore` and should NEVER be committed to git
2. **Test accounts only**: Use dedicated test accounts, not personal accounts
3. **Sandboxed credentials**: test@veria.cc is a test account, not a production user
4. **API key protection**: Keep `GEMINI_API_KEY` secret
5. **Password rotation**: Rotate test passwords regularly

### Best Practices

- ✅ Use environment variables for all credentials
- ✅ Use dedicated test accounts
- ✅ Never hardcode credentials in source code
- ✅ Store `.env` securely (not in version control)
- ✅ Use different credentials for CI/CD vs local development
- ❌ Don't use production credentials for testing
- ❌ Don't share API keys in logs or traces

## Troubleshooting

### Issue: "Credentials not found"

**Symptom**: Test fails, Gemini doesn't enter credentials

**Solutions**:
1. Check `.env` file exists in project root
2. Verify environment variable names match exactly:
   - `TEST_GITHUB_USER` (not `GITHUB_TEST_USER`)
   - `TEST_GOOGLE_EMAIL` (not `GOOGLE_TEST_EMAIL`)
3. Restart test after updating `.env`

```bash
# Verify variables are loaded
node -e "require('dotenv').config(); console.log(process.env.TEST_GITHUB_USER)"
```

### Issue: "Wrong credentials used"

**Symptom**: Test uses different credentials than expected

**Check**:
1. Multiple `.env` files? (Only use root `.env`)
2. System environment variables overriding?
3. Hardcoded values in JSON config?

```bash
# Check what's being loaded
grep TEST_ .env
```

### Issue: "Credentials visible in logs"

**Symptom**: Passwords appear in console output or trace files

**This is expected behavior** for debugging. To prevent:
1. Use `--quiet` flag to reduce logging
2. Don't share trace files publicly
3. Review execution.log before sharing

**Note**: The goal string includes credentials intentionally to help Gemini understand what to enter.

## Changing Test Credentials

### To Use Different Credentials

1. **Update .env file:**
```bash
TEST_GITHUB_USER=newuser@example.com
TEST_GITHUB_PASS=NewPassword123!
```

2. **No code changes needed** - credentials are dynamically loaded

3. **Test immediately:**
```bash
npm run test:github
```

### To Add New OAuth Provider

1. **Update .env:**
```bash
TEST_FACEBOOK_EMAIL=test@veria.cc
TEST_FACEBOOK_PASS=G3tup1N1t!
```

2. **Update veria-oauth-flows.json:**
```json
{
  "name": "facebook",
  "enabled": true,
  "testAccount": {
    "email": "process.env.TEST_FACEBOOK_EMAIL",
    "password": "process.env.TEST_FACEBOOK_PASS"
  },
  "flow": ["landing", "provider_auth", "callback", "dashboard"]
}
```

3. **Add npm script to package.json:**
```json
{
  "scripts": {
    "test:facebook": "node src/orchestrator.js --provider facebook"
  }
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: OAuth Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Create .env file
        run: |
          echo "GEMINI_API_KEY=${{ secrets.GEMINI_API_KEY }}" >> .env
          echo "TEST_GITHUB_USER=${{ secrets.TEST_GITHUB_USER }}" >> .env
          echo "TEST_GITHUB_PASS=${{ secrets.TEST_GITHUB_PASS }}" >> .env
          echo "TEST_GOOGLE_EMAIL=${{ secrets.TEST_GOOGLE_EMAIL }}" >> .env
          echo "TEST_GOOGLE_PASS=${{ secrets.TEST_GOOGLE_PASS }}" >> .env

      - name: Run OAuth tests
        run: npm run test:all

      - name: Upload traces
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-traces
          path: tmp/oauth-test-*/trace.zip
```

### Required GitHub Secrets

Add these in repository settings → Secrets and variables → Actions:

- `GEMINI_API_KEY`
- `TEST_GITHUB_USER`
- `TEST_GITHUB_PASS`
- `TEST_GOOGLE_EMAIL`
- `TEST_GOOGLE_PASS`

## Verification

### Test Credential Loading

```bash
# Test that credentials are loaded correctly
node -e "
require('dotenv').config();
console.log('GitHub User:', process.env.TEST_GITHUB_USER);
console.log('Google Email:', process.env.TEST_GOOGLE_EMAIL);
console.log('GitHub Pass exists:', !!process.env.TEST_GITHUB_PASS);
console.log('Google Pass exists:', !!process.env.TEST_GOOGLE_PASS);
"
```

Expected output:
```
GitHub User: test@veria.cc
Google Email: test@veria.cc
GitHub Pass exists: true
Google Pass exists: true
```

### Test Full Flow

```bash
# Run GitHub OAuth test
npm run test:github

# Check execution log for credentials
cat tmp/oauth-test-*/execution.log | grep -i credentials
```

Expected in logs:
```json
"Getting next action for goal: You are testing github OAuth flow on veria.cc.
You are now on github's login page.
Enter credentials: {\"username\":\"test@veria.cc\",\"password\":\"G3tup1N1t!\"} and submit the form."
```

## Summary

| Item | Value |
|------|-------|
| **Test Email** | test@veria.cc |
| **Test Password** | G3tup1N1t! |
| **GitHub Env Vars** | TEST_GITHUB_USER, TEST_GITHUB_PASS |
| **Google Env Vars** | TEST_GOOGLE_EMAIL, TEST_GOOGLE_PASS |
| **Config File** | src/scenarios/veria-oauth-flows.json |
| **Resolution Method** | Runtime via orchestrator.resolveEnvVar() |
| **Passed to Agent** | In goal string + context.credentials |
| **Security** | Never commit .env, use test accounts only |

## Related Documentation

- [README.md](../README.md) - Main setup guide
- [OAUTH_AUTOMATION_DESIGN.md](OAUTH_AUTOMATION_DESIGN.md) - System architecture
- [CDP_AND_TRACING.md](CDP_AND_TRACING.md) - Debugging with traces
