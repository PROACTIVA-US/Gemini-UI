# Gemini E2E Testing Framework

An AI-powered end-to-end testing framework using Google's Gemini Computer Use API. This framework allows you to write high-level test scenarios that Gemini executes by visually understanding and interacting with web pages.

## 🌟 Features

### 1. **Universal Test Scenarios**
Test any web application flow using natural language goals:
- ✅ Form validation
- ✅ Navigation testing
- ✅ Search functionality
- ✅ E-commerce checkout flows
- ✅ OAuth authentication
- ✅ Responsive design
- ✅ Accessibility checks
- ✅ Performance testing

### 2. **AI-Powered Execution**
- **Visual Understanding**: Gemini sees the page like a human tester
- **Natural Language Goals**: No brittle CSS selectors
- **Adaptive Interactions**: Handles dynamic UIs automatically
- **Context Awareness**: Remembers previous actions

### 3. **Enhanced Fix Agent**
When tests fail, the AI:
- 🔍 Diagnoses root cause with code context
- 💡 Proposes specific fixes with explanations
- ✅ Validates fixes before applying
- 🔄 Creates rollback checkpoints
- 📊 Provides confidence scores and alternatives

## 🚀 Quick Start

### Installation

```bash
cd gemini-ui-testing
npm install
```

### Environment Setup

Create a `.env` file:

```bash
# Required
GEMINI_API_KEY=your_gemini_api_key

# Optional (for fix agent features)
VERIA_PROJECT_PATH=/path/to/your/project
VERCEL_TOKEN=your_vercel_token
VERCEL_PROJECT_ID=your_project_id
```

### Run Your First Test

```bash
# Run a specific test scenario
npm run scenario:form

# Run all scenarios
npm run scenario:all

# Run with auto-fix enabled
node src/scenario-runner.js --scenario navigation-test --auto-fix --debug
```

## 📋 Test Scenarios

### 1. Form Validation Testing

```bash
npm run scenario:form
```

Tests form validation by:
- Submitting empty forms
- Testing invalid inputs
- Verifying error messages
- Submitting valid data

**Configuration:** `src/scenarios/test-scenarios.json` → `form-validation`

### 2. Navigation Testing

```bash
npm run scenario:nav
```

Tests all navigation links:
- Clicks all header navigation links
- Tests footer links
- Verifies no broken links
- Checks each page loads correctly

**Configuration:** `src/scenarios/test-scenarios.json` → `navigation-test`

### 3. Search Functionality

```bash
npm run scenario:search
```

Tests search features:
- Empty search handling
- Valid search queries
- No results handling
- Results display validation

**Configuration:** `src/scenarios/test-scenarios.json` → `search-functionality`

### 4. Checkout Flow (E-commerce)

```bash
npm run scenario:checkout
```

Complete e-commerce flow:
- Product page viewing
- Add to cart
- Cart verification
- Checkout process
- Payment (test mode)
- Order confirmation

**Configuration:** `src/scenarios/test-scenarios.json` → `checkout-flow`

### 5. Responsive Design Testing

```bash
npm run scenario:responsive
```

Tests across viewports:
- Desktop (1920x1080)
- Tablet (768x1024)
- Mobile (375x667)

**Configuration:** `src/scenarios/test-scenarios.json` → `responsive-design`

### 6. Accessibility Testing

```bash
npm run scenario:a11y
```

Basic accessibility checks:
- Keyboard navigation
- Color contrast
- Alt text on images

**Configuration:** `src/scenarios/test-scenarios.json` → `accessibility-test`

### 7. Performance Testing

```bash
npm run scenario:perf
```

Performance metrics:
- Page load time
- Resource count
- Total page size
- Lighthouse scores

**Configuration:** `src/scenarios/test-scenarios.json` → `performance-test`

## 🔧 Enhanced Fix Agent

### Interactive Fix Analysis

```bash
npm run fix:analyze
```

