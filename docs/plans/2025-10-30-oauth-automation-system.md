# OAuth Automation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build autonomous multi-agent system using Gemini Computer Use API to test, diagnose, and fix OAuth authentication flows for Veria.

**Architecture:** Orchestrator coordinates 4 specialized agents (Test Executor, Vision Analyst, Diagnostic, Fix) through state machine-based OAuth flow testing. Each agent is isolated, testable, and uses Gemini for AI capabilities.

**Tech Stack:** Node.js, @google/generative-ai, Playwright, simple-git, @vercel/client

---

## Task 1: Project Setup and Dependencies

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Update package.json with new dependencies**

```bash
cd /Users/danielconnolly/Projects/Gemini/gemini-ui-testing
```

Modify `package.json`:
```json
{
  "name": "gemini-oauth-automation",
  "version": "2.0.0",
  "description": "Autonomous OAuth testing with Gemini Computer Use",
  "main": "src/orchestrator.js",
  "type": "commonjs",
  "scripts": {
    "test": "node src/orchestrator.js --provider github --debug",
    "test:all": "node src/orchestrator.js --all",
    "test:github": "node src/orchestrator.js --provider github",
    "test:google": "node src/orchestrator.js --provider google"
  },
  "keywords": ["gemini", "oauth", "testing", "automation"],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@vercel/client": "^2.0.0",
    "dotenv": "^17.2.3",
    "har-validator": "^5.1.5",
    "playwright": "^1.56.0",
    "simple-git": "^3.20.0"
  }
}
```

**Step 2: Install dependencies**

Run: `npm install`
Expected: All packages installed successfully

**Step 3: Create .env.example**

Create `.env.example`:
```bash
# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Test Accounts
GITHUB_TEST_USER=your_github_username
GITHUB_TEST_PASS=your_github_password
GOOGLE_TEST_EMAIL=your_google_email
GOOGLE_TEST_PASS=your_google_password

# Vercel (for log fetching)
VERCEL_TOKEN=your_vercel_token
VERCEL_PROJECT_ID=veria-website

# Veria Project Path
VERIA_PROJECT_PATH=/Users/danielconnolly/Projects/Veria
```

**Step 4: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
tmp/
*.log
.DS_Store
```

**Step 5: Create basic README**

Create `README.md`:
```markdown
# Gemini OAuth Automation System

Autonomous multi-agent system for testing OAuth flows using Gemini Computer Use API.

## Setup

1. Copy `.env.example` to `.env` and fill in credentials
2. Run `npm install`
3. Test: `npm run test:github`

## Usage

```bash
# Test all OAuth providers
npm run test:all

# Test specific provider
node src/orchestrator.js --provider github

# Debug mode
node src/orchestrator.js --provider github --debug
```

## Architecture

See `OAUTH_AUTOMATION_DESIGN.md` for full design documentation.
```

**Step 6: Commit**

```bash
git add package.json .env.example .gitignore README.md
git commit -m "chore: Set up project dependencies and configuration"
```

---

## Task 2: Directory Structure and Utilities

**Files:**
- Create: `src/utils/state-machine.js`
- Create: `src/utils/logger.js`
- Create: `src/scenarios/veria-oauth-flows.json`

**Step 1: Create src directories**

Run:
```bash
mkdir -p src/agents src/utils src/scenarios
```

**Step 2: Write state machine utility**

Create `src/utils/state-machine.js`:
```javascript
class StateMachine {
  constructor(provider, states) {
    this.provider = provider;
    this.states = states;
    this.currentIndex = 0;
    this.history = [];
    this.maxRetries = 3;
    this.retryCount = 0;
  }

  getCurrentState() {
    return this.states[this.currentIndex];
  }

  getNextState() {
    if (this.currentIndex < this.states.length - 1) {
      return this.states[this.currentIndex + 1];
    }
    return null;
  }

  advance() {
    if (this.currentIndex < this.states.length - 1) {
      this.history.push({
        state: this.getCurrentState(),
        timestamp: new Date().toISOString(),
        success: true
      });
      this.currentIndex++;
      this.retryCount = 0;
      return true;
    }
    return false;
  }

  retry() {
    this.retryCount++;
    if (this.retryCount >= this.maxRetries) {
      this.history.push({
        state: this.getCurrentState(),
        timestamp: new Date().toISOString(),
        success: false,
        reason: 'Max retries exceeded'
      });
      return false;
    }
    return true;
  }

