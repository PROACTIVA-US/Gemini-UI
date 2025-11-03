# Browser Session Management

## Overview

The automation now **saves browser sessions** so you only need to log in once per service.

## How It Works

### First Run
1. Browser opens to service (e.g., Stripe)
2. You log in manually
3. Session is saved to `tmp/browser-sessions/session-state.json`

### Subsequent Runs
1. Browser loads with saved session
2. **You're already logged in!**
3. Automation proceeds immediately

## Session Storage Location

```
tmp/browser-sessions/
├── session-state.json    # Cookies, localStorage, sessionStorage
└── (service-specific session files in future)
```

## Session File Contents

The `session-state.json` contains:
- **Cookies** - Authentication tokens
- **localStorage** - Persistent data
- **Origins** - Allowed domains

**IMPORTANT**: This file contains authentication credentials. Never commit to git!

## Security

✅ **Protected**:
- `.gitignore` excludes `tmp/browser-sessions/`
- Session files are local-only
- Permissions: Owner read/write only

⚠️ **Best Practices**:
- Don't share session files
- Delete if compromised: `rm -rf tmp/browser-sessions/`
- Sessions expire based on service timeout

## Managing Sessions

### View Current Sessions
```bash
cat tmp/browser-sessions/session-state.json | jq '.cookies[] | {name, domain, expirationDate}'
```

### Clear All Sessions
```bash
rm -rf tmp/browser-sessions/
```

Next run will require fresh logins.

### Clear Specific Service Session
```bash
# Coming soon: per-service session files
rm tmp/browser-sessions/stripe-session.json
```

## Session Lifetime

| Service | Session Lifetime | Notes |
|---------|-----------------|-------|
| Stripe | 30 days | Auto-extends on activity |
| Resend | 7 days | Refresh required |
| GitHub | 14 days | OAuth token refresh |
| Google | Variable | Based on account settings |
| Supabase | 30 days | Dashboard session |

## Troubleshooting

### "Session expired" or "Please log in"

**Cause**: Session timed out or cookies expired

**Solution**:
```bash
rm -rf tmp/browser-sessions/
npm run rotate:stripe  # Will prompt for fresh login
```

### Session not saving

**Check**:
1. Directory exists and is writable
   ```bash
   ls -la tmp/browser-sessions/
   ```

2. No errors during cleanup
   ```bash
   # Look for "Session saved" in output
   npm run rotate:stripe
   ```

### Multiple accounts/environments

**Problem**: Testing with different Stripe accounts

**Solution**: Use environment-specific sessions (coming soon)
```bash
# Current workaround
mv tmp/browser-sessions tmp/browser-sessions-prod
# Switch to test account
npm run rotate:stripe
# Restore prod sessions
mv tmp/browser-sessions-prod tmp/browser-sessions
```

## Future Enhancements

### Per-Service Sessions
Instead of one global session file, each service gets its own:
```
tmp/browser-sessions/
├── stripe.json
├── resend.json
├── github.json
└── google.json
```

### Session Refresh
Automatically refresh expiring sessions before rotation.

### Multi-Profile Support
```bash
npm run rotate:stripe -- --profile production
npm run rotate:stripe -- --profile staging
```

## Examples

### First Time Setup
```bash
$ npm run rotate:stripe

ℹ️  Initializing browser...
ℹ️  No existing session found
🔑 Browser opened - Please log in to Stripe
⏸️  After logging in, press Enter...
[You log in manually]
[Press Enter]
✅ Session saved to: tmp/browser-sessions/session-state.json
✅ Stripe rotation complete
```

### Subsequent Runs
```bash
$ npm run rotate:stripe

ℹ️  Initializing browser...
✅ Found existing session - attempting auto-login
✅ Already logged in!
[Automation proceeds automatically]
✅ Stripe rotation complete
```

### Session Expired
```bash
$ npm run rotate:stripe

ℹ️  Initializing browser...
✅ Found existing session - attempting auto-login
⚠️  Session expired - please log in again
🔑 Browser opened - Please log in to Stripe
[You log in again]
✅ Session saved (refreshed)
```

## Benefits

✅ **Time Saving**: Login once, use forever (until expiry)
✅ **Automation**: Future runs are fully automated
✅ **Reliability**: No need to handle 2FA every time
✅ **Multi-Service**: Each service session persists independently

## Migration from Previous Versions

If you used the tool before session management:

```bash
# No migration needed!
# Just run the tool and log in once
npm run rotate:stripe
# Session will be saved automatically
```

Next run will use the saved session.
