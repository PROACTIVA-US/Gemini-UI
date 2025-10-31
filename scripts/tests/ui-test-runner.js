#!/usr/bin/env node

const GeminiComputerUse = require('./computer-use');
const fs = require('fs').promises;

async function runTestSuite(testFile) {
    const tests = JSON.parse(await fs.readFile(testFile, 'utf8'));
    const tester = new GeminiComputerUse();
    
    await tester.initialize();
    
    for (const test of tests.tests) {
        console.log(`\n🧪 Running test: ${test.name}`);
        await tester.runTask(test.task, test.url);
        await tester.page.waitForTimeout(2000); // Wait between tests
    }
    
    await tester.cleanup();
}

// Example test suite format
const exampleTests = {
    "name": "Example Test Suite",
    "tests": [
        {
            "name": "Homepage Load Test",
            "task": "Verify the homepage loads correctly and all navigation links are visible",
            "url": "https://example.com"
        },
        {
            "name": "Form Submission Test",
            "task": "Fill out and submit the contact form with test data",
            "url": "https://example.com/contact"
        }
    ]
};

// Save example test suite
fs.writeFile('example-tests.json', JSON.stringify(exampleTests, null, 2))
    .then(() => console.log('Created example-tests.json'))
    .catch(console.error);

// Run if called directly
if (require.main === module) {
    const testFile = process.argv[2];
    if (!testFile) {
        console.log('Usage: ./ui-test-runner.js <test-file.json>');
        console.log('Example: ./ui-test-runner.js example-tests.json');
    } else {
        runTestSuite(testFile).catch(console.error);
    }
}
