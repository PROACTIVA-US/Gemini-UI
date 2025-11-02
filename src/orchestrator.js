#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const TestExecutorAgent = require('./agents/test-executor');
const ComputerUseAgent = require('./agents/computer-use');
const DiagnosticAgent = require('./agents/diagnostic');
const FixAgent = require('./agents/fix');
const StateMachine = require('./utils/state-machine');
const Logger = require('./utils/logger');

/**
 * OAuthOrchestrator coordinates multi-agent OAuth flow testing with automatic fix capabilities.
 * Manages the complete testing lifecycle including test execution, Computer Use API control,
 * diagnostics, and automated fix proposals.
 */
class OAuthOrchestrator {
  /**
   * Creates a new OAuthOrchestrator instance.
   * @param {Object} options - Configuration options
   * @param {boolean} [options.all=false] - Test all enabled providers
   * @param {string} [options.provider] - Specific provider name(s) to test (comma-separated)
   * @param {boolean} [options.debug=false] - Enable debug logging
   * @param {boolean} [options.autoFix=false] - Automatically apply fixes without approval
   * @param {number} [options.actionDelay=2000] - Delay between actions in milliseconds
   */
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options.debug || false);
    this.config = null;
    this.outputDir = null;
    this.actionDelay = options.actionDelay || 2000; // Configurable delay between actions
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

  /**
   * Verifies that the current URL matches expectations for the given state.
   * @param {string} currentState - The current state in the state machine
   * @param {string} currentUrl - The current page URL
   * @param {string} providerName - The OAuth provider name
   * @returns {boolean} True if URL matches state expectations, false otherwise
   */
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

  /**
   * Tests a single OAuth provider through its complete authentication flow.
   * Coordinates between TestExecutor, ComputerUse, Diagnostic, and Fix agents.
   * @param {string} providerName - Name of the OAuth provider to test (e.g., 'github', 'google')
   * @returns {Promise<Object>} Test result containing status, provider name, and execution history
   * @throws {Error} If provider not found in config or max retries exceeded
   */
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
    const computerUse = new ComputerUseAgent(this.logger, process.env.GEMINI_API_KEY);
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

        // Resolve test credentials from provider config
        const testCredentials = {};
        if (providerConfig.testAccount) {
          for (const [key, value] of Object.entries(providerConfig.testAccount)) {
            testCredentials[key] = this.resolveEnvVar(value, providerConfig);
          }
        }

        // Build detailed goal based on current state
        let goal = `You are testing ${providerName} sign-in flow on veria.cc. `;

        if (currentState === 'landing') {
          if (providerName === 'email') {
            goal += `Look for the email/password login form on the page and prepare to enter credentials.`;
          } else {
            goal += `Look for the "Sign in with ${providerName}" button and click it.`;
          }
        } else if (currentState === 'email_login') {
          goal += `You are on the veria.cc login form. Enter email and password credentials: ${JSON.stringify(testCredentials)} into the form fields and click the submit/sign-in button to log in.`;
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
        } else if (currentState === 'callback') {
          goal += `The OAuth authentication is completing. Wait for automatic redirect back to veria.cc. If you see a consent/permission screen, click Allow/Continue. If already back on veria.cc, wait for dashboard to load.`;
        } else if (currentState === 'dashboard') {
          goal += `You should now be on the veria.cc dashboard (NOT the signin page). Verify you see user profile, API keys, dashboard navigation, or a sign-out button. The URL should be veria.cc/dashboard or similar, not /signin.`;
        } else if (currentState === 'signout') {
          goal += `You are logged in to veria.cc dashboard. Find the sign-out/logout button (usually in user menu or navigation) and click it to sign out. After signing out, you should be redirected back to the landing/signin page.`;
        }

        // Get Computer Use action directly (no translation gap!)
        const action = await computerUse.getNextAction(
          capturedState.screenshot,
          goal,
          {
            state: currentState,
            url: capturedState.metadata.url,
            provider: providerName,
            credentials: testCredentials
          }
        );

        if (!action) {
          this.logger.error('No action received from Computer Use API');
          if (!stateMachine.retry()) {
            throw new Error(`Failed to get action for state: ${currentState}`);
          }
          continue;
        }

        // Execute Computer Use action directly
        const result = await testExecutor.executeComputerUseAction(action);

        // Capture page state after action to get current URL
        const postActionState = await testExecutor.captureState();

        // Report result back to Gemini with current URL (required by Computer Use API)
        await computerUse.reportActionResult(result, postActionState.metadata.url);

        // Check if action succeeded
        if (result.success) {
          this.logger.success(`Action ${action.name} executed successfully`);

          // Increment action counter and check limit
          stateMachine.actionsInCurrentState++;

          if (stateMachine.actionsInCurrentState >= stateMachine.maxActionsPerState) {
            throw new Error(`Exceeded max actions (${stateMachine.maxActionsPerState}) for state: ${currentState}`);
          }

          // Wait for page to settle after action (especially for redirects)
          await new Promise(resolve => setTimeout(resolve, 5000));  // Changed from 2000 to 5000

          // Add conditional wait after the base wait
          if (currentState === 'provider_auth' || currentState === 'callback') {
            // OAuth redirects need more time
            this.logger.debug(`Waiting extra time for ${currentState} redirect...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

          // Verify state transition based on URL
          const afterActionState = await testExecutor.captureState();
          const currentUrl = afterActionState.metadata.url;

          this.logger.debug(`After ${currentState}, URL is: ${currentUrl}`);

          // Verify state transition using helper method
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
        } else {
          this.logger.error(`Action ${action.name} failed: ${result.error}`);

          // Handle error with diagnostic agent if available
          if (result.error && diagnostic) {
            const diagnosticResult = await diagnostic.diagnoseRootCause({
              screenshot: capturedState.screenshot,
              errorAnalysis: { errorDetected: true, errorMessage: result.error },
              networkLogs: await testExecutor.getNetworkLogs(),
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
              this.logger.info('Fix requires manual approval (use --auto-fix to enable)');
              approved = false;
            }

            if (approved) {
              await fix.applyFix(fixPlan, true);
              this.logger.info('Retrying flow after fix...');
              stateMachine.reset();
              computerUse.reset();
              await testExecutor.navigate(this.config.baseUrl);
              continue;
            }
          }

          // Retry logic
          if (!stateMachine.retry()) {
            throw new Error(`Max retries exceeded for state: ${currentState}`);
          }
        }

        // Brief pause between states (configurable)
        await new Promise(resolve => setTimeout(resolve, this.actionDelay));
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

  /**
   * Main execution method that orchestrates the complete OAuth testing workflow.
   * Validates environment, loads configuration, executes tests, and generates summary.
   * @throws {Error} If required environment variables are missing or tests fail
   */
  async run() {
    console.log(`
🖥️  Gemini OAuth Automation System
${'='.repeat(60)}
`);

    // Validate required environment variables
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required. Please set it in your .env file.');
    }

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
