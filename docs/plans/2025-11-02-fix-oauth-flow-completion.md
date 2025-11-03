# Fix OAuth Flow Completion - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix OAuth authentication flows to actually complete sign-in, reach the dashboard, and successfully sign out.

**Architecture:** The current implementation advances through state machine states without verifying actual authentication completion. We need to: (1) improve Computer Use prompts to ensure forms are submitted, (2) add robust URL-based state verification, (3) implement proper waiting for async redirects, (4) add multi-step OAuth handling for email/password entry sequences.

**Tech Stack:** Playwright (browser automation), Gemini Computer Use API, Node.js state machine

---

## Current Problems

### Problem 1: OAuth Forms Never Submit
- **Symptom:** Credentials entered but form not submitted
- **Evidence:** Test stops on Google password page, GitHub login page
- **Root Cause:** Computer Use API enters text but doesn't click submit buttons

### Problem 2: State Machine Advances Prematurely
- **Symptom:** State marked "complete" while still on login pages
- **Evidence:** Dashboard state reached but URL is `accounts.google.com`
- **Root Cause:** No URL verification before advancing states

### Problem 3: Email Verification Blocker
- **Symptom:** Email sign-in stops at "Check your email" page
- **Evidence:** URL is `/auth/verify-email`, test can't proceed
- **Root Cause:** Veria requires email verification link click

### Problem 4: Multi-Step OAuth Not Handled
- **Symptom:** Google OAuth requires: email → Next → password → Sign In
- **Evidence:** Test enters email but doesn't click "Next" button
- **Root Cause:** Single-action prompts don't handle multi-step flows

---

## Solution Architecture

### Approach A: Fix OAuth Flows (Recommended)
1. Improve prompts to explicitly request form submission
2. Add multi-turn conversation for multi-step OAuth
3. Wait for URL changes after form submission
4. Verify dashboard URL before marking complete

### Approach B: Use Session Cookies (Alternative)
1. Pre-authenticate once manually
2. Save session cookies
3. Load cookies before each test
4. Test only dashboard → signout flow

**We'll implement Approach A** because it tests the full authentication flow.

---

## Task 1: Improve Computer Use Prompts for Form Submission

**Files:**
- Modify: `src/orchestrator.js:126-132`

**Step 1: Update provider_auth prompt to explicitly request submission**

```javascript
} else if (currentState === 'provider_auth') {
  // Multi-step instructions for OAuth providers
  if (providerName === 'google') {
    goal += `You are on Google's login page. Complete these steps in sequence:
1. Enter email: ${JSON.stringify(testCredentials.email)} and click "Next" button
2. Wait for password page to load
3. Enter password: ${testCredentials.password} and click "Sign in" button
4. If you see a consent/permissions screen, click "Allow" or "Continue"
Do NOT proceed to next step until the current step completes.`;
  } else if (providerName === 'github') {
    goal += `You are on GitHub's login page. Complete these steps:
1. If you see username field, enter: ${JSON.stringify(testCredentials.username)}
2. Enter password: ${testCredentials.password}
3. Click the green "Sign in" button to submit the form
4. Wait for redirect back to veria.cc`;
  } else {
    goal += `Enter credentials: ${JSON.stringify(testCredentials)} and click the submit button to log in.`;
  }
```

**Step 2: Test prompt improvement manually**

Run: `npm run test:google`
Check: Verify in trace that email is entered AND "Next" is clicked
Expected: Should see two type_text_at actions and click_at for Next button

**Step 3: Commit**

```bash
git add src/orchestrator.js
git commit -m "feat: improve OAuth prompts for multi-step form submission"
```

---

## Task 2: Add Maximum Actions Per State

**Files:**
- Modify: `src/utils/state-machine.js:5-9`
- Modify: `src/orchestrator.js:97-107`

**Step 1: Add maxActionsPerState to state machine**

```javascript
// src/utils/state-machine.js
constructor(provider, states) {
  this.provider = provider;
  this.states = states;
  this.currentIndex = 0;
  this.history = [];
  this.maxRetries = 3;
  this.retryCount = 0;
  this.actionsInCurrentState = 0;  // NEW: Track actions per state
  this.maxActionsPerState = 10;    // NEW: Prevent infinite loops
}
```

**Step 2: Reset action counter on state advance**

```javascript
// src/utils/state-machine.js in advance() method
advance() {
  if (this.currentIndex < this.states.length) {
    this.history.push({
      state: this.getCurrentState(),
      timestamp: new Date().toISOString(),
      success: true,
      actionsPerformed: this.actionsInCurrentState  // NEW
    });
    this.currentIndex++;
    this.retryCount = 0;
    this.actionsInCurrentState = 0;  // NEW: Reset counter
    return true;
  }
  return false;
}
```

