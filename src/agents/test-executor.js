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
    this.networkRequests = [];
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

  async navigate(url) {
    this.logger.info(`Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
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
    const { name, args } = action;

    this.logger.info(`Executing Computer Use action: ${name}`);

    try {
      switch (name) {
        case 'click_at':
          // Convert normalized coordinates (0-999) to actual pixel coordinates
          const clickX = (args.x / 1000) * this.page.viewportSize().width;
          const clickY = (args.y / 1000) * this.page.viewportSize().height;
          await this.page.mouse.click(clickX, clickY);
          return { success: true, action: name, actionName: name };

        case 'type_text_at':
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
