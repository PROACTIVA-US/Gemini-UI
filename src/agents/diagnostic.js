const { GoogleGenerativeAI } = require('@google/generative-ai');
const VercelAPI = require('../utils/vercel-api');

class DiagnosticAgent {
  constructor(logger, apiKey, vercelToken, vercelProjectId) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
    this.vercelApi = new VercelAPI(vercelToken, vercelProjectId);
  }

  async diagnoseRootCause(errorContext) {
    this.logger.info('Running root cause diagnosis...');

    const { screenshot, errorAnalysis, networkLogs, pageUrl } = errorContext;

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

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const diagnostic = JSON.parse(jsonMatch[0]);

      this.logger.success(`Root cause identified: ${diagnostic.rootCause} (confidence: ${diagnostic.confidence})`);

      return diagnostic;
    } catch (error) {
      this.logger.error('Diagnosis failed', error.message);
      throw error;
    }
  }

  async checkOAuthConfig(provider) {
    this.logger.info(`Checking OAuth config for ${provider}...`);

    // Read .env.local from Veria project if available
    const envPath = process.env.VERIA_PROJECT_PATH
      ? `${process.env.VERIA_PROJECT_PATH}/apps/veria-website/.env.local`
      : null;

    const config = {
      provider,
      envPath,
      checks: []
    };

    // Basic validation
    if (provider === 'github') {
      config.checks.push({
        name: 'GITHUB_CLIENT_ID',
        status: process.env.GITHUB_CLIENT_ID ? 'present' : 'missing'
      });
      config.checks.push({
        name: 'GITHUB_CLIENT_SECRET',
        status: process.env.GITHUB_CLIENT_SECRET ? 'present' : 'missing'
      });
    }

    this.logger.success('Config check complete', config);
    return config;
  }
}

module.exports = DiagnosticAgent;