**Step 3: Increment counter in orchestrator**

```javascript
// src/orchestrator.js in main loop after action execution
stateMachine.actionsInCurrentState++;

if (stateMachine.actionsInCurrentState >= stateMachine.maxActionsPerState) {
  throw new Error(`Exceeded max actions (${stateMachine.maxActionsPerState}) for state: ${currentState}`);
}
```

**Step 4: Test action limiting**

Run: `npm run test:google`
Expected: Test should either complete or fail with "Exceeded max actions" error
Check: `results.json` should show `actionsPerformed` in history

**Step 5: Commit**

```bash
git add src/utils/state-machine.js src/orchestrator.js
git commit -m "feat: add max actions per state to prevent infinite loops"
```

---

## Task 3: Implement Robust URL Verification

**Files:**
- Modify: `src/orchestrator.js:176-206`

**Step 1: Create URL verification helper method**

```javascript
// src/orchestrator.js - add as new method before testProvider()
verifyStateTransition(currentState, currentUrl, providerName) {
  const logger = this.logger;

  switch(currentState) {
    case 'landing':
      // Should be on signin page or have clicked provider button
      return currentUrl.includes('veria.cc') || currentUrl.includes(providerName);

    case 'email_login':
      // Should still be on veria.cc but not on verify-email page yet
      return currentUrl.includes('veria.cc') && !currentUrl.includes('verify-email');

    case 'provider_auth':
      // Should be on provider domain (google.com, github.com) OR back on veria.cc
      const onProvider = currentUrl.includes('google.com') ||
                        currentUrl.includes('github.com') ||
                        currentUrl.includes('accounts.google') ||
                        currentUrl.includes('github.com/login');
      const backOnVeria = currentUrl.includes('veria.cc');
      return onProvider || backOnVeria;

    case 'callback':
      // MUST be back on veria.cc domain, NOT on signin page
      const onVeriaNotSignin = currentUrl.includes('veria.cc') &&
                               !currentUrl.includes('/signin') &&
                               !currentUrl.includes('verify-email');
      if (!onVeriaNotSignin) {
        logger.warn(`Callback failed - URL: ${currentUrl}`);
        logger.warn(`Expected veria.cc (not /signin or verify-email)`);
      }
      return onVeriaNotSignin;

    case 'dashboard':
      // MUST be on veria.cc AND have dashboard-like URL
      const dashboardUrls = ['/dashboard', '/api', '/keys', '/settings', '/profile'];
      const hasDashboardUrl = dashboardUrls.some(path => currentUrl.includes(path));
      const notOnSignin = !currentUrl.includes('/signin');
      const notOnVerify = !currentUrl.includes('verify-email');

      const onDashboard = currentUrl.includes('veria.cc') &&
                         hasDashboardUrl &&
                         notOnSignin &&
                         notOnVerify;

      if (!onDashboard) {
        logger.warn(`Dashboard verification failed - URL: ${currentUrl}`);
        logger.warn(`Expected: veria.cc with /dashboard or /api or /keys`);
      }
      return onDashboard;

    case 'signout':
      // Should be back on signin/landing page
      return currentUrl.includes('veria.cc') &&
             (currentUrl.includes('/signin') || currentUrl === 'https://www.veria.cc/');

    default:
      logger.warn(`Unknown state for verification: ${currentState}`);
      return true; // Don't block unknown states
  }
}
```

**Step 2: Replace inline verification with helper call**

```javascript
// src/orchestrator.js:176-206 - replace the existing verification code
const stateVerified = this.verifyStateTransition(
  currentState,
  currentUrl,
  providerName
);

if (stateVerified) {
  stateMachine.advance();
} else {
  this.logger.warn(`State verification failed for ${currentState}`);
  this.logger.warn(`Current URL: ${currentUrl}`);

  // Take screenshot of failed state
  await testExecutor.captureState();

  if (!stateMachine.retry()) {
    throw new Error(`Failed to verify ${currentState} state after max retries. Stuck at URL: ${currentUrl}`);
  }
}
```

**Step 3: Test URL verification**

Run: `npm run test:google`
Expected: Test should fail at callback or dashboard with clear error message
Check logs for: "Dashboard verification failed - URL: <actual-url>"

**Step 4: Commit**

```bash
git add src/orchestrator.js
git commit -m "feat: add robust URL-based state verification"
```

---

## Task 4: Increase Wait Time for Redirects

**Files:**
- Modify: `src/orchestrator.js:167-168`

**Step 1: Increase wait time after actions**

