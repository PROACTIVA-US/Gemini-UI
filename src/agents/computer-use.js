const { GoogleGenAI, createPartFromBase64, createPartFromText } = require('@google/genai');

/**
 * Computer Use Agent - Uses Gemini Computer Use API for direct browser control
 * Replaces the Vision Analyst Agent with actual browser control capabilities
 */
class ComputerUseAgent {
  constructor(logger, apiKey) {
    this.logger = logger;
    this.client = new GoogleGenAI({ apiKey });
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

      // Debug: Log full response structure
      this.logger.debug('Full API response:', JSON.stringify(response, null, 2));

      // Extract function call from response (check both snake_case and camelCase)
      const functionCall = response.candidates[0].content.parts.find(
        part => part.functionCall || part.function_call
      );

      if (!functionCall) {
        this.logger.error('No function call in response');
        this.logger.debug('Response parts:', response.candidates[0].content.parts);
        return null;
      }

      const action = functionCall.functionCall || functionCall.function_call;

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        parts: messages[messages.length - 1].parts
      });
      this.conversationHistory.push({
        role: 'model',
        parts: [{ functionCall: action }]
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
