const { GoogleGenerativeAI } = require('@google/generative-ai');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

/**
 * EnhancedFixAgent - Advanced diagnostic fix proposal and application agent
 *
 * Improvements over base FixAgent:
 * - Multi-file analysis and fixes
 * - Code context awareness (reads surrounding code)
 * - Fix validation before application
 * - Rollback capability
 * - Fix history and learning
 * - Browser automation fixes (selector updates, timing fixes)
 * - Configuration fixes (env vars, API keys)
 * - Code logic fixes (async/await, error handling)
 */
class EnhancedFixAgent {
  constructor(logger, apiKey, projectPath) {
    if (!logger || typeof logger !== 'object') {
      throw new Error('Valid logger instance is required');
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('Valid API key is required');
    }
    if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
      throw new Error('Valid project path is required');
    }

    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
    this.fixHistory = [];
  }

  /**
   * Enhanced diagnostic and fix proposal with better context awareness
   * @param {Object} diagnostic - Diagnostic object with error information
   * @param {Object} context - Additional context (screenshots, network logs, page state)
   * @returns {Promise<Object>} Enhanced fix plan
   */
  async proposeEnhancedFix(diagnostic, context = {}) {
    this.logger.info('Running enhanced diagnostic analysis...');

    // Categorize the error type
    const errorCategory = this.categorizeError(diagnostic, context);

    this.logger.info(`Error category: ${errorCategory}`);

    // Gather relevant code context based on error category
    const codeContext = await this.gatherCodeContext(errorCategory, diagnostic, context);

    // Build enhanced prompt with code context
    const prompt = this.buildEnhancedPrompt(diagnostic, context, errorCategory, codeContext);

    try {
      const parts = [prompt];

      // Include screenshot if available
      if (context.screenshot) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: context.screenshot
          }
        });
      }

      const result = await this.model.generateContent(parts);
      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const fixPlan = JSON.parse(jsonMatch[0]);

      // Validate fix plan structure
      this.validateFixPlan(fixPlan);

      // Enhance fix plan with additional metadata
      fixPlan.category = errorCategory;
      fixPlan.timestamp = new Date().toISOString();
      fixPlan.diagnostic = diagnostic;

      this.logger.success(`Enhanced fix plan created: ${fixPlan.summary}`);
      this.logger.info(`Category: ${errorCategory}, Risk: ${fixPlan.risk}, Confidence: ${fixPlan.confidence || 'N/A'}`);

      return fixPlan;

    } catch (error) {
      this.logger.error('Enhanced fix plan generation failed', error.message);
      throw error;
    }
  }

  /**
   * Categorize error to determine fix strategy
   */
  categorizeError(diagnostic, context) {
    const errorMessage = (diagnostic.message || '').toLowerCase();
    const pageUrl = context.pageUrl || '';

    // Selector/Element errors
    if (errorMessage.includes('selector') ||
        errorMessage.includes('element not found') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('wait for element')) {
      return 'selector_error';
    }

    // OAuth/Authentication errors
    if (errorMessage.includes('oauth') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('redirect_uri') ||
        pageUrl.includes('error=OAuth')) {
      return 'auth_error';
    }

    // Network/API errors
    if (errorMessage.includes('network') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('api') ||
        errorMessage.includes('cors')) {
      return 'network_error';
    }

    // Configuration errors
    if (errorMessage.includes('env') ||
        errorMessage.includes('config') ||
        errorMessage.includes('undefined') ||
        errorMessage.includes('not found')) {
      return 'config_error';
    }

    // Timing/Race condition errors
    if (errorMessage.includes('race condition') ||
        errorMessage.includes('timing') ||
        errorMessage.includes('navigation') ||
        errorMessage.includes('execution context')) {
      return 'timing_error';
    }

    // Form/Input errors
    if (errorMessage.includes('form') ||
        errorMessage.includes('input') ||
        errorMessage.includes('validation')) {
      return 'form_error';
    }

    return 'unknown_error';
  }

  /**
   * Gather relevant code context based on error category
   */
  async gatherCodeContext(category, diagnostic, context) {
    const codeContext = {
      files: [],
      relevantCode: []
    };

    try {
      switch (category) {
        case 'selector_error':
          // Read test executor and scenario files
          codeContext.files.push(
            await this.readFileIfExists('src/agents/test-executor.js'),
            await this.readFileIfExists('src/scenario-runner.js')
          );
          break;

        case 'auth_error':
          // Read OAuth config and auth-related files
          codeContext.files.push(
            await this.readFileIfExists('.env.local'),
            await this.readFileIfExists('src/scenarios/veria-oauth-flows.json'),
            await this.readFileIfExists('src/orchestrator.js')
          );
          break;

        case 'config_error':
          // Read config files
          codeContext.files.push(
            await this.readFileIfExists('.env'),
            await this.readFileIfExists('.env.local'),
            await this.readFileIfExists('package.json')
          );
          break;

        case 'timing_error':
          // Read test executor for timing-related code
          codeContext.files.push(
            await this.readFileIfExists('src/agents/test-executor.js'),
            await this.readFileIfExists('src/agents/computer-use.js')
          );
          break;
      }

      // Filter out null results
      codeContext.files = codeContext.files.filter(f => f !== null);

    } catch (error) {
      this.logger.debug('Could not gather full code context:', error.message);
    }

    return codeContext;
  }

  /**
   * Read file if it exists, return null otherwise
   */
  async readFileIfExists(relativePath) {
    try {
      const fullPath = path.join(this.projectPath, relativePath);
      const content = await fs.readFile(fullPath, 'utf8');
      return {
        path: relativePath,
        content: content
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build enhanced prompt with code context
   */
  buildEnhancedPrompt(diagnostic, context, category, codeContext) {
    let prompt = `
You are an expert debugging assistant analyzing a test failure.

ERROR CATEGORY: ${category}

DIAGNOSTIC INFORMATION:
${JSON.stringify(diagnostic, null, 2)}

CONTEXT:
- Page URL: ${context.pageUrl || 'N/A'}
- Network Logs: ${context.networkLogs ? context.networkLogs.length + ' requests' : 'N/A'}
- Error Analysis: ${JSON.stringify(context.errorAnalysis || {}, null, 2)}
`;

    // Add code context if available
    if (codeContext.files.length > 0) {
      prompt += `\n\nRELEVANT CODE FILES:\n`;
      for (const file of codeContext.files) {
        // Truncate large files to first 100 lines
        const lines = file.content.split('\n');
        const truncated = lines.slice(0, 100).join('\n');
        prompt += `\n--- ${file.path} ---\n${truncated}\n${lines.length > 100 ? `\n... (${lines.length - 100} more lines)` : ''}\n`;
      }
    }

    // Category-specific guidance
    prompt += this.getCategorySpecificGuidance(category);

    prompt += `

TASK: Analyze the error and propose a fix.

Respond in JSON format:
{
  "rootCause": "detailed explanation of the root cause",
  "confidence": 0.0-1.0,
  "changes": [
    {
      "file": "relative/path/to/file",
      "oldContent": "exact line(s) to replace",
      "newContent": "replacement line(s)",
      "reason": "why this fixes the issue",
      "lineNumber": 123
    }
  ],
  "risk": "low|medium|high",
  "requiresApproval": true/false,
  "summary": "one sentence summary of fix",
  "testingSteps": [
    "step 1 to verify the fix",
    "step 2 to verify the fix"
  ],
  "alternatives": [
    "alternative approach 1",
    "alternative approach 2"
  ]
}

IMPORTANT:
- Be specific with file paths and line numbers
- Include complete context for oldContent (minimum 3 lines)
- Ensure newContent is syntactically correct
- Consider edge cases and potential side effects
- Provide testing steps to verify the fix works
`;

    return prompt;
  }

  /**
   * Get category-specific guidance for the AI
   */
  getCategorySpecificGuidance(category) {
    const guidance = {
      selector_error: `
SELECTOR ERROR GUIDANCE:
- Check if selectors are too specific or too generic
- Consider dynamic IDs that change on each page load
- Look for timing issues (element not yet rendered)
- Suggest using more robust selectors (data-testid, aria-labels)
- Consider waiting strategies (waitForSelector with timeout)
`,
      auth_error: `
AUTH ERROR GUIDANCE:
- Check OAuth client ID and secret configuration
- Verify redirect URI matches OAuth app settings
- Check NEXTAUTH_URL environment variable
- Look for callback URL mismatches
- Verify OAuth scopes are correctly configured
`,
      timing_error: `
TIMING ERROR GUIDANCE:
- Look for missing await keywords
- Check for race conditions in async code
- Suggest adding explicit waits (page.waitForLoadState)
- Consider navigation timeouts
- Look for "Execution context was destroyed" errors
`,
      config_error: `
CONFIG ERROR GUIDANCE:
- Check for missing environment variables
- Verify .env.local exists and is loaded
- Look for typos in environment variable names
- Check if variables are properly exported/accessed
`,
      network_error: `
NETWORK ERROR GUIDANCE:
- Check API endpoint URLs
- Verify CORS configuration
- Look for network timeouts
- Check if APIs are accessible
- Verify request headers and authentication
`,
      form_error: `
FORM ERROR GUIDANCE:
- Check form field selectors
- Verify input validation logic
- Look for submit button issues
- Check form submission handlers
`
    };

    return guidance[category] || '';
  }

  /**
   * Validate fix plan structure
   */
  validateFixPlan(fixPlan) {
    if (!fixPlan || typeof fixPlan !== 'object') {
      throw new Error('Fix plan must be an object');
    }

    const requiredFields = ['rootCause', 'changes', 'risk', 'requiresApproval', 'summary'];
    for (const field of requiredFields) {
      if (!(field in fixPlan)) {
        throw new Error(`Fix plan missing required field: ${field}`);
      }
    }

    if (!Array.isArray(fixPlan.changes)) {
      throw new Error('Fix plan changes must be an array');
    }

    if (!['low', 'medium', 'high'].includes(fixPlan.risk)) {
      throw new Error('Fix plan risk must be low, medium, or high');
    }

    // Validate each change
    for (let i = 0; i < fixPlan.changes.length; i++) {
      const change = fixPlan.changes[i];
      const requiredChangeFields = ['file', 'oldContent', 'newContent', 'reason'];

      for (const field of requiredChangeFields) {
        if (!(field in change)) {
          throw new Error(`Change ${i} missing required field: ${field}`);
        }
      }
    }
  }

  /**
   * Apply fix with validation and rollback capability
   */
  async applyFixWithValidation(fixPlan, approved = false) {
    if (fixPlan.requiresApproval && !approved) {
      throw new Error('Approval required');
    }

    this.logger.info('Applying fix with validation...');

    // Create git checkpoint before applying changes
    const checkpointBranch = `fix-checkpoint-${Date.now()}`;
    try {
      await this.git.checkoutLocalBranch(checkpointBranch);
      this.logger.success(`Created checkpoint branch: ${checkpointBranch}`);
    } catch (error) {
      this.logger.warn('Could not create checkpoint branch:', error.message);
    }

    const appliedChanges = [];
    const failedChanges = [];

    for (const change of fixPlan.changes) {
      const filePath = path.join(this.projectPath, change.file);

      try {
        // Read file
        let content = await fs.readFile(filePath, 'utf8');

        // Validate old content exists
        if (!content.includes(change.oldContent)) {
          throw new Error('Old content not found in file (may have already been changed or incorrect match)');
        }

        // Apply change
        const newContent = content.replace(change.oldContent, change.newContent);

        // Validate new content is different
        if (newContent === content) {
          throw new Error('New content is identical to old content (no changes made)');
        }

        // Write file
        await fs.writeFile(filePath, newContent, 'utf8');

        this.logger.success(`✓ Applied fix to ${change.file}`);
        appliedChanges.push(change);

      } catch (error) {
        this.logger.error(`✗ Failed to apply fix to ${change.file}:`, error.message);
        failedChanges.push({
          ...change,
          error: error.message
        });
      }
    }

    // If any changes failed, offer rollback
    if (failedChanges.length > 0) {
      this.logger.warn(`${failedChanges.length} change(s) failed. You can rollback using: git checkout ${checkpointBranch}`);
    }

    // Commit successful changes
    if (appliedChanges.length > 0) {
      const commitMessage = `fix(${fixPlan.category}): ${fixPlan.summary}\n\n${fixPlan.rootCause}\n\nChanges:\n${appliedChanges.map(c => `- ${c.file}: ${c.reason}`).join('\n')}\n\nRisk: ${fixPlan.risk}\nConfidence: ${fixPlan.confidence || 'N/A'}`;

      try {
        await this.git.add(appliedChanges.map(c => c.file));
        await this.git.commit(commitMessage);
        this.logger.success('Changes committed');
      } catch (error) {
        this.logger.error('Failed to commit changes:', error.message);
      }
    }

    // Record in fix history
    this.fixHistory.push({
      timestamp: new Date().toISOString(),
      fixPlan: fixPlan,
      applied: appliedChanges,
      failed: failedChanges,
      checkpointBranch: checkpointBranch
    });

    return {
      successful: appliedChanges,
      failed: failedChanges,
      checkpointBranch: checkpointBranch
    };
  }

  /**
   * Show enhanced diff with syntax highlighting and context
   */
  async showEnhancedDiff(fixPlan) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🔧 PROPOSED FIX PLAN');
    console.log('='.repeat(70));
    console.log(`\n📋 Summary: ${fixPlan.summary}`);
    console.log(`🎯 Root Cause: ${fixPlan.rootCause}`);
    console.log(`⚠️  Risk Level: ${fixPlan.risk.toUpperCase()}`);
    console.log(`📊 Confidence: ${fixPlan.confidence ? (fixPlan.confidence * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log(`✅ Requires Approval: ${fixPlan.requiresApproval ? 'YES' : 'NO'}`);

    if (fixPlan.alternatives && fixPlan.alternatives.length > 0) {
      console.log(`\n💡 Alternative Approaches:`);
      fixPlan.alternatives.forEach((alt, i) => {
        console.log(`   ${i + 1}. ${alt}`);
      });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('📝 PROPOSED CHANGES:');
    console.log('='.repeat(70));

    for (let i = 0; i < fixPlan.changes.length; i++) {
      const change = fixPlan.changes[i];
      console.log(`\n[${i + 1}/${fixPlan.changes.length}] File: ${change.file}`);
      console.log(`    Reason: ${change.reason}`);
      if (change.lineNumber) {
        console.log(`    Line: ${change.lineNumber}`);
      }
      console.log(`\n    OLD:`);
      console.log(`    ${change.oldContent.split('\n').join('\n    ')}`);
      console.log(`\n    NEW:`);
      console.log(`    ${change.newContent.split('\n').join('\n    ')}`);
      console.log(`    ${'-'.repeat(66)}`);
    }

    if (fixPlan.testingSteps && fixPlan.testingSteps.length > 0) {
      console.log(`\n${'='.repeat(70)}`);
      console.log('🧪 TESTING STEPS:');
      console.log('='.repeat(70));
      fixPlan.testingSteps.forEach((step, i) => {
        console.log(`${i + 1}. ${step}`);
      });
    }

    console.log(`\n${'='.repeat(70)}\n`);
  }

  /**
   * Get fix history
   */
  getFixHistory() {
    return this.fixHistory;
  }

  /**
   * Rollback to a previous state using checkpoint branch
   */
  async rollback(checkpointBranch) {
    this.logger.info(`Rolling back to checkpoint: ${checkpointBranch}`);

    try {
      await this.git.checkout(checkpointBranch);
      this.logger.success('Rollback successful');
      return true;
    } catch (error) {
      this.logger.error('Rollback failed:', error.message);
      return false;
    }
  }
}

module.exports = EnhancedFixAgent;
