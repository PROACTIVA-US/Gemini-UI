# Gemini Computer Use API Migration Plan

## Overview
This document outlines how to migrate from the current Vision Analysis approach to the proper Computer Use API implementation.

---

## Phase 1: Update Dependencies

### 1.1 Update package.json
```bash
npm install @google/genai@latest
```

Note: The `@google/generative-ai` package is being deprecated. Use `@google/genai` instead.

### 1.2 Verify Model Access
Ensure you have access to `gemini-2.5-computer-use-preview-10-2025` model (Preview access required).

---

## Phase 2: Replace Vision Analyst with Computer Use Agent

### 2.1 Create New Agent: `src/agents/computer-use.js`

```javascript
const { GoogleGenerativeAI } = require('@google/genai');

/**
 * Computer Use Agent - Uses Gemini Computer Use API for direct browser control
 * Replaces the Vision Analyst Agent with actual browser control capabilities
 */
class ComputerUseAgent {
  constructor(logger, apiKey) {
    this.logger = logger;
    this.client = new GoogleGenerativeAI({ apiKey });
    this.model = 'gemini-2.5-computer-use-preview-10-2025';
    this.conversationHistory = [];
  }

  /**
   * Get next action from Gemini Computer Use API
   * @param {string} screenshot - Base64 encoded screenshot
   * @param {string} goal - Current goal/task description
   * @param {object} context - Additional context (state, url, etc.)
   * @returns {Promise<object>} Computer use action to execute
   */
  async getNextAction(screenshot, goal, context = {}) {
    this.logger.info(`Getting next action for goal: ${goal}`);

    // Build conversation history with screenshots
    const messages = [
      ...this.conversationHistory,
      {
        role: 'user',
        parts: [
          { text: `Goal: ${goal}\nCurrent context: ${JSON.stringify(context)}` },
          {
            inline_data: {
              mime_type: 'image/png',
              data: screenshot
            }
          }
        ]
      }
    ];

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: messages,
        config: {
          tools: [{
            computer_use: {
              environment: 'ENVIRONMENT_BROWSER',
              // Optionally exclude certain actions
              // excluded_predefined_functions: ['drag_and_drop']
            }
          }]
        }
      });

      // Extract function call from response
      const functionCall = response.candidates[0].content.parts.find(
        part => part.function_call
      );

      if (!functionCall) {
        this.logger.error('No function call in response');
        return null;
      }

      const action = functionCall.function_call;

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        parts: messages[messages.length - 1].parts
      });
      this.conversationHistory.push({
        role: 'model',
        parts: [{ function_call: action }]
      });

      this.logger.success(`Action received: ${action.name}`);
      this.logger.debug('Action details:', action);

      return action;
    } catch (error) {
      this.logger.error('Computer Use API failed', error.message);
      throw error;
    }
  }

  /**
   * Report action result back to Gemini
   * @param {object} result - Result of executed action
   */
  async reportActionResult(result) {
    this.conversationHistory.push({
      role: 'function',
      parts: [{
        function_response: {
          name: result.actionName,
          response: result
        }
      }]
    });
  }

  /**
   * Reset conversation history
   */
  reset() {
    this.conversationHistory = [];
  }
}

module.exports = ComputerUseAgent;
```

### 2.2 Update Test Executor to Handle Computer Use Actions

Add a new method to `src/agents/test-executor.js`:

```javascript
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
        return { success: true, action: name };

      case 'type_text_at':
        const typeX = (args.x / 1000) * this.page.viewportSize().width;
        const typeY = (args.y / 1000) * this.page.viewportSize().height;
        await this.page.mouse.click(typeX, typeY);
        await this.page.keyboard.type(args.text);
        if (args.press_enter) {
          await this.page.keyboard.press('Enter');
        }
        return { success: true, action: name, text: args.text };

      case 'scroll_document':
        await this.page.evaluate((direction) => {
          const distance = direction === 'down' ? 500 : -500;
          window.scrollBy(0, distance);
        }, args.direction);
        return { success: true, action: name, direction: args.direction };

      case 'navigate':
        await this.navigate(args.url);
        return { success: true, action: name, url: args.url };

      case 'key_combination':
        // Parse key combination (e.g., "Control+C")
        await this.page.keyboard.press(args.keys);
        return { success: true, action: name, keys: args.keys };

      case 'go_back':
        await this.page.goBack();
        return { success: true, action: name };

      case 'go_forward':
        await this.page.goForward();
        return { success: true, action: name };

      case 'hover_at':
        const hoverX = (args.x / 1000) * this.page.viewportSize().width;
        const hoverY = (args.y / 1000) * this.page.viewportSize().height;
        await this.page.mouse.move(hoverX, hoverY);
        return { success: true, action: name };

      default:
        this.logger.error(`Unknown Computer Use action: ${name}`);
        return { success: false, action: name, error: 'Unknown action' };
    }
  } catch (error) {
    this.logger.error(`Failed to execute ${name}:`, error.message);
    return { success: false, action: name, error: error.message };
  }
}
```

---

