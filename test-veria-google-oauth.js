#!/usr/bin/env node

/**
 * Test Google OAuth flow on veria.cc
 *
 * This script:
 * 1. Opens veria.cc/signin
 * 2. Clicks "Continue with Google"
 * 3. Captures any errors
 * 4. Reports back what happens
 */

const { chromium } = require('playwright');

async function testGoogleOAuth() {
  console.log('🔍 Testing Google OAuth on veria.cc...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  // Enable error logging
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  // Enable request/response logging
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[HTTP ${response.status()}] ${response.url()}`);
    }
  });

  try {
    console.log('📍 Step 1: Navigate to signin page');
    await page.goto('https://veria.cc/signin', { waitUntil: 'networkidle' });
    console.log(`✅ Current URL: ${page.url()}\n`);

    console.log('📍 Step 2: Click "Continue with Google"');
    const googleButton = page.getByRole('button', { name: /google/i });
    await googleButton.click();

    console.log('⏳ Waiting for navigation...');
    await page.waitForTimeout(3000);

    console.log(`✅ Current URL: ${page.url()}\n`);

    // Check if we're on Google OAuth page
    if (page.url().includes('accounts.google.com')) {
      console.log('✅ Successfully redirected to Google OAuth\n');

      // Take screenshot
      await page.screenshot({ path: '/tmp/google-oauth-page.png' });
      console.log('📸 Screenshot saved to /tmp/google-oauth-page.png\n');

    } else if (page.url().includes('error')) {
      console.log('❌ OAuth failed - redirected to error page');
      console.log(`   URL: ${page.url()}\n`);

      // Extract error from URL
      const url = new URL(page.url());
      const error = url.searchParams.get('error');
      console.log(`   Error parameter: ${error}\n`);

      // Take screenshot
      await page.screenshot({ path: '/tmp/oauth-error.png' });
      console.log('📸 Screenshot saved to /tmp/oauth-error.png\n');

      // Check page content for error messages
      const bodyText = await page.textContent('body');
      console.log('📄 Page content snippet:');
      console.log(bodyText.substring(0, 500));

    } else {
      console.log(`⚠️  Unexpected URL: ${page.url()}`);
      await page.screenshot({ path: '/tmp/unexpected-state.png' });
      console.log('📸 Screenshot saved to /tmp/unexpected-state.png\n');
    }

    console.log('\n⏸️  Pausing for 5 seconds to inspect...');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: '/tmp/test-error.png' });
    console.log('📸 Error screenshot saved to /tmp/test-error.png');
  } finally {
    await browser.close();
    console.log('\n✅ Test complete');
  }
}

testGoogleOAuth().catch(console.error);
