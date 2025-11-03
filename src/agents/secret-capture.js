/**
 * SecretCaptureAgent handles capturing secrets from web UIs
 * - Monitors clipboard for newly copied secrets
 * - Extracts secrets from text fields and modals
 * - Validates secret format before capture
 */
class SecretCaptureAgent {
  /**
   * Create a new SecretCaptureAgent instance.
   * @param {Logger} logger - Logger instance for output
   * @param {string} outputDir - Directory for saving screenshots/artifacts
   */
  constructor(logger, outputDir) {
    this.logger = logger;
    this.outputDir = outputDir;
  }

  /**
   * Capture a secret from the current UI state
   * Tries multiple methods: clipboard, text selection, visible text
   * @param {TestExecutorAgent} testExecutor - Browser automation agent
   * @param {string} secretName - Name of the secret being captured
   * @returns {Promise<string|null>} Captured secret or null if not found
   */
  async captureFromUI(testExecutor, secretName) {
    this.logger.info(`    → Attempting to capture ${secretName}...`);

    // Method 1: Try to get from clipboard
    try {
      const clipboardValue = await this.captureFromClipboard(testExecutor);
      if (clipboardValue && this.validateSecret(clipboardValue, secretName)) {
        this.logger.success(`    ✓ Captured ${secretName} from clipboard`);
        return clipboardValue;
      }
    } catch (error) {
      this.logger.debug(`Clipboard capture failed: ${error.message}`);
    }

    // Method 2: Try to find in visible text/input fields
    try {
      const visibleValue = await this.captureFromVisibleText(testExecutor, secretName);
      if (visibleValue && this.validateSecret(visibleValue, secretName)) {
        this.logger.success(`    ✓ Captured ${secretName} from UI`);
        return visibleValue;
      }
    } catch (error) {
      this.logger.debug(`UI text capture failed: ${error.message}`);
    }

    // Method 3: Try to find in code blocks or pre-formatted text
    try {
      const codeValue = await this.captureFromCodeBlock(testExecutor);
      if (codeValue && this.validateSecret(codeValue, secretName)) {
        this.logger.success(`    ✓ Captured ${secretName} from code block`);
        return codeValue;
      }
    } catch (error) {
      this.logger.debug(`Code block capture failed: ${error.message}`);
    }

    this.logger.warn(`    ⚠️  Could not automatically capture ${secretName}`);
    return null;
  }

  /**
   * Attempt to read secret from clipboard
   * @param {TestExecutorAgent} testExecutor - Browser automation agent
   * @returns {Promise<string|null>} Clipboard content or null
   */
  async captureFromClipboard(testExecutor) {
    const page = testExecutor.page;

    // Try to read clipboard using browser API
    const clipboardText = await page.evaluate(async () => {
      try {
        // Request clipboard permissions
        const permission = await navigator.permissions.query({ name: 'clipboard-read' });
        if (permission.state === 'denied') {
          return null;
        }

        // Read clipboard
        const text = await navigator.clipboard.readText();
        return text;
      } catch (error) {
        return null;
      }
    });

    return clipboardText?.trim() || null;
  }

  /**
   * Attempt to find secret in visible input fields or selected text
   * @param {TestExecutorAgent} testExecutor - Browser automation agent
   * @param {string} secretName - Name of secret (helps identify relevant fields)
   * @returns {Promise<string|null>} Found secret or null
   */
  async captureFromVisibleText(testExecutor, secretName) {
    const page = testExecutor.page;

    // Common selectors for secret display
    const selectors = [
      'input[type="text"][readonly]',
      'input[value*="sk_"]',  // Stripe keys
      'input[value*="re_"]',  // Resend keys
      'input[value*="ghp_"]', // GitHub personal access tokens
      'code',
      'pre',
      '.secret-value',
      '.api-key',
      '[data-secret]'
    ];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (!element) continue;

        // Try to get value from input
        const value = await element.evaluate(el => {
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return el.value;
          }
          return el.textContent;
        });

        if (value && value.trim().length > 10) {
          return value.trim();
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    return null;
  }

