const { GoogleGenerativeAI } = require('@google/generative-ai');
const VercelAPI = require('../utils/vercel-api');

/**
 * Diagnostic Agent for analyzing OAuth authentication errors
 * Uses Gemini AI to perform root cause analysis by examining error context,
 * screenshots, network logs, and Vercel deployment logs.
 */
class DiagnosticAgent {
  /**
   * Create a new DiagnosticAgent instance
   * @param {Object} logger - Logger instance for output
   * @param {string} apiKey - Google AI API key for Gemini
   * @param {string} vercelToken - Vercel API token for deployment access
   * @param {string} vercelProjectId - Vercel project ID
   */
  constructor(logger, apiKey, vercelToken, vercelProjectId) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
    this.vercelApi = new VercelAPI(vercelToken, vercelProjectId);
  }

  /**
   * Diagnose the root cause of an OAuth authentication error
   * @param {Object} errorContext - Context information about the error
   * @param {string} errorContext.screenshot - Base64 encoded screenshot
   * @param {Object} errorContext.errorAnalysis - Previous error analysis
   * @param {Array} errorContext.networkLogs - Network request logs
   * @param {string} errorContext.pageUrl - URL where error occurred
   * @returns {Promise<Object>} Diagnostic result with root cause, evidence, and fix suggestions
   * @throws {Error} If validation fails or diagnosis cannot be completed
   */
  async diagnoseRootCause(errorContext) {
    this.logger.info('Running root cause diagnosis...');

    // Input validation
    if (!errorContext || typeof errorContext !== 'object') {
      throw new Error('errorContext must be a valid object');
    }

    const { screenshot, errorAnalysis, networkLogs, pageUrl } = errorContext;

    // Validate required fields
    if (!errorAnalysis) {
      throw new Error('errorContext.errorAnalysis is required');
    }
    if (!pageUrl || typeof pageUrl !== 'string') {
      throw new Error('errorContext.pageUrl must be a valid string');
    }

    // Fetch Vercel logs
    let vercelLogs = null;
    try {
      const deployment = await this.vercelApi.getLatestDeployment();
      vercelLogs = await this.vercelApi.fetchLogs(deployment.id);
    } catch (error) {
      this.logger.debug('Could not fetch Vercel logs:', error.message);
    }

    const prompt = `
You are diagnosing an OAuth authentication error.

Error Analysis: ${JSON.stringify(errorAnalysis)}
Page URL: ${pageUrl}
Vercel Logs: ${JSON.stringify(vercelLogs)}

Common OAuth issues:
- redirect_uri_mismatch: Callback URL mismatch between OAuth app and NEXTAUTH_URL
- invalid_client: Client ID mismatch or incorrect
- access_denied: User denied or app not authorized
- invalid_request: Missing required parameters

Analyze all evidence and determine:
1. What is the root cause?
2. What evidence supports this?
3. What needs to be fixed?

Respond in JSON format:
{
  "rootCause": "brief description",
  "confidence": 0.0-1.0,
  "evidence": [
    "evidence item 1",
    "evidence item 2"
  ],
  "fixSuggestions": [
    {
      "file": "path/to/file",
      "change": "description of change",
      "priority": "critical|high|medium|low"
    }
  ],
  "reasoning": "detailed analysis"
}
`;

    try {
      const parts = [prompt];

      if (screenshot) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        });
      }

      const result = await this.model.generateContent(parts);
      const response = await result.response;
      const text = response.text();

      this.logger.debug('Diagnostic response:', text);

      // Improved JSON parsing with better regex and error handling
      let diagnostic;
      try {
        // Try to find JSON object in response, looking for complete object with proper nesting
        const jsonMatch = text.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        diagnostic = JSON.parse(jsonMatch[0]);

        // Validate expected structure
        if (!diagnostic.rootCause || !diagnostic.confidence) {
          throw new Error('Diagnostic response missing required fields (rootCause, confidence)');
        }
      } catch (parseError) {
        this.logger.error('Failed to parse diagnostic response:', parseError.message);
        this.logger.debug('Raw response:', text);
        throw new Error(`Failed to parse diagnostic response: ${parseError.message}`);
      }

      this.logger.success(`Root cause identified: ${diagnostic.rootCause} (confidence: ${diagnostic.confidence})`);

      // Transform to format expected by FixAgent for backward compatibility
      return {
        type: 'oauth_error',
        message: diagnostic.rootCause,
        category: this._categorizeError(diagnostic.rootCause),
        context: {
          confidence: diagnostic.confidence,
          evidence: diagnostic.evidence || [],
          fixSuggestions: diagnostic.fixSuggestions || [],
          reasoning: diagnostic.reasoning || '',
          pageUrl: pageUrl,
          errorAnalysis: errorAnalysis
        }
      };
    } catch (error) {
      this.logger.error('Diagnosis failed', error.message);
      throw error;
    }
  }

  /**
   * Categorize error based on root cause description
   * @private
   * @param {string} rootCause - Root cause description
   * @returns {string} Error category
   */
  _categorizeError(rootCause) {
    const lower = rootCause.toLowerCase();

    if (lower.includes('redirect_uri') || lower.includes('redirect uri') || lower.includes('callback')) {
      return 'redirect_uri_mismatch';
    }
    if (lower.includes('client_id') || lower.includes('client id') || lower.includes('invalid_client')) {
      return 'invalid_client';
    }
    if (lower.includes('access_denied') || lower.includes('denied')) {
      return 'access_denied';
    }
    if (lower.includes('invalid_request') || lower.includes('missing parameter')) {
      return 'invalid_request';
    }
    if (lower.includes('scope') || lower.includes('permission')) {
      return 'insufficient_scope';
    }

    return 'unknown_error';
  }

  /**
   * Check OAuth configuration for a specific provider
   * Validates presence of required environment variables
   * @param {string} provider - OAuth provider name ('github', 'google', etc.)
   * @returns {Promise<Object>} Configuration check results
   * @throws {Error} If provider is not supported
   */
  async checkOAuthConfig(provider) {
    this.logger.info(`Checking OAuth config for ${provider}...`);

    // Validate provider input
    const supportedProviders = ['github', 'google'];
    if (!provider || typeof provider !== 'string') {
      throw new Error('provider must be a valid string');
    }

    const normalizedProvider = provider.toLowerCase();
    if (!supportedProviders.includes(normalizedProvider)) {
      throw new Error(`Unsupported provider: ${provider}. Supported providers: ${supportedProviders.join(', ')}`);
    }

    // Read .env.local from Veria project if available
    const envPath = process.env.VERIA_PROJECT_PATH
      ? `${process.env.VERIA_PROJECT_PATH}/apps/veria-website/.env.local`
      : null;

    const config = {
      provider: normalizedProvider,
      envPath,
      checks: []
    };

    // Provider-specific validation
    if (normalizedProvider === 'github') {
      config.checks.push({
        name: 'GITHUB_CLIENT_ID',
        status: process.env.GITHUB_CLIENT_ID ? 'present' : 'missing'
      });
      config.checks.push({
        name: 'GITHUB_CLIENT_SECRET',
        status: process.env.GITHUB_CLIENT_SECRET ? 'present' : 'missing'
      });
    } else if (normalizedProvider === 'google') {
      config.checks.push({
        name: 'GOOGLE_CLIENT_ID',
        status: process.env.GOOGLE_CLIENT_ID ? 'present' : 'missing'
      });
      config.checks.push({
        name: 'GOOGLE_CLIENT_SECRET',
        status: process.env.GOOGLE_CLIENT_SECRET ? 'present' : 'missing'
      });
    }

    // Common NextAuth variables
    config.checks.push({
      name: 'NEXTAUTH_URL',
      status: process.env.NEXTAUTH_URL ? 'present' : 'missing'
    });
    config.checks.push({
      name: 'NEXTAUTH_SECRET',
      status: process.env.NEXTAUTH_SECRET ? 'present' : 'missing'
    });

    this.logger.success('Config check complete', config);
    return config;
  }
}

module.exports = DiagnosticAgent;
