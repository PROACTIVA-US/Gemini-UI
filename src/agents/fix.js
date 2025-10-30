const { GoogleGenerativeAI } = require('@google/generative-ai');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

class FixAgent {
  constructor(logger, apiKey, projectPath) {
    this.logger = logger;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
  }

  async proposeFixPlan(diagnostic) {
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

      this.logger.success(`Fix plan created: ${fixPlan.summary}`);
      this.logger.info(`Risk: ${fixPlan.risk}, Requires approval: ${fixPlan.requiresApproval}`);

      return fixPlan;
    } catch (error) {
      this.logger.error('Fix plan generation failed', error.message);
      throw error;
    }
  }

  async applyFix(fixPlan, approved = false) {
    if (fixPlan.requiresApproval && !approved) {
      this.logger.error('Fix requires approval but not provided');
      throw new Error('Approval required');
    }

    this.logger.info('Applying fix...');

    const appliedChanges = [];

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
          this.logger.error(`Old content not found in ${change.file}`);
        }
      } catch (error) {
        this.logger.error(`Failed to apply change to ${change.file}:`, error.message);
      }
    }

    // Commit changes
    if (appliedChanges.length > 0) {
      const commitMessage = `fix: ${fixPlan.summary}\n\nApplied changes:\n${appliedChanges.map(c => `- ${c.file}: ${c.reason}`).join('\n')}`;

      await this.git.add(appliedChanges.map(c => c.file));
      await this.git.commit(commitMessage);

      this.logger.success('Changes committed');
    }

    return appliedChanges;
  }

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