Interactively analyze and fix test failures:
1. Enter error message
2. Provide page URL (optional)
3. Add screenshot path (optional)
4. Review AI-generated fix proposal
5. Approve or decline changes

### Analyze From Log File

```bash
npm run fix:from-log tmp/test-results/execution.log
```

Automatically finds and fixes errors from test logs.

### Command Line Usage

```bash
# Analyze specific error
node scripts/fix-analyzer.js \
  --error "timeout waiting for selector" \
  --url "https://example.com" \
  --screenshot tmp/error.png

# Auto-apply fixes
node scripts/fix-analyzer.js \
  --from-log tmp/test-results/execution.log \
  --auto-apply
```

## 📖 Creating Custom Test Scenarios

### Scenario Structure

Edit `src/scenarios/test-scenarios.json`:

```json
{
  "scenarios": [
    {
      "name": "my-custom-test",
      "description": "Description of what this tests",
      "baseUrl": "https://myapp.com",
      "enabled": true,
      "testData": {
        "user": {
          "email": "test@example.com",
          "password": "testpass123"
        }
      },
      "flow": [
        {
          "state": "landing",
          "goal": "Navigate to homepage and verify logo is visible",
          "validation": {
            "urlContains": "myapp.com"
          }
        },
        {
          "state": "login",
          "goal": "Click login button, fill email and password, submit form",
          "inputs": "testData.user",
          "validation": {
            "hasSuccess": true,
            "urlChanged": true
          }
        }
      ]
    }
  ]
}
```

### Run Your Custom Scenario

```bash
node src/scenario-runner.js --scenario my-custom-test --debug
```

## 🎯 Test Flow Steps

Each step in a scenario can include:

### Goal (Required)
Natural language description of what to do:
```json
{
  "goal": "Find the search input and search for 'product'"
}
```

### Inputs (Optional)
Data to input during the step:
```json
{
  "inputs": {
    "email": "user@example.com",
    "password": "password123"
  }
}
```

Or reference test data:
```json
{
  "inputs": "testData.credentials"
}
```

### Validations (Optional)
Checks to perform after the step:
```json
{
  "validation": {
    "urlContains": "/dashboard",
    "hasErrors": false,
    "hasSuccess": true,
    "noErrors": true
  }
}
```

Available validations:
- `urlContains`: Check URL contains string
- `urlChanged`: Verify URL changed
- `hasErrors`: Check for error messages
- `hasSuccess`: Check for success messages
- `noErrors`: Verify no errors on page
- `hasForm`: Check form is present
- `hasResults`: Check search results exist

## 🛠️ Enhanced Fix Agent Capabilities

### Error Categories

The fix agent automatically categorizes errors:

1. **Selector Errors** - Missing or incorrect element selectors
2. **Auth Errors** - OAuth/authentication configuration issues
3. **Network Errors** - API/CORS/fetch failures
4. **Config Errors** - Missing environment variables
5. **Timing Errors** - Race conditions, async issues
6. **Form Errors** - Form validation, submission issues

### Fix Proposal Features

Each fix includes:
- **Root Cause Analysis** - Detailed explanation
- **Confidence Score** - AI confidence level (0-1)
- **Specific Changes** - Exact file modifications with line numbers
- **Risk Level** - Low/Medium/High risk assessment
- **Testing Steps** - How to verify the fix works
- **Alternatives** - Other possible solutions

### Example Fix Output

```
🔧 PROPOSED FIX PLAN
======================================================================

📋 Summary: Update selector to use data-testid attribute
🎯 Root Cause: CSS selector is too specific and breaks when HTML changes
⚠️  Risk Level: LOW
📊 Confidence: 85%
✅ Requires Approval: NO

💡 Alternative Approaches:
   1. Use more generic selector like [type="submit"]
   2. Wait for element with retry logic

======================================================================
📝 PROPOSED CHANGES:
======================================================================

[1/1] File: src/agents/test-executor.js
    Reason: Replace brittle CSS selector with robust data attribute
    Line: 115

    OLD:
    await this.page.click('button.submit-btn.primary');

    NEW:
    await this.page.click('[data-testid="submit-button"]');
    ------------------------------------------------------------------

🧪 TESTING STEPS:
1. Run the test scenario again
2. Verify the button is clicked successfully
3. Check no selector timeout errors occur

======================================================================
```

