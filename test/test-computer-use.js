const ComputerUseAgent = require('../src/agents/computer-use');
const TestExecutorAgent = require('../src/agents/test-executor');
const Logger = require('../src/utils/logger');
require('dotenv').config();

/**
 * Test Computer Use Agent integration
 * Verifies that Computer Use actions can be generated and executed
 */
async function test() {
  const logger = new Logger(true);
  const executor = new TestExecutorAgent(logger, './tmp');
  const computerUse = new ComputerUseAgent(logger, process.env.GEMINI_API_KEY);

  try {
    logger.info('Starting Computer Use Agent test...');

    // Initialize browser
    await executor.initialize();
    await executor.navigate('https://veria.cc');

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Capture state
    const state = await executor.captureState();
    logger.success('Screenshot captured');

    // Get Computer Use action
    logger.info('Requesting action from Computer Use API...');
    const action = await computerUse.getNextAction(
      state.screenshot,
      'Click the Sign In button',
      { url: 'https://veria.cc' }
    );

    if (!action) {
      logger.error('No action received from Computer Use API');
      await executor.cleanup();
      process.exit(1);
    }

    logger.success('Computer Use Action received:');
    console.log(JSON.stringify(action, null, 2));

    // Execute the action
    logger.info('Executing action...');
    const result = await executor.executeComputerUseAction(action);
    logger.success('Execution Result:');
    console.log(JSON.stringify(result, null, 2));

    // Report result back
    await computerUse.reportActionResult(result);

    // Cleanup
    await executor.cleanup();

    if (result.success) {
      logger.success('✅ Computer Use test PASSED');
      process.exit(0);
    } else {
      logger.error('❌ Computer Use test FAILED');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Test failed:', error.message);
    console.error(error);
    await executor.cleanup();
    process.exit(1);
  }
}

// Run test
test();
