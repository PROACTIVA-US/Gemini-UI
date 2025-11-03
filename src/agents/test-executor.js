const { chromium } = require('playwright');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class TestExecutorAgent {
  constructor(logger, outputDir) {
    this.logger = logger;
    this.outputDir = outputDir;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.screenshotCount = 0;
    this.networkRequests = [];
  }

  async initialize(options = {}) {
    this.logger.info('Initializing browser...');

    // Use persistent context for session storage (cookies, localStorage, etc.)
    const userDataDir = options.userDataDir || path.join(__dirname, '..', '..', 'tmp', 'browser-sessions');

    // Ensure user data directory exists
    if (!fsSync.existsSync(userDataDir)) {
      fsSync.mkdirSync(userDataDir, { recursive: true });
    }

    // Enable CDP (Chrome DevTools Protocol) on port 9222 for full tracing
    const cdpPort = options.cdpPort || 9222;

    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--start-maximized',
        `--remote-debugging-port=${cdpPort}` // Enable CDP for DevTools access
      ]
    });

    this.cdpPort = cdpPort;
    this.logger.debug(`CDP enabled on port ${cdpPort}`);

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState: options.storageState, // Load previous session if exists
      recordVideo: {
        dir: this.outputDir,
        size: { width: 1920, height: 1080 }
      }
    });

    // Start Playwright tracing for full trace recording
    // Includes screenshots, snapshots, network activity, console logs
    this.traceEnabled = options.enableTrace !== false; // Default: true
    if (this.traceEnabled) {
      const traceOptions = {
        screenshots: true,
        snapshots: true,
        sources: true,
        // Attach full trace data including network and console
      };
      await this.context.tracing.start(traceOptions);
      this.logger.debug('Playwright tracing started');
    }

    this.page = await this.context.newPage();
    this.userDataDir = userDataDir;
    this.tracePath = path.join(this.outputDir, 'trace.zip');

    // Enable console log capture
    this.page.on('console', msg => {
      this.logger.debug(`Browser console: ${msg.text()}`);
    });

    // Enable network request tracking
    this.page.on('request', request => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    });

    this.logger.success('Browser initialized');
  }

  async navigate(url, options = {}) {
    this.logger.info(`Navigating to ${url}`);

    const defaultOptions = {
      waitUntil: 'domcontentloaded', // Changed from networkidle for better reliability
      timeout: 60000 // Increased timeout to 60 seconds
    };

    try {
      await this.page.goto(url, { ...defaultOptions, ...options });
      this.logger.success(`Navigated to ${url}`);
    } catch (error) {
      // If navigation times out, check if we're at least on the page
      const currentUrl = this.page.url();
      if (currentUrl.includes(new URL(url).hostname)) {
        this.logger.warn(`Navigation timed out but reached ${currentUrl}`);
      } else {
        throw error;
      }
    }
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

  /**
   * Take a screenshot with a custom name
   * @param {string} name - Name for the screenshot file
   * @returns {Promise<string>} Base64 encoded screenshot
   */
  async takeScreenshot(name) {
    const screenshotPath = path.join(
      this.outputDir,
      `${name}.png`
    );

    const screenshot = await this.page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    this.logger.debug(`Screenshot saved: ${screenshotPath}`);

    return screenshot.toString('base64');
  }

  /**
   * Returns a copy of all network requests captured since browser initialization.
   * Network requests are tracked via event listener set up in initialize() method.
   * @returns {Array<{url: string, method: string, headers: Object}>} Array of captured network requests
   */
  async getNetworkLogs() {
    return [...this.networkRequests];
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

  /**
   * Execute a Computer Use action
   * @param {object} action - Action from Computer Use API
   * @returns {Promise<object>} Execution result
   */
  async executeComputerUseAction(action) {
    // Validate action object
    if (!action || typeof action !== 'object') {
      this.logger.error('Invalid action: action must be an object');
      return { success: false, actionName: 'unknown', error: 'Invalid action format' };
    }

    if (!action.name || typeof action.name !== 'string') {
      this.logger.error('Invalid action: missing or invalid name');
      return { success: false, actionName: 'unknown', error: 'Missing action name' };
    }

    const { name, args } = action;

    // Validate args for actions that require them
    if (!args && ['click_at', 'type_text_at', 'scroll_document', 'navigate', 'key_combination', 'hover_at'].includes(name)) {
      this.logger.error(`Action ${name} requires args`);
      return { success: false, actionName: name, error: 'Missing action arguments' };
    }

    this.logger.info(`Executing Computer Use action: ${name}`);

    try {
      switch (name) {
        case 'click_at':
          // Validate coordinates
          if (typeof args.x !== 'number' || typeof args.y !== 'number') {
            return { success: false, actionName: name, error: 'Invalid coordinate types' };
          }
          if (args.x < 0 || args.x > 1000 || args.y < 0 || args.y > 1000) {
            return { success: false, actionName: name, error: `Coordinates out of bounds: (${args.x}, ${args.y})` };
          }

          // Convert normalized coordinates (0-999) to actual pixel coordinates
          const clickX = (args.x / 1000) * this.page.viewportSize().width;
          const clickY = (args.y / 1000) * this.page.viewportSize().height;
          await this.page.mouse.click(clickX, clickY);
          return { success: true, action: name, actionName: name };

        case 'type_text_at':
          // Validate coordinates and text
          if (typeof args.x !== 'number' || typeof args.y !== 'number') {
            return { success: false, actionName: name, error: 'Invalid coordinate types' };
          }
          if (args.x < 0 || args.x > 1000 || args.y < 0 || args.y > 1000) {
            return { success: false, actionName: name, error: `Coordinates out of bounds: (${args.x}, ${args.y})` };
          }
          if (!args.text || typeof args.text !== 'string') {
            return { success: false, actionName: name, error: 'Missing or invalid text' };
          }

          const typeX = (args.x / 1000) * this.page.viewportSize().width;
          const typeY = (args.y / 1000) * this.page.viewportSize().height;
          await this.page.mouse.click(typeX, typeY);
          await this.page.keyboard.type(args.text);
          if (args.press_enter) {
            await this.page.keyboard.press('Enter');
          }
          return { success: true, action: name, actionName: name, text: args.text };

        case 'scroll_document':
          await this.page.evaluate((direction) => {
            const distance = direction === 'down' ? 500 : -500;
            window.scrollBy(0, distance);
          }, args.direction);
          return { success: true, action: name, actionName: name, direction: args.direction };

        case 'navigate':
          await this.navigate(args.url);
          return { success: true, action: name, actionName: name, url: args.url };

        case 'key_combination':
          // Parse key combination (e.g., "Control+C")
          await this.page.keyboard.press(args.keys);
          return { success: true, action: name, actionName: name, keys: args.keys };

        case 'go_back':
          await this.page.goBack();
          return { success: true, action: name, actionName: name };

        case 'go_forward':
          await this.page.goForward();
          return { success: true, action: name, actionName: name };

        case 'hover_at':
          // Validate coordinates
          if (typeof args.x !== 'number' || typeof args.y !== 'number') {
            return { success: false, actionName: name, error: 'Invalid coordinate types' };
          }
          if (args.x < 0 || args.x > 1000 || args.y < 0 || args.y > 1000) {
            return { success: false, actionName: name, error: `Coordinates out of bounds: (${args.x}, ${args.y})` };
          }

          const hoverX = (args.x / 1000) * this.page.viewportSize().width;
          const hoverY = (args.y / 1000) * this.page.viewportSize().height;
          await this.page.mouse.move(hoverX, hoverY);
          return { success: true, action: name, actionName: name };

        default:
          this.logger.error(`Unknown Computer Use action: ${name}`);
          return { success: false, action: name, actionName: name, error: 'Unknown action' };
      }
    } catch (error) {
      this.logger.error(`Failed to execute ${name}:`, error.message);
      return { success: false, action: name, actionName: name, error: error.message };
    }
  }

  async cleanup() {
    this.logger.info('Cleaning up browser...');

    // Stop and save trace before closing context
    if (this.traceEnabled && this.context) {
      try {
        await this.context.tracing.stop({ path: this.tracePath });
        this.logger.success(`Trace saved to: ${this.tracePath}`);
        this.logger.info(`View trace: npx playwright show-trace ${this.tracePath}`);
      } catch (error) {
        this.logger.warn(`Failed to save trace: ${error.message}`);
      }
    }

    // Save session state for future use
    if (this.context && options.saveSession !== false) {
      try {
        const storageStatePath = path.join(this.userDataDir, 'session-state.json');
        const storageState = await this.context.storageState();
        await fs.writeFile(storageStatePath, JSON.stringify(storageState, null, 2));
        this.logger.success(`Session saved to: ${storageStatePath}`);
      } catch (error) {
        this.logger.warn(`Failed to save session: ${error.message}`);
      }
    }

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
