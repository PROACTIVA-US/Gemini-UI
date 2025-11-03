# Computer Use API Coordinate Analysis

## Test Run: 2025-11-02T22:11:34 (GitHub OAuth)

### Actions Performed

#### State 1: Landing
**Action:** `click_at`
- **Coordinates:** `{x: 798, y: 32}`
- **Purpose:** Click "Sign in with GitHub" button
- **Normalized:** (79.8%, 3.2%) of screen
- **Pixel coords:** ~(1532, 34) on 1920x1080 screen
- **Result:** ✅ Successfully navigated to GitHub login page

#### State 2: Provider Auth (GitHub Login)
**Action:** `click_at`
- **Coordinates:** `{x: 500, y: 577}`
- **Purpose:** Unknown (should be entering credentials)
- **Normalized:** (50%, 57.7%) of screen
- **Pixel coords:** ~(960, 623) on 1920x1080 screen
- **Result:** ⚠️ Clicked something but no credentials entered

#### State 3: Callback
**Action 1:** `type_text_at`
- **Coordinates:** `{x: 500, y: 265}`
- **Text:** `"test@veria.cc"`
- **Normalized:** (50%, 26.5%) of screen
- **Pixel coords:** ~(960, 286) on 1920x1080 screen
- **Result:** ⚠️ Typed email but we're still on GitHub (not back on veria.cc)

**Action 2:** `type_text_at`
- **Coordinates:** `{x: 500, y: 330}`
- **Text:** `"G3tup1N1t!"`
- **Normalized:** (50%, 33%) of screen
- **Pixel coords:** ~(960, 356) on 1920x1080 screen
- **Result:** ⚠️ Typed password but on wrong page

#### State 4: Dashboard
**Action 1:** `type_text_at`
- **Coordinates:** `{x: 500, y: 330}`
- **Text:** `"G3tup1N1t!"`
- **Result:** ⚠️ Retrying password entry

**Action 2:** `click_at`
- **Coordinates:** `{x: 500, y: 391}`
- **Result:** ❌ Still stuck on GitHub login

## Key Findings

### Issue 1: Wrong State for Credential Entry
The API is trying to enter credentials during the **callback** and **dashboard** states instead of **provider_auth** state.

**Expected flow:**
1. Landing → Click GitHub button ✅
2. Provider Auth → **Enter username, password, click Sign in** ❌
3. Callback → Wait for redirect ✅
4. Dashboard → Verify logged in ✅

**Actual flow:**
1. Landing → Click GitHub button ✅
2. Provider Auth → **Just clicks at (500, 577)** ❌
3. Callback → **Tries to enter credentials** ❌ (too late!)
4. Dashboard → **Tries to enter credentials** ❌ (still too late!)

### Issue 2: State Verification Too Permissive

The state verification for `provider_auth` returns `true` for any URL containing `github.com`:

```javascript
case 'provider_auth':
  const onProvider = currentUrl.includes('google.com') ||
                    currentUrl.includes('github.com') ||
                    ...;
  const backOnVeria = currentUrl.includes('veria.cc');
  return onProvider || backOnVeria;
```

This allows the state machine to advance **before credentials are entered**.

### Issue 3: Computer Use API Not Understanding Form Flow

The prompt says:
```
You are on GitHub's login page. Complete these steps:
1. If you see username field, enter: "test@veria.cc"
2. Enter password: G3tup1N1t!
3. Click the green "Sign in" button to submit the form
4. Wait for redirect back to veria.cc
```

But the API:
- Clicks once at (500, 577) - unknown purpose
- Advances to callback state
- **Then** tries to enter credentials (too late)

## Root Cause

**The Computer Use API doesn't understand it needs to complete ALL steps before the page changes.**

The API sees:
1. GitHub login page
2. Clicks something
3. Page doesn't immediately change
4. State advances (because URL still contains "github.com")
5. Later tries to enter credentials but it's the wrong state

## Solutions

### Solution A: More Explicit Prompting
Change prompt to:
```
STOP. Do NOT advance until you have completed ALL these actions:
1. Click the username/email input field
2. Type "test@veria.cc"
3. Click the password input field
4. Type "G3tup1N1t!"
5. Click the "Sign in" button
Only after clicking Sign in should you expect the page to change.
```

### Solution B: Don't Verify URL Until Multiple Actions
Change verification to require:
```javascript
case 'provider_auth':
  // Must perform at least 3 actions (username, password, submit)
  if (stateMachine.actionsInCurrentState < 3) {
    logger.warn('Provider auth needs at least 3 actions (credentials + submit)');
    return false;
  }
  // Then check if we're back on veria or still on provider
  return currentUrl.includes('veria.cc');
```

### Solution C: Use Playwright Selectors
Replace coordinate clicking with actual form interaction:
```javascript
await page.fill('input[name="login"]', username);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
```

## Recommended Fix

**Combine A + B:**
1. Improve prompts to be more explicit
2. Don't advance provider_auth state until at least 3 actions performed
3. Only advance when URL changes back to veria.cc

This ensures credentials are entered before state advances.

## Trace Viewer Verification

Open trace to confirm:
```bash
npx playwright show-trace tmp/oauth-test-2025-11-02T22-11-34/trace.zip
```

Look for:
- Screenshots showing GitHub login form
- Whether click at (500, 577) actually focused an input
- Whether type_text_at in callback state typed into nothing (no focused field)
