'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;

async function waitStatusCount(page, expected) {
  await page.waitForFunction(expectedCount => {
    const value = document.querySelector('#statusCount')?.textContent || '';
    return value.trim() === String(expectedCount);
  }, expected, { timeout: TIMEOUT });
}

async function currentCount(page) {
  return Number(String(await page.locator('#statusCount').textContent() || '').trim());
}

async function lockState(page) {
  return page.evaluate(() => window.M4WD_CONNECTOR_TARGET_LOCK?.get?.() || null);
}

async function waitUnlocked(page) {
  await page.waitForFunction(() => window.M4WD_CONNECTOR_TARGET_LOCK?.get?.() == null, { timeout: TIMEOUT });
}

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required for browser smoke tests');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.accept());
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.locator('#courseCanvas').waitFor({ state: 'visible', timeout: TIMEOUT });

    const boot = await page.evaluate(() => ({
      control: Boolean(window.M4WD_CONNECTOR_TARGET_LOCK),
      runtime: Boolean(window.M4WD_CONNECTOR_TARGET_LOCK_RUNTIME),
      graphWrapped: Boolean(window.M4WD_LAYOUT_GRAPH?.__m4wdConnectorTargetLockWrapped),
      uiInstalled: Boolean(window.__M4WD_CONNECTOR_TARGET_LOCK_UI_INSTALLED__),
      connectorScriptCount: document.querySelectorAll('script[src*="connector-target-lock-runtime.js"]').length
    }));
    assert.deepEqual(boot, {
      control: true,
      runtime: true,
      graphWrapped: true,
      uiInstalled: true,
      connectorScriptCount: 1
    }, 'connector targeting must boot once in the production page without retaining the private debug bridge');

    // Build a clean layout only through the user-facing flow. The production
    // debug bridge is intentionally temporary, so this regression must not rely on it.
    const library = page.locator('#savedSpaceLibraryPanel');
    if (!(await library.isVisible())) await page.locator('#newBtn').click();
    await library.waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('#createNewSpaceBtn').click();
    await page.locator('#layoutSpacePanel').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await page.locator('#subEditModeBar').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('#skipSpaceSaveBtn').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('#skipSpaceSaveBtn').click();

    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });

    const canvas = page.locator('#courseCanvas');
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox && canvasBox.width > 200 && canvasBox.height > 200, 'course canvas must have a usable bounding box');
    const centerX = canvasBox.x + canvasBox.width / 2;
    const centerY = canvasBox.y + canvasBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    await waitStatusCount(page, 1);
    await page.waitForFunction(() => !String(document.querySelector('#startText')?.textContent || '').includes('未設定'), { timeout: TIMEOUT });

    // Explicitly select Straight so every connector-lock interaction below uses
    // a normal compatible part and isolates connector targeting behavior.
    await page.keyboard.press('1');

    const markers = page.locator('#connectorTargetLockOverlay .connector-target-point');
    await page.waitForFunction(() => document.querySelectorAll('#connectorTargetLockOverlay .connector-target-point').length >= 2, { timeout: TIMEOUT });
    assert.ok(await markers.count() >= 2, 'placed Start must expose two selectable open connectors');

    // Same-target toggle releases the lock.
    await markers.first().click();
    assert.ok(await lockState(page), 'connector marker click must lock the target');
    await page.locator('#connectorTargetLockStatus').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('#connectorTargetLockOverlay .connector-target-point.is-locked').click();
    await waitUnlocked(page);

    // Esc releases the lock.
    await markers.first().click();
    assert.ok(await lockState(page), 'connector must lock again before Esc regression');
    await page.keyboard.press('Escape');
    await waitUnlocked(page);

    // The requested behavior: a click inside the canvas but outside the fitted
    // layout space releases the lock only. The editor keeps a visible margin
    // around a newly fitted 5m x 5m field, so 5px from the canvas corner is
    // deliberately outside the layout while still reaching the canvas listener.
    await markers.first().click();
    assert.ok(await lockState(page), 'connector must lock before outside-space regression');
    const countBeforeOutside = await currentCount(page);
    await page.mouse.click(canvasBox.x + 5, canvasBox.y + 5);
    await waitUnlocked(page);
    assert.equal(await currentCount(page), countBeforeOutside, 'outside-layout click must release without placing a part');
    assert.equal(countBeforeOutside, 1, 'outside-layout regression must begin with only Start placed');

    // A locked target must remain usable beyond the ordinary 24px snap radius.
    // Clicking the canvas centre is intentionally far from the selected Start
    // endpoint; successful placement therefore exercises the explicit lock in
    // the real browser rather than only the unit-test wrapper.
    await page.waitForFunction(() => document.querySelectorAll('#connectorTargetLockOverlay .connector-target-point').length >= 2, { timeout: TIMEOUT });
    await markers.first().click();
    const markerBox = await page.locator('#connectorTargetLockOverlay .connector-target-point.is-locked').boundingBox();
    assert.ok(markerBox, 'locked connector marker must remain visible');
    const markerX = markerBox.x + markerBox.width / 2;
    const markerY = markerBox.y + markerBox.height / 2;
    const distanceToCenter = Math.hypot(centerX - markerX, centerY - markerY);
    assert.ok(distanceToCenter > 24, `test click must be outside ordinary snap radius (actual ${distanceToCenter.toFixed(1)}px)`);

    const countBeforePlacement = await currentCount(page);
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    await waitStatusCount(page, countBeforePlacement + 1);
    await waitUnlocked(page);
    assert.equal(await currentCount(page), 2, 'one Straight must be placed through the locked connector');

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(`✓ explicit connector target browser regression passed; forced click distance=${distanceToCenter.toFixed(1)}px`);
    console.log('✓ outside-layout click released the target without placing a part');
    console.log('✓ same-target click, Esc, and one-placement auto-release passed');
    console.log('Browser connector target lock smoke test passed.');
  } catch (error) {
    try { await page.screenshot({ path: `${ARTIFACT_DIR}/connector-target-lock-failure.png`, fullPage: true }); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
