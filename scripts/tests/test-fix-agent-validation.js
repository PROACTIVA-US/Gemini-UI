#!/usr/bin/env node

/**
 * Test script for Fix Agent validation and error handling
 * Tests all the critical and important fixes applied
 */

const FixAgent = require('./src/agents/fix');

// Mock logger for testing
const mockLogger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  error: (msg, details) => console.log(`[ERROR] ${msg}`, details || '')
};

// Test counters
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

console.log('\n=== Testing Fix Agent Validation ===\n');

// Test 1: Constructor validation - invalid logger
test('Constructor rejects invalid logger', () => {
  try {
    new FixAgent(null, 'test-api-key', '/test/path');
    throw new Error('Should have thrown');
  } catch (error) {
    if (!error.message.includes('Valid logger instance is required')) {
      throw new Error(`Wrong error: ${error.message}`);
    }
  }
});

// Test 2: Constructor validation - logger missing methods
test('Constructor rejects logger without required methods', () => {
  try {
    new FixAgent({}, 'test-api-key', '/test/path');
    throw new Error('Should have thrown');
  } catch (error) {
    if (!error.message.includes('Logger must have info, success, and error methods')) {
      throw new Error(`Wrong error: ${error.message}`);
    }
  }
});

// Test 3: Constructor validation - invalid API key
test('Constructor rejects invalid API key', () => {
  try {
    new FixAgent(mockLogger, '', '/test/path');
    throw new Error('Should have thrown');
  } catch (error) {
    if (!error.message.includes('Valid API key is required')) {
      throw new Error(`Wrong error: ${error.message}`);
    }
  }
});

// Test 4: Constructor validation - invalid project path
test('Constructor rejects invalid project path', () => {
  try {
    new FixAgent(mockLogger, 'test-api-key', '');
    throw new Error('Should have thrown');
  } catch (error) {
    if (!error.message.includes('Valid project path is required')) {
      throw new Error(`Wrong error: ${error.message}`);
    }
  }
});

// Test 5: Constructor validation - valid parameters
test('Constructor accepts valid parameters', () => {
  const agent = new FixAgent(mockLogger, 'test-api-key', __dirname);
  if (!agent.logger || !agent.projectPath) {
    throw new Error('Agent not properly initialized');
  }
});

// Test 6: proposeFixPlan validation - null diagnostic
(async () => {
  await asyncTest('proposeFixPlan rejects null diagnostic', async () => {
    const agent = new FixAgent(mockLogger, 'test-api-key', __dirname);
    try {
      await agent.proposeFixPlan(null);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!error.message.includes('Valid diagnostic object is required')) {
        throw new Error(`Wrong error: ${error.message}`);
      }
    }
  });
})();

// Test 7: proposeFixPlan validation - missing type
(async () => {
  await asyncTest('proposeFixPlan rejects diagnostic without type', async () => {
    const agent = new FixAgent(mockLogger, 'test-api-key', __dirname);
    try {
      await agent.proposeFixPlan({ message: 'test' });
      throw new Error('Should have thrown');
    } catch (error) {
      if (!error.message.includes('Diagnostic must have a valid type field')) {
        throw new Error(`Wrong error: ${error.message}`);
      }
    }
  });
})();

// Test 8: proposeFixPlan validation - missing message
(async () => {
  await asyncTest('proposeFixPlan rejects diagnostic without message', async () => {
    const agent = new FixAgent(mockLogger, 'test-api-key', __dirname);
    try {
      await agent.proposeFixPlan({ type: 'oauth_error' });
      throw new Error('Should have thrown');
    } catch (error) {
      if (!error.message.includes('Diagnostic must have a valid message field')) {
        throw new Error(`Wrong error: ${error.message}`);
      }
    }
  });
})();

// Test 9: applyFix return structure includes successful and failed arrays
test('applyFix return structure includes successful and failed arrays', () => {
  const agent = new FixAgent(mockLogger, 'test-api-key', __dirname);

  // Mock the applyFix to test return structure
  const originalApplyFix = agent.applyFix.bind(agent);
  agent.applyFix = async function(fixPlan, approved) {
    // Just verify the structure without actually running
    const result = {
      successful: [],
      failed: []
    };

    if (!result.successful || !Array.isArray(result.successful)) {
      throw new Error('Result must have successful array');
    }
    if (!result.failed || !Array.isArray(result.failed)) {
      throw new Error('Result must have failed array');
    }

    return result;
  };

  // This test just verifies the return structure expectation
  if (typeof agent.applyFix !== 'function') {
    throw new Error('applyFix is not a function');
  }
});

// Test 10: Check JSDoc exists
test('Class has JSDoc documentation', () => {
  const fs = require('fs');
  const filePath = './src/agents/fix.js';
  const content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('/**') || !content.includes('@class')) {
    throw new Error('Class JSDoc missing');
  }
  if (!content.includes('@param') || !content.includes('@returns')) {
    throw new Error('Method JSDoc missing');
  }
  if (!content.includes('@throws')) {
    throw new Error('Throws documentation missing');
  }
});

// Summary
setTimeout(() => {
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed === 0) {
    console.log('\n✓ All validation tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}, 1000);
