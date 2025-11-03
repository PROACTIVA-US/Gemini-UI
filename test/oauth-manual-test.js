/**
 * Manual E2E OAuth Test for Veria
 * Tests GitHub and Google OAuth flows
 *
 * Run: node tests/e2e/oauth-manual-test.js
 */

const { chromium } = require('playwright');

const TEST_URL = process.env.TEST_URL || 'https://veria.cc';
const GITHUB_USER = process.env.TEST_GITHUB_USER || 'veria-test-user';
const GITHUB_PASS = process.env.TEST_GITHUB_PASS || 'G3tup1N1t!';
const GOOGLE_EMAIL = process.env.TEST_GOOGLE_EMAIL || 'test@veria.cc';
const GOOGLE_PASS = process.env.TEST_GOOGLE_PASS || 'G3tup1N1t!';

async function testGitHubOAuth() {
  console.log('\n🧪 Testing GitHub OAuth Flow...\n');

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console messages and errors
  const consoleMessages = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('  Browser Console:', text);
    }
  });

  page.on('pageerror', error => {
    const text = `[EXCEPTION] ${error.message}`;
    consoleMessages.push(text);
    console.log('  Browser Error:', text);
  });

  try {
    // Step 1: Navigate to Veria
    console.log('1. Navigating to', TEST_URL);
    await page.goto(TEST_URL);
    await page.screenshot({ path: 'tmp/01-landing.png' });

    // Step 2: Click Sign In
    console.log('2. Clicking "Sign In" button...');
    await page.click('text=Sign In');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tmp/02-signin-modal.png' });

    // Step 3: Click GitHub OAuth button
    console.log('3. Clicking "Sign in with GitHub" button...');
    const githubButton = page.locator('button:has-text("GitHub"), a:has-text("GitHub")').first();
    await githubButton.click();
    await page.waitForTimeout(3000);

    // Step 4: Fill GitHub credentials (if on GitHub login page)
    const currentUrl = page.url();
    console.log('4. Current URL:', currentUrl);

    if (currentUrl.includes('github.com')) {
      console.log('   On GitHub login page, entering credentials...');
      await page.screenshot({ path: 'tmp/03-github-login.png' });

      await page.fill('input[name="login"]', GITHUB_USER);
      await page.fill('input[name="password"]', GITHUB_PASS);
      await page.screenshot({ path: 'tmp/04-github-credentials.png' });

      await page.click('input[type="submit"]');
      await page.waitForTimeout(3000);

      // Handle 2FA or authorization if needed
      const url2 = page.url();
      console.log('   After login URL:', url2);
      await page.screenshot({ path: 'tmp/05-github-after-login.png' });

      // If on authorization page, authorize
      if (url2.includes('authorize') || page.locator('button:has-text("Authorize")').count() > 0) {
        console.log('   Authorizing application...');
        await page.click('button:has-text("Authorize")');
        await page.waitForTimeout(3000);
      }
    }

    // Step 5: Wait for redirect back to Veria
    console.log('5. Waiting for redirect to Veria...');
    await page.waitForURL(url => url.includes('veria.cc'), { timeout: 10000 });
    const finalUrl = page.url();
    console.log('   Final URL:', finalUrl);
    await page.screenshot({ path: 'tmp/06-final-page.png' });

    // Step 6: Verify logged in
    const isLoggedIn = await page.locator('text=/Sign Out|Dashboard|Account/i').count() > 0;

    if (isLoggedIn) {
      console.log('✅ GitHub OAuth SUCCESS - User is logged in!');
      return { success: true, consoleMessages };
    } else {
      console.log('❌ GitHub OAuth FAILED - Not logged in');
      return { success: false, consoleMessages };
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    await page.screenshot({ path: 'tmp/error.png' });
    return { success: false, error: error.message, consoleMessages };
  } finally {
    // Print console summary
    if (consoleMessages.length > 0) {
      console.log('\n📋 Browser Console Log:');
      consoleMessages.forEach(msg => console.log('  ' + msg));
    }
    await browser.close();
  }
}

async function testGoogleOAuth() {
  console.log('\n🧪 Testing Google OAuth Flow...\n');

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate to Veria
    console.log('1. Navigating to', TEST_URL);
    await page.goto(TEST_URL);

    // Step 2: Click Sign In
    console.log('2. Clicking "Sign In" button...');
    await page.click('text=Sign In');
    await page.waitForTimeout(2000);

    // Step 3: Click Google OAuth button
    console.log('3. Clicking "Sign in with Google" button...');
    const googleButton = page.locator('button:has-text("Google"), a:has-text("Google")').first();
    await googleButton.click();
    await page.waitForTimeout(3000);

    // Step 4: Fill Google credentials (if on Google login page)
    const currentUrl = page.url();
    console.log('4. Current URL:', currentUrl);

    if (currentUrl.includes('accounts.google.com')) {
      console.log('   On Google login page, entering email...');

      await page.fill('input[type="email"]', GOOGLE_EMAIL);
      await page.click('button:has-text("Next"), #identifierNext');
      await page.waitForTimeout(2000);

      console.log('   Entering password...');
      await page.fill('input[type="password"]', GOOGLE_PASS);
      await page.click('button:has-text("Next"), #passwordNext');
      await page.waitForTimeout(3000);
    }

    // Step 5: Wait for redirect back to Veria
    console.log('5. Waiting for redirect to Veria...');
    await page.waitForURL(url => url.includes('veria.cc'), { timeout: 10000 });
    const finalUrl = page.url();
    console.log('   Final URL:', finalUrl);

    // Step 6: Verify logged in
    const isLoggedIn = await page.locator('text=/Sign Out|Dashboard|Account/i').count() > 0;

    if (isLoggedIn) {
      console.log('✅ Google OAuth SUCCESS - User is logged in!');
      return true;
    } else {
      console.log('❌ Google OAuth FAILED - Not logged in');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('========================================');
  console.log('🔒 Veria OAuth E2E Tests');
  console.log('========================================');
  console.log(`Test URL: ${TEST_URL}`);
  console.log(`GitHub User: ${GITHUB_USER}`);
  console.log(`Google Email: ${GOOGLE_EMAIL}`);
  console.log('========================================\n');

  const results = {
    github: false,
    google: false
  };

  // Test GitHub OAuth
  results.github = await testGitHubOAuth();

  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test Google OAuth
  results.google = await testGoogleOAuth();

  // Summary
  console.log('\n========================================');
  console.log('📊 Test Results Summary');
  console.log('========================================');
  console.log(`GitHub OAuth: ${results.github ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Google OAuth: ${results.google ? '✅ PASS' : '❌ FAIL'}`);
  console.log('========================================\n');

  process.exit(results.github && results.google ? 0 : 1);
}

main();
