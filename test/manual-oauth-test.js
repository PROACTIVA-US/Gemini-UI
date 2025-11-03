const { chromium } = require('playwright');

async function testOAuth(provider) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\n🧪 Testing ${provider} OAuth flow...\n`);

  try {
    // Navigate to sign-in page
    console.log('1. Navigating to https://www.veria.cc/signin');
    await page.goto('https://www.veria.cc/signin');
    await page.waitForLoadState('networkidle');

    // Take screenshot of sign-in page
    await page.screenshot({ path: `test/screenshots/01-signin-page.png` });
    console.log('   ✅ Sign-in page loaded');

    // Click the OAuth provider button
    const buttonSelector = provider === 'google'
      ? 'button:has-text("Continue with Google")'
      : 'button:has-text("Continue with GitHub")';

    console.log(`2. Clicking "${provider}" button`);
    await page.click(buttonSelector);

    // Wait for OAuth redirect
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test/screenshots/02-oauth-redirect.png` });

    const currentUrl = page.url();
    console.log(`   ✅ Redirected to: ${currentUrl}`);

    // Check if we're on the OAuth provider's page
    if (provider === 'google' && currentUrl.includes('accounts.google.com')) {
      console.log('   ✅ Successfully redirected to Google OAuth');
    } else if (provider === 'github' && currentUrl.includes('github.com')) {
      console.log('   ✅ Successfully redirected to GitHub OAuth');
    } else if (currentUrl.includes('error')) {
      console.log(`   ❌ ERROR: Redirected to error page`);
      await page.screenshot({ path: `test/screenshots/03-error.png` });
    } else {
      console.log(`   ⚠️  Unexpected URL: ${currentUrl}`);
    }

    // Wait a bit to see the OAuth page
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `test/screenshots/03-oauth-page.png` });

    console.log('\n✅ OAuth redirect test completed');
    console.log('📸 Screenshots saved to test/screenshots/\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: `test/screenshots/error.png` });
  } finally {
    await browser.close();
  }
}

// Run tests
const provider = process.argv[2] || 'github';
testOAuth(provider);