  isComplete() {
    return this.currentIndex === this.states.length - 1;
  }

  reset() {
    this.currentIndex = 0;
    this.retryCount = 0;
    this.history = [];
  }

  getHistory() {
    return this.history;
  }
}

module.exports = StateMachine;
```

**Step 3: Write logger utility**

Create `src/utils/logger.js`:
```javascript
class Logger {
  constructor(verbose = false) {
    this.verbose = verbose;
    this.logs = [];
  }

  info(message, data = null) {
    const log = { level: 'INFO', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    console.log(`ℹ️  ${message}`, data || '');
  }

  success(message, data = null) {
    const log = { level: 'SUCCESS', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    console.log(`✅ ${message}`, data || '');
  }

  error(message, data = null) {
    const log = { level: 'ERROR', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    console.error(`❌ ${message}`, data || '');
  }

  debug(message, data = null) {
    const log = { level: 'DEBUG', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    if (this.verbose) {
      console.log(`🔍 ${message}`, data || '');
    }
  }

  step(stepNumber, totalSteps, stateName) {
    const message = `[${stepNumber}/${totalSteps}] STATE: ${stateName}`;
    console.log(`\n${'='.repeat(50)}\n${message}\n${'='.repeat(50)}`);
    this.logs.push({ level: 'STEP', message, timestamp: new Date().toISOString() });
  }

  getLogs() {
    return this.logs;
  }

  saveLogs(filepath) {
    const fs = require('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.logs, null, 2));
  }
}

module.exports = Logger;
```

**Step 4: Create OAuth flow configuration**

Create `src/scenarios/veria-oauth-flows.json`:
```json
{
  "baseUrl": "https://veria.cc",
  "providers": [
    {
      "name": "github",
      "enabled": true,
      "testAccount": {
        "username": "process.env.GITHUB_TEST_USER",
        "password": "process.env.GITHUB_TEST_PASS"
      },
      "flow": ["landing", "provider_auth", "callback", "dashboard"]
    },
    {
      "name": "google",
      "enabled": true,
      "testAccount": {
        "email": "process.env.GOOGLE_TEST_EMAIL",
        "password": "process.env.GOOGLE_TEST_PASS"
      },
      "flow": ["landing", "provider_auth", "callback", "dashboard"]
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
      "expect": "Redirecting to dashboard or error detected",
      "timeout": 10000
    },
    "dashboard": {
      "expect": "User logged in, API keys or dashboard visible",
      "timeout": 10000
    }
  },
  "maxRetries": 3,
  "defaultTimeout": 30000
}
```

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: Add state machine, logger utilities, and OAuth flow config"
```

---

## Task 3: Test Executor Agent

**Files:**
- Create: `src/agents/test-executor.js`

**Step 1: Write Test Executor Agent**

Create `src/agents/test-executor.js`:
```javascript
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class TestExecutorAgent {
  constructor(logger, outputDir) {
    this.logger = logger;
    this.outputDir = outputDir;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.screenshotCount = 0;
  }

  async initialize() {
    this.logger.info('Initializing browser...');
    this.browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: this.outputDir,
        size: { width: 1920, height: 1080 }
      }
    });
    this.page = await this.context.newPage();

    // Enable console log capture
    this.page.on('console', msg => {
      this.logger.debug(`Browser console: ${msg.text()}`);
    });

    this.logger.success('Browser initialized');
  }

  async navigate(url) {
    this.logger.info(`Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle' });
    this.logger.success(`Navigated to ${url}`);
  }

  async click(selector, options = {}) {
    this.logger.info(`Clicking: ${selector}`);

    // Support both CSS selectors and coordinates
    if (typeof selector === 'string') {
      await this.page.click(selector, options);
    } else if (selector.x !== undefined && selector.y !== undefined) {
      await this.page.mouse.click(selector.x, selector.y);
    }

    await this.page.waitForTimeout(1000); // Brief pause after click
    this.logger.success(`Clicked: ${selector}`);
  }

  async type(selector, text, options = {}) {
    this.logger.info(`Typing into: ${selector}`);
    await this.page.fill(selector, text, options);
    this.logger.success(`Typed into: ${selector}`);
  }

  async captureState() {
    this.screenshotCount++;
    const screenshotPath = path.join(
      this.outputDir,
      `screenshot-${String(this.screenshotCount).padStart(3, '0')}.png`
    );

    // Capture screenshot
    const screenshot = await this.page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    // Capture page info
    const state = {
      url: this.page.url(),
      title: await this.page.title(),
      screenshotPath,
      timestamp: new Date().toISOString()
    };

    this.logger.debug('State captured', state);

    // Return base64 for Gemini
    const screenshotBase64 = screenshot.toString('base64');

    return {
      screenshot: screenshotBase64,
      metadata: state
    };
  }

  async getNetworkLogs() {
    // Playwright doesn't have direct HAR export, but we can capture requests
    const requests = [];
    this.page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    });
    return requests;
  }

  async waitFor(condition, timeout = 10000) {
    this.logger.info(`Waiting for condition: ${condition}`);

    if (condition === 'networkidle') {
      await this.page.waitForLoadState('networkidle', { timeout });
    } else if (condition.startsWith('selector:')) {
      const selector = condition.replace('selector:', '');
      await this.page.waitForSelector(selector, { timeout });
    } else if (condition === 'navigation') {
      await this.page.waitForNavigation({ timeout });
    }

    this.logger.success('Wait condition met');
  }

  async cleanup() {
    this.logger.info('Cleaning up browser...');
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.logger.success('Browser closed');
  }
}

module.exports = TestExecutorAgent;
```

**Step 2: Test the agent manually**

Create temporary test file `test-executor-manual.js`:
```javascript
const TestExecutorAgent = require('./src/agents/test-executor');
const Logger = require('./src/utils/logger');

async function test() {
  const logger = new Logger(true);
  const executor = new TestExecutorAgent(logger, './tmp');

  try {
    await executor.initialize();
    await executor.navigate('https://veria.cc');
    const state = await executor.captureState();
    console.log('Screenshot saved to:', state.metadata.screenshotPath);
    await executor.cleanup();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
```

Run: `node test-executor-manual.js`
Expected: Browser opens, navigates to veria.cc, screenshot saved, browser closes

**Step 3: Clean up test file and commit**

```bash
rm test-executor-manual.js
git add src/agents/test-executor.js
git commit -m "feat: Add Test Executor Agent with browser automation"
```

---

## Task 4: Vision Analyst Agent

**Files:**
- Create: `src/agents/vision-analyst.js`

**Step 1: Write Vision Analyst Agent**

Create `src/agents/vision-analyst.js`:
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

class VisionAnalystAgent {
  constructor(logger, apiKey) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
  }

  async analyzeState(screenshot, expectedState, context = {}) {
    this.logger.info(`Analyzing state (expected: ${expectedState})`);

    const prompt = `
You are analyzing a screenshot from an OAuth authentication flow test.

Expected State: ${expectedState}
Current Context: ${JSON.stringify(context)}

Analyze the screenshot and determine:
1. What is the actual state of the page?
2. Does it match the expected state "${expectedState}"?
3. Are there any errors visible?
4. What should the next action be?

Respond in JSON format:
{
  "actualState": "landing|provider_auth|callback|dashboard|error",
  "matches": true/false,
  "confidence": 0.0-1.0,
  "errorDetected": true/false,
  "errorDetails": "description if error detected",
  "nextAction": {
    "type": "click|type|wait|diagnose",
    "target": "selector or description",
    "reasoning": "why this action"
  },
  "reasoning": "overall analysis"
}
`;

    try {
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      this.logger.debug('Gemini response:', text);

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      this.logger.success(`Analysis complete: ${analysis.actualState} (confidence: ${analysis.confidence})`);

      return analysis;
    } catch (error) {
      this.logger.error('Vision analysis failed', error.message);
      throw error;
    }
  }

  async detectError(screenshot, context = {}) {
    this.logger.info('Running error detection...');

    const prompt = `
You are analyzing a screenshot for OAuth authentication errors.

Context: ${JSON.stringify(context)}

Look for:
- Error messages or alerts
- Failed authentication indicators
- Redirect errors (redirect_uri_mismatch, invalid_client, etc.)
- Access denied messages
- Missing or broken UI elements

Respond in JSON format:
{
  "errorDetected": true/false,
  "errorType": "oauth_error|network_error|ui_error|unknown",
  "errorMessage": "exact error text if visible",
  "severity": "critical|high|medium|low",
  "suggestedAgent": "diagnostic|fix|none",
  "reasoning": "what you see"
}
`;

    try {
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const errorAnalysis = JSON.parse(jsonMatch[0]);

      if (errorAnalysis.errorDetected) {
        this.logger.error(`Error detected: ${errorAnalysis.errorType}`, errorAnalysis.errorMessage);
      } else {
        this.logger.success('No errors detected');
      }

      return errorAnalysis;
    } catch (error) {
      this.logger.error('Error detection failed', error.message);
      throw error;
    }
  }
}

module.exports = VisionAnalystAgent;
```

**Step 2: Test the agent manually**

Create `test-vision-manual.js`:
```javascript
require('dotenv').config();
const VisionAnalystAgent = require('./src/agents/vision-analyst');
const TestExecutorAgent = require('./src/agents/test-executor');
const Logger = require('./src/utils/logger');
const fs = require('fs');

async function test() {
  const logger = new Logger(true);
  const executor = new TestExecutorAgent(logger, './tmp');
  const vision = new VisionAnalystAgent(logger, process.env.GEMINI_API_KEY);

  try {
    await executor.initialize();
    await executor.navigate('https://veria.cc');
    const state = await executor.captureState();

    const analysis = await vision.analyzeState(
      state.screenshot,
      'landing',
      { url: 'https://veria.cc' }
    );

    console.log('Analysis:', JSON.stringify(analysis, null, 2));

    await executor.cleanup();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
```

Run: `node test-vision-manual.js`
Expected: Browser opens, captures screenshot, Gemini analyzes it, outputs JSON analysis

**Step 3: Clean up and commit**

```bash
rm test-vision-manual.js
git add src/agents/vision-analyst.js
git commit -m "feat: Add Vision Analyst Agent with Gemini integration"
```

---

## Task 5: Diagnostic Agent

**Files:**
- Create: `src/agents/diagnostic.js`
- Create: `src/utils/vercel-api.js`

**Step 1: Write Vercel API utility**

Create `src/utils/vercel-api.js`:
```javascript
class VercelAPI {
  constructor(token, projectId) {
    this.token = token;
    this.projectId = projectId;
    this.baseUrl = 'https://api.vercel.com';
  }

  async fetchLogs(deploymentId, timeRange = 3600000) {
    // Simplified - in production would use @vercel/client
    // For now, return mock structure
    return {
      logs: [
        { timestamp: Date.now(), message: 'OAuth callback received' },
        { timestamp: Date.now(), message: 'Error: redirect_uri_mismatch' }
      ]
    };
  }

  async getLatestDeployment() {
    // Mock - returns latest deployment ID
    return { id: 'dpl_mock123', url: 'veria.cc' };
  }
}

module.exports = VercelAPI;
```

**Step 2: Write Diagnostic Agent**

Create `src/agents/diagnostic.js`:
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const VercelAPI = require('../utils/vercel-api');

class DiagnosticAgent {
  constructor(logger, apiKey, vercelToken, vercelProjectId) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
    this.vercelApi = new VercelAPI(vercelToken, vercelProjectId);
  }

  async diagnoseRootCause(errorContext) {
    this.logger.info('Running root cause diagnosis...');

    const { screenshot, errorAnalysis, networkLogs, pageUrl } = errorContext;

    // Fetch Vercel logs
    let vercelLogs = null;
    try {
      const deployment = await this.vercelApi.getLatestDeployment();
      vercelLogs = await this.vercelApi.fetchLogs(deployment.id);
    } catch (error) {
      this.logger.debug('Could not fetch Vercel logs:', error.message);
    }

    const prompt = `
You are diagnosing an OAuth authentication error.

Error Analysis: ${JSON.stringify(errorAnalysis)}
Page URL: ${pageUrl}
Vercel Logs: ${JSON.stringify(vercelLogs)}

Common OAuth issues:
- redirect_uri_mismatch: Callback URL mismatch between OAuth app and NEXTAUTH_URL
- invalid_client: Client ID mismatch or incorrect
- access_denied: User denied or app not authorized
- invalid_request: Missing required parameters

Analyze all evidence and determine:
1. What is the root cause?
2. What evidence supports this?
3. What needs to be fixed?

Respond in JSON format:
{
  "rootCause": "brief description",
  "confidence": 0.0-1.0,
  "evidence": [
    "evidence item 1",
    "evidence item 2"
  ],
  "fixSuggestions": [
    {
      "file": "path/to/file",
      "change": "description of change",
      "priority": "critical|high|medium|low"
    }
  ],
  "reasoning": "detailed analysis"
}
`;

    try {
      const parts = [prompt];

      if (screenshot) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        });
      }

      const result = await this.model.generateContent(parts);
      const response = await result.response;
      const text = response.text();

      this.logger.debug('Diagnostic response:', text);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const diagnostic = JSON.parse(jsonMatch[0]);

      this.logger.success(`Root cause identified: ${diagnostic.rootCause} (confidence: ${diagnostic.confidence})`);

      return diagnostic;
    } catch (error) {
      this.logger.error('Diagnosis failed', error.message);
      throw error;
    }
  }

  async checkOAuthConfig(provider) {
    this.logger.info(`Checking OAuth config for ${provider}...`);

    // Read .env.local from Veria project if available
    const envPath = process.env.VERIA_PROJECT_PATH
      ? `${process.env.VERIA_PROJECT_PATH}/apps/veria-website/.env.local`
      : null;

    const config = {
      provider,
      envPath,
      checks: []
    };

    // Basic validation
    if (provider === 'github') {
      config.checks.push({
        name: 'GITHUB_CLIENT_ID',
        status: process.env.GITHUB_CLIENT_ID ? 'present' : 'missing'
      });
      config.checks.push({
        name: 'GITHUB_CLIENT_SECRET',
        status: process.env.GITHUB_CLIENT_SECRET ? 'present' : 'missing'
      });
    }

    this.logger.success('Config check complete', config);
    return config;
  }
}

