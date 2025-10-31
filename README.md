# Gemini OAuth Automation System

Autonomous multi-agent system for testing OAuth flows using Gemini Computer Use API.

## Architecture

- **Orchestrator**: Coordinates all agents through state machine
- **Test Executor**: Controls Playwright browser automation
- **Computer Use Agent**: Direct browser control via Gemini Computer Use API
- **Diagnostic Agent**: Root cause analysis of OAuth errors
- **Fix Agent**: Proposes and applies fixes automatically

See `OAUTH_AUTOMATION_DESIGN.md` for complete design.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Test setup:**
   ```bash
   npm run test:github
   ```

## Usage

### Test All Providers
```bash
npm run test:all
```

### Test Specific Provider
```bash
npm run test:github  # GitHub OAuth
npm run test:google  # Google OAuth
```

### Debug Mode
```bash
node src/orchestrator.js --provider github --debug
```

### Auto-Fix Mode (USE WITH CAUTION)
```bash
node src/orchestrator.js --provider github --auto-fix
```

## Output

Each test run creates a timestamped directory in `tmp/`:
```
tmp/oauth-test-2025-10-30-140523/
├── screenshot-001.png
├── screenshot-002.png
├── screenshot-003.png
├── results.json
└── execution.log
```

## Troubleshooting

### "GEMINI_API_KEY not found"
- Ensure `.env` file exists and contains `GEMINI_API_KEY=your_key`

### Browser doesn't open
- Check Playwright installation: `npx playwright install chromium`

### OAuth test fails immediately
- Verify test credentials in `.env`
- Check Veria website is accessible at https://veria.cc

## Development

### Project Structure
```
src/
├── agents/           # Specialized agents
├── utils/            # Utilities (state machine, logger)
├── scenarios/        # Test configurations
└── orchestrator.js   # Main coordinator
```

### Adding New Provider

1. Add to `src/scenarios/veria-oauth-flows.json`
2. Define flow states
3. Add test credentials to `.env`
4. Run: `node src/orchestrator.js --provider newprovider`

## License

ISC
