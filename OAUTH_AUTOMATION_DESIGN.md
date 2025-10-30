# OAuth Automation System - Design Document

**Date:** 2025-10-30
**Project:** Gemini Computer Use - Veria OAuth Testing
**Status:** Design Complete - Ready for Implementation

## Executive Summary

Autonomous multi-agent system using Gemini Computer Use API to test, diagnose, and fix OAuth authentication flows for Veria (https://veria.cc). The system replaces tedious manual OAuth debugging with AI-driven automation that can detect issues, diagnose root causes, and propose/apply fixes.

## Requirements

### Primary Goals
1. **Full OAuth Flow Testing**: Test all 4 auth providers (Email, Google, GitHub, Wallet) from landing → authentication → callback → dashboard
2. **Autonomous Debugging**: When errors occur, automatically diagnose root causes and propose fixes
3. **Reusable Tool**: Can be run repeatedly for regression testing and monitoring

### Success Criteria
- All OAuth flows execute successfully end-to-end
- System can be run on-demand for testing and monitoring
- Clear visibility into test execution (screenshots, logs, decisions)
- Safe autonomous fixing with approval controls

### Constraints
- API Key: Existing Gemini API key available
- Location: Standalone in `/Users/danielconnolly/Projects/Gemini/gemini-ui-testing/`
- Foundation: Build on existing `computer-use.js` infrastructure (Gemini 2.5 + Playwright)

## Architecture

### High-Level Design: Multi-Agent System

The system uses an **Orchestrator Agent** coordinating four specialized agents:

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Agent                        │
│  - Loads test scenarios                                      │
│  - Manages state machine per OAuth provider                 │
│  - Routes to specialized agents                              │
│  - Maintains execution history                               │
│  - Controls fix approval process                             │
└──────────┬────────────┬────────────┬─────────────┬──────────┘
           │            │            │             │
    ┌──────▼─────┐ ┌───▼──────┐ ┌──▼────────┐ ┌──▼──────┐
    │   Test     │ │  Vision  │ │Diagnostic │ │   Fix   │
    │ Executor   │ │ Analyst  │ │  Agent    │ │  Agent  │
    └────────────┘ └──────────┘ └───────────┘ └─────────┘
```

### Agent Responsibilities

#### 1. Test Executor Agent
**Purpose:** Browser control and interaction

**Capabilities:**
- Navigate to URLs
- Click elements (by selector or coordinates)
- Type into form fields
- Capture state (screenshot + DOM + network logs)
- Smart waiting for page loads/network idle

**Interface:**
```javascript
class TestExecutorAgent {
  async navigate(url)
  async click(selectorOrCoordinates)
  async type(selector, text)
  async captureState()
  async waitFor(condition, timeout)
}
```

#### 2. Vision Analyst Agent
**Purpose:** Screenshot analysis and state detection

**Capabilities:**
- Analyze screenshots via Gemini to determine current state
- Detect errors and anomalies
- Suggest next actions based on visual analysis
- Confidence scoring for decisions

**Interface:**
```javascript
class VisionAnalystAgent {
  async analyzeState(screenshot, expectedState)
  // Returns: {
  //   actualState,
  //   confidence,
  //   errorDetected,
  //   nextAction,
  //   reasoning
  // }

  async detectError(screenshot, context)
  // Returns: {
  //   errorType,
  //   errorMessage,
  //   severity,
  //   suggestedAgent
  // }
}
```

#### 3. Diagnostic Agent
**Purpose:** Root cause analysis when errors occur

**Capabilities:**
- Fetch Vercel function logs for server-side errors
- Analyze network traffic (HAR data)
- Validate OAuth configuration (env vars, callback URLs)
- Synthesize evidence into root cause diagnosis

**Interface:**
```javascript
class DiagnosticAgent {
  async fetchVercelLogs(deploymentId, timeRange)
  async analyzeNetworkTraffic(harData)
  async checkOAuthConfig(provider, envVars)
  async diagnoseRootCause(errorContext)
  // Returns: {
  //   rootCause,
  //   confidence,
  //   evidence[],
  //   fixSuggestions[]
  // }
}
```

#### 4. Fix Agent
**Purpose:** Propose and apply fixes to code/config

**Capabilities:**
- Generate fix plans based on diagnostics
- Show diffs for review
- Apply changes to files (with approval)
- Commit changes with descriptive messages

**Interface:**
```javascript
class FixAgent {
  async proposeFixPlan(diagnostic)
  // Returns: {
  //   changes: [{
  //     file,
  //     oldContent,
  //     newContent,
  //     reason
  //   }],
  //   risk,
  //   requiresApproval
  // }

  async applyFix(fixPlan, approved=false)
  // Applies changes, commits with message
}
```

## Execution Flow

### Single OAuth Test Execution

```
1. INITIALIZE
   Orchestrator loads scenario: "Test GitHub OAuth"
   - URL: https://veria.cc
   - Provider: GitHub
   - States: [landing, auth_clicked, provider_auth, callback, dashboard]
   - Credentials: env vars for test GitHub account

2. STATE: LANDING
   → TestExecutor.navigate("https://veria.cc")
   → TestExecutor.captureState()
   → VisionAnalyst.analyzeState(screenshot, "landing")
   → Response: { actualState: "landing", nextAction: "click_github_auth" }
   → TestExecutor.click("//button[contains(text(), 'Sign in with GitHub')]")

3. STATE: AUTH_CLICKED → PROVIDER_AUTH
   → TestExecutor.captureState()
   → VisionAnalyst.analyzeState(screenshot, "provider_auth")
   → Response: { actualState: "github_login", nextAction: "authenticate" }
   → TestExecutor.type("#login_field", process.env.GITHUB_TEST_USER)
   → TestExecutor.type("#password", process.env.GITHUB_TEST_PASS)
   → TestExecutor.click("input[type='submit']")

4. STATE: CALLBACK (ERROR DETECTED)
   → TestExecutor.captureState()
   → VisionAnalyst.analyzeState(screenshot, "callback")
   → Response: { errorDetected: true, errorType: "oauth_error" }
   → DiagnosticAgent.diagnoseRootCause({ error, screenshot, networkLogs })
   → Response: { rootCause: "callback_url_mismatch", evidence: [...] }
   → FixAgent.proposeFixPlan(diagnostic)
   → Orchestrator presents fix to user
   → User approves
   → FixAgent.applyFix(plan, approved=true)
   → Orchestrator retries from state 1

5. STATE: CALLBACK (SUCCESS)
   → TestExecutor.captureState()
   → VisionAnalyst.analyzeState(screenshot, "callback")
   → Response: { actualState: "redirecting", nextAction: "wait_for_dashboard" }

6. STATE: DASHBOARD
   → TestExecutor.captureState()
   → VisionAnalyst.analyzeState(screenshot, "dashboard")
   → Response: { actualState: "dashboard", confidence: 0.95 }
   → Orchestrator marks test as PASSED
```

### Error Handling Strategy

- **Retry Logic**: 3 attempts per state before escalating
- **State Recovery**: Can resume from any state (not just from beginning)
- **Diagnostic Bundle**: On final failure, capture full diagnostic bundle:
  - All screenshots (numbered by step)
  - Network HAR file
  - Console logs
  - Vercel function logs
  - Diagnostic analysis
- **State Persistence**: Each run writes to `/tmp/oauth-test-{timestamp}/` with JSON manifest

## Implementation Structure

### Directory Layout

```
/Users/danielconnolly/Projects/Gemini/gemini-ui-testing/
├── .env                          # GEMINI_API_KEY, test credentials
├── .gitignore                    # Ignore .env, node_modules, tmp/
├── package.json                  # Dependencies
├── OAUTH_AUTOMATION_DESIGN.md    # This document
├── README.md                     # Usage instructions
├── src/
│   ├── orchestrator.js           # Main orchestrator
│   ├── agents/
│   │   ├── test-executor.js      # Browser control agent
│   │   ├── vision-analyst.js     # Screenshot analysis agent
│   │   ├── diagnostic.js         # Error diagnosis agent
│   │   └── fix.js                # Code/config fixing agent
│   ├── scenarios/
│   │   └── veria-oauth-flows.json # Test scenarios config
│   └── utils/
│       ├── state-machine.js      # State tracking logic
│       ├── vercel-api.js         # Vercel log fetching
│       └── report-generator.js   # Test report generation
├── tmp/                          # Test run outputs (gitignored)
└── computer-use.js               # Legacy (keep for reference)
```

### Technology Stack

**Core Dependencies:**
- `@google/generative-ai` (^0.24.1) - Gemini API client
- `playwright` (^1.56.0) - Browser automation
- `dotenv` (^17.2.3) - Environment configuration

**New Dependencies to Add:**
- `@vercel/client` - Vercel API for log fetching
- `har-validator` - Network traffic analysis
- `simple-git` - Git operations for Fix Agent

### Configuration File

**scenarios/veria-oauth-flows.json:**
```json
{
  "baseUrl": "https://veria.cc",
  "providers": [
    {
      "name": "email",
      "testAccount": "test@veria.cc",
      "flow": ["landing", "email_form", "magic_link", "dashboard"]
    },
    {
      "name": "google",
      "testAccount": "process.env.GOOGLE_TEST_EMAIL",
      "flow": ["landing", "provider_auth", "callback", "dashboard"]
    },
    {
      "name": "github",
      "testAccount": "process.env.GITHUB_TEST_USER",
      "flow": ["landing", "provider_auth", "callback", "dashboard"]
    },
    {
      "name": "wallet",
      "testAccount": "process.env.WALLET_TEST_ADDRESS",
      "flow": ["landing", "wallet_connect", "signature", "dashboard"]
    }
  ],
  "states": {
    "landing": {
      "expect": "Sign in buttons visible",
      "timeout": 10000
    },
    "provider_auth": {
      "expect": "Provider login page loaded",
      "timeout": 15000
    },
    "callback": {
      "expect": "Redirecting to dashboard or error page",
      "timeout": 10000
    },
    "dashboard": {
      "expect": "User logged in, API keys visible",
      "timeout": 10000
    }
  },
  "maxRetries": 3,
  "defaultTimeout": 30000
}
```

### Environment Variables

**.env:**
```bash
# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Test Accounts
GITHUB_TEST_USER=your_github_username
GITHUB_TEST_PASS=your_github_password
GOOGLE_TEST_EMAIL=your_google_email
GOOGLE_TEST_PASS=your_google_password
WALLET_TEST_PRIVATE_KEY=your_test_wallet_key

# Vercel (for log fetching)
VERCEL_TOKEN=your_vercel_token
VERCEL_PROJECT_ID=veria-website

# Veria (for Fix Agent)
VERIA_PROJECT_PATH=/Users/danielconnolly/Projects/Veria
```

## CLI Interface

### Usage Examples

```bash
# Run all OAuth tests
node src/orchestrator.js --all

# Test specific provider
node src/orchestrator.js --provider github

# Test multiple providers
node src/orchestrator.js --provider github,google

# Debug mode (pause on errors, show detailed logs)
node src/orchestrator.js --provider github --debug

# Auto-fix mode (applies fixes without approval - USE WITH CAUTION)
node src/orchestrator.js --all --auto-fix

# Dry run (no actual fixes applied)
node src/orchestrator.js --provider github --dry-run

# Generate report only (from previous run)
node src/orchestrator.js --report tmp/oauth-test-20251030-140523
```

### Output Example

```
🖥️  Gemini OAuth Automation System
═════════════════════════════════════════

📋 Testing: GitHub OAuth
🌐 URL: https://veria.cc

[1/6] STATE: landing
  ✅ Navigated to https://veria.cc
  📸 Screenshot captured
  🤖 Vision Analysis: Detected landing page (confidence: 0.98)
  ➡️  Next action: Click "Sign in with GitHub"

[2/6] STATE: auth_clicked
  ✅ Clicked GitHub auth button
  📸 Screenshot captured
  🤖 Vision Analysis: GitHub login page detected (confidence: 0.95)
  ➡️  Next action: Authenticate with credentials

[3/6] STATE: provider_auth
  ✅ Entered credentials
  ✅ Submitted form
  📸 Screenshot captured
  ⏳ Waiting for callback...

[4/6] STATE: callback
  ❌ Error detected: OAuth AccessDenied
  🔍 Running diagnostics...

  📊 Diagnostic Report:
    Root Cause: GitHub OAuth App callback URL mismatch
    Confidence: 0.92
    Evidence:
      - GitHub OAuth App configured: https://veria.cc/api/auth/callback/github
      - NextAuth expects: https://veria.cc/api/auth/callback/github
      - Error message: "redirect_uri_mismatch"

  🔧 Fix Proposed:
    File: apps/veria-website/.env.local
    Change: NEXTAUTH_URL=https://www.veria.cc → NEXTAUTH_URL=https://veria.cc
    Risk: Low

  ⏸  Waiting for approval... (y/n): y

  ✅ Fix applied
  💾 Committed: "fix: Update NEXTAUTH_URL to match GitHub OAuth callback"
  🔄 Retrying test from state 1...

[RETRY 1/3] STATE: landing
  ...

✅ GitHub OAuth: PASSED
⏱  Duration: 45.3s
📁 Artifacts: tmp/oauth-test-20251030-140523/

═════════════════════════════════════════
Summary: 1/1 tests passed (100%)
```

## State Machine Design

Each OAuth provider has a state machine with provider-specific states:

```javascript
const stateMachine = {
  'email': ['landing', 'email_form', 'magic_link_sent', 'dashboard'],
  'google': ['landing', 'provider_auth', 'callback', 'dashboard'],
  'github': ['landing', 'provider_auth', 'callback', 'dashboard'],
  'wallet': ['landing', 'wallet_connect', 'signature_request', 'callback', 'dashboard']
};
```

**State Transitions:**
- Each state has expected conditions (visual markers, URLs, elements)
- Vision Analyst determines if conditions are met
- Orchestrator advances to next state or triggers error handling
- Failed states can be retried up to 3 times

## Security Considerations

1. **Credentials Storage**: All test credentials in `.env` (gitignored)
2. **Fix Approval**: Default requires human approval before applying fixes
3. **Scope Limiting**: Fix Agent can only modify specific files (`.env.local`, config files)
4. **Audit Trail**: All fixes are git committed with descriptive messages
5. **Dry Run Mode**: Test fixes without actually applying them

## Future Enhancements

1. **Parallel Testing**: Run multiple provider tests simultaneously
2. **Slack/Discord Notifications**: Alert on test failures
3. **CI/CD Integration**: Run as part of deployment pipeline
4. **Visual Regression**: Compare screenshots to baseline for UI changes
5. **Performance Metrics**: Track OAuth flow timing and optimize
6. **Multi-Environment**: Test staging, production, local simultaneously

## Success Metrics

- **Coverage**: All 4 OAuth providers tested successfully
- **Reliability**: 95%+ test pass rate on first attempt
- **Speed**: Average test completion < 60 seconds
- **Autonomy**: 80%+ of detected issues fixed automatically
- **Reusability**: Tool used weekly for regression testing

## Next Steps

1. **Phase 5**: Set up git worktree for isolated development
2. **Phase 6**: Create detailed implementation plan with bite-sized tasks
3. **Implementation**: Build agents incrementally (Test Executor → Vision Analyst → Diagnostic → Fix)
4. **Testing**: Validate each agent independently before integration
5. **Deployment**: Add to Veria's testing workflow

---

**Document Status:** ✅ Design Complete - Ready for Implementation
**Last Updated:** 2025-10-30
**Next Action:** Set up git worktree and create implementation plan
