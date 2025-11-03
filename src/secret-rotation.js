#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const TestExecutorAgent = require('./agents/test-executor');
const ComputerUseAgent = require('./agents/computer-use');
const SecretCaptureAgent = require('./agents/secret-capture');
const Logger = require('./utils/logger');

const execAsync = promisify(exec);

/**
 * SecretRotationOrchestrator automates the complete secret rotation workflow
 * across all Veria infrastructure services (Stripe, Resend, GitHub, Google, Supabase, Vercel).
 */
class SecretRotationOrchestrator {
  /**
   * Creates a new SecretRotationOrchestrator instance.
   * @param {Object} options - Configuration options
   * @param {boolean} [options.dryRun=false] - Preview without executing
   * @param {boolean} [options.autoApprove=false] - Skip confirmation prompts
   * @param {boolean} [options.debug=false] - Enable debug logging
   * @param {string} [options.service] - Rotate specific service only
   * @param {boolean} [options.testAfter=true] - Test deployment after rotation
   */
  constructor(options = {}) {
    this.options = {
      dryRun: options.dryRun || false,
      autoApprove: options.autoApprove || false,
      debug: options.debug || false,
      service: options.service || null,
      testAfter: options.testAfter !== false
    };

    this.logger = new Logger(this.options.debug);
    this.config = null;
    this.outputDir = null;
    this.rotatedSecrets = new Map();
    this.oldSecrets = new Map();
    this.rollbackData = [];
  }

  async loadConfig() {
    const configPath = path.join(__dirname, 'scenarios/secret-rotation-flows.json');
    const configData = await fs.readFile(configPath, 'utf8');
    this.config = JSON.parse(configData);
    this.logger.success('Secret rotation configuration loaded');
  }