## Phase 3: Update Orchestrator

### 3.1 Replace Vision Analyst with Computer Use Agent

In `src/orchestrator.js`, replace:

```javascript
// OLD:
const VisionAnalystAgent = require('./agents/vision-analyst');
const visionAnalyst = new VisionAnalystAgent(this.logger, process.env.GEMINI_API_KEY);

// NEW:
const ComputerUseAgent = require('./agents/computer-use');
const computerUse = new ComputerUseAgent(this.logger, process.env.GEMINI_API_KEY);
```

### 3.2 Update Test Loop

Replace the vision analysis + action execution pattern with Computer Use workflow:

```javascript
// OLD PATTERN:
// 1. Capture state
const capturedState = await testExecutor.captureState();

// 2. Analyze with vision
const analysis = await visionAnalyst.analyzeState(
  capturedState.screenshot,
  currentState,
  context
);

// 3. Execute suggested action (with gap)
if (analysis.nextAction) {
  await this.executeAction(testExecutor, analysis.nextAction, providerConfig);
}

// NEW PATTERN:
// 1. Capture state
const capturedState = await testExecutor.captureState();

// 2. Get Computer Use action (no gap!)
const action = await computerUse.getNextAction(
  capturedState.screenshot,
  `Navigate through ${currentState} state for ${providerName} OAuth`,
  {
    state: currentState,
    url: capturedState.metadata.url,
    provider: providerName
  }
);

// 3. Execute Computer Use action directly
const result = await testExecutor.executeComputerUseAction(action);

// 4. Report result back to Gemini
await computerUse.reportActionResult(result);

// 5. Check if state completed
if (result.success) {
  stateMachine.advance();
} else {
  // Handle retry or error
  if (!stateMachine.retry()) {
    throw new Error(`Failed to complete state: ${currentState}`);
  }
}
```

---

## Phase 4: Testing & Validation

### 4.1 Test Computer Use Actions Individually

Create `test/test-computer-use.js`:

```javascript
const ComputerUseAgent = require('../src/agents/computer-use');
const TestExecutorAgent = require('../src/agents/test-executor');
const Logger = require('../src/utils/logger');

async function test() {
  const logger = new Logger(true);
  const executor = new TestExecutorAgent(logger, './tmp');
  const computerUse = new ComputerUseAgent(logger, process.env.GEMINI_API_KEY);

  try {
    await executor.initialize();
    await executor.navigate('https://veria.cc');

    const state = await executor.captureState();

    const action = await computerUse.getNextAction(
      state.screenshot,
      'Click the Sign In button',
      { url: 'https://veria.cc' }
    );

    console.log('Computer Use Action:', action);

    const result = await executor.executeComputerUseAction(action);
    console.log('Execution Result:', result);

    await executor.cleanup();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
```

### 4.2 Integration Test

Run the full OAuth flow with Computer Use:

```bash
npm run test:github
```

---

## Phase 5: Remove Legacy Code

Once Computer Use API is working:

### 5.1 Deprecate Vision Analyst
- Move `src/agents/vision-analyst.js` to `src/agents/legacy/`
- Add deprecation notice
- Update documentation

### 5.2 Deprecate Diagnostic & Fix Agents (Optional)
Computer Use API can handle error recovery autonomously, but you may want to keep these for additional analysis.

---

## Expected Improvements

### Before (Vision Analysis):
```
Screenshot → Vision: "Click Sign In" → Test Executor: ??? → FAIL (selector not found)
```

### After (Computer Use):
```
Screenshot → Computer Use: click_at(x=500, y=300) → Test Executor: ✓ Click → SUCCESS
```

### Benefits:
1. **No Translation Gap** - Gemini controls browser directly
2. **Self-Correcting** - Gemini sees result and adjusts
3. **Autonomous** - Can complete entire flow without predefined selectors
4. **Robust** - Handles dynamic UIs, popup overlays, etc.

---

## Migration Checklist

- [ ] Install `@google/genai` package
- [ ] Create `ComputerUseAgent` class
- [ ] Add `executeComputerUseAction()` to Test Executor
- [ ] Update Orchestrator to use Computer Use instead of Vision
- [ ] Test individual Computer Use actions
- [ ] Run full OAuth integration test
- [ ] Verify error handling and retry logic
- [ ] Update documentation
- [ ] Deprecate Vision Analyst
- [ ] Clean up legacy code

---

## Notes

- Computer Use API is in **Preview** - expect changes
- Monitor for SDK updates (currently `@google/genai`)
- Keep conversation history for multi-turn interactions
- Use safety checks for high-stakes actions
- Consider rate limiting for API calls

---

## Resources

- [Official Computer Use Docs](https://ai.google.dev/gemini-api/docs/computer-use)
- [Google Gen AI SDK](https://www.npmjs.com/package/@google/genai)
- [Gemini Computer Use Blog Post](https://blog.google/technology/google-deepmind/gemini-computer-use-model/)

---

**Status:** Ready for implementation
**Estimated Time:** 4-6 hours
**Priority:** High (addresses core functionality gap)
