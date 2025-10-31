/**
 * Test script to verify diagnostic.js fixes
 * Tests validation, error handling, and extended functionality
 */

const DiagnosticAgent = require('./src/agents/diagnostic');
const VercelAPI = require('./src/utils/vercel-api');

// Mock logger
const logger = {
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  debug: (msg, ...args) => console.log('[DEBUG]', msg, ...args),
  success: (msg, ...args) => console.log('[SUCCESS]', msg, ...args),
  error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
};

async function runTests() {
  console.log('\n=== Testing Diagnostic Agent Fixes ===\n');

  // Test 1: Input validation for diagnoseRootCause
  console.log('Test 1: Input validation for diagnoseRootCause');
  try {
    const agent = new DiagnosticAgent(logger, 'fake-key', 'fake-token', 'fake-project');

    // Test missing errorContext
    try {
      await agent.diagnoseRootCause(null);
      console.log('  ❌ FAIL: Should throw error for null errorContext');
    } catch (error) {
      if (error.message.includes('errorContext must be a valid object')) {
        console.log('  ✓ PASS: Correctly validates null errorContext');
      } else {
        console.log('  ❌ FAIL: Wrong error message:', error.message);
      }
    }

    // Test missing required fields
    try {
      await agent.diagnoseRootCause({});
      console.log('  ❌ FAIL: Should throw error for missing errorAnalysis');
    } catch (error) {
      if (error.message.includes('errorAnalysis is required')) {
        console.log('  ✓ PASS: Correctly validates missing errorAnalysis');
      } else {
        console.log('  ❌ FAIL: Wrong error message:', error.message);
      }
    }

    // Test missing pageUrl
    try {
      await agent.diagnoseRootCause({ errorAnalysis: {} });
      console.log('  ❌ FAIL: Should throw error for missing pageUrl');
    } catch (error) {
      if (error.message.includes('pageUrl must be a valid string')) {
        console.log('  ✓ PASS: Correctly validates missing pageUrl');
      } else {
        console.log('  ❌ FAIL: Wrong error message:', error.message);
      }
    }

    console.log('  ✓ Test 1 Complete\n');
  } catch (error) {
    console.log('  ❌ Test 1 Failed:', error.message, '\n');
  }

  // Test 2: Google provider support in checkOAuthConfig
  console.log('Test 2: Google provider support in checkOAuthConfig');
  try {
    const agent = new DiagnosticAgent(logger, 'fake-key', 'fake-token', 'fake-project');

    // Test GitHub provider (existing)
    const githubConfig = await agent.checkOAuthConfig('github');
    const hasGithubChecks = githubConfig.checks.some(c => c.name === 'GITHUB_CLIENT_ID');
    if (hasGithubChecks) {
      console.log('  ✓ PASS: GitHub provider checks present');
    } else {
      console.log('  ❌ FAIL: GitHub provider checks missing');
    }

    // Test Google provider (new)
    const googleConfig = await agent.checkOAuthConfig('google');
    const hasGoogleChecks = googleConfig.checks.some(c => c.name === 'GOOGLE_CLIENT_ID');
    if (hasGoogleChecks) {
      console.log('  ✓ PASS: Google provider checks present');
    } else {
      console.log('  ❌ FAIL: Google provider checks missing');
    }

    // Test common NextAuth checks
    const hasNextAuthUrl = googleConfig.checks.some(c => c.name === 'NEXTAUTH_URL');
    const hasNextAuthSecret = googleConfig.checks.some(c => c.name === 'NEXTAUTH_SECRET');
    if (hasNextAuthUrl && hasNextAuthSecret) {
      console.log('  ✓ PASS: Common NextAuth checks present');
    } else {
      console.log('  ❌ FAIL: Common NextAuth checks missing');
    }

    // Test unsupported provider
    try {
      await agent.checkOAuthConfig('facebook');
      console.log('  ❌ FAIL: Should throw error for unsupported provider');
    } catch (error) {
      if (error.message.includes('Unsupported provider')) {
        console.log('  ✓ PASS: Correctly rejects unsupported provider');
      } else {
        console.log('  ❌ FAIL: Wrong error message:', error.message);
      }
    }

    console.log('  ✓ Test 2 Complete\n');
  } catch (error) {
    console.log('  ❌ Test 2 Failed:', error.message, '\n');
  }

  // Test 3: VercelAPI mock data warnings
  console.log('Test 3: VercelAPI mock data warnings');
  try {
    const vercelApi = new VercelAPI('fake-token', 'fake-project');

    // Capture console.warn
    const originalWarn = console.warn;
    let warnCalls = [];
    console.warn = (...args) => warnCalls.push(args.join(' '));

    // Test fetchLogs
    const logs = await vercelApi.fetchLogs('dpl_123');
    if (logs._isMockData && warnCalls.some(w => w.includes('fetchLogs'))) {
      console.warn = originalWarn;
      console.log('  ✓ PASS: fetchLogs warns about mock data');
    } else {
      console.warn = originalWarn;
      console.log('  ❌ FAIL: fetchLogs missing mock data warning');
    }

    // Reset warn capture
    warnCalls = [];
    console.warn = (...args) => warnCalls.push(args.join(' '));

    // Test getLatestDeployment
    const deployment = await vercelApi.getLatestDeployment();
    if (deployment._isMockData && warnCalls.some(w => w.includes('getLatestDeployment'))) {
      console.warn = originalWarn;
      console.log('  ✓ PASS: getLatestDeployment warns about mock data');
    } else {
      console.warn = originalWarn;
      console.log('  ❌ FAIL: getLatestDeployment missing mock data warning');
    }

    console.log('  ✓ Test 3 Complete\n');
  } catch (error) {
    console.log('  ❌ Test 3 Failed:', error.message, '\n');
  }

  // Test 4: JSDoc documentation presence
  console.log('Test 4: JSDoc documentation presence');
  try {
    const fs = require('fs');
    const diagnosticContent = fs.readFileSync('./src/agents/diagnostic.js', 'utf8');
    const vercelApiContent = fs.readFileSync('./src/utils/vercel-api.js', 'utf8');

    // Check for JSDoc comments
    const hasClassDoc = diagnosticContent.includes('* Diagnostic Agent for');
    const hasConstructorDoc = diagnosticContent.includes('@param {Object} logger');
    const hasDiagnoseDoc = diagnosticContent.includes('* Diagnose the root cause');
    const hasCheckConfigDoc = diagnosticContent.includes('* Check OAuth configuration');

    const hasVercelClassDoc = vercelApiContent.includes('* VercelAPI client');
    const hasFetchLogsDoc = vercelApiContent.includes('* Fetch logs for a specific');
    const hasGetDeploymentDoc = vercelApiContent.includes('* Get the latest deployment');

    if (hasClassDoc && hasConstructorDoc && hasDiagnoseDoc && hasCheckConfigDoc) {
      console.log('  ✓ PASS: DiagnosticAgent has JSDoc documentation');
    } else {
      console.log('  ❌ FAIL: DiagnosticAgent missing JSDoc documentation');
    }

    if (hasVercelClassDoc && hasFetchLogsDoc && hasGetDeploymentDoc) {
      console.log('  ✓ PASS: VercelAPI has JSDoc documentation');
    } else {
      console.log('  ❌ FAIL: VercelAPI missing JSDoc documentation');
    }

    console.log('  ✓ Test 4 Complete\n');
  } catch (error) {
    console.log('  ❌ Test 4 Failed:', error.message, '\n');
  }

  console.log('=== All Tests Complete ===\n');
}

runTests().catch(console.error);
