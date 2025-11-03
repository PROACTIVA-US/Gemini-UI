# CDP and Full Trace Recording

The gemini-ui-testing tool now supports **Chrome DevTools Protocol (CDP)** and **full trace recording** for comprehensive debugging and performance analysis.

## Overview

- **CDP Port**: 9222 (standard Chrome remote debugging port)
- **Trace Format**: Playwright trace ZIP file (viewable with Playwright's trace viewer)
- **Auto-enabled**: Both features are enabled by default on every test run

## Features Enabled

### 1. Chrome DevTools Protocol (CDP)

CDP enables external tools to connect to the running Chrome instance for:
- Live debugging while tests run
- Performance profiling
- Network inspection
- Console monitoring
- DOM manipulation and inspection

**CDP Endpoint**: `http://127.0.0.1:9222`

### 2. Full Trace Recording

Playwright tracing captures comprehensive test execution data:
- ✅ **Screenshots** - Visual snapshots at each action
- ✅ **DOM Snapshots** - Complete page state at each step
- ✅ **Network Activity** - All HTTP requests and responses
- ✅ **Console Logs** - Browser console output
- ✅ **Source Code** - JavaScript sources for debugging
- ✅ **Action Timeline** - Chronological test step execution

## Usage

### Basic Usage (Automatic)

Tracing is enabled automatically on every test run:

```bash
npm run test:github
```

Output:
```
✅ Trace saved to: /path/to/tmp/oauth-test-2025-11-02T20-35-03/trace.zip
ℹ️  View trace: npx playwright show-trace /path/to/trace.zip
```

### Viewing Traces

#### Option 1: Playwright Trace Viewer (Recommended)

```bash
# View the most recent trace
npx playwright show-trace tmp/oauth-test-*/trace.zip

# View specific trace
npx playwright show-trace tmp/oauth-test-2025-11-02T20-35-03/trace.zip
```

The trace viewer provides:
- Interactive timeline of all actions
- Screenshots and DOM snapshots
- Network waterfall
- Console logs
- Source code with execution highlights

#### Option 2: Online Trace Viewer

Upload trace.zip to: https://trace.playwright.dev/

### Advanced Usage

#### Custom Trace Configuration

Disable tracing (not recommended):
```javascript
const testExecutor = new TestExecutorAgent(logger, outputDir);
await testExecutor.initialize({
  enableTrace: false  // Disable tracing
});
```

#### Mid-Test Trace Control

```javascript
// Start tracing mid-test
await testExecutor.startTrace();

// Stop and save trace to custom location
const tracePath = await testExecutor.stopTrace('/custom/path/trace.zip');

// Export trace to another location
await testExecutor.exportTrace('/backup/trace.zip');
```

#### Custom CDP Port

```javascript
await testExecutor.initialize({
  cdpPort: 9223  // Use custom port instead of 9222
});

// Get CDP endpoint URL
const endpoint = testExecutor.getCDPEndpoint();
console.log(`CDP available at: ${endpoint}`);
```

## Connecting External Tools via CDP

### Chrome DevTools

While test is running:
1. Open Chrome browser
2. Navigate to: `chrome://inspect`
3. Click "Configure..."
4. Add: `127.0.0.1:9222`
5. Click "inspect" under the test browser

### Puppeteer Connection

```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222'
});

// Now you have full Puppeteer API access to the running test
const pages = await browser.pages();
```

### Chrome DevTools MCP Server

Install the MCP server:
```bash
npm install -g chrome-devtools-mcp
```

Connect to running test:
```bash
chrome-devtools-mcp --browser-url=http://127.0.0.1:9222
```

Available tools:
- `performance_start_trace` - Start performance profiling
- `performance_stop_trace` - Stop and retrieve trace
- `performance_analyze_insight` - Extract actionable insights
- `list_network_requests` - Inspect network activity
- `get_console_message` - Read console logs
- `take_screenshot` - Capture screenshots
- `evaluate_script` - Execute JavaScript

## Trace Contents

### What's Captured

Every trace.zip file contains:

```
trace.zip
├── trace.network         # Network HAR data
├── trace.stacks          # JavaScript call stacks
├── trace-resources/      # Screenshots, snapshots, etc.
├── trace-actions.json    # Action timeline
└── index.html            # Trace viewer UI
```

### File Size

Typical trace sizes:
- **Simple test (3-5 actions)**: 1-2 MB
- **Complex test (20+ actions)**: 5-10 MB
- **Full OAuth flow**: 1.5-3 MB

Traces are automatically cleaned up based on the `tmp/` directory retention policy.

## Use Cases

### 1. Debugging Flaky Tests

View the exact state when a test fails:
```bash
npx playwright show-trace tmp/oauth-test-FAILED-*/trace.zip
```

Inspect:
- Network requests that timed out
- Console errors
- DOM state at failure point

### 2. Performance Analysis

Use CDP to capture performance profiles:
```javascript
// Connect via Puppeteer
const client = await page.context().newCDPSession(page);
await client.send('Performance.enable');
const metrics = await client.send('Performance.getMetrics');
```

### 3. Visual Regression Testing

Export screenshots from trace:
```bash
# Trace viewer provides screenshot export
npx playwright show-trace trace.zip
# Click on any action -> "Copy screenshot"
```

### 4. OAuth Flow Documentation

Trace files serve as documentation:
- Share trace.zip with team members
- Upload to trace.playwright.dev for review
- Attach to bug reports

### 5. CI/CD Integration

Store traces as artifacts:
```yaml
# .github/workflows/test.yml
- name: Run OAuth tests
  run: npm run test:github

- name: Upload trace artifacts
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-traces
    path: tmp/oauth-test-*/trace.zip
```

## Configuration Options

### Environment Variables

Control trace behavior via environment:
```bash
# Disable tracing for faster tests (not recommended)
ENABLE_TRACE=false npm run test:github

# Use custom CDP port
CDP_PORT=9223 npm run test:github
```

### Code Configuration

```javascript
const options = {
  enableTrace: true,           // Enable/disable tracing
  cdpPort: 9222,              // CDP remote debugging port
  userDataDir: './sessions',  // Browser session storage
  storageState: null          // Previous session state
};

await testExecutor.initialize(options);
```

## Troubleshooting

### Issue: "Port 9222 already in use"

Another Chrome instance is using the CDP port:
```bash
# Find process using port 9222
lsof -i :9222

# Kill the process or use different port
await testExecutor.initialize({ cdpPort: 9223 });
```

### Issue: "Cannot read trace.zip"

Trace wasn't saved (test crashed):
```bash
# Check if trace exists
ls -lh tmp/oauth-test-*/trace.zip

# If missing, tracing was interrupted - check logs
cat tmp/oauth-test-*/execution.log
```

### Issue: "Trace viewer shows empty timeline"

Trace started but no actions recorded:
- Check test actually executed actions
- Verify `context.tracing.start()` was called
- Ensure `cleanup()` was called to finalize trace

## Performance Impact

### Tracing Overhead

- **Minimal**: ~5-10% slower test execution
- **File I/O**: Trace writing happens async, doesn't block test
- **Memory**: ~50-100 MB additional memory usage

### When to Disable

Disable tracing only for:
- ⚡ High-volume CI/CD pipelines (thousands of tests)
- 🔥 Performance benchmarking (measuring exact timings)
- 💾 Storage-constrained environments

For debugging and development: **Always keep tracing enabled.**

## Best Practices

1. **Always review traces for failed tests** - Don't guess what went wrong
2. **Archive important traces** - Move trace.zip out of tmp/ directory
3. **Share traces instead of screenshots** - Full context vs. single image
4. **Use CDP for live debugging** - Connect DevTools while test runs
5. **Clean old traces regularly** - Traces accumulate in tmp/

## API Reference

### TestExecutorAgent Methods

```javascript
// Get CDP endpoint URL
getCDPEndpoint() → string

// Start trace recording
startTrace() → Promise<void>

// Stop trace and save
stopTrace(customPath?: string) → Promise<string|null>

// Export trace to another location
exportTrace(outputPath: string) → Promise<void>

// Cleanup (automatically stops trace)
cleanup(options?: object) → Promise<void>
```

### Initialization Options

```typescript
interface InitOptions {
  enableTrace?: boolean;      // Default: true
  cdpPort?: number;          // Default: 9222
  userDataDir?: string;      // Default: tmp/browser-sessions
  storageState?: object;     // Browser session state
}
```

## Resources

- [Playwright Trace Viewer Documentation](https://playwright.dev/docs/trace-viewer)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Chrome DevTools MCP Server](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Playwright Tracing Guide](https://playwright.dev/docs/trace-viewer-intro)

## Summary

The gemini-ui-testing tool now provides:
- ✅ **CDP on port 9222** - Connect external DevTools
- ✅ **Full trace recording** - Comprehensive test execution logs
- ✅ **Auto-enabled by default** - No configuration needed
- ✅ **Playwright trace viewer** - Rich visual debugging
- ✅ **1.6MB trace files** - Compact and shareable

Every test run generates a complete trace that can be:
- Viewed with Playwright's trace viewer
- Shared with team members
- Uploaded to CI/CD artifacts
- Connected to via CDP for live debugging
