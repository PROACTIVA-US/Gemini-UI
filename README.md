# Gemini OAuth Automation System

Autonomous multi-agent system for testing OAuth flows using Gemini Computer Use API.

## Setup

1. Copy `.env.example` to `.env` and fill in credentials
2. Run `npm install`
3. Test: `npm run test:github`

## Usage

```bash
# Test all OAuth providers
npm run test:all

# Test specific provider
node src/orchestrator.js --provider github

# Debug mode
node src/orchestrator.js --provider github --debug
```

## Architecture

See `OAUTH_AUTOMATION_DESIGN.md` for full design documentation.
