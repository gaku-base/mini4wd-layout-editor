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
  await page.addInitScript(() => {
    Object.defineProperty(window, '__mini4wdCourseDebug', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: undefined
    });
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => typeof window.__mini4wdCourseDebug?.loadState === 'function', { timeout: TIMEOUT });
    await page.evaluate(() => document.querySelector('#setupDialog')?.close());

    const runtimeInstalled = await page.evaluate(() => Boolean(
      window.M4WD_LAYOUT_GRAPH?.__m4wdSlopeHeightPropagationRuntimeWrapped
      && window.M4WD_LAYOUT_GRAPH?.__m4wdSlopeUnderpassRuntimeWrapped
    ));
    assert.equal(runtimeInstalled, true, 'slope height propagation must wrap the already-installed underpass graph');

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const base = debug.getState();
      debug.loadState({
        ...base,
        field: { ...base.field, originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
        start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
        parts: [
          { id: 'slope-retrofit', type: 'slope', x: 154, y: 100, zMm: 0, rotation: 0, zOrder: 1, colorKey: 'default' },
          { id: 'downstream-1', type: 'straight', x: 208, y: 100, zMm: 0, rotation: 0, zOrder: 2, colorKey: 'blue' },
          { id: 'downstream-2', type: 'straight', x: 262, y: 100, zMm: 0, rotation: 0, zOrder: 3, colorKey: 'blue' },
          { id: 'crossing-ground', type: 'straight', x: 208, y: 100, zMm: 0, rotation: 90, zOrder: 4, colorKey: 'red' }
        ],
        connections: [
          { partAId: 'start', connectorAId: 'b', partBId: 'slope-retrofit', connectorBId: 'a', createdOrder: 1 },
          { partAId: 'downstream-1', connectorAId: 'b', partBId: 'downstream-2', connectorBId: 'a', createdOrder: 2 }
        ],
        activeConnection: null,
        selectedType: 'straight',
        rotation: 0
      });
    });

    const result = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      const runtime = debug.getRuntimeState();
      return {
        parts: Object.fromEntries(state.parts.map(part => [part.id, { type: part.type, zMm: part.zMm }])),
        connections: state.connections,
        warnings: runtime.layoutWarnings,
        warningText: document.querySelector('#statusWarnings')?.textContent || ''
      };
    });

    assert.equal(result.parts['slope-retrofit'].zMm, 0, 'slope low-side base remains at ground');
    assert.equal(result.parts['downstream-1'].zMm, 115, 'first existing downstream part rises one level');
    assert.equal(result.parts['downstream-2'].zMm, 115, 'connected downstream route rises as one component');
    assert.equal(result.parts['crossing-ground'].zMm, 0, 'unrelated crossing route remains at ground');
    assert.ok(result.connections.some(edge => {
      const ids = new Set([edge.partAId, edge.partBId]);
      return ids.has('slope-retrofit') && ids.has('downstream-1');
    }), 'slope high end is formally connected to the raised downstream route');

    const crossingWarning = result.warnings.find(warning => warning.type === 'interference'
      && warning.partIds?.includes('downstream-1')
      && warning.partIds?.includes('crossing-ground'));
    assert.equal(crossingWarning, undefined, 'the old same-height crossing interference clears after the slope raises the route');
    assert.equal(result.warnings.some(warning => warning.type === 'height-mismatch'), false, 'new slope connection has no height mismatch');

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join('\n')}`);
    console.log('✓ retrofit slope raises the existing downstream route by 115mm and clears the stale interference');
    console.log('Browser retrofit slope height propagation smoke test passed.');
  } catch (error) {
    try {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'slope-retrofit-failure.png'), fullPage: true });
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