```javascript
// src/orchestrator.js - update existing wait time
// Wait for page to settle after action (especially for redirects)
await new Promise(resolve => setTimeout(resolve, 5000));  // Changed from 2000 to 5000
```

**Step 2: Add extra wait for OAuth states**

```javascript
// Add conditional wait after the base wait
if (currentState === 'provider_auth' || currentState === 'callback') {
  // OAuth redirects need more time
  this.logger.debug(`Waiting extra time for ${currentState} redirect...`);
  await new Promise(resolve => setTimeout(resolve, 3000));
}
```

**Step 3: Test redirect waiting**

Run: `npm run test:github`
Expected: Should see "Waiting extra time for provider_auth redirect..." in logs
Check: Verify URL changes in trace after increased wait

**Step 4: Commit**

```bash
git add src/orchestrator.js
git commit -m "feat: increase wait times for OAuth redirects"
```

---

## Task 5: Handle Email Verification Blocker

**Files:**
- Modify: `src/scenarios/veria-oauth-flows.json:7-11`
- Modify: `src/orchestrator.js:124-125`

**Step 1: Disable email provider (temporary workaround)**

```json
// src/scenarios/veria-oauth-flows.json
{
  "name": "email",
  "enabled": false,  // Changed from true - requires email verification
  "testAccount": {
    "email": "process.env.TEST_EMAIL_USER",
    "password": "process.env.TEST_EMAIL_PASS"
  },
  "flow": ["landing", "email_login", "dashboard", "signout"]
}
```

**Step 2: Add detection for email verification page**

```javascript
// src/orchestrator.js - add in verifyStateTransition() for email_login
case 'email_login':
  if (currentUrl.includes('verify-email')) {
    logger.error('Email verification required - cannot proceed without email access');
    logger.error('Email authentication requires clicking verification link in email');
    throw new Error('Email verification blocker: Cannot test email auth without email access');
  }
  return currentUrl.includes('veria.cc') && !currentUrl.includes('verify-email');
```

**Step 3: Document email auth limitation**

Create: `docs/EMAIL_AUTH_LIMITATION.md`

```markdown
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
```

**Step 4: Test with email disabled**

Run: `npm run test:all`
Expected: Only github and google should run, email should be skipped
Check: Summary should show "Skipped: 1" for email

**Step 5: Commit**

```bash
git add src/scenarios/veria-oauth-flows.json docs/EMAIL_AUTH_LIMITATION.md src/orchestrator.js
git commit -m "feat: disable email provider due to verification requirement"
```

---

## Task 6: Add Detailed Logging for Debugging

**Files:**
- Modify: `src/orchestrator.js:145-155`

**Step 1: Log current page state before action**

```javascript
// src/orchestrator.js - after capturing state, before getting action
this.logger.debug(`[${currentState}] Current page state:`);
this.logger.debug(`  URL: ${capturedState.metadata.url}`);
this.logger.debug(`  Title: ${capturedState.metadata.title}`);
this.logger.debug(`  Screenshot: ${capturedState.screenshot ? 'captured' : 'none'}`);
```

**Step 2: Log action being requested**

```javascript
// After getting action from Computer Use
if (action) {
  this.logger.debug(`[${currentState}] Requesting action: ${action.name}`);
  this.logger.debug(`  Args: ${JSON.stringify(action.args || {})}`);
} else {
  this.logger.error(`[${currentState}] No action received from Computer Use API`);
}
```

**Step 3: Log state transition**

```javascript
// After state verification
if (stateVerified) {
  this.logger.success(`✓ ${currentState} → ${stateMachine.getNextState() || 'COMPLETE'}`);
  this.logger.success(`  Actions performed: ${stateMachine.actionsInCurrentState}`);
  stateMachine.advance();
}
```

**Step 4: Test enhanced logging**

Run: `npm run test:github`
Expected: Logs should show detailed state transitions with URLs and action counts
Check: `execution.log` should have [state] prefix on debug lines

**Step 5: Commit**

```bash
git add src/orchestrator.js
git commit -m "feat: add detailed logging for OAuth flow debugging"
```

---

## Task 7: Test and Validate Complete Flow

**Files:**
- Test: Run full test suite
- Verify: Check traces and logs

**Step 1: Test GitHub OAuth flow**

Run: `npm run test:github`

**Expected outcomes:**
- ✅ Landing → clicks "Sign in with GitHub"
- ✅ Provider auth → enters credentials AND clicks "Sign in"
- ✅ Callback → redirects back to veria.cc (not signin page)
- ✅ Dashboard → URL is veria.cc/dashboard or /api
- ✅ Signout → clicks signout button
- ✅ Returns to signin page

