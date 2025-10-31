# Legacy Agents

This directory contains deprecated agents that have been replaced by newer implementations.

## Deprecated Agents

### VisionAnalystAgent (vision-analyst.js)

**Status:** DEPRECATED
**Replaced by:** ComputerUseAgent (src/agents/computer-use.js)
**Deprecated on:** October 31, 2025

#### Reason for Deprecation

Vision Analyst used Gemini's vision capabilities to analyze screenshots and suggest actions (like "click the Sign In button"). However, this approach had a critical "translation gap":

1. Vision Analysis: Gemini sees screenshot → suggests action description
2. Translation Gap: Action description → CSS selector (unreliable)
3. Execution: Playwright executes using CSS selector

**Problems:**
- Selector translation was error-prone
- Dynamic UIs broke selectors frequently
- No direct feedback loop for corrections

#### Replacement: Computer Use API

The Computer Use API eliminates the translation gap entirely:

1. Gemini sees screenshot → provides coordinate-based action (e.g., `click_at(x=795, y=32)`)
2. Playwright executes directly at those coordinates
3. Result is reported back to Gemini for self-correction

**Benefits:**
- No translation gap
- Self-correcting loop
- Handles dynamic UIs robustly
- Autonomous navigation without predefined selectors

#### Migration Guide

If you have code using VisionAnalystAgent:

**Old code:**
```javascript
const visionAnalyst = new VisionAnalystAgent(logger, apiKey);
const analysis = await visionAnalyst.analyzeState(screenshot, state, context);
if (analysis.nextAction) {
  await executor.executeAction(analysis.nextAction);
}
```

**New code:**
```javascript
const computerUse = new ComputerUseAgent(logger, apiKey);
const action = await computerUse.getNextAction(screenshot, goal, context);
const result = await executor.executeComputerUseAction(action);
await computerUse.reportActionResult(result);
```

See `docs/COMPUTER_USE_MIGRATION_PLAN.md` for complete migration details.

---

**Do not use legacy agents in new code.**
