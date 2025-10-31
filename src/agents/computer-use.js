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

      // Extract function call from response
      const functionCall = response.candidates[0].content.parts.find(
        part => part.functionCall
      );

      if (!functionCall) {
        this.logger.error('No function call in response');
        this.logger.debug('Response parts count:', response.candidates[0].content.parts.length);
        return null;
      }

      const action = functionCall.functionCall;

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        parts: messages[messages.length - 1].parts
      });
      this.conversationHistory.push({
        role: 'model',
        parts: [{ functionCall: action }]
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
   */
  async reportActionResult(result) {
    this.conversationHistory.push({
      role: 'function',
      parts: [{
        functionResponse: {
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