**If test fails, check:**
1. Execution log for URL at each state
2. Screenshot showing what page it's actually on
3. Whether "State verification failed" appears
4. Action count - did it hit max actions?

**Step 2: Test Google OAuth flow**

Run: `npm run test:google`

**Expected outcomes:**
- ✅ Landing → clicks "Sign in with Google"
- ✅ Provider auth → enters email, clicks Next, enters password, clicks Sign in
- ✅ Callback → redirects to veria.cc after OAuth consent
- ✅ Dashboard → URL is veria.cc/dashboard
- ✅ Signout → finds and clicks signout

**Common failure points:**
- Email entered but "Next" not clicked → check prompt
- Password page timeout → increase wait time
- Still on accounts.google.com → OAuth didn't complete

**Step 3: Analyze failures and iterate**

For each failure:

```bash
# Check what page we're stuck on
cat tmp/oauth-test-*/execution.log | jq -r '.[] | select(.message | contains("After")) | "\(.message)"' | tail -10

# View last screenshot
open tmp/oauth-test-*/screenshot-*.png

# Check trace for detailed actions
npx playwright show-trace tmp/oauth-test-*/trace.zip
```

Common fixes:
- **Stuck on provider login:** Improve prompt to explicitly click submit button
- **Stuck at callback:** Increase wait time for redirect
- **Stuck at dashboard verification:** Check if dashboard URL pattern is correct

**Step 4: Document test results**

Create: `docs/TEST_RESULTS.md`

```markdown
# OAuth Test Results

## Test Date: YYYY-MM-DD

### GitHub OAuth
- Status: [PASS/FAIL]
- Time: X seconds
- States completed: X/5
- Issues: [describe any]

### Google OAuth
- Status: [PASS/FAIL]
- Time: X seconds
- States completed: X/5
- Issues: [describe any]

### Email Auth
- Status: DISABLED
- Reason: Requires email verification

## Trace Files
- GitHub: tmp/oauth-test-*/trace.zip
- Google: tmp/oauth-test-*/trace.zip

## Next Steps
[List any remaining issues]
```

**Step 5: Final commit**

```bash
git add docs/TEST_RESULTS.md
git commit -m "docs: add OAuth test results and analysis"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] Test advances through states only when URL changes correctly
- [ ] Forms are submitted (not just filled)
- [ ] OAuth redirects complete back to veria.cc
- [ ] Dashboard state only passes when on /dashboard or /api URL
- [ ] Signout button is found and clicked
- [ ] After signout, returns to signin page
- [ ] Trace files show complete flow from signin to signout
- [ ] Logs clearly show URL at each state transition
- [ ] Failed states don't advance (retry instead)
- [ ] Max retries prevents infinite loops

---

## Testing Strategy

### Unit Testing (Not Required)
These changes are integration-level, no unit tests needed.

### Manual Testing Required
```bash
# Test each provider individually
npm run test:github
npm run test:google

# Check results
cat tmp/oauth-test-*/results.json | jq '.'

# View traces
npx playwright show-trace tmp/oauth-test-*/trace.zip
```

### Success Criteria
- Test reaches dashboard state with correct URL
- At least one provider (GitHub or Google) completes full flow
- Trace shows: signin → provider auth → callback → dashboard → signout

---

## Rollback Plan

If changes break tests completely:

```bash
# Revert all changes
git log --oneline -10  # Find commit before changes
git revert <commit-sha>

# Or restore specific files
git checkout HEAD~5 -- src/orchestrator.js
git checkout HEAD~5 -- src/utils/state-machine.js
```

---

## Known Limitations

1. **Email authentication disabled** - Requires email verification link
2. **OAuth consent screens** - May require manual approval on first run
3. **Rate limiting** - Providers may block repeated login attempts
4. **2FA** - Test accounts must have 2FA disabled
5. **CAPTCHA** - Cannot be automated, test accounts must be trusted

---

## Future Enhancements

1. **Session cookie persistence** - Save authenticated sessions for faster tests
2. **Parallel provider testing** - Test all providers concurrently
3. **Dashboard interaction tests** - Test API key creation, profile updates
4. **Error recovery** - Auto-retry with exponential backoff
5. **Visual regression testing** - Compare dashboard screenshots over time

---

## References

- [Gemini Computer Use API Docs](https://ai.google.dev/gemini-api/docs/computer-use)
- [Playwright Tracing](https://playwright.dev/docs/trace-viewer)
- [OAuth 2.0 Flow](https://oauth.net/2/)
- Project docs: `docs/OAUTH_AUTOMATION_DESIGN.md`
