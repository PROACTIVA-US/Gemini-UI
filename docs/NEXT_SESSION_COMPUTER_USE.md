# Next Session: Implement Gemini Computer Use API

## Session Goal
Refactor the OAuth automation system to use **Gemini Computer Use API** instead of Vision Analysis API to eliminate the vision → automation gap.

---

## Quick Start Command

```bash
cd /Users/danielconnolly/Projects/Gemini/gemini-ui-testing
```

Then tell Claude:
> "I want to implement the Computer Use API migration from COMPUTER_USE_MIGRATION_PLAN.md. Start with Phase 2 (creating ComputerUseAgent) and work through all phases systematically."

---

## Current Status

### ✅ What's Complete
- **All 9 implementation tasks** from original plan finished
- **Multi-agent system** working (Test Executor, Vision Analyst, Diagnostic, Fix, Orchestrator)
- **1,361 lines of production code** written and tested
- **Complete documentation** (README, TESTING_NOTES, design docs)
- **18 git commits** with clean history

### ⚠️ Critical Issue Identified
**The system uses the WRONG Gemini API approach:**

**Current (Incorrect):**
```
Screenshot → Vision API → "Click Sign In" → Test Executor → ❌ Can't find element
```

**Should Be (Correct):**
```
Screenshot → Computer Use API → click_at(x=500, y=300) → Test Executor → ✅ Clicks
```

**Root Cause:** We implemented Vision Analysis when we should have used Computer Use API for direct browser control.

---

## What Needs To Be Done

### Phase 1: Update Dependencies ⏱️ 10 mins

```bash
# Install new SDK (Computer Use requires @google/genai, not @google/generative-ai)
npm install @google/genai@latest

# Update package.json to use new model
# Model: gemini-2.5-computer-use-preview-10-2025
```

### Phase 2: Create ComputerUseAgent ⏱️ 60 mins

**File:** `src/agents/computer-use.js`

**Key Features:**
- Initialize with `@google/genai` SDK
- Use model: `gemini-2.5-computer-use-preview-10-2025`
- Enable `computer_use` tool in API config
- Maintain conversation history for multi-turn interactions
- Handle actions: `click_at`, `type_text_at`, `scroll_document`, `navigate`, etc.

**Complete code template in:** `COMPUTER_USE_MIGRATION_PLAN.md` (Phase 2.1)

### Phase 3: Update Test Executor ⏱️ 45 mins

**File:** `src/agents/test-executor.js`

**Add new method:** `executeComputerUseAction(action)`

**Handles these Computer Use actions:**
- `click_at(x, y)` - Convert normalized coords (0-999) to pixels
- `type_text_at(x, y, text, press_enter)`
- `scroll_document(direction)`
- `navigate(url)`
- `key_combination(keys)`
- `go_back()` / `go_forward()`
- `hover_at(x, y)`

**Complete code in:** `COMPUTER_USE_MIGRATION_PLAN.md` (Phase 2.2)

### Phase 4: Update Orchestrator ⏱️ 60 mins

**File:** `src/orchestrator.js`

**Changes:**
1. Replace `VisionAnalystAgent` import with `ComputerUseAgent`
2. Update test loop to use Computer Use workflow
3. Remove `executeAction()` method (no longer needed)
4. Add action result reporting to Gemini

**Complete workflow in:** `COMPUTER_USE_MIGRATION_PLAN.md` (Phase 3)

### Phase 5: Testing ⏱️ 30 mins

**Steps:**
1. Create test script: `test/test-computer-use.js`
2. Test individual Computer Use actions
3. Run integration test: `npm run test:github`
4. Verify full OAuth flow works end-to-end

### Phase 6: Cleanup ⏱️ 15 mins

**Actions:**
1. Move `src/agents/vision-analyst.js` → `src/agents/legacy/`
2. Add deprecation notice
3. Update README.md with Computer Use API details
4. Update TESTING_NOTES.md with new results
5. Git commit all changes

**Total Estimated Time:** 3.5-4 hours

---

