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
   * @param {object} stateMachine - The state machine instance for action counting
   * @returns {boolean} True if URL matches state expectations, false otherwise
   */
  verifyStateTransition(currentState, currentUrl, providerName, stateMachine) {
    const logger = this.logger;

    switch(currentState) {
      case 'landing':
        // Should be on signin page or have clicked provider button
        return currentUrl.includes('veria.cc') || currentUrl.includes(providerName);

      case 'email_login':
        if (currentUrl.includes('verify-email')) {
          logger.error('Email verification required - cannot proceed without email access');
          logger.error('Email authentication requires clicking verification link in email');
          throw new Error('Email verification blocker: Cannot test email auth without email access');
        }
        // Should still be on veria.cc but not on verify-email page yet
        return currentUrl.includes('veria.cc') && !currentUrl.includes('verify-email');

      case 'provider_auth':
        // OAuth login requires multiple actions: username, password, submit (minimum 3)
        const minOAuthActions = 3;

        if (stateMachine.actionsInCurrentState < minOAuthActions) {
          logger.debug(`Provider auth needs ${minOAuthActions} actions (username, password, submit), currently: ${stateMachine.actionsInCurrentState}`);
          return false; // Don't advance yet - let API complete the form
        }

        // After 3+ actions, MUST be redirected back to veria.cc (OAuth completed)
        // Form submission happens on action 3, redirect takes a few more seconds
        const oauthComplete = currentUrl.includes('veria.cc');

        if (!oauthComplete) {
          // Still on provider domain - wait for redirect (up to max actions limit)
          if (stateMachine.actionsInCurrentState >= stateMachine.maxActionsPerState - 2) {
            logger.warn(`Provider auth: ${stateMachine.actionsInCurrentState} actions but still at ${currentUrl}`);
            logger.warn(`OAuth may have failed - not redirecting to veria.cc`);
          }
          return false; // Keep waiting for redirect
        }

        logger.info(`✓ Provider auth complete - ${stateMachine.actionsInCurrentState} actions, redirected to veria.cc`);
        return true;

      case 'callback':
        // Check if we're back on veria.cc
        if (!currentUrl.includes('veria.cc')) {
          return false; // Still on OAuth provider
        }

        // Check for OAuth-specific errors (these indicate server-side issues that need fixing)
        const oauthErrors = [
          'OAuthAccountNotLinked',
          'OAuthCallback',
          'OAuthSignin'
        ];

        const hasOAuthError = oauthErrors.some(err => currentUrl.includes(`error=${err}`));

        if (hasOAuthError) {
          // OAuth error detected - this requires diagnostic and fix
          const errorType = oauthErrors.find(e => currentUrl.includes(e));
          logger.warn(`OAuth error detected: ${errorType}`);
          logger.warn(`URL: ${currentUrl}`);
          // Return false to trigger error handling and fix cycle
          return false;
        }

        // Normal success: on veria.cc, not on signin, not on verify-email
        const callbackSuccess = !currentUrl.includes('/signin') &&
                                !currentUrl.includes('verify-email');

        if (!callbackSuccess) {
          logger.warn(`Callback failed - URL: ${currentUrl}`);
          logger.warn(`Expected veria.cc (not /signin or verify-email)`);
        }

        return callbackSuccess;

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

    // Track flow-level retries to prevent infinite loops
    let flowRetryCount = 0;
    const maxFlowRetries = 3;

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

        // Log current page state before action
        this.logger.debug(`[${currentState}] Current page state:`);
        this.logger.debug(`  URL: ${capturedState.metadata.url}`);
        this.logger.debug(`  Title: ${capturedState.metadata.title}`);
        this.logger.debug(`  Screenshot: ${capturedState.screenshot ? 'captured' : 'none'}`);

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
1. Click the username/email input field
2. Type username: ${JSON.stringify(testCredentials.username)}
3. Click the password input field
4. Type password: ${testCredentials.password}
5. Click the green "Sign in" button to submit the form
6. AFTER clicking Sign in, WAIT and observe - the page will redirect to veria.cc
7. Do NOT take any more actions until you see the page change to veria.cc domain`;
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

        // Log action being requested
        if (action) {
          this.logger.debug(`[${currentState}] Requesting action: ${action.name}`);
          this.logger.debug(`  Args: ${JSON.stringify(action.args || {})}`);
        } else {
          this.logger.error(`[${currentState}] No action received from Computer Use API`);
        }

        if (!action) {
          this.logger.error('No action received from Computer Use API');
          if (!stateMachine.retry()) {
            throw new Error(`Failed to get action for state: ${currentState}`);
          }
          continue;
        }

        // Execute Computer Use action directly
        const result = await testExecutor.executeComputerUseAction(action);

        // Preserve safety decision from action (required for API acknowledgement)
        if (action._safetyDecision) {
          result._safetyDecision = action._safetyDecision;
          this.logger.debug(`Preserving safety decision for action ${action.name}:`, action._safetyDecision);
        } else {
          this.logger.debug(`No safety decision found for action ${action.name}`);
        }

        // Capture page state after action to get current URL
        // Note: May fail during navigation, handle gracefully
        let postActionState;
        try {
          postActionState = await testExecutor.captureState();
        } catch (error) {
          if (error.message && error.message.includes('Execution context')) {
            // Page is navigating, wait and retry
            this.logger.debug('Page navigating, waiting before retry...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            postActionState = await testExecutor.captureState();
          } else {
            throw error; // Rethrow if not a navigation error
          }
        }

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
          // Handle potential navigation errors during redirects
          let afterActionState;
          try {
            afterActionState = await testExecutor.captureState();
          } catch (error) {
            if (error.message && error.message.includes('Execution context')) {
              // Still navigating after wait, give it more time
              this.logger.debug('Page still navigating after wait, retrying...');
              await new Promise(resolve => setTimeout(resolve, 3000));
              afterActionState = await testExecutor.captureState();
            } else {
              throw error;
            }
          }

          const currentUrl = afterActionState.metadata.url;
          this.logger.debug(`After ${currentState}, URL is: ${currentUrl}`);

          // Verify state transition using helper method
          const stateVerified = this.verifyStateTransition(
            currentState,
            currentUrl,
            providerName,
            stateMachine
          );

          if (stateVerified) {
            this.logger.success(`✓ ${currentState} → ${stateMachine.getNextState() || 'COMPLETE'}`);
            this.logger.success(`  Actions performed: ${stateMachine.actionsInCurrentState}`);
            stateMachine.advance();
          } else {
            this.logger.warn(`State verification failed for ${currentState}`);
            this.logger.warn(`Current URL: ${currentUrl}`);

            // Take screenshot of failed state
            const failedState = await testExecutor.captureState();

            // Check if this is an OAuth error
            const isOAuthError = currentUrl.includes('error=OAuth');
            const errorType = currentUrl.match(/error=([^&]+)/)?.[1];

            if (isOAuthError) {
              this.logger.warn(`OAuth error detected: ${errorType}`);

              // Special handling for OAuthAccountNotLinked - this requires database/account setup
              if (errorType === 'OAuthAccountNotLinked') {
                this.logger.error('❌ OAuthAccountNotLinked Error - Cannot be auto-fixed');
                this.logger.error('');
                this.logger.error('This error means the email "test@veria.cc" is already registered');
                this.logger.error('but linked to a DIFFERENT sign-in method (not GitHub).');
                this.logger.error('');
                this.logger.error('To fix this, you need to either:');
                this.logger.error('  1. Use a different test email that is not already registered');
                this.logger.error('  2. Delete the existing user and let OAuth create a new one');
                this.logger.error('  3. Enable account linking in your NextAuth configuration');
                this.logger.error('  4. Manually link the GitHub account to the existing user in the database');
                this.logger.error('');
                throw new Error('OAuthAccountNotLinked requires manual intervention - see above for solutions');
              }

              // For other OAuth errors, attempt diagnostic and fix
              if (diagnostic && fix) {
                this.logger.info('Attempting to diagnose and fix OAuth error...');

                try {
                  // Run diagnostic
                  const diagnosticResult = await diagnostic.diagnoseRootCause({
                    screenshot: failedState.screenshot,
                    errorAnalysis: {
                      errorDetected: true,
                      errorMessage: `OAuth error: ${errorType}`,
                      errorType: errorType
                    },
                    networkLogs: await testExecutor.getNetworkLogs(),
                    pageUrl: currentUrl
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

                    // Check flow retry limit
                    flowRetryCount++;
                    if (flowRetryCount >= maxFlowRetries) {
                      throw new Error(`Max flow retries (${maxFlowRetries}) reached. Unable to complete OAuth flow after multiple fix attempts.`);
                    }

                    this.logger.info(`Fix applied - retrying OAuth flow from beginning (attempt ${flowRetryCount + 1}/${maxFlowRetries + 1})...`);

                    // Reset state machine and restart flow
                    stateMachine.reset();
                    computerUse.reset();
                    await testExecutor.navigate(this.config.baseUrl);
                    continue; // Restart the while loop
                  }
                } catch (fixError) {
                  this.logger.error(`Fix attempt failed: ${fixError.message}`);
                }
              }
            }

            // If no fix was attempted or fix failed, use normal retry logic
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
      this.logger.success(`✅ Successfully reached dashboard and completed full e2e flow`);

      return {
        status: 'passed',
        provider: providerName,
        flow: stateMachine.history,
        flowRetries: flowRetryCount
      };

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