## 📊 Test Results

Results are saved to `tmp/test-{scenario}-{timestamp}/`:
- `results.json` - Detailed test results
- `screenshots/` - Screenshots at each step
- `trace.zip` - Playwright trace (view with `npx playwright show-trace`)
- `execution.log` - Full execution log

### View Trace

```bash
npx playwright show-trace tmp/test-form-validation-2025-01-01/trace.zip
```

## 🐛 Debugging

### Enable Debug Logging

```bash
node src/scenario-runner.js --scenario form-validation --debug
```

### Common Issues

#### 1. Screenshot/Vision Issues
```bash
# Gemini can't see page elements
# Solution: Check viewport size, wait for page load
```

#### 2. Timeout Errors
```bash
# Actions timing out
# Solution: Increase timeout, add explicit waits
```

#### 3. Selector Changes
```bash
# Elements not found
# Solution: Use enhanced fix agent to update selectors
```

## 🔄 Workflow Example

### 1. Write Test Scenario
```json
{
  "name": "user-registration",
  "baseUrl": "https://myapp.com/signup",
  "flow": [
    {
      "state": "fill-form",
      "goal": "Fill registration form with test data",
      "inputs": {
        "name": "Test User",
        "email": "test@example.com",
        "password": "Test123!"
      }
    }
  ]
}
```

### 2. Run Test
```bash
npm run scenario -- --scenario user-registration
```

### 3. If Test Fails
```bash
# Analyze the failure
npm run fix:analyze
# Or analyze from log
npm run fix:from-log tmp/test-user-registration-*/execution.log
```

### 4. Review and Apply Fix
The fix agent will:
- Show what went wrong
- Propose specific changes
- Ask for approval
- Apply fix and create git checkpoint

### 5. Re-run Test
```bash
npm run scenario -- --scenario user-registration
```

## 📈 Advanced Usage

### Parallel Testing

Run multiple scenarios in sequence:
```bash
npm run scenario:all
```

### Custom Viewports

Add to scenario:
```json
{
  "viewports": [
    { "width": 1440, "height": 900, "name": "laptop" },
    { "width": 414, "height": 896, "name": "iphone-11" }
  ]
}
```

### Network Throttling

Modify test executor:
```javascript
await context.route('**/*', route => {
  setTimeout(() => route.continue(), 100); // Add 100ms delay
});
```

## 🤝 Contributing

### Adding New Scenario Types

1. Add scenario to `src/scenarios/test-scenarios.json`
2. Add validation logic to `src/scenario-runner.js`
3. Add npm script to `package.json`
4. Update documentation

### Improving Fix Agent

1. Add error patterns to `categorizeError()` in `src/agents/enhanced-fix.js`
2. Add fix strategies to `getCategorySpecificGuidance()`
3. Test with real failures

## 📚 API Reference

### ScenarioRunner

```javascript
const runner = new ScenarioRunner({
  debug: true,
  autoFix: true
});

await runner.runScenario('form-validation');
```

### EnhancedFixAgent

```javascript
const fixAgent = new EnhancedFixAgent(logger, apiKey, projectPath);

const fixPlan = await fixAgent.proposeEnhancedFix(diagnostic, context);
await fixAgent.showEnhancedDiff(fixPlan);
const result = await fixAgent.applyFixWithValidation(fixPlan, true);
```

## 🎓 Learn More

- [Gemini Computer Use API Docs](https://ai.google.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [OAuth Testing Guide](./docs/oauth-testing.md)

## 📄 License

ISC
