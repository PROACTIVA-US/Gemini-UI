# Next Session: OAuth Automation Implementation

## Session Goal
Implement the OAuth automation system using **Subagent-Driven Development** approach.

## Quick Start Command

```bash
cd /Users/danielconnolly/Projects/Gemini/gemini-ui-testing
```

Then tell Claude:
> "I want to implement the OAuth automation plan using subagent-driven development. The plan is in `docs/plans/2025-10-30-oauth-automation-system.md`. Use the superpowers:subagent-driven-development skill."

## What's Ready

✅ **Design Complete**: `OAUTH_AUTOMATION_DESIGN.md`
✅ **Implementation Plan**: `docs/plans/2025-10-30-oauth-automation-system.md`
✅ **Git Initialized**: Repository ready with 2 commits
✅ **9 Tasks Defined**: Each task is 2-5 minutes of focused work

## Architecture Summary

**Multi-Agent System:**
- Orchestrator coordinates 4 specialized agents
- Test Executor: Browser control (Playwright)
- Vision Analyst: Screenshot analysis (Gemini)
- Diagnostic Agent: Root cause analysis
- Fix Agent: Automated fixes with approval

**Flow:**
Landing → Auth → Callback → Dashboard (with error detection/fixing at each state)

## Task Breakdown (9 tasks, ~4-6 hours)

1. ✅ Project setup and dependencies (~30 min)
2. ✅ Directory structure and utilities (~20 min)
3. ✅ Test Executor Agent (~45 min)
4. ✅ Vision Analyst Agent (~45 min)
5. ✅ Diagnostic Agent (~30 min)
6. ✅ Fix Agent (~30 min)
7. ✅ Orchestrator (~60 min)
8. ✅ Integration testing (~30 min)
9. ✅ Final documentation (~15 min)

## Required Skills

The next session MUST use these skills in order:
1. **superpowers:using-superpowers** - Establishes mandatory workflows
2. **superpowers:subagent-driven-development** - Dispatches fresh subagent per task with code review

## Environment Setup Needed

Before starting implementation, you'll need:

1. **Copy `.env.example` to `.env`** and fill in:
   - `GEMINI_API_KEY` (already have)
   - `GITHUB_TEST_USER` / `GITHUB_TEST_PASS`
   - `GOOGLE_TEST_EMAIL` / `GOOGLE_TEST_PASS`
   - `VERCEL_TOKEN`
   - `VERIA_PROJECT_PATH=/Users/danielconnolly/Projects/Veria`

2. **Verify Gemini API key works**:
   ```bash
   node -e "console.log(require('dotenv').config()); console.log(process.env.GEMINI_API_KEY ? '✅ API key loaded' : '❌ Missing');"
   ```

## Success Criteria

After implementation:
- Can run: `npm run test:github`
- Browser opens automatically
- Navigates through OAuth flow
- Captures screenshots at each step
- Detects and diagnoses errors
- Proposes fixes (with approval)
- Generates test report in `tmp/`

## Current State

```
/Users/danielconnolly/Projects/Gemini/gemini-ui-testing/
├── .env.example          ✅ Created
├── .gitignore            ✅ Created (will create in Task 1)
├── OAUTH_AUTOMATION_DESIGN.md  ✅ Complete
├── README.md             ⏳ Basic version exists
├── computer-use.js       ✅ Legacy reference
├── package.json          ✅ Needs update in Task 1
├── docs/
│   └── plans/
│       └── 2025-10-30-oauth-automation-system.md  ✅ Complete
└── src/                  ⏳ To be created in Task 2-7
    ├── agents/
    ├── utils/
    ├── scenarios/
    └── orchestrator.js
```

## Git Status

```
Current branch: main
2 commits:
  - b9a9771: docs: Add OAuth automation system design document
  - 38b6796: docs: Add complete OAuth automation implementation plan
```

## Notes from Planning Session

- User has existing Gemini API key ✅
- Want standalone project (not in Veria repo) ✅
- Need full autonomous debugging (detect → diagnose → fix) ✅
- Success = OAuth flows pass + reusable tool ✅
- Manual OAuth debugging has been tedious/redundant (automation needed!) ✅

## Important: Use Subagent-Driven Development

When implementing:
1. Read the plan: `docs/plans/2025-10-30-oauth-automation-system.md`
2. Invoke skill: `superpowers:subagent-driven-development`
3. For EACH task (1-9):
   - Dispatch fresh subagent to implement task
   - Subagent follows TDD approach from plan
   - Code review between tasks
   - Fix issues before moving to next task

This ensures quality gates at every step!

---

**Next Command:** Tell Claude to use subagent-driven development with the plan file.