## Critical Files to Modify

| File | Action | Details |
|------|--------|---------|
| `package.json` | Update | Add `@google/genai` dependency |
| `src/agents/computer-use.js` | Create | New agent using Computer Use API |
| `src/agents/test-executor.js` | Modify | Add `executeComputerUseAction()` method |
| `src/orchestrator.js` | Modify | Replace Vision with Computer Use workflow |
| `src/agents/vision-analyst.js` | Deprecate | Move to legacy/ folder |
| `README.md` | Update | Document Computer Use API usage |
| `TESTING_NOTES.md` | Update | Add new test results |

---

## Reference Documents

1. **Migration Plan:** `COMPUTER_USE_MIGRATION_PLAN.md` (complete step-by-step guide with code)
2. **Original Design:** `OAUTH_AUTOMATION_DESIGN.md` (system architecture)
3. **Testing Notes:** `TESTING_NOTES.md` (current gap documented)
4. **Implementation Plan:** `docs/plans/2025-10-30-oauth-automation-system.md`

---

## Environment Setup

### Required Environment Variables
```bash
# .env file should contain:
GEMINI_API_KEY=your_gemini_api_key_here

# Test credentials (for OAuth testing):
GITHUB_TEST_USER=your_github_username
GITHUB_TEST_PASS=your_github_password
GOOGLE_TEST_EMAIL=your_google_email
GOOGLE_TEST_PASS=your_google_password

# Optional (for fix agent):
VERCEL_TOKEN=your_vercel_token
VERCEL_PROJECT_ID=veria-website
VERIA_PROJECT_PATH=/Users/danielconnolly/Projects/Veria
```

### Verify Setup
```bash
# Check API key is loaded
node -e "require('dotenv').config(); console.log(process.env.GEMINI_API_KEY ? '✅ API key loaded' : '❌ Missing');"

# Check model access (after installing @google/genai)
# Test script will be created in Phase 5
```

---

## Expected Outcomes

### After Implementation

**Before (Current):**
```
$ npm run test:github
✅ Browser opens
✅ Navigates to veria.cc
✅ Gemini Vision: "State: landing, Action: Click Sign In"
❌ Test Executor: Timeout - "Sign In" selector not found
❌ Test FAILS
```

**After (Computer Use API):**
```
$ npm run test:github
✅ Browser opens
✅ Navigates to veria.cc
✅ Gemini Computer Use: click_at(x=523, y=312)
✅ Test Executor: Click at (523, 312)
✅ Gemini sees result, continues OAuth flow autonomously
✅ Completes: landing → auth → callback → dashboard
✅ Test PASSES
```

### Success Criteria

- [ ] Computer Use API integrated
- [ ] OAuth flow completes without manual selectors
- [ ] Test passes through all 4 states (landing → auth → callback → dashboard)
- [ ] Error handling works (Gemini self-corrects)
- [ ] Documentation updated
- [ ] Legacy Vision Analyst deprecated

---

## Key Differences: Vision vs Computer Use

| Aspect | Vision Analysis (Current) | Computer Use API (Target) |
|--------|--------------------------|---------------------------|
| Model | `gemini-2.0-flash-exp` | `gemini-2.5-computer-use-preview-10-2025` |
| SDK | `@google/generative-ai` | `@google/genai` |
| Output | JSON suggestions | Executable actions |
| Actions | Human descriptions | Coordinate-based |
| Gap | Needs CSS selector translation | No translation needed |
| Autonomy | Single analysis | Multi-turn autonomous |
| Self-correction | No | Yes (sees results) |

---

## Git Status

```
Current branch: main
Latest commit: fca5929 - docs: Add Computer Use API migration plan

All changes committed and ready for migration.
Clean working directory.
```

---

## Implementation Strategy

### Recommended Approach

**Use Subagent-Driven Development:**

Tell Claude:
> "Use subagent-driven development to implement the Computer Use API migration. Create separate subagents for each phase (2-6) and review between phases."

