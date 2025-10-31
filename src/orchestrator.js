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

/**
 * OAuthOrchestrator coordinates multi-agent OAuth flow testing with automatic fix capabilities.
 * Manages the complete testing lifecycle including test execution, vision analysis, diagnostics,
 * and automated fix proposals.
 */
class OAuthOrchestrator {
  /**
   * Creates a new OAuthOrchestrator instance.
   * @param {Object} options - Configuration options
   * @param {boolean} [options.all=false] - Test all enabled providers
   * @param {string} [options.provider] - Specific provider name(s) to test (comma-separated)
   * @param {boolean} [options.debug=false] - Enable debug logging
   * @param {boolean} [options.autoFix=false] - Automatically apply fixes without approval
   */
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

  /**
   * Tests a single OAuth provider through its complete authentication flow.
   * Coordinates between TestExecutor, VisionAnalyst, Diagnostic, and Fix agents.
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
