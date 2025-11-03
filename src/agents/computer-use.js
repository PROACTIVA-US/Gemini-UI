const { GoogleGenAI, createPartFromBase64, createPartFromText } = require('@google/genai');

/**
 * Computer Use Agent - Uses Gemini Computer Use API for direct browser control
 * Replaces the Vision Analyst Agent with actual browser control capabilities
 */
class ComputerUseAgent {
  constructor(logger, apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('API key is required for ComputerUseAgent');
    }

    this.logger = logger;
    this.client = new GoogleGenAI({ apiKey });
    this.model = options.model || process.env.COMPUTER_USE_MODEL || 'gemini-2.5-computer-use-preview-10-2025';
    this.conversationHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 10; // Limit history to prevent memory issues
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
          createPartFromText(`Goal: ${goal}\nCurrent context: ${JSON.stringify(context)}`),
          createPartFromBase64(screenshot, 'image/png')
        ]
      }
    ];

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: messages,
        config: {
          tools: [{
            computerUse: {
              environment: 'ENVIRONMENT_BROWSER',
              // Optionally exclude certain actions
              // excludedPredefinedFunctions: ['drag_and_drop']
            }
          }]
        }
      });

      // Validate response structure
      if (!response.candidates || response.candidates.length === 0) {
        this.logger.error('No candidates in API response');
        return null;
      }

      if (!response.candidates[0].content || !response.candidates[0].content.parts) {
        this.logger.error('Invalid response structure');
        return null;
      }

      // Log full response structure for debugging safety decisions
      this.logger.debug('Full candidate keys:', Object.keys(response.candidates[0]));

      // Extract function call from response
      const functionCall = response.candidates[0].content.parts.find(
        part => part.functionCall
      );

      if (!functionCall) {
        this.logger.error('No function call in response');
        this.logger.debug('Response parts count:', response.candidates[0].content.parts.length);
        return null;
      }

      this.logger.debug('Function call part keys:', Object.keys(functionCall));

      const action = functionCall.functionCall;

      // Extract safety decision if present (required for function response acknowledgement)
      // Check multiple possible locations in the response
      let safetyDecision = null;

      // Option 1: At candidate level
      if (response.candidates[0].safetyDecision) {
        safetyDecision = response.candidates[0].safetyDecision;
        this.logger.debug('Safety decision found at candidate level');
      }

      // Option 2: At part level
      if (functionCall.safetyDecision) {
        safetyDecision = functionCall.safetyDecision;
        this.logger.debug('Safety decision found at part level');
      }

      if (safetyDecision) {
        action._safetyDecision = safetyDecision;
        this.logger.debug('Safety decision stored:', safetyDecision);
      }

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        parts: messages[messages.length - 1].parts
      });

      // Preserve the full function call part including safety decision if present
      const modelPart = { functionCall: action };

      this.conversationHistory.push({
        role: 'model',
        parts: [modelPart]
      });

      // Prune history to prevent memory issues (keep only recent turns)
      if (this.conversationHistory.length > this.maxHistoryLength * 2) {
        this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength * 2);
        this.logger.debug(`Pruned conversation history to ${this.maxHistoryLength} turns`);
      }

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
   * @param {string} currentUrl - Current page URL after action execution
   */
  async reportActionResult(result, currentUrl) {
    // Computer Use API requires URL in function response
    const response = {
      ...result,
      url: currentUrl || result.url || ''
    };

    // Build function response part
    const functionResponsePart = {
      functionResponse: {
        name: result.actionName,
        response: response
      }
    };

    // Always include safety decision in function response
    // The Gemini Computer Use API requires this even if not explicitly provided in the call
    // Use the stored safety decision if available, otherwise use default "safe" decision
    if (result._safetyDecision) {
      functionResponsePart.safetyDecision = result._safetyDecision;
      this.logger.debug('Acknowledging explicit safety decision');
    } else {
      // Provide default safety acknowledgement
      functionResponsePart.safetyDecision = {
        decision: 'SAFE'
      };
      this.logger.debug('Providing default SAFE safety decision');
    }

    this.conversationHistory.push({
      role: 'function',
      parts: [functionResponsePart]
    });
  }

  /**
   * Execute a high-level task using Computer Use API
   * @param {object} options - Task options
   * @param {string} options.instruction - What to do
   * @param {string} options.screenshot - Base64 screenshot
   * @param {number} options.timeout - Max time in ms
   * @returns {Promise<object>} Task result
   */
  async executeTask(options) {
    const { instruction, screenshot, timeout = 30000 } = options;

    this.logger.info(`Executing task: ${instruction}`);

    const startTime = Date.now();
    const maxAttempts = 5;
    let attempt = 0;

    while (attempt < maxAttempts && (Date.now() - startTime) < timeout) {
      attempt++;

      try {
        // Get next action from Gemini
        const action = await this.getNextAction(screenshot, instruction, {
          attempt,
          maxAttempts
        });

        if (!action) {
          this.logger.warn('No action returned from Computer Use API');
          return { success: false, error: 'No action returned' };
        }

        this.logger.success(`Task action: ${action.name}`);
        return { success: true, action };

      } catch (error) {
        this.logger.error(`Task execution failed: ${error.message}`);

        if (attempt >= maxAttempts) {
          return { success: false, error: error.message };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return { success: false, error: 'Timeout or max attempts reached' };
  }

  /**
   * Reset conversation history
   */
  reset() {
    this.conversationHistory = [];
  }
}

module.exports = ComputerUseAgent;
