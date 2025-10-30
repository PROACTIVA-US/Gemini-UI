const { GoogleGenerativeAI } = require('@google/generative-ai');

class VisionAnalystAgent {
  constructor(logger, apiKey) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
  }

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

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      this.logger.success(`Analysis complete: ${analysis.actualState} (confidence: ${analysis.confidence})`);

      return analysis;
    } catch (error) {
      this.logger.error('Vision analysis failed', error.message);
      throw error;
    }
  }

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

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const errorAnalysis = JSON.parse(jsonMatch[0]);

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