  async setupOutputDirectory() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.outputDir = path.join(__dirname, '..', 'tmp', `secret-rotation-${timestamp}`);
    await fs.mkdir(this.outputDir, { recursive: true });
    this.logger.success(`Output directory: ${this.outputDir}`);
  }

  /**
   * Generate local secrets using openssl commands
   */
  async generateLocalSecrets() {
    this.logger.info('\n🔐 Generating local secrets...');

    const localService = this.config.services.find(s => s.name === 'local-secrets');
    if (!localService) {
      throw new Error('local-secrets service not found in config');
    }

    for (const [taskName, task] of Object.entries(localService.tasks)) {
      this.logger.info(`  → ${task.description}`);

      if (this.options.dryRun) {
        this.logger.info(`    [DRY RUN] Would execute: ${task.command}`);
        this.rotatedSecrets.set(task.outputVar, 'MOCK_SECRET_' + Date.now());
      } else {
        try {
          const { stdout } = await execAsync(task.command);
          const secret = stdout.trim();
          this.rotatedSecrets.set(task.outputVar, secret);
          this.logger.success(`    ✓ ${task.outputVar} generated`);
        } catch (error) {
          this.logger.error(`    ✗ Failed to generate ${task.outputVar}: ${error.message}`);
          throw error;
        }
      }
    }

    return localService.outputs;
  }

  /**
   * Rotate secrets for a specific service using browser automation
   * @param {string} serviceName - Name of the service to rotate
   */
  async rotateService(serviceName) {
    this.logger.info(`\n${'='.repeat(60)}\n🔄 Rotating: ${serviceName}\n${'='.repeat(60)}`);

    const serviceConfig = this.config.services.find(s => s.name === serviceName);
    if (!serviceConfig) {
      throw new Error(`Service ${serviceName} not found in config`);
    }

    // Skip services that don't require browser automation
    if (!serviceConfig.loginRequired) {
      this.logger.info(`Skipping ${serviceName} (handled by local generation)`);
      return;
    }

    // In dry-run mode, skip browser automation
    if (this.options.dryRun) {
      this.logger.info(`[DRY RUN] Would rotate ${serviceConfig.displayName}`);
      for (const output of serviceConfig.outputs) {
        this.rotatedSecrets.set(output, 'MOCK_SECRET_' + Date.now());
        this.logger.info(`  → Would capture: ${output}`);
      }
      return;
    }

    // Initialize agents
    const testExecutor = new TestExecutorAgent(this.logger, this.outputDir);
    const computerUse = new ComputerUseAgent(this.logger, process.env.GEMINI_API_KEY);
    const secretCapture = new SecretCaptureAgent(this.logger, this.outputDir);

    try {
      // Check for existing session
      const sessionPath = path.join(__dirname, '..', 'tmp', 'browser-sessions', 'session-state.json');
      let storageState = null;

      try {
        if (fsSync.existsSync(sessionPath)) {
          storageState = sessionPath;
          this.logger.info('  ✅ Found existing session - attempting auto-login');
        }
      } catch (error) {
        // No session file, will need manual login
      }

      await testExecutor.initialize({ storageState });

      // Navigate to service URL (base domain for login)
      const baseDomain = new URL(serviceConfig.url).origin;
      this.logger.info(`  → Opening ${serviceName} in browser...`);
      await testExecutor.navigate(baseDomain);

      // Wait for login (manual or automated)
      if (serviceConfig.loginRequired) {
        this.logger.info('\n  🔑 Browser opened - You should be logged in to ' + serviceConfig.displayName);
        this.logger.info('  📍 Waiting 10 seconds for you to verify login...\n');

        // Give user 10 seconds to verify they're logged in
        // In foreground mode, they can press Ctrl+C if not ready
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Now navigate to the actual target page
        this.logger.info(`  → Navigating to ${serviceConfig.url}`);
        await testExecutor.navigate(serviceConfig.url);

        // Take screenshot of the page we're on
        await testExecutor.takeScreenshot(`${serviceName}-ready`);
      }

      // Execute flow steps
      for (const step of serviceConfig.flow) {
        if (step === 'login' && !this.options.autoApprove) continue; // Already handled

        this.logger.info(`  → Executing: ${step}`);

        const task = serviceConfig.tasks[step];
        if (!task) {
          this.logger.warn(`    ⚠️  Task ${step} not defined in config`);
          continue;
        }

        if (this.options.dryRun) {
          this.logger.info(`    [DRY RUN] Would execute: ${task.description}`);
          if (task.outputVar) {
            this.rotatedSecrets.set(task.outputVar, 'MOCK_SECRET_' + Date.now());
          }
        } else {
          // Use Computer Use agent to execute the task
          const screenshot = await testExecutor.takeScreenshot(`${serviceName}-${step}`);

          const result = await computerUse.executeTask({
            instruction: task.description,
            screenshot: screenshot,
            timeout: task.timeout || this.config.defaultTimeout
          });

          // Capture secret if this is a capture step
          if (task.outputVar) {
            const capturedSecret = await secretCapture.captureFromUI(
              testExecutor,
              task.outputVar
            );

            if (capturedSecret) {
              this.rotatedSecrets.set(task.outputVar, capturedSecret);
              this.logger.success(`    ✓ ${task.outputVar} captured`);
            } else {
              throw new Error(`Failed to capture ${task.outputVar}`);
            }
          }

          this.logger.success(`    ✓ ${step} completed`);
        }

        // Small delay between actions
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      this.logger.success(`✅ ${serviceConfig.displayName} rotation complete`);

    } catch (error) {
      this.logger.error(`❌ Failed to rotate ${serviceName}: ${error.message}`);

      // Save screenshot for debugging
      if (!this.options.dryRun) {
        await testExecutor.takeScreenshot(`${serviceName}-error`);
      }

      throw error;
    } finally {
      await testExecutor.cleanup({ saveSession: true });
    }

    return serviceConfig.outputs;
  }

  /**
   * Update all rotated secrets in Vercel
   */
  async updateVercel() {
    this.logger.info('\n🚀 Updating Vercel environment variables...');

    if (this.options.dryRun) {
      this.logger.info('[DRY RUN] Would update the following secrets in Vercel:');
      for (const [key, value] of this.rotatedSecrets.entries()) {
        this.logger.info(`  - ${key}: ${value.substring(0, 10)}...`);
      }
      return;
    }

    // TODO: Implement Vercel API integration
    // For now, output instructions
    this.logger.info('\n📋 Manual Vercel Update Required:');
    this.logger.info('Go to: https://vercel.com/proactiva-us/veria-website/settings/environment-variables\n');

    for (const [key, value] of this.rotatedSecrets.entries()) {
      this.logger.info(`${key}=${value}`);
    }

    if (!this.options.autoApprove) {
      this.logger.info('\nPress Enter after updating Vercel...');
      await this.waitForUserInput();
    }
  }

  /**
   * Test production deployment to verify rotated secrets work
   */
  async testDeployment() {
    if (!this.options.testAfter) {
      this.logger.info('Skipping deployment test (--no-test-after)');
      return;
    }

    this.logger.info('\n🧪 Testing production deployment...');

    const testEndpoints = this.config.rollbackStrategy.testEndpoints;

    for (const endpoint of testEndpoints) {
      this.logger.info(`  → Testing ${endpoint}`);

      if (this.options.dryRun) {
        this.logger.info('    [DRY RUN] Would test endpoint');
        continue;
      }

      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          this.logger.success(`    ✓ ${endpoint} responding`);
        } else {
          this.logger.warn(`    ⚠️  ${endpoint} returned ${response.status}`);
        }
      } catch (error) {
        this.logger.error(`    ✗ ${endpoint} failed: ${error.message}`);
      }
    }
  }

  /**
   * Save rotation results to file
   */
  async saveResults() {
    const results = {
      timestamp: new Date().toISOString(),
      dryRun: this.options.dryRun,
      rotatedSecrets: Array.from(this.rotatedSecrets.keys()),
      rollbackData: this.rollbackData,
      success: true
    };

    const resultsPath = path.join(this.outputDir, 'rotation-results.json');
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
    this.logger.success(`Results saved to: ${resultsPath}`);

    // Also save secrets to secure file (for manual Vercel update if needed)
    const secretsPath = path.join(this.outputDir, 'new-secrets.env');
    const secretsContent = Array.from(this.rotatedSecrets.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.writeFile(secretsPath, secretsContent, { mode: 0o600 });
    this.logger.success(`Secrets saved to: ${secretsPath}`);
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      this.logger.info('🔐 Veria Secret Rotation Automation\n');

      if (this.options.dryRun) {
        this.logger.warn('⚠️  DRY RUN MODE - No changes will be made\n');
      }

      await this.loadConfig();
      await this.setupOutputDirectory();

      // Determine which services to rotate
      const servicesToRotate = this.options.service
        ? [this.options.service]
        : this.config.executionOrder;

      // Step 1: Generate local secrets
      if (servicesToRotate.includes('local-secrets') || !this.options.service) {
        await this.generateLocalSecrets();
      }

      // Step 2: Rotate each service
      for (const serviceName of servicesToRotate) {
        if (serviceName === 'local-secrets' || serviceName === 'vercel') continue;

        try {
          await this.rotateService(serviceName);
        } catch (error) {
          this.logger.error(`Failed to rotate ${serviceName}: ${error.message}`);

          if (!this.options.autoApprove) {
            this.logger.info('Continue with remaining services? (y/n)');
            const answer = await this.waitForUserInput();
            if (answer.toLowerCase() !== 'y') {
              throw new Error('Rotation aborted by user');
            }
          }
        }
      }

      // Step 3: Update Vercel
      if (servicesToRotate.includes('vercel') || !this.options.service) {
        await this.updateVercel();
      }

      // Step 4: Test deployment
      await this.testDeployment();

      // Step 5: Save results
      await this.saveResults();

      this.logger.success('\n✅ Secret rotation completed successfully!');
      this.logger.info(`\nRotated ${this.rotatedSecrets.size} secrets`);
      this.logger.info(`Results saved to: ${this.outputDir}`);

    } catch (error) {
      this.logger.error(`\n❌ Secret rotation failed: ${error.message}`);
      this.logger.error('Check logs for details');
      throw error;
    }
  }

  /**
   * Wait for user input (for manual steps)
   */
  waitForUserInput() {
    return new Promise((resolve) => {
      const stdin = process.stdin;

      // Check if stdin is a TTY before setting raw mode
      if (stdin.isTTY && stdin.setRawMode) {
        stdin.setRawMode(false);
      }

      stdin.resume();
      stdin.setEncoding('utf8');

      stdin.once('data', (data) => {
        stdin.pause();
        resolve(data.toString().trim());
      });
    });
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    dryRun: args.includes('--dry-run'),
    autoApprove: args.includes('--auto-approve'),
    debug: args.includes('--debug'),
    testAfter: !args.includes('--no-test-after'),
    service: null
  };

  // Extract service name if provided
  const serviceIndex = args.indexOf('--service');
  if (serviceIndex !== -1 && args[serviceIndex + 1]) {
    options.service = args[serviceIndex + 1];
  }

  const orchestrator = new SecretRotationOrchestrator(options);

  orchestrator.run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = SecretRotationOrchestrator;