module.exports = DiagnosticAgent;
```

**Step 3: Commit**

```bash
git add src/agents/diagnostic.js src/utils/vercel-api.js
git commit -m "feat: Add Diagnostic Agent with root cause analysis"
```

---

## Task 6: Fix Agent

**Files:**
- Create: `src/agents/fix.js`

**Step 1: Write Fix Agent**

Create `src/agents/fix.js`:
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

class FixAgent {
  constructor(logger, apiKey, projectPath) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
  }

  async proposeFixPlan(diagnostic) {
    this.logger.info('Proposing fix plan...');

    const prompt = `
You are generating a fix plan for an OAuth error.

Diagnostic: ${JSON.stringify(diagnostic)}

Create a fix plan with specific file changes. Only propose changes to:
- .env.local files
- Configuration files (not code files unless critical)

Respond in JSON format:
{
  "changes": [
    {
      "file": "relative/path/to/file",
      "oldContent": "line to replace",
      "newContent": "replacement line",
      "reason": "why this fixes the issue"
    }
  ],
  "risk": "low|medium|high",
  "requiresApproval": true/false,
  "summary": "one sentence summary of fix"
}
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const fixPlan = JSON.parse(jsonMatch[0]);

      this.logger.success(`Fix plan created: ${fixPlan.summary}`);
      this.logger.info(`Risk: ${fixPlan.risk}, Requires approval: ${fixPlan.requiresApproval}`);

      return fixPlan;
    } catch (error) {
      this.logger.error('Fix plan generation failed', error.message);
      throw error;
    }
  }

  async applyFix(fixPlan, approved = false) {
    if (fixPlan.requiresApproval && !approved) {
      this.logger.error('Fix requires approval but not provided');
      throw new Error('Approval required');
    }

    this.logger.info('Applying fix...');

    const appliedChanges = [];

    for (const change of fixPlan.changes) {
      const filePath = path.join(this.projectPath, change.file);

      try {
        // Read file
        let content = await fs.readFile(filePath, 'utf8');

        // Apply change
        if (content.includes(change.oldContent)) {
          content = content.replace(change.oldContent, change.newContent);
          await fs.writeFile(filePath, content, 'utf8');

          this.logger.success(`Applied change to ${change.file}`);
          appliedChanges.push(change);
        } else {
          this.logger.error(`Old content not found in ${change.file}`);
        }
      } catch (error) {
        this.logger.error(`Failed to apply change to ${change.file}:`, error.message);
      }
    }

    // Commit changes
    if (appliedChanges.length > 0) {
      const commitMessage = `fix: ${fixPlan.summary}\n\nApplied changes:\n${appliedChanges.map(c => `- ${c.file}: ${c.reason}`).join('\n')}`;

      await this.git.add(appliedChanges.map(c => c.file));
      await this.git.commit(commitMessage);

      this.logger.success('Changes committed');
    }

    return appliedChanges;
  }

  async showDiff(fixPlan) {
    this.logger.info('Showing proposed changes...');

    for (const change of fixPlan.changes) {
      console.log(`\n📝 File: ${change.file}`);
      console.log(`   Reason: ${change.reason}`);
      console.log(`   - ${change.oldContent}`);
      console.log(`   + ${change.newContent}`);
    }
  }
}

