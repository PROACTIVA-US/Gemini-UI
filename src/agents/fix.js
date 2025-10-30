const { GoogleGenerativeAI } = require('@google/generative-ai');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

/**
 * FixAgent - Automated diagnostic fix proposal and application agent
 *
 * This agent uses AI to analyze diagnostics, propose fixes, and apply them
 * to project files with proper validation and error handling.
 *
 * @class
 * @example
 * const agent = new FixAgent(logger, apiKey, '/path/to/project');
 * const plan = await agent.proposeFixPlan(diagnostic);
 * await agent.showDiff(plan);
 * const results = await agent.applyFix(plan, true);
 */
class FixAgent {
  /**
   * Creates a new FixAgent instance
   *
   * @param {Object} logger - Logger instance with info, success, and error methods
   * @param {string} apiKey - Google Generative AI API key
   * @param {string} projectPath - Absolute path to the project root directory
   * @throws {Error} If required parameters are missing or invalid
   */
  constructor(logger, apiKey, projectPath) {
    // Validate required parameters
    if (!logger || typeof logger !== 'object') {
      throw new Error('Valid logger instance is required');
    }
    if (!logger.info || !logger.success || !logger.error) {
      throw new Error('Logger must have info, success, and error methods');
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
  }

  /**
   * Proposes a fix plan for a given diagnostic using AI
   *
   * @param {Object} diagnostic - Diagnostic object containing error information
   * @param {string} diagnostic.type - Type of diagnostic (e.g., 'oauth_error')
   * @param {string} diagnostic.message - Error message
   * @param {string} [diagnostic.category] - Error category
   * @param {Object} [diagnostic.context] - Additional context information
   * @returns {Promise<Object>} Fix plan with changes, risk level, and approval requirement
   * @returns {Array<Object>} return.changes - Array of proposed file changes
   * @returns {string} return.risk - Risk level: 'low', 'medium', or 'high'
   * @returns {boolean} return.requiresApproval - Whether manual approval is needed
   * @returns {string} return.summary - One-sentence summary of the fix
   * @throws {Error} If diagnostic is invalid or AI response is malformed
   */
  async proposeFixPlan(diagnostic) {
    // Validate input diagnostic
    if (!diagnostic || typeof diagnostic !== 'object') {
      throw new Error('Valid diagnostic object is required');
    }
    if (!diagnostic.type || typeof diagnostic.type !== 'string') {
      throw new Error('Diagnostic must have a valid type field');
    }
    if (!diagnostic.message || typeof diagnostic.message !== 'string') {
      throw new Error('Diagnostic must have a valid message field');
    }

    this.logger.info('Proposing fix plan...');

    const prompt = `
You are generating a fix plan for an OAuth error.

Diagnostic: ${JSON.stringify(diagnostic)}

Create a fix plan with specific file changes. Only propose changes to:
- .env.local files
- Configuration files (not code files unless critical)

Respond in JSON format:
{
  "changes": [
    {
      "file": "relative/path/to/file",
      "oldContent": "line to replace",
      "newContent": "replacement line",
      "reason": "why this fixes the issue"
    }
  ],
  "risk": "low|medium|high",
  "requiresApproval": true/false,
  "summary": "one sentence summary of fix"
}
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const fixPlan = JSON.parse(jsonMatch[0]);

      // Validate response structure
      if (!fixPlan || typeof fixPlan !== 'object') {
        throw new Error('Fix plan must be an object');
      }
      if (!Array.isArray(fixPlan.changes)) {
        throw new Error('Fix plan must contain a changes array');
      }
      if (!fixPlan.risk || !['low', 'medium', 'high'].includes(fixPlan.risk)) {
        throw new Error('Fix plan must have a valid risk level (low, medium, or high)');
      }
      if (typeof fixPlan.requiresApproval !== 'boolean') {
        throw new Error('Fix plan must have a requiresApproval boolean field');
      }
      if (!fixPlan.summary || typeof fixPlan.summary !== 'string') {
        throw new Error('Fix plan must have a summary string');
      }

      // Validate each change
      for (let i = 0; i < fixPlan.changes.length; i++) {
        const change = fixPlan.changes[i];
        if (!change.file || typeof change.file !== 'string') {
          throw new Error(`Change ${i} must have a valid file field`);
        }
        if (!change.oldContent || typeof change.oldContent !== 'string') {
          throw new Error(`Change ${i} must have a valid oldContent field`);
        }
        if (!change.newContent || typeof change.newContent !== 'string') {
          throw new Error(`Change ${i} must have a valid newContent field`);
        }
        if (!change.reason || typeof change.reason !== 'string') {
          throw new Error(`Change ${i} must have a valid reason field`);
        }
      }

      this.logger.success(`Fix plan created: ${fixPlan.summary}`);
      this.logger.info(`Risk: ${fixPlan.risk}, Requires approval: ${fixPlan.requiresApproval}`);

      return fixPlan;
    } catch (error) {
      this.logger.error('Fix plan generation failed', error.message);
      throw error;
    }
  }

  /**
   * Applies a fix plan to the project files
   *
   * @param {Object} fixPlan - Fix plan object returned from proposeFixPlan
   * @param {Array<Object>} fixPlan.changes - Array of file changes to apply
   * @param {boolean} fixPlan.requiresApproval - Whether approval is required
   * @param {string} fixPlan.summary - Summary of the fix
   * @param {boolean} [approved=false] - Whether the fix has been approved
   * @returns {Promise<Object>} Result containing successful and failed changes
   * @returns {Array<Object>} return.successful - Array of successfully applied changes
   * @returns {Array<Object>} return.failed - Array of failed changes with error details
   * @throws {Error} If approval is required but not provided
   */
  async applyFix(fixPlan, approved = false) {
    if (fixPlan.requiresApproval && !approved) {
      this.logger.error('Fix requires approval but not provided');
      throw new Error('Approval required');
    }

    this.logger.info('Applying fix...');

    const appliedChanges = [];
    const failedChanges = [];

    for (const change of fixPlan.changes) {
      const filePath = path.join(this.projectPath, change.file);

      try {
        // Read file
        let content = await fs.readFile(filePath, 'utf8');

        // Apply change
        if (content.includes(change.oldContent)) {
          content = content.replace(change.oldContent, change.newContent);
          await fs.writeFile(filePath, content, 'utf8');

          this.logger.success(`Applied change to ${change.file}`);
          appliedChanges.push(change);
        } else {
          const error = new Error('Old content not found in file');
          this.logger.error(`Old content not found in ${change.file}`);
          failedChanges.push({
            ...change,
            error: error.message
          });
        }
      } catch (error) {
        this.logger.error(`Failed to apply change to ${change.file}:`, error.message);
        failedChanges.push({
          ...change,
          error: error.message
        });
      }
    }

    // Commit changes with error handling
    if (appliedChanges.length > 0) {
      const commitMessage = `fix: ${fixPlan.summary}\n\nApplied changes:\n${appliedChanges.map(c => `- ${c.file}: ${c.reason}`).join('\n')}`;

      try {
        await this.git.add(appliedChanges.map(c => c.file));
        await this.git.commit(commitMessage);
        this.logger.success('Changes committed');
      } catch (error) {
        this.logger.error('Failed to commit changes:', error.message);
        throw new Error(`Git commit failed: ${error.message}`);
      }
    }

    return {
      successful: appliedChanges,
      failed: failedChanges
    };
  }

  /**
   * Displays a visual diff of proposed changes
   *
   * @param {Object} fixPlan - Fix plan object containing proposed changes
   * @param {Array<Object>} fixPlan.changes - Array of file changes to display
   * @returns {void}
   */
  async showDiff(fixPlan) {
    this.logger.info('Showing proposed changes...');

    for (const change of fixPlan.changes) {
      console.log(`\n📝 File: ${change.file}`);
      console.log(`   Reason: ${change.reason}`);
      console.log(`   - ${change.oldContent}`);
      console.log(`   + ${change.newContent}`);
    }
  }
}

module.exports = FixAgent;
