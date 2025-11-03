#!/usr/bin/env node

/**
 * Fix Analyzer CLI - Interactive tool for analyzing and fixing test failures
 *
 * Usage:
 *   node scripts/fix-analyzer.js --error "selector timeout" --url "https://example.com"
 *   node scripts/fix-analyzer.js --from-log tmp/test-results/execution.log
 *   node scripts/fix-analyzer.js --interactive
 */

require('dotenv').config();
const EnhancedFixAgent = require('../src/agents/enhanced-fix');
const DiagnosticAgent = require('../src/agents/diagnostic');
const Logger = require('../src/utils/logger');
const fs = require('fs').promises;
const readline = require('readline');

class FixAnalyzer {
  constructor(options = {}) {
    this.logger = new Logger(options.debug || false);
    this.options = options;

    this.enhancedFix = new EnhancedFixAgent(
      this.logger,
      process.env.GEMINI_API_KEY,
      process.env.VERIA_PROJECT_PATH || process.cwd()
    );

    this.diagnostic = new DiagnosticAgent(
      this.logger,
      process.env.GEMINI_API_KEY,
      process.env.VERCEL_TOKEN,
      process.env.VERCEL_PROJECT_ID
    );
  }

  /**
   * Analyze error from command line arguments
   */
  async analyzeFromArgs() {
    const error = this.options.error;
    const url = this.options.url || 'unknown';
    const screenshot = this.options.screenshot;

    this.logger.info('Analyzing error from command line...');

    // Build diagnostic object
    const diagnostic = {
      type: 'test_failure',
      message: error,
      category: 'unknown'
    };

    // Build context
    const context = {
      pageUrl: url,
      errorAnalysis: {
        errorDetected: true,
        errorMessage: error
      }
    };

    // Load screenshot if provided
    if (screenshot) {
      try {
        const screenshotData = await fs.readFile(screenshot);
        context.screenshot = screenshotData.toString('base64');
      } catch (err) {
        this.logger.warn('Could not load screenshot:', err.message);
      }
    }

    // Generate fix plan
    const fixPlan = await this.enhancedFix.proposeEnhancedFix(diagnostic, context);

    // Show diff
    await this.enhancedFix.showEnhancedDiff(fixPlan);

    // Ask for approval
    if (fixPlan.requiresApproval && !this.options.autoApply) {
      const approved = await this.askForApproval();

      if (approved) {
        const result = await this.enhancedFix.applyFixWithValidation(fixPlan, true);
        this.showResults(result);
      } else {
        this.logger.info('Fix not applied (user declined)');
      }
    } else if (this.options.autoApply) {
      const result = await this.enhancedFix.applyFixWithValidation(fixPlan, true);
      this.showResults(result);
    }
  }

  /**
   * Analyze error from log file
   */
  async analyzeFromLog() {
    const logPath = this.options.fromLog;

    this.logger.info(`Reading log file: ${logPath}`);

    try {
      const logContent = await fs.readFile(logPath, 'utf8');

      // Parse log file for errors
      const errors = this.parseLogForErrors(logContent);

      if (errors.length === 0) {
        this.logger.info('No errors found in log file');
        return;
      }

      this.logger.info(`Found ${errors.length} error(s) in log file`);

      // Analyze each error
      for (let i = 0; i < errors.length; i++) {
        const error = errors[i];

        console.log(`\n${'='.repeat(70)}`);
        console.log(`Analyzing error ${i + 1}/${errors.length}`);
        console.log('='.repeat(70));

        const diagnostic = {
          type: 'test_failure',
          message: error.message,
          category: error.category || 'unknown'
        };

        const context = {
          pageUrl: error.url || 'unknown',
          errorAnalysis: {
            errorDetected: true,
            errorMessage: error.message
          }
        };

        const fixPlan = await this.enhancedFix.proposeEnhancedFix(diagnostic, context);
        await this.enhancedFix.showEnhancedDiff(fixPlan);

        if (this.options.autoApply) {
          const result = await this.enhancedFix.applyFixWithValidation(fixPlan, true);
          this.showResults(result);
        } else if (fixPlan.requiresApproval) {
          const approved = await this.askForApproval();
          if (approved) {
            const result = await this.enhancedFix.applyFixWithValidation(fixPlan, true);
            this.showResults(result);
          }
        }
      }

    } catch (error) {
      this.logger.error('Failed to analyze log file:', error.message);
    }
  }