  /**
   * Attempt to find secret in code blocks or pre-formatted text
   * @param {TestExecutorAgent} testExecutor - Browser automation agent
   * @returns {Promise<string|null>} Found secret or null
   */
  async captureFromCodeBlock(testExecutor) {
    const page = testExecutor.page;

    try {
      // Look for code blocks that might contain secrets
      const codeBlocks = await page.$$eval('code, pre', elements => {
        return elements
          .map(el => el.textContent.trim())
          .filter(text => text.length > 10 && text.length < 200);
      });

      // Return the first valid-looking secret
      for (const text of codeBlocks) {
        // Skip common placeholder text
        if (text.includes('example') || text.includes('your_') || text.includes('xxx')) {
          continue;
        }

        return text;
      }
    } catch (error) {
      // Ignore errors
    }

    return null;
  }

  /**
   * Validate that captured text looks like a valid secret
   * @param {string} value - The captured value
   * @param {string} secretName - Name of the secret (for format validation)
   * @returns {boolean} True if value appears to be a valid secret
   */
  validateSecret(value, secretName) {
    if (!value || typeof value !== 'string') return false;

    // Remove whitespace
    value = value.trim();

    // Basic validation: must be at least 16 characters
    if (value.length < 16) return false;

    // Must not contain common placeholder text
    const placeholders = ['example', 'your_', 'xxx', 'placeholder', 'test123'];
    if (placeholders.some(p => value.toLowerCase().includes(p))) {
      return false;
    }

    // Secret-specific validation
    switch (secretName) {
      case 'STRIPE_SECRET_KEY':
        return value.startsWith('sk_') || value.startsWith('rk_');

      case 'STRIPE_WEBHOOK_SECRET':
        return value.startsWith('whsec_');

      case 'RESEND_API_KEY':
        return value.startsWith('re_');

      case 'GITHUB_CLIENT_SECRET':
        // GitHub secrets are 40 character hex strings
        return /^[a-f0-9]{40}$/i.test(value);

      case 'GOOGLE_CLIENT_SECRET':
        // Google secrets are typically 24-32 character alphanumeric
        return value.length >= 24 && value.length <= 35;

      case 'NEXTAUTH_SECRET':
        // Base64 encoded, should be 40+ characters
        return value.length >= 32 && /^[A-Za-z0-9+/=]+$/.test(value);

      case 'COMPLIANCE_API_ADMIN_KEY':
        // Hex string, 64 characters
        return /^[a-f0-9]{64}$/i.test(value);

      case 'DATABASE_PASSWORD':
        // Typically 20+ alphanumeric characters
        return value.length >= 16 && /^[A-Za-z0-9!@#$%^&*]+$/.test(value);

      default:
        // Generic validation: alphanumeric with some special chars
        return /^[A-Za-z0-9_\-+/=!@#$%^&*]+$/.test(value);
    }
  }

  /**
   * Prompt user to manually input a secret if automatic capture fails
   * @param {string} secretName - Name of the secret
   * @returns {Promise<string>} Manually entered secret
   */
  async promptForManualEntry(secretName) {
    this.logger.warn(`\n⚠️  Could not automatically capture ${secretName}`);
    this.logger.info('Please copy the secret and press Enter...');

    return new Promise((resolve) => {
      const stdin = process.stdin;
      stdin.setRawMode(false);
      stdin.resume();
      stdin.setEncoding('utf8');

      stdin.once('data', async (data) => {
        stdin.pause();

        // Try to read from clipboard after user presses Enter
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          // macOS clipboard read
          const { stdout } = await execAsync('pbpaste');
          const secret = stdout.trim();

          if (this.validateSecret(secret, secretName)) {
            this.logger.success(`✓ ${secretName} captured from clipboard`);
            resolve(secret);
          } else {
            this.logger.error(`✗ Invalid secret format for ${secretName}`);
            resolve(null);
          }
        } catch (error) {
          this.logger.error(`Failed to read clipboard: ${error.message}`);
          resolve(null);
        }
      });
    });
  }

  /**
   * Monitor clipboard for changes (useful for copy-on-reveal secrets)
   * @param {TestExecutorAgent} testExecutor - Browser automation agent
   * @param {number} timeout - How long to wait for clipboard change (ms)
   * @returns {Promise<string|null>} New clipboard content or null
   */
  async waitForClipboardChange(testExecutor, timeout = 10000) {
    const page = testExecutor.page;
    const startTime = Date.now();

    // Get initial clipboard state
    let lastClipboard = await this.captureFromClipboard(testExecutor);

    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const currentClipboard = await this.captureFromClipboard(testExecutor);

      if (currentClipboard && currentClipboard !== lastClipboard) {
        this.logger.success('Detected clipboard change');
        return currentClipboard;
      }

      lastClipboard = currentClipboard;
    }

    return null;
  }
}

module.exports = SecretCaptureAgent;
