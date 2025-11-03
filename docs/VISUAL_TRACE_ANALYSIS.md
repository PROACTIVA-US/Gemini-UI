# Visual Trace Analysis - GitHub OAuth Flow

## Screenshot Evidence

### Screenshot 004-006: Veria Sign-In Page
- Shows "Sign In to Veria" form
- Has "Continue with GitHub" button
- **Action:** Landing state clicked GitHub button successfully

### Screenshot 008: GitHub Login (Empty)
- **URL:** github.com/login
- Username field: **EMPTY** ❌
- Password field: **EMPTY** ❌
- This is DURING provider_auth state
- The API only clicked at (500, 577) - unknown element
- **No credentials entered yet**

### Screenshot 010: GitHub Login (Partial)
- Username field: **"test@veria.cc"** ✅
- Password field: **EMPTY** ❌
- This is DURING callback state
- First `type_text_at` action worked, but in wrong state!

### Screenshot 017: GitHub Login (Complete)
- Username field: **"test@veria.cc"** ✅
- Password field: **"•••••••••••"** ✅
- Button: **"Signing in..."** ✅
- **Form was submitted!**
- This is DURING dashboard state (too late)

## Root Cause Confirmed

### The Timeline

1. **Provider Auth State:**
   - API receives: "Enter credentials and submit form"
   - API action: `click_at (500, 577)` - clicks something unknown
   - NO typing of credentials
   - State advances because URL contains "github.com"

2. **Callback State:**
   - API action: `type_text_at (500, 265)` with "test@veria.cc"
   - Enters username (we see it in screenshot 010)
   - State advances

3. **Dashboard State:**
   - API action: `type_text_at (500, 330)` with "G3tup1N1t!"
   - Enters password
   - API action: `click_at (500, 391)` - clicks Sign in button
   - Form submits (we see "Signing in..." in screenshot 017)
   - **But test ends before auth completes**

## The Problem

**State machine advances too early, before credentials are entered.**

The `provider_auth` state verification accepts any github.com URL:

```javascript
case 'provider_auth':
  const onProvider = currentUrl.includes('github.com');
  return onProvider || backOnVeria;
```

This means:
1. Land on GitHub login page
2. Click something (anything)
3. URL still has "github.com" ✅
4. State advances to "callback"
5. **Credentials get entered in wrong states**

## The Fix

### Option 1: Don't Advance Until Multiple Actions (RECOMMENDED)

```javascript
case 'provider_auth':
  // OAuth login requires multiple actions: username, password, submit
  const minActionsRequired = 3;

  if (stateMachine.actionsInCurrentState < minActionsRequired) {
    logger.debug(`Provider auth needs ${minActionsRequired} actions, currently at ${stateMachine.actionsInCurrentState}`);
    return false; // Don't advance yet
  }

  // After 3+ actions, verify we're back on veria.cc (OAuth completed)
  if (!currentUrl.includes('veria.cc')) {
    logger.warn(`Provider auth: ${minActionsRequired} actions performed but still on ${currentUrl}`);
    return false;
  }

  return true;
```

This ensures:
- At least 3 actions (username + password + submit)
- Don't advance until OAuth redirects back to veria.cc
- API has time to complete the form

### Option 2: Improve Prompt with Explicit Wait

```javascript
goal += `You are on GitHub's login page. Complete these steps IN ORDER:
1. Click the username/email input field
2. Type: ${JSON.stringify(testCredentials.username)}
3. Click the password input field
4. Type: ${testCredentials.password}
5. Click the green "Sign in" button
6. WAIT - do NOT report completion until you see the page start redirecting to veria.cc

IMPORTANT: Complete ALL 6 steps before this state can advance.`;
```

### Option 3: Combined Approach (BEST)

Implement both:
1. Improve prompts to be more explicit about ALL steps
2. Don't advance state until minimum actions AND URL changes

## Actual Success!

The screenshots prove the Computer Use API CAN:
- ✅ Type into form fields correctly
- ✅ Click submit buttons
- ✅ Complete multi-step forms

The ONLY issue is **state timing** - it advances before the API finishes.

## Next Implementation

File: `src/orchestrator.js` - Update `verifyStateTransition()`:

```javascript
case 'provider_auth':
  // OAuth requires: enter username, enter password, click submit (min 3 actions)
  const minOAuthActions = 3;

  if (stateMachine.actionsInCurrentState < minOAuthActions) {
    logger.debug(`Provider auth needs ${minOAuthActions} actions (username, password, submit), currently: ${stateMachine.actionsInCurrentState}`);
    return false;
  }

  // After sufficient actions, verify OAuth completed (back on veria.cc)
  const oauthComplete = currentUrl.includes('veria.cc');

  if (!oauthComplete) {
    // Still on provider domain after 3+ actions - might need more time
    if (stateMachine.actionsInCurrentState >= minOAuthActions + 2) {
      logger.warn(`Provider auth: ${stateMachine.actionsInCurrentState} actions but still at ${currentUrl}`);
    }
    return false;
  }

  logger.success(`Provider auth complete - performed ${stateMachine.actionsInCurrentState} actions, now on veria.cc`);
  return true;
```

This fix will:
1. Keep state machine in provider_auth until 3+ actions
2. Only advance when back on veria.cc
3. Give API time to complete the entire flow
4. Fix the timing issue completely

## Expected Result After Fix

With this change, the flow will be:

1. **Provider Auth:**
   - Action 1: type username
   - Action 2: type password
   - Action 3: click submit
   - Actions 4-N: wait for redirect
   - Verify: URL contains veria.cc ✅
   - Advance to callback

2. **Callback:**
   - Already on veria.cc
   - Just wait for dashboard to load

3. **Dashboard:**
   - Verify dashboard URL
   - Complete!

The screenshots prove the API is working - we just need better state verification!