  /**
   * Interactive mode
   */
  async runInteractive() {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                    🔧 Fix Analyzer - Interactive Mode              ║
╚════════════════════════════════════════════════════════════════════╝
`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    // Gather information
    const errorMessage = await question('Enter error message: ');
    const pageUrl = await question('Enter page URL (optional): ');
    const screenshotPath = await question('Enter screenshot path (optional): ');

    rl.close();

    // Build diagnostic
    const diagnostic = {
      type: 'test_failure',
      message: errorMessage,
      category: 'unknown'
    };

    const context = {
      pageUrl: pageUrl || 'unknown',
      errorAnalysis: {
        errorDetected: true,
        errorMessage: errorMessage
      }
    };

    // Load screenshot if provided
    if (screenshotPath) {
      try {
        const screenshotData = await fs.readFile(screenshotPath);
        context.screenshot = screenshotData.toString('base64');
      } catch (err) {
        this.logger.warn('Could not load screenshot:', err.message);
      }
    }

    // Generate fix
    const fixPlan = await this.enhancedFix.proposeEnhancedFix(diagnostic, context);
    await this.enhancedFix.showEnhancedDiff(fixPlan);

    // Apply if approved
    if (fixPlan.requiresApproval) {
      const approved = await this.askForApproval();
      if (approved) {
        const result = await this.enhancedFix.applyFixWithValidation(fixPlan, true);
        this.showResults(result);
      }
    }
  }

  /**
   * Parse log file for errors
   */
  parseLogForErrors(logContent) {
    const errors = [];
    const lines = logContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for error patterns
      if (line.includes('ERROR') || line.includes('Failed') || line.includes('FAILED')) {
        // Extract error message
        const errorMatch = line.match(/ERROR.*?:(.*?)$/i) ||
                          line.match(/Failed.*?:(.*?)$/i) ||
                          line.match(/FAILED.*?:(.*?)$/i);

        if (errorMatch) {
          // Look for URL in nearby lines
          let url = 'unknown';
          for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
            const urlMatch = lines[j].match(/URL:\s*(https?:\/\/[^\s]+)/i);
            if (urlMatch) {
              url = urlMatch[1];
              break;
            }
          }

          errors.push({
            message: errorMatch[1].trim(),
            url: url,
            line: i + 1
          });
        }
      }
    }

    return errors;
  }

  /**
   * Ask user for approval
   */
  async askForApproval() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nApply this fix? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  /**
   * Show results of fix application
   */
  showResults(result) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 FIX APPLICATION RESULTS');
    console.log('='.repeat(70));

    console.log(`\n✅ Successful: ${result.successful.length}`);
    result.successful.forEach(change => {
      console.log(`   - ${change.file}`);
    });

    if (result.failed.length > 0) {
      console.log(`\n❌ Failed: ${result.failed.length}`);
      result.failed.forEach(change => {
        console.log(`   - ${change.file}: ${change.error}`);
      });
    }

    console.log(`\n🔖 Checkpoint branch: ${result.checkpointBranch}`);
    console.log(`   To rollback: git checkout ${result.checkpointBranch}`);
    console.log('='.repeat(70) + '\n');
  }

  /**
   * Main run method
   */
  async run() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    if (this.options.interactive) {
      await this.runInteractive();
    } else if (this.options.fromLog) {
      await this.analyzeFromLog();
    } else if (this.options.error) {
      await this.analyzeFromArgs();
    } else {
      this.showUsage();
    }
  }

  /**
   * Show usage information
   */
  showUsage() {
    console.log(`
Fix Analyzer - Intelligent test failure analysis and repair

Usage:
  node scripts/fix-analyzer.js [options]

Options:
  --error <message>         Error message to analyze
  --url <url>              Page URL where error occurred
  --screenshot <path>      Path to screenshot of error
  --from-log <path>        Analyze errors from log file
  --interactive            Interactive mode
  --auto-apply             Automatically apply fixes without approval
  --debug                  Enable debug logging

Examples:
  # Analyze specific error
  node scripts/fix-analyzer.js --error "timeout waiting for selector" --url "https://example.com"

  # Analyze from log file
  node scripts/fix-analyzer.js --from-log tmp/test-results/execution.log

  # Interactive mode
  node scripts/fix-analyzer.js --interactive

  # Auto-apply fixes
  node scripts/fix-analyzer.js --from-log tmp/test-results/execution.log --auto-apply
`);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    error: args.find((arg, i) => args[i - 1] === '--error'),
    url: args.find((arg, i) => args[i - 1] === '--url'),
    screenshot: args.find((arg, i) => args[i - 1] === '--screenshot'),
    fromLog: args.find((arg, i) => args[i - 1] === '--from-log'),
    interactive: args.includes('--interactive'),
    autoApply: args.includes('--auto-apply'),
    debug: args.includes('--debug')
  };

  const analyzer = new FixAnalyzer(options);
  analyzer.run().catch(console.error);
}

module.exports = FixAnalyzer;
