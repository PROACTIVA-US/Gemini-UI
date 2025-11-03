# Secret Rotation Automation

Automated secret rotation for all Veria infrastructure services using Gemini Computer Use API.

## Overview

This tool automates the complete secret rotation workflow across:
- **Stripe** - API keys and webhook secrets
- **Resend** - Email API keys
- **GitHub OAuth** - Client secrets
- **Google OAuth** - Client secrets
- **Supabase** - Database passwords
- **Local secrets** - NEXTAUTH_SECRET, Compliance API keys
- **Vercel** - Environment variable updates

## Quick Start

### 1. Dry Run (Preview Only)

Test the automation without making any changes:

```bash
cd /Users/danielconnolly/Projects/Gemini/gemini-ui-testing
npm run rotate:dry-run
```

### 2. Rotate Single Service

Test with one service first (recommended):

```bash
# Stripe (safest to test first)
npm run rotate:stripe

# Other services
npm run rotate:resend
npm run rotate:github
npm run rotate:google
npm run rotate:supabase
```

### 3. Full Rotation

Rotate all secrets automatically:

```bash
npm run rotate:secrets
```

With auto-approval and testing:

```bash
npm run rotate:auto
```

## How It Works

### Phase 1: Local Secret Generation
- Generates `NEXTAUTH_SECRET` using `openssl rand -base64 32`
- Generates `COMPLIANCE_API_ADMIN_KEY` using `openssl rand -hex 32`
- No browser automation needed

### Phase 2: Service Rotation
For each service:
1. **Navigate** to service dashboard (e.g., Stripe API keys page)
2. **Login** (manual or automated)
3. **Computer Use Agent** performs actions:
   - Clicks "Generate new secret" buttons
   - Waits for secret reveal
   - Captures secret from UI or clipboard
4. **Validation** ensures secret format is correct
5. **Screenshot** saved for audit trail

### Phase 3: Vercel Update
- Updates all environment variables in Vercel
- Currently requires manual update (API integration coming)
- Displays all new secrets for copy/paste

### Phase 4: Verification
- Tests production endpoints:
  - `https://veria.cc/api/auth/signin`
  - `https://veria.cc/api/test-connection`
- Confirms rotated secrets work
- Rollback available if tests fail

## Command Line Options

```bash
node src/secret-rotation.js [options]

Options:
  --dry-run           Preview without executing
  --auto-approve      Skip confirmation prompts
  --debug             Enable debug logging
  --service <name>    Rotate specific service only
  --no-test-after     Skip deployment testing
```

## Examples

### Test Stripe Rotation (Safest First Test)

```bash
# Dry run to see what will happen
npm run rotate:stripe -- --dry-run

# Actually rotate (you'll need to log in)
npm run rotate:stripe

# Auto-approve all prompts
npm run rotate:stripe -- --auto-approve
```

### Rotate All Secrets

```bash
# Interactive (confirms each step)
npm run rotate:secrets

# Fully automated
npm run rotate:auto
```

## Output Files

Each rotation creates a timestamped directory:

```
tmp/secret-rotation-2025-11-01T223045/
├── rotation-results.json    # Summary of rotation
├── new-secrets.env          # All new secrets (secure file, 0600 permissions)
├── stripe-rotate_secret_key.png
├── stripe-capture_secret.png
├── resend-create_key.png
└── execution.log
```

## Security Features

### 1. Dry Run Mode
- Test without making changes
- Preview all actions
- Validate configuration

### 2. Rollback Capability
- Old secrets kept until verification
- Can revert if rotation fails
- Audit trail via screenshots

### 3. Validation
- Each secret validated against expected format
- Prevents capturing placeholder text
- Ensures secrets are real

### 4. Secure Storage
- Secrets saved with 0600 permissions (owner-only)
- Output files in temporary directory
- Can be securely deleted after use

## Troubleshooting

### "GEMINI_API_KEY not found"

Add to `.env`:
```bash
GEMINI_API_KEY=your_gemini_api_key
```

### "Could not automatically capture secret"

The tool will pause and ask you to manually copy the secret. This happens if:
- Secret is revealed with custom UI
- Clipboard access denied
- Unexpected page layout

**Solution**: Copy the secret manually, then press Enter.

### Service rotation fails

1. Check screenshot in output directory
2. Verify you're logged into the service
3. Try with `--debug` flag for more info
4. Run individual service with `--service` flag

### Vercel update fails

Currently requires manual update. Future versions will use Vercel API.

**Manual steps**:
1. Go to Vercel dashboard
2. Open environment variables
3. Copy/paste from `new-secrets.env` file

## Safety Checklist

Before running full rotation:

- [ ] Run dry-run mode first
- [ ] Test with single service (Stripe recommended)
- [ ] Verify Gemini API key is set
- [ ] Check you're logged into all services
- [ ] Have rollback plan ready
- [ ] Backup current secrets

## Advanced Usage

### Custom Service Order

Edit `src/scenarios/secret-rotation-flows.json`:

```json
"executionOrder": [
  "local-secrets",
  "stripe",
  "resend",
  "github-oauth",
  "google-oauth",
  "supabase",
  "vercel"
]
```

### Extend Secret Capture

Add to `src/agents/secret-capture.js`:

```javascript
case 'MY_CUSTOM_SECRET':
  return /^custom_[a-z0-9]{32}$/.test(value);
```

### Add New Service

1. Add to `secret-rotation-flows.json`:
```json
{
  "name": "new-service",
  "url": "https://service.com/api-keys",
  "tasks": { ... }
}
```

2. Add npm script to `package.json`:
```json
"rotate:new-service": "node src/secret-rotation.js --service new-service"
```

## Architecture

```
SecretRotationOrchestrator
├── ConfigLoader (loads secret-rotation-flows.json)
├── TestExecutorAgent (Playwright browser automation)
├── ComputerUseAgent (Gemini AI for UI interaction)
├── SecretCaptureAgent (extracts secrets from UI)
└── VercelAPI (updates environment variables)
```

## Time Estimates

- **Dry Run**: 2-3 minutes
- **Single Service**: 3-5 minutes
- **Full Rotation**: 15-20 minutes (vs 1-2 hours manual)

## Next Steps

1. **Test with dry run**
2. **Rotate Stripe only** (lowest risk)
3. **Verify Stripe rotation worked**
4. **Rotate remaining services**
5. **Update Vercel manually** (for now)
6. **Test production deployment**

## Support

For issues or questions:
- Check output logs in `tmp/secret-rotation-*/`
- Review screenshots for debugging
- Run with `--debug` flag for verbose output