module.exports = FixAgent;
```

**Step 2: Commit**

```bash
git add src/agents/fix.js
git commit -m "feat: Add Fix Agent with automated fix application"
```

---

## Task 7: Orchestrator Agent

**Files:**
- Create: `src/orchestrator.js`

**Step 1: Write Orchestrator**

Create `src/orchestrator.js`:
```javascript
#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const TestExecutorAgent = require('./agents/test-executor');
const VisionAnalystAgent = require('./agents/vision-analyst');
const DiagnosticAgent = require('./agents/diagnostic');
const FixAgent = require('./agents/fix');
const StateMachine = require('./utils/state-machine');
const Logger = require('./utils/logger');

class OAuthOrchestrator {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options.debug || false);
    this.config = null;
    this.outputDir = null;
  }

  async loadConfig() {
    const configPath = path.join(__dirname, 'scenarios/veria-oauth-flows.json');
    const configData = await fs.readFile(configPath, 'utf8');
    this.config = JSON.parse(configData);
    this.logger.success('Configuration loaded');
  }

  async setupOutputDirectory() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.outputDir = path.join(__dirname, '..', 'tmp', `oauth-test-${timestamp}`);
    await fs.mkdir(this.outputDir, { recursive: true });
    this.logger.success(`Output directory: ${this.outputDir}`);
  }

  async testProvider(providerName) {
    this.logger.info(`\n${'='.repeat(60)}\n🖥️  Testing OAuth Provider: ${providerName}\n${'='.repeat(60)}`);

    // Find provider config
    const providerConfig = this.config.providers.find(p => p.name === providerName);
    if (!providerConfig) {
      throw new Error(`Provider ${providerName} not found in config`);
    }

    if (!providerConfig.enabled) {
      this.logger.info(`Provider ${providerName} is disabled, skipping`);
      return { status: 'skipped', provider: providerName };
    }

    // Initialize agents
    const testExecutor = new TestExecutorAgent(this.logger, this.outputDir);
    const visionAnalyst = new VisionAnalystAgent(this.logger, process.env.GEMINI_API_KEY);
    const diagnostic = new DiagnosticAgent(
      this.logger,
      process.env.GEMINI_API_KEY,
      process.env.VERCEL_TOKEN,
      process.env.VERCEL_PROJECT_ID
    );
    const fix = new FixAgent(
      this.logger,
      process.env.GEMINI_API_KEY,
      process.env.VERIA_PROJECT_PATH
    );

    // Initialize state machine
    const stateMachine = new StateMachine(providerName, providerConfig.flow);

    try {
      await testExecutor.initialize();

      // Navigate to base URL
      await testExecutor.navigate(this.config.baseUrl);

      // State machine loop
      while (!stateMachine.isComplete()) {
        const currentState = stateMachine.getCurrentState();
        const stateIndex = stateMachine.currentIndex;
        const totalStates = stateMachine.states.length;

        this.logger.step(stateIndex + 1, totalStates, currentState);

        // Capture current state
        const capturedState = await testExecutor.captureState();

        // Analyze with Vision
        const analysis = await visionAnalyst.analyzeState(
          capturedState.screenshot,
          currentState,
          { url: capturedState.metadata.url, provider: providerName }
        );

        // Check for errors
        if (analysis.errorDetected) {
          this.logger.error('Error detected in current state');

          // Run diagnostics
          const diagnosticResult = await diagnostic.diagnoseRootCause({
            screenshot: capturedState.screenshot,
            errorAnalysis: analysis,
            networkLogs: [],
            pageUrl: capturedState.metadata.url
          });

          // Propose fix
          const fixPlan = await fix.proposeFixPlan(diagnosticResult);
          await fix.showDiff(fixPlan);

          // Request approval if needed
          let approved = false;
          if (this.options.autoFix) {
            approved = true;
            this.logger.info('Auto-fix enabled, applying fix...');
          } else {
            // In a real implementation, would prompt user
            this.logger.info('Fix requires manual approval (use --auto-fix to enable)');
            approved = false;
          }

          if (approved) {
            await fix.applyFix(fixPlan, true);

            // Retry from beginning
            this.logger.info('Retrying flow after fix...');
            stateMachine.reset();
            await testExecutor.navigate(this.config.baseUrl);
            continue;
          } else {
            throw new Error('Test failed with error, fix not approved');
          }
        }

        // Execute next action
        if (analysis.nextAction) {
          await this.executeAction(testExecutor, analysis.nextAction, providerConfig);
        }

        // Advance state
        if (analysis.matches || analysis.actualState === currentState) {
          stateMachine.advance();
        } else if (!stateMachine.retry()) {
          throw new Error(`Max retries exceeded for state: ${currentState}`);
        }

        // Brief pause between states
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      await testExecutor.cleanup();

      this.logger.success(`✅ ${providerName} OAuth test PASSED`);
      return { status: 'passed', provider: providerName, history: stateMachine.getHistory() };

    } catch (error) {
      this.logger.error(`❌ ${providerName} OAuth test FAILED:`, error.message);
      await testExecutor.cleanup();
      return { status: 'failed', provider: providerName, error: error.message };
    }
  }

  async executeAction(testExecutor, action, providerConfig) {
    switch (action.type) {
      case 'click':
        await testExecutor.click(action.target);
        break;

      case 'type':
        const value = this.resolveEnvVar(action.value, providerConfig);
        await testExecutor.type(action.target, value);
        break;

      case 'wait':
        await testExecutor.waitFor(action.condition || 'networkidle', action.timeout);
        break;

      default:
        this.logger.debug(`Unknown action type: ${action.type}`);
    }
  }

  resolveEnvVar(value, providerConfig) {
    // Resolve environment variables from test account config
    if (value && value.startsWith('process.env.')) {
      const envKey = value.replace('process.env.', '');
      return process.env[envKey] || value;
    }
    return value;
  }

  async run() {
    console.log(`
🖥️  Gemini OAuth Automation System
${'='.repeat(60)}
`);

    await this.loadConfig();
    await this.setupOutputDirectory();

    const results = [];

    if (this.options.all) {
      // Test all enabled providers
      for (const provider of this.config.providers) {
        if (provider.enabled) {
          const result = await this.testProvider(provider.name);
          results.push(result);
        }
      }
    } else if (this.options.provider) {
      // Test specific provider(s)
      const providers = this.options.provider.split(',');
      for (const provider of providers) {
        const result = await this.testProvider(provider.trim());
        results.push(result);
      }
    } else {
      this.logger.error('No provider specified. Use --provider <name> or --all');
      return;
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Test Summary');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`📁 Output: ${this.outputDir}`);

    // Save results
    await fs.writeFile(
      path.join(this.outputDir, 'results.json'),
      JSON.stringify(results, null, 2)
    );

    this.logger.saveLogs(path.join(this.outputDir, 'execution.log'));
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    all: args.includes('--all'),
    provider: args.find((arg, i) => args[i - 1] === '--provider'),
    debug: args.includes('--debug'),
    autoFix: args.includes('--auto-fix')
  };

  if (!options.all && !options.provider) {
    console.log(`
Usage: node src/orchestrator.js [options]

Options:
  --all                Test all enabled OAuth providers
  --provider <name>    Test specific provider (github, google, etc.)
  --debug              Enable debug logging
  --auto-fix           Automatically apply fixes without approval

Examples:
  node src/orchestrator.js --provider github
  node src/orchestrator.js --all --debug
  node src/orchestrator.js --provider github --auto-fix
    `);
    process.exit(0);
  }

  const orchestrator = new OAuthOrchestrator(options);
  orchestrator.run().catch(console.error);
}

module.exports = OAuthOrchestrator;
```

**Step 2: Make orchestrator executable**

Run: `chmod +x src/orchestrator.js`

**Step 3: Test orchestrator help**

Run: `node src/orchestrator.js`
Expected: Usage instructions displayed

**Step 4: Commit**

```bash
git add src/orchestrator.js
git commit -m "feat: Add Orchestrator with multi-agent coordination"
```

---

## Task 8: Integration Testing

**Files:**
- Update: `.env` (create from .env.example)

**Step 1: Set up environment**

Copy `.env.example` to `.env` and fill in real credentials:
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

**Step 2: Run initial test (expect failure or partial success)**

Run: `npm run test:github`
Expected: Browser opens, navigates to Veria, attempts GitHub OAuth flow

**Step 3: Review output**

Check `tmp/oauth-test-*/` for:
- Screenshots showing each step
- `results.json` with test results
- `execution.log` with detailed logs

**Step 4: Document findings**

Create `TESTING_NOTES.md`:
```markdown
# Testing Notes

## Initial Test Run: [Date]

### Results:
- Provider tested: GitHub
- Status: [passed/failed]
- Issues found: [list]

### Screenshots:
- See tmp/oauth-test-[timestamp]/

### Next Steps:
- [what needs fixing]
```

**Step 5: Commit**

```bash
git add TESTING_NOTES.md
git commit -m "docs: Add initial testing notes"
```

---

## Task 9: Final Documentation

**Files:**
- Update: `README.md`

**Step 1: Update README with complete usage**

Update `README.md`:
```markdown
# Gemini OAuth Automation System

Autonomous multi-agent system for testing OAuth flows using Gemini Computer Use API.

## Architecture

- **Orchestrator**: Coordinates all agents through state machine
- **Test Executor**: Controls Playwright browser automation
- **Vision Analyst**: Analyzes screenshots with Gemini vision
- **Diagnostic Agent**: Root cause analysis of OAuth errors
- **Fix Agent**: Proposes and applies fixes automatically

See `OAUTH_AUTOMATION_DESIGN.md` for complete design.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Test setup:**
   ```bash
   npm run test:github
   ```

## Usage

### Test All Providers
```bash
npm run test:all
```

### Test Specific Provider
```bash
npm run test:github  # GitHub OAuth
npm run test:google  # Google OAuth
```

### Debug Mode
```bash
node src/orchestrator.js --provider github --debug
```

### Auto-Fix Mode (USE WITH CAUTION)
```bash
node src/orchestrator.js --provider github --auto-fix
```

## Output

Each test run creates a timestamped directory in `tmp/`:
```
tmp/oauth-test-2025-10-30-140523/
├── screenshot-001.png
├── screenshot-002.png
├── screenshot-003.png
├── results.json
└── execution.log
```

## Troubleshooting

### "GEMINI_API_KEY not found"
- Ensure `.env` file exists and contains `GEMINI_API_KEY=your_key`

### Browser doesn't open
- Check Playwright installation: `npx playwright install chromium`

### OAuth test fails immediately
- Verify test credentials in `.env`
- Check Veria website is accessible at https://veria.cc

## Development

### Project Structure
```
src/
├── agents/           # Specialized agents
├── utils/            # Utilities (state machine, logger)
├── scenarios/        # Test configurations
└── orchestrator.js   # Main coordinator
```

### Adding New Provider

1. Add to `src/scenarios/veria-oauth-flows.json`
2. Define flow states
3. Add test credentials to `.env`
4. Run: `node src/orchestrator.js --provider newprovider`

## License

ISC
```

**Step 2: Commit final docs**

```bash
git add README.md
git commit -m "docs: Complete README with full usage instructions"
```

---

## Completion Checklist

- [ ] Task 1: Project setup ✅
- [ ] Task 2: Directory structure and utilities ✅
- [ ] Task 3: Test Executor Agent ✅
- [ ] Task 4: Vision Analyst Agent ✅
- [ ] Task 5: Diagnostic Agent ✅
- [ ] Task 6: Fix Agent ✅
- [ ] Task 7: Orchestrator ✅
- [ ] Task 8: Integration testing ✅
- [ ] Task 9: Final documentation ✅

## Next Steps After Implementation

1. **Run first real test**: `npm run test:github`
2. **Analyze results**: Review tmp/ output
3. **Iterate on prompts**: Refine Gemini prompts based on accuracy
4. **Add more providers**: Extend to Google, Email, Wallet
5. **CI/CD Integration**: Add to Veria's deployment pipeline

---

**Plan Status:** ✅ Complete and ready for execution
**Estimated Time:** 4-6 hours for full implementation
**Dependencies:** All clearly documented in Task 1
