const { GoogleGenerativeAI } = require('@google/generative-ai');

class VisionAnalystAgent {
  constructor(logger, apiKey) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
  }

  /**
   * Extract JSON from Gemini response text with multiple fallback strategies
   * @private
   * @param {string} text - Raw response text from Gemini
   * @returns {Object} Parsed JSON object
   * @throws {Error} If no valid JSON can be extracted
   */
  _extractJSON(text) {
    // Strategy 1: Try to extract JSON from code block (```json...```)
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (e) {
        this.logger.debug('Failed to parse JSON from code block', e.message);
      }
    }

    // Strategy 2: Try to extract JSON objects and parse them in order
    // Use greedy match to get larger JSON objects first
    const jsonMatches = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (jsonMatches) {
      // Sort by length descending to try larger/more complete objects first
      const sortedMatches = jsonMatches.sort((a, b) => b.length - a.length);
      for (const match of sortedMatches) {
        try {
          return JSON.parse(match);
        } catch (e) {
          this.logger.debug('Failed to parse JSON candidate', e.message);
        }
      }
    }

    // Strategy 3: Try to find JSON between specific markers or at start/end
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.includes('}')) {
      const lastBrace = trimmed.lastIndexOf('}');
      try {
        return JSON.parse(trimmed.substring(0, lastBrace + 1));
      } catch (e) {
        this.logger.debug('Failed to parse trimmed JSON', e.message);
      }
    }

    throw new Error('No valid JSON found in response');
  }

  /**
   * Validate that the analysis response contains all required fields
   * @private
   * @param {Object} analysis - Parsed analysis object
   * @throws {Error} If required fields are missing or invalid
   */
  _validateAnalysisResponse(analysis) {
    const required = ['actualState', 'matches', 'confidence', 'errorDetected', 'nextAction', 'reasoning'];
    const missing = required.filter(field => !(field in analysis));

    if (missing.length > 0) {
      throw new Error(`Missing required fields in analysis response: ${missing.join(', ')}`);
    }

    if (typeof analysis.matches !== 'boolean') {
      throw new Error('Field "matches" must be a boolean');
    }

    if (typeof analysis.errorDetected !== 'boolean') {
      throw new Error('Field "errorDetected" must be a boolean');
    }

    if (typeof analysis.confidence !== 'number' || analysis.confidence < 0 || analysis.confidence > 1) {
      throw new Error('Field "confidence" must be a number between 0 and 1');
    }

    if (!analysis.nextAction || typeof analysis.nextAction !== 'object') {
      throw new Error('Field "nextAction" must be an object');
    }

    if (!analysis.nextAction.type || !analysis.nextAction.reasoning) {
      throw new Error('nextAction must contain "type" and "reasoning" fields');
    }
  }

  /**
   * Validate that the error detection response contains all required fields
   * @private
   * @param {Object} errorAnalysis - Parsed error analysis object
   * @throws {Error} If required fields are missing or invalid
   */
  _validateErrorResponse(errorAnalysis) {
    const required = ['errorDetected', 'errorType', 'severity', 'suggestedAgent', 'reasoning'];
    const missing = required.filter(field => !(field in errorAnalysis));

    if (missing.length > 0) {
      throw new Error(`Missing required fields in error response: ${missing.join(', ')}`);
    }

    if (typeof errorAnalysis.errorDetected !== 'boolean') {
      throw new Error('Field "errorDetected" must be a boolean');
    }

    const validSeverities = ['critical', 'high', 'medium', 'low'];
    if (!validSeverities.includes(errorAnalysis.severity)) {
      throw new Error(`Field "severity" must be one of: ${validSeverities.join(', ')}`);
    }
  }

  /**
   * Analyze a screenshot to determine the current state of the OAuth flow
   * @param {string} screenshot - Base64-encoded screenshot image
   * @param {string} expectedState - The expected state (landing|provider_auth|callback|dashboard|error)
   * @param {Object} context - Additional context about the test
   * @returns {Promise<Object>} Analysis result with actualState, matches, confidence, errorDetected, nextAction, and reasoning
   * @throws {Error} If analysis fails or response is invalid
   */
  async analyzeState(screenshot, expectedState, context = {}) {
    this.logger.info(`Analyzing state (expected: ${expectedState})`);

    const prompt = `
You are analyzing a screenshot from an OAuth authentication flow test.

Expected State: ${expectedState}
Current Context: ${JSON.stringify(context)}

Analyze the screenshot and determine:
1. What is the actual state of the page?
2. Does it match the expected state "${expectedState}"?
3. Are there any errors visible?
4. What should the next action be?

Respond in JSON format:
{
  "actualState": "landing|provider_auth|callback|dashboard|error",
  "matches": true/false,
  "confidence": 0.0-1.0,
  "errorDetected": true/false,
  "errorDetails": "description if error detected",
  "nextAction": {
    "type": "click|type|wait|diagnose",
    "target": "selector or description",
    "reasoning": "why this action"
  },
  "reasoning": "overall analysis"
}
`;

    try {
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      this.logger.debug('Gemini response:', text);

      // Extract and parse JSON with robust extraction
      const analysis = this._extractJSON(text);

      // Validate response schema
      this._validateAnalysisResponse(analysis);

      this.logger.success(`Analysis complete: ${analysis.actualState} (confidence: ${analysis.confidence})`);

      return analysis;
    } catch (error) {
      this.logger.error('Vision analysis failed', error.message);
      throw error;
    }
  }

  /**
   * Detect errors in a screenshot from the OAuth flow
   * @param {string} screenshot - Base64-encoded screenshot image
   * @param {Object} context - Additional context about the test
   * @returns {Promise<Object>} Error analysis with errorDetected, errorType, errorMessage, severity, suggestedAgent, and reasoning
   * @throws {Error} If error detection fails or response is invalid
   */
  async detectError(screenshot, context = {}) {
    this.logger.info('Running error detection...');

    const prompt = `
You are analyzing a screenshot for OAuth authentication errors.

Context: ${JSON.stringify(context)}

Look for:
- Error messages or alerts
- Failed authentication indicators
- Redirect errors (redirect_uri_mismatch, invalid_client, etc.)
- Access denied messages
- Missing or broken UI elements

Respond in JSON format:
{
  "errorDetected": true/false,
  "errorType": "oauth_error|network_error|ui_error|unknown",
  "errorMessage": "exact error text if visible",
  "severity": "critical|high|medium|low",
  "suggestedAgent": "diagnostic|fix|none",
  "reasoning": "what you see"
}
`;

    try {
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      // Extract and parse JSON with robust extraction
      const errorAnalysis = this._extractJSON(text);

      // Validate response schema
      this._validateErrorResponse(errorAnalysis);

      if (errorAnalysis.errorDetected) {
        this.logger.error(`Error detected: ${errorAnalysis.errorType}`, errorAnalysis.errorMessage);
      } else {
        this.logger.success('No errors detected');
      }

      return errorAnalysis;
    } catch (error) {
      this.logger.error('Error detection failed', error.message);
      throw error;
    }
  }
}

module.exports = VisionAnalystAgent;
