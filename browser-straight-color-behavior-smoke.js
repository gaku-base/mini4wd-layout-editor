'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;

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
  await page.addInitScript(() => { window.__COURSE_ENABLE_DEBUG__ = true; });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => typeof window.__mini4wdCourseDebug?.loadState === 'function', { timeout: TIMEOUT });
    await page.waitForFunction(() => document.querySelector('#detailsToggleBtn'), { timeout: TIMEOUT });
    await page.evaluate(() => document.querySelector('#setupDialog')?.close());

    const selector = page.locator('#straightColorBehaviorSelect');
    assert.equal(await selector.inputValue(), 'slope-by-color', 'default behavior must be red-up / blue-down');

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const base = debug.getState();
      debug.loadState({
        ...base,
        field: { ...base.field, originX: 0, originY: 0, widthCm: 600, heightCm: 300, gridCm: 10 },
        start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
        parts: [
          { id: 'upstream-up', type: 'slope', x: 154, y: 100, zMm: 0, rotation: 0, zOrder: 1, colorKey: 'default', entryConnectorId: 'a', routeIndex: 0 },
          { id: 'target', type: 'straight', x: 208, y: 100, zMm: 115, rotation: 0, zOrder: 2, colorKey: 'default', entryConnectorId: 'a', routeIndex: 0 },
          { id: 'downstream', type: 'straight', x: 262, y: 100, zMm: 115, rotation: 0, zOrder: 3, colorKey: 'default', entryConnectorId: 'a', routeIndex: 0 }
        ],
        connections: [
          { partAId: 'start', connectorAId: 'b', partBId: 'upstream-up', connectorBId: 'a', createdOrder: 1 },
          { partAId: 'upstream-up', connectorAId: 'b', partBId: 'target', connectorBId: 'a', createdOrder: 2 },
          { partAId: 'target', connectorAId: 'b', partBId: 'downstream', connectorBId: 'a', createdOrder: 3 }
        ],
        activeConnection: null,
        selectedType: 'straight',
        rotation: 0
      });
      debug.setSelectedIds(['target']);
    });

    await page.locator('#detailsToggleBtn').click();
    await page.locator('#colorSelectionBtn').waitFor({ state: 'visible', timeout: TIMEOUT });

    await page.locator('#colorSelectionBtn').click();
    let state = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    let target = state.parts.find(part => part.id === 'target');
    let downstream = state.parts.find(part => part.id === 'downstream');
    assert.equal(target.type, 'slope');
    assert.equal(target.colorKey, 'red');
    assert.equal(target.entryConnectorId, 'a', 'red uses the low side as Start-direction entry');
    assert.equal(downstream.zMm, 230, 'red uphill raises the following route by 115mm');
    console.log('✓ default red converts Straight to Start-direction uphill Slope');

    await page.locator('#colorSelectionBtn').click();
    state = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    target = state.parts.find(part => part.id === 'target');
    downstream = state.parts.find(part => part.id === 'downstream');
    assert.equal(target.type, 'slope');
    assert.equal(target.colorKey, 'blue');
    assert.equal(target.entryConnectorId, 'b', 'blue uses the high side as Start-direction entry');
    assert.equal(downstream.zMm, 0, 'blue downhill returns the following route to ground');
    console.log('✓ cycling red to blue reorients the Slope downhill without moving its physical endpoints');

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const base = debug.getState();
      debug.loadState({
        ...base,
        start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
        parts: [
          { id: 'color-only-target', type: 'straight', x: 154, y: 100, zMm: 0, rotation: 0, zOrder: 1, colorKey: 'default', entryConnectorId: 'a', routeIndex: 0 }
        ],
        connections: [
          { partAId: 'start', connectorAId: 'b', partBId: 'color-only-target', connectorBId: 'a', createdOrder: 1 }
        ],
        activeConnection: null,
        selectedType: 'straight',
        rotation: 0
      });
      debug.setSelectedIds(['color-only-target']);
    });

    await selector.selectOption('color-only');
    await page.locator('#colorSelectionBtn').click();
    state = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    target = state.parts.find(part => part.id === 'color-only-target');
    assert.equal(target.type, 'straight');
    assert.equal(target.colorKey, 'red');

    await page.locator('#colorSelectionBtn').click();
    state = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    target = state.parts.find(part => part.id === 'color-only-target');
    assert.equal(target.type, 'straight');
    assert.equal(target.colorKey, 'blue');
    console.log('✓ color-only mode keeps red and blue Straight parts unchanged in type and height');

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join('\n')}`);
    console.log('Browser straight color behavior smoke test passed.');
  } catch (error) {
    try {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'straight-color-behavior-failure.png'), fullPage: true });
    } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
