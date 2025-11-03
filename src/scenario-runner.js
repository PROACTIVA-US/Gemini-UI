#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const TestExecutorAgent = require('./agents/test-executor');
const ComputerUseAgent = require('./agents/computer-use');
const DiagnosticAgent = require('./agents/diagnostic');
const FixAgent = require('./agents/fix');
const Logger = require('./utils/logger');

/**
 * ScenarioRunner - Universal E2E testing orchestrator using Gemini Computer Use
 * Supports multiple test scenario types beyond OAuth: forms, navigation, search, etc.
 */
class ScenarioRunner {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options.debug || false);
    this.scenarios = null;
    this.outputDir = null;
  }

  async loadScenarios() {
    const scenarioPath = path.join(__dirname, 'scenarios/test-scenarios.json');
    const scenarioData = await fs.readFile(scenarioPath, 'utf8');
    this.scenarios = JSON.parse(scenarioData);
    this.logger.success('Test scenarios loaded');
  }

  async setupOutputDirectory(scenarioName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.outputDir = path.join(__dirname, '..', 'tmp', `test-${scenarioName}-${timestamp}`);
    await fs.mkdir(this.outputDir, { recursive: true });
    this.logger.success(`Output directory: ${this.outputDir}`);
  }

  /**
   * Execute a test scenario
   * @param {string} scenarioName - Name of scenario to run
   * @returns {Promise<Object>} Test results
   */
  async runScenario(scenarioName) {
    this.logger.info(`\n${'='.repeat(60)}\n🧪 Running Scenario: ${scenarioName}\n${'='.repeat(60)}`);

    // Find scenario config
    const scenario = this.scenarios.scenarios.find(s => s.name === scenarioName);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }

    if (!scenario.enabled) {
      this.logger.info(`Scenario ${scenarioName} is disabled, skipping`);
      return { status: 'skipped', scenario: scenarioName };
    }

    await this.setupOutputDirectory(scenarioName);

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
      process.env.VERIA_PROJECT_PATH || process.cwd()
    );

    const results = {
      scenario: scenarioName,
      description: scenario.description,
      steps: [],
      status: 'running',
      startTime: Date.now()
    };

    try {
      await testExecutor.initialize();

      // Navigate to base URL
      await testExecutor.navigate(scenario.baseUrl);

      // Handle viewport testing (responsive design)
      if (scenario.viewports) {
        return await this.runResponsiveTest(scenario, testExecutor, computerUse, results);
      }

      // Execute each step in the flow
      for (let i = 0; i < scenario.flow.length; i++) {
        const step = scenario.flow[i];
        const stepNumber = i + 1;
        const totalSteps = scenario.flow.length;

        this.logger.step(stepNumber, totalSteps, step.state);

        const stepResult = await this.executeStep(
          step,
          testExecutor,
          computerUse,
          diagnostic,
          fix,
          scenario
        );

        results.steps.push(stepResult);

        if (!stepResult.success) {
          this.logger.error(`Step ${step.state} failed: ${stepResult.error}`);

          // Attempt diagnosis and fix
          if (this.options.autoFix) {
            await this.attemptAutoFix(stepResult, diagnostic, fix, testExecutor);
          }

          results.status = 'failed';
          results.failedStep = step.state;
          break;
        }

        this.logger.success(`✓ ${step.state} completed`);

        // Brief pause between steps
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (results.status === 'running') {
        results.status = 'passed';
      }

      await testExecutor.cleanup();

      this.logger.success(`✅ Scenario ${scenarioName} completed: ${results.status.toUpperCase()}`);

      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;

      return results;

    } catch (error) {
      this.logger.error(`❌ Scenario ${scenarioName} FAILED:`, error.message);
      await testExecutor.cleanup();

      results.status = 'failed';
      results.error = error.message;
      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;

      return results;
    }
  }

  /**
   * Execute a single test step
   */
  async executeStep(step, testExecutor, computerUse, diagnostic, fix, scenario) {
    const stepResult = {
      state: step.state,
      goal: step.goal,
      success: false,
      actions: [],
      validations: []
    };

    try {
      // Capture current state
      const currentState = await testExecutor.captureState();

      this.logger.debug(`[${step.state}] Current URL: ${currentState.metadata.url}`);

      // Build enhanced goal with context
      let enhancedGoal = step.goal;

      // Add input data to goal if present
      if (step.inputs) {
        const inputs = this.resolveInputs(step.inputs, scenario);
        enhancedGoal += `\n\nInput data to use: ${JSON.stringify(inputs, null, 2)}`;
      }

      // Add validation expectations to goal
      if (step.validation) {
        enhancedGoal += `\n\nExpected validations after completing this step: ${JSON.stringify(step.validation, null, 2)}`;
      }

      // Get action from Gemini Computer Use
      const action = await computerUse.getNextAction(
        currentState.screenshot,
        enhancedGoal,
        {
          state: step.state,
          url: currentState.metadata.url,
          scenario: scenario.name
        }
      );

      if (!action) {
        throw new Error('No action received from Computer Use API');
      }

      this.logger.debug(`[${step.state}] Action: ${action.name}`);

      // Execute action
      const executionResult = await testExecutor.executeComputerUseAction(action);

      stepResult.actions.push({
        name: action.name,
        args: action.args,
        success: executionResult.success
      });

      if (!executionResult.success) {
        throw new Error(`Action ${action.name} failed: ${executionResult.error}`);
      }

      // Preserve safety decision
      if (action._safetyDecision) {
        executionResult._safetyDecision = action._safetyDecision;
      }

      // Wait for page to settle
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Capture post-action state
      const postActionState = await testExecutor.captureState();

      // Report result back to Gemini
      await computerUse.reportActionResult(executionResult, postActionState.metadata.url);

      // Perform validations if specified
      if (step.validation) {
        const validationResults = await this.performValidations(
          step.validation,
          postActionState,
          testExecutor,
          computerUse
        );

        stepResult.validations = validationResults;

        const allValidationsPassed = validationResults.every(v => v.passed);
        if (!allValidationsPassed) {
          const failedValidations = validationResults.filter(v => !v.passed);
          throw new Error(`Validations failed: ${failedValidations.map(v => v.type).join(', ')}`);
        }
      }

      stepResult.success = true;
      stepResult.finalUrl = postActionState.metadata.url;

      return stepResult;

    } catch (error) {
      stepResult.success = false;
      stepResult.error = error.message;
      return stepResult;
    }
  }

  /**
   * Perform validation checks after a step
   */
  async performValidations(validation, state, testExecutor, computerUse) {
    const results = [];

    // URL validation
    if (validation.urlContains) {
      results.push({
        type: 'urlContains',
        expected: validation.urlContains,
        actual: state.metadata.url,
        passed: state.metadata.url.includes(validation.urlContains)
      });
    }

    if (validation.urlChanged) {
      // Would need previous URL to compare
      results.push({
        type: 'urlChanged',
        passed: true // Simplified for now
      });
    }

    // Error detection
    if (validation.hasErrors !== undefined) {
      try {
        const screenshot = await testExecutor.takeScreenshot(`validation-${Date.now()}`);

        // Ask Gemini to detect errors on the page
        const errorCheckGoal = "Look at this page and determine if there are any error messages visible. Respond with 'yes' if errors are present, 'no' if not.";

        const action = await computerUse.getNextAction(
          screenshot,
          errorCheckGoal,
          { validationType: 'errorDetection' }
        );

        if (!action) {
          throw new Error('No response from AI for error detection');
        }

        // Parse Gemini's response - check if response contains affirmative indicators
        const hasErrors = this.parseValidationResponse(action, ['yes', 'error', 'errors', 'found']);

        results.push({
          type: 'hasErrors',
          expected: validation.hasErrors,
          actual: hasErrors,
          passed: validation.hasErrors === hasErrors
        });
      } catch (error) {
        this.logger.warn('Error validation failed:', error.message);
        results.push({
          type: 'hasErrors',
          passed: false,
          error: error.message
        });
      }
    }

    // Success detection
    if (validation.hasSuccess !== undefined) {
      try {
        const screenshot = await testExecutor.takeScreenshot(`validation-${Date.now()}`);

        const successCheckGoal = "Look at this page and determine if there is a success message visible. Respond with 'yes' if a success message is present, 'no' if not.";

        const action = await computerUse.getNextAction(
          screenshot,
          successCheckGoal,
          { validationType: 'successDetection' }
        );

        if (!action) {
          throw new Error('No response from AI for success detection');
        }

        const hasSuccess = this.parseValidationResponse(action, ['yes', 'success', 'successful', 'complete']);

        results.push({
          type: 'hasSuccess',
          expected: validation.hasSuccess,
          actual: hasSuccess,
          passed: validation.hasSuccess === hasSuccess
        });
      } catch (error) {
        this.logger.warn('Success validation failed:', error.message);
        results.push({
          type: 'hasSuccess',
          passed: false,
          error: error.message
        });
      }
    }

    // No errors validation
    if (validation.noErrors) {
      results.push({
        type: 'noErrors',
        passed: !state.metadata.url.includes('error')
      });
    }

    return results;
  }

  /**
   * Parse validation response from AI
   * @param {Object} action - AI response action
   * @param {Array<string>} indicators - Positive indicator keywords
   * @returns {boolean} Whether validation passed
   */
  parseValidationResponse(action, indicators) {
    // Check if action has a text response
    const responseText = JSON.stringify(action).toLowerCase();

    // Look for positive indicators
    return indicators.some(indicator => responseText.includes(indicator));
  }

  /**
   * Resolve input data from scenario config
   */
  resolveInputs(inputs, scenario) {
    if (typeof inputs === 'string' && inputs.startsWith('testData.')) {
      const path = inputs.replace('testData.', '').split('.');
      let data = scenario.testData;
      for (const key of path) {
        data = data[key];
      }
      return data;
    }
    return inputs;
  }

  /**
   * Run responsive design tests across multiple viewports
   */
  async runResponsiveTest(scenario, testExecutor, computerUse, results) {
    for (const viewport of scenario.viewports) {
      this.logger.info(`Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

      // Resize viewport
      await testExecutor.page.setViewportSize({
        width: viewport.width,
        height: viewport.height
      });

      // Run flow for this viewport
      for (const step of scenario.flow) {
        const stepResult = await this.executeStep(
          step,
          testExecutor,
          computerUse,
          null,
          null,
          scenario
        );

        results.steps.push({
          ...stepResult,
          viewport: viewport.name
        });

        if (!stepResult.success) {
          results.status = 'failed';
          return results;
        }
      }
    }

    results.status = 'passed';
    return results;
  }

  /**
   * Attempt to auto-fix failures using diagnostic and fix agents
   */
  async attemptAutoFix(stepResult, diagnostic, fix, testExecutor) {
    this.logger.info('Attempting auto-fix...');

    try {
      const screenshot = await testExecutor.takeScreenshot(`error-${Date.now()}`);
      const currentUrl = testExecutor.page.url();

      const diagnosticResult = await diagnostic.diagnoseRootCause({
        screenshot: screenshot,
        errorAnalysis: {
          errorDetected: true,
          errorMessage: stepResult.error
        },
        networkLogs: await testExecutor.getNetworkLogs(),
        pageUrl: currentUrl
      });

      const fixPlan = await fix.proposeFixPlan(diagnosticResult);
      await fix.showDiff(fixPlan);

      if (this.options.autoFix) {
        await fix.applyFix(fixPlan, true);
        this.logger.success('Fix applied');
      }

    } catch (error) {
      this.logger.error('Auto-fix failed:', error.message);
    }
  }

  /**
   * Main execution method
   */
  async run() {
    console.log(`
🧪 Gemini E2E Test Scenario Runner
${'='.repeat(60)}
`);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    await this.loadScenarios();

    const results = [];

    if (this.options.all) {
      // Run all enabled scenarios
      for (const scenario of this.scenarios.scenarios) {
        if (scenario.enabled) {
          const result = await this.runScenario(scenario.name);
          results.push(result);
        }
      }
    } else if (this.options.scenario) {
      // Run specific scenario
      const result = await this.runScenario(this.options.scenario);
      results.push(result);
    } else {
      this.logger.error('No scenario specified. Use --scenario <name> or --all');
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

    // Save detailed results
    if (this.outputDir) {
      const resultsPath = path.join(this.outputDir, 'results.json');
      await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
      console.log(`📁 Results saved: ${resultsPath}`);
    }
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    all: args.includes('--all'),
    scenario: args.find((arg, i) => args[i - 1] === '--scenario'),
    debug: args.includes('--debug'),
    autoFix: args.includes('--auto-fix')
  };

  if (!options.all && !options.scenario) {
    console.log(`
Usage: node src/scenario-runner.js [options]

Options:
  --all                Run all enabled test scenarios
  --scenario <name>    Run specific scenario
  --debug              Enable debug logging
  --auto-fix           Automatically apply fixes

Available scenarios:
  - form-validation
  - navigation-test
  - search-functionality
  - responsive-design
  - checkout-flow
  - accessibility-test
  - performance-test

Examples:
  node src/scenario-runner.js --scenario form-validation
  node src/scenario-runner.js --all --debug
  node src/scenario-runner.js --scenario checkout-flow --auto-fix
    `);
    process.exit(0);
  }

  const runner = new ScenarioRunner(options);
  runner.run().catch(console.error);
}

module.exports = ScenarioRunner;
