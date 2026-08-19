'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 8000;

function logStep(message) {
  console.log(`✓ ${message}`);
}

async function waitVisible(page, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  return locator;
}

async function text(locator) {
  return String(await locator.textContent() || '').trim();
}

async function openSavedSpaceLibrary(page) {
  const library = page.locator('#savedSpaceLibraryPanel');
  if (!(await library.isVisible())) {
    await page.locator('#newBtn').click();
  }
  await library.waitFor({ state: 'visible', timeout: TIMEOUT });
  return library;
}

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required for browser smoke tests');

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const dialogs = [];

  // Chromium may request /favicon.ico even when the application does not define one.
  // Fulfil only that browser-generated request so real application resource 404s still fail the smoke test.
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('dialog', async dialog => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await waitVisible(page, '#courseCanvas');
    logStep('application boots in Chromium');

    await openSavedSpaceLibrary(page);
    await waitVisible(page, '#createNewSpaceBtn');
    logStep('new layout opens the saved-space library');

    await page.locator('#createNewSpaceBtn').click();
    await waitVisible(page, '#layoutSpacePanel');

    assert.equal(await page.locator('#fieldWidthInput').inputValue(), '5.0');
    assert.equal(await page.locator('#fieldHeightInput').inputValue(), '5.0');
    assert.equal(await page.locator('#gridInput').inputValue(), '10');
    logStep('STEP 1 defaults are 5.0m × 5.0m / 10cm');

    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await waitVisible(page, '#subEditModeBar');
    await waitVisible(page, '#spaceSaveControls');
    await waitVisible(page, '#savedSpaceNameInput');
    logStep('STEP 1 advances to STEP 2');

    await page.locator('#savedSpaceNameInput').fill('Smoke Test Space');
    await page.locator('#saveSpaceAndStartBtn').click();

    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });
    logStep('saved space advances to STEP 3');

    const canvas = page.locator('#courseCanvas');
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 100 && box.height > 100, 'course canvas has a usable size');

    const startBefore = await text(page.locator('#startText'));
    assert.match(startBefore, /未設定/);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForFunction(() => {
      const value = document.querySelector('#startText')?.textContent || '';
      return value.trim() && !value.includes('未設定');
    }, { timeout: TIMEOUT });

    const startAfterPlacement = await text(page.locator('#startText'));
    assert.doesNotMatch(startAfterPlacement, /未設定/);
    logStep('Start can be placed and normal course editing begins');

    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await waitVisible(page, '#courseCanvas');
    const startAfterReload = await text(page.locator('#startText'));
    assert.doesNotMatch(startAfterReload, /未設定/);
    logStep('course state restores after reload');

    await openSavedSpaceLibrary(page);
    const savedCard = page.locator('.saved-space-card', { hasText: 'Smoke Test Space' });
    await savedCard.waitFor({ state: 'visible', timeout: TIMEOUT });
    logStep('saved-space library persists after reload');

    const startBeforeCancel = await text(page.locator('#startText'));
    await page.locator('#cancelSavedSpaceLibraryBtn').click();
    await page.locator('#savedSpaceLibraryPanel').waitFor({ state: 'hidden', timeout: TIMEOUT });
    const startAfterCancel = await text(page.locator('#startText'));
    assert.equal(startAfterCancel, startBeforeCancel);
    assert.doesNotMatch(startAfterCancel, /未設定/);
    logStep('cancelling new-layout setup preserves the current course');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    logStep('console error / page error = 0');

    console.log(`Browser smoke test passed${dialogs.length ? ` (${dialogs.length} dialog(s) handled)` : ''}.`);
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'failure.png');
    try {
      await page.screenshot({ path: screenshot, fullPage: true });
      console.error(`Failure screenshot: ${screenshot}`);
    } catch (screenshotError) {
      console.error(`Could not save failure screenshot: ${screenshotError.message}`);
    }
    if (pageErrors.length) console.error(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) console.error(`Console errors:\n${consoleErrors.join('\n')}`);
    if (dialogs.length) console.error(`Dialogs:\n${dialogs.join('\n')}`);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