**Phases:**
1. Phase 2 Subagent: Create ComputerUseAgent → Review
2. Phase 3 Subagent: Update Test Executor → Review
3. Phase 4 Subagent: Update Orchestrator → Review
4. Phase 5 Subagent: Testing → Review
5. Phase 6 Subagent: Cleanup and docs → Final review

This ensures quality gates at each step and proper error handling.

---

## Potential Issues & Solutions

### Issue 1: Model Access
**Problem:** `gemini-2.5-computer-use-preview-10-2025` is in Preview
**Solution:** Ensure API key has preview access. Check Google AI Studio for model availability.

### Issue 2: SDK Breaking Changes
**Problem:** `@google/genai` is experimental
**Solution:** Pin exact version in package.json: `"@google/genai": "^1.0.0"` (check latest)

### Issue 3: Coordinate Translation
**Problem:** Computer Use uses normalized coords (0-999), Playwright uses pixels
**Solution:** Code provided in migration plan handles conversion

### Issue 4: Action Failures
**Problem:** Computer Use action fails to execute
**Solution:** Report failure back to Gemini, it will self-correct and try alternative approach

---

## Notes from Previous Session

**What worked well:**
- Subagent-driven development with code reviews
- Systematic task-by-task implementation
- Comprehensive testing and documentation

**What to improve:**
- Should have used Computer Use API from the start
- Need to verify API capabilities before architecture decisions
- Always check latest Gemini models and features

**Lessons learned:**
- Gemini has TWO APIs for vision tasks:
  1. Vision Analysis (what we used) - for analyzing images
  2. Computer Use (what we need) - for controlling browsers
- Always read the official docs for the specific use case

---

## Resources

### Official Documentation
- [Gemini Computer Use API](https://ai.google.dev/gemini-api/docs/computer-use)
- [Google Gen AI SDK](https://www.npmjs.com/package/@google/genai)
- [Gemini Computer Use Blog](https://blog.google/technology/google-deepmind/gemini-computer-use-model/)

### Community Examples
- [pmbstyle/gemini-computer-use](https://github.com/pmbstyle/gemini-computer-use) - Python example
- [browserbase/gemini-browser](https://github.com/browserbase/gemini-browser) - Browserbase integration

### Migration Guide
- `COMPUTER_USE_MIGRATION_PLAN.md` - Complete implementation guide (411 lines)

---

## Quick Command Reference

```bash
# Start implementation
npm install @google/genai@latest

# Test Computer Use Agent (after Phase 2)
node test/test-computer-use.js

# Run full integration test (after Phase 4)
npm run test:github

# Check logs
cat tmp/oauth-test-*/execution.log

# View screenshots
open tmp/oauth-test-*/screenshot-*.png
```

---

## Checklist for Next Session

Before starting:
- [ ] Read `COMPUTER_USE_MIGRATION_PLAN.md` fully
- [ ] Verify `GEMINI_API_KEY` is set in `.env`
- [ ] Check model access (preview may require waitlist)
- [ ] Confirm `@google/genai` is available on npm

During implementation:
- [ ] Follow phases 2-6 systematically
- [ ] Run code review after each phase
- [ ] Test incrementally (don't wait until end)
- [ ] Commit after each successful phase

After completion:
- [ ] Run full OAuth integration test
- [ ] Update all documentation
- [ ] Create new TESTING_NOTES.md with results
- [ ] Tag release: `v2.0.0-computer-use`

---

## Success Metrics

**Implementation complete when:**
1. Computer Use API integrated and working
2. OAuth flow passes all 4 states autonomously
3. No manual CSS selectors needed
4. Gemini self-corrects on errors
5. All tests passing
6. Documentation updated
7. Clean git history with meaningful commits

**Expected outcome:**
A truly autonomous OAuth testing system that can handle any OAuth flow without predefined selectors or manual intervention.

---

**Status:** Ready for Computer Use API implementation
**Priority:** High - this fixes the core functionality gap
**Estimated Effort:** 3.5-4 hours
**Next Command:** Tell Claude to implement Computer Use API migration using subagent-driven development
