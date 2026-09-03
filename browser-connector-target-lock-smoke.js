'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(() => document.querySelector('#setupDialog')?.close());

    await page.waitForFunction(() => Boolean(
      window.__mini4wdCourseDebug
      && window.M4WD_CONNECTOR_TARGET_LOCK
      && window.M4WD_LAYOUT_GRAPH?.__m4wdConnectorTargetLockWrapped
    ), { timeout: TIMEOUT });

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      state.start = {
        id: 'start', type: 'start', x: 250, y: 250, zMm: 0,
        rotation: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 0
      };
      state.parts = [];
      state.connections = [];
      state.selectedType = 'straight';
      state.rotation = 0;
      debug.loadState(state);
      debug.setMode('place');
      debug.selectPartType('straight');
    });

    const markers = page.locator('#connectorTargetLockOverlay .connector-target-point');
    await page.waitForFunction(() => document.querySelectorAll('#connectorTargetLockOverlay .connector-target-point').length >= 2, { timeout: TIMEOUT });
    assert.ok(await markers.count() >= 2, 'start must expose selectable open connectors');

    const firstMarker = markers.first();
    const firstIdentity = await firstMarker.getAttribute('data-connector-target');
    await firstMarker.click();

    await page.waitForFunction(() => Boolean(window.M4WD_CONNECTOR_TARGET_LOCK?.get()), { timeout: TIMEOUT });
    const locked = await page.evaluate(() => window.M4WD_CONNECTOR_TARGET_LOCK.get());
    assert.equal(locked.identity, firstIdentity);
    await page.locator('#connectorTargetLockStatus').waitFor({ state: 'visible', timeout: TIMEOUT });

    const forcedTarget = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const lock = window.M4WD_CONNECTOR_TARGET_LOCK.get();
      debug.setCursor(460, 440);
      const proposal = debug.getPlacementProposal();
      return {
        lock,
        snapped: proposal?.snapped,
        targetPartId: proposal?.edge?.partAId,
        targetConnectorId: proposal?.edge?.connectorAId,
        distancePx: proposal?.distancePx
      };
    });
    assert.equal(forcedTarget.snapped, true, 'locked connector must remain the snap target even when cursor is far away');
    assert.equal(forcedTarget.targetPartId, forcedTarget.lock.partId);
    assert.equal(forcedTarget.targetConnectorId, forcedTarget.lock.connectorId);
    assert.ok(forcedTarget.distancePx > 24, 'browser test must prove the explicit lock overrides the ordinary 24px range');

    const beforeOutside = await page.evaluate(() => window.__mini4wdCourseDebug.getRuntimeState().placementCommitCount);
    const outsidePoint = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const runtime = debug.getRuntimeState();
      const bounds = debug.getFieldBounds();
      const canvas = document.querySelector('#courseCanvas');
      const rect = canvas.getBoundingClientRect();
      const topLeft = window.M4WD_ROOM_BOUNDARY.worldToScreen({ x: bounds.minX, y: bounds.minY }, runtime.view);
      return {
        x: rect.left + Math.max(2, topLeft.x - 18),
        y: rect.top + Math.max(2, topLeft.y - 18)
      };
    });
    await page.mouse.click(outsidePoint.x, outsidePoint.y);
    await page.waitForFunction(() => window.M4WD_CONNECTOR_TARGET_LOCK?.get() == null, { timeout: TIMEOUT });
    const afterOutside = await page.evaluate(() => window.__mini4wdCourseDebug.getRuntimeState().placementCommitCount);
    assert.equal(afterOutside, beforeOutside, 'outside-layout click must release the lock without placing a part');

    await page.waitForFunction(() => document.querySelectorAll('#connectorTargetLockOverlay .connector-target-point').length >= 2, { timeout: TIMEOUT });
    await markers.first().click();
    assert.ok(await page.evaluate(() => window.M4WD_CONNECTOR_TARGET_LOCK.get()), 'marker click must lock');
    await page.locator('#connectorTargetLockOverlay .connector-target-point.is-locked').click();
    await page.waitForFunction(() => window.M4WD_CONNECTOR_TARGET_LOCK?.get() == null, { timeout: TIMEOUT });

    await markers.first().click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.M4WD_CONNECTOR_TARGET_LOCK?.get() == null, { timeout: TIMEOUT });

    await markers.first().click();
    const beforePlacement = await page.evaluate(() => window.__mini4wdCourseDebug.getRuntimeState().placementCommitCount);
    const canvasBox = await page.locator('#courseCanvas').boundingBox();
    assert.ok(canvasBox, 'course canvas must have a bounding box');
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.waitForFunction(expected => {
      const runtime = window.__mini4wdCourseDebug.getRuntimeState();
      return runtime.placementCommitCount > expected && window.M4WD_CONNECTOR_TARGET_LOCK?.get() == null;
    }, beforePlacement, { timeout: TIMEOUT });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log('✓ explicit connector target: exact target lock, outside-space release, same-target toggle, Esc, and one-placement auto-release passed');
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
