'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;

function baseLayout(state) {
  return {
    ...state,
    field: { ...state.field, originX: 0, originY: 0, widthCm: 700, heightCm: 400, gridCm: 10 },
    start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
    activeConnection: null,
    selectedType: 'straight',
    rotation: 0
  };
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
    await page.waitForFunction(() => typeof window.__mini4wdCourseDebug?.loadState === 'function', { timeout: TIMEOUT });
    await page.evaluate(() => document.querySelector('#setupDialog')?.close());

    const controls = await page.evaluate(() => {
      const panel = document.querySelector('#colorPanel');
      const select = document.querySelector('#straightColorBehaviorSelect');
      const style = panel ? getComputedStyle(panel) : null;
      return {
        panelVisible: Boolean(panel && style?.display !== 'none' && style?.visibility !== 'hidden'),
        mode: select?.value || null,
        options: Array.from(select?.options || []).map(option => [option.value, option.textContent.trim()]),
        redButton: Boolean(document.querySelector('[data-color-key="red"]')),
        blueButton: Boolean(document.querySelector('[data-color-key="blue"]'))
      };
    });
    assert.equal(controls.panelVisible, true, 'color behavior controls stay visible in Simple UI');
    assert.equal(controls.mode, 'slope-by-color');
    assert.deepEqual(controls.options, [
      ['slope-by-color', 'デフォルト（赤=上り／青=下り）'],
      ['color-only', 'カラーでのパーツ変更なし']
    ]);
    assert.equal(controls.redButton, true);
    assert.equal(controls.blueButton, true);
    console.log('✓ color panel exposes direct red/blue palette and requested behavior selector');

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      debug.loadState({
        ...state,
        field: { ...state.field, originX: 0, originY: 0, widthCm: 700, heightCm: 400, gridCm: 10 },
        start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
        parts: [
          { id: 'target', type: 'straight', x: 154, y: 100, zMm: 0, rotation: 0, zOrder: 1, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' },
          { id: 'downstream', type: 'straight', x: 208, y: 100, zMm: 0, rotation: 0, zOrder: 2, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' }
        ],
        connections: [
          { partAId: 'start', connectorAId: 'b', partBId: 'target', connectorBId: 'a', createdOrder: 1 },
          { partAId: 'target', connectorAId: 'b', partBId: 'downstream', connectorBId: 'a', createdOrder: 2 }
        ],
        activeConnection: null,
        selectedType: 'straight',
        rotation: 0
      });
      debug.setMode('color');
      debug.setSelectedIds(['target']);
    });
    await page.locator('#straightColorBehaviorSelect').selectOption('slope-by-color');
    await page.locator('[data-color-key="red"]').click();

    const uphill = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      const runtime = debug.getRuntimeState();
      return {
        target: state.parts.find(part => part.id === 'target'),
        downstream: state.parts.find(part => part.id === 'downstream'),
        edges: state.connections,
        warnings: runtime.layoutWarnings
      };
    });
    assert.equal(uphill.target.type, 'slope');
    assert.equal(uphill.target.zMm, 0);
    assert.equal(uphill.target.rotation, 0);
    assert.equal(uphill.target.entryConnectorId, 'a');
    assert.equal(uphill.target.colorKey, 'default');
    assert.equal(uphill.downstream.zMm, 115);
    assert.equal(uphill.warnings.some(warning => warning.type === 'height-mismatch'), false);
    console.log('✓ red Straight becomes an uphill slope in Start travel direction and raises downstream by 115mm');

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      debug.loadState({
        ...state,
        field: { ...state.field, originX: 0, originY: 0, widthCm: 700, heightCm: 400, gridCm: 10 },
        start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
        parts: [
          { id: 'target', type: 'straight', x: 154, y: 100, zMm: 0, rotation: 0, zOrder: 1, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' },
          { id: 'downstream', type: 'straight', x: 208, y: 100, zMm: 0, rotation: 0, zOrder: 2, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' }
        ],
        connections: [
          { partAId: 'start', connectorAId: 'b', partBId: 'target', connectorBId: 'a', createdOrder: 1 },
          { partAId: 'target', connectorAId: 'b', partBId: 'downstream', connectorBId: 'a', createdOrder: 2 }
        ],
        activeConnection: null,
        selectedType: 'straight',
        rotation: 0
      });
      debug.setMode('color');
      debug.setSelectedIds(['target']);
    });
    await page.locator('#straightColorBehaviorSelect').selectOption('color-only');
    await page.locator('[data-color-key="blue"]').click();

    const colorOnly = await page.evaluate(() => {
      const state = window.__mini4wdCourseDebug.getState();
      return {
        target: state.parts.find(part => part.id === 'target'),
        downstream: state.parts.find(part => part.id === 'downstream'),
        mode: document.querySelector('#straightColorBehaviorSelect')?.value,
        hint: document.querySelector('#colorBehaviorHint')?.textContent
      };
    });
    assert.equal(colorOnly.mode, 'color-only');
    assert.equal(colorOnly.target.type, 'straight');
    assert.equal(colorOnly.target.colorKey, 'blue');
    assert.equal(colorOnly.target.zMm, 0);
    assert.equal(colorOnly.downstream.zMm, 0);
    assert.match(colorOnly.hint, /パーツ種類は変更せず/);
    console.log('✓ color-only mode keeps a blue Straight as a blue Straight');

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      debug.loadState({
        ...state,
        field: { ...state.field, originX: 0, originY: 0, widthCm: 800, heightCm: 400, gridCm: 10 },
        start: { id: 'start', type: 'start', x: 100, y: 100, zMm: 0, rotation: 0, zOrder: 0, colorKey: 'default' },
        parts: [
          { id: 'upstream-slope', type: 'slope', x: 154, y: 100, zMm: 0, rotation: 0, zOrder: 1, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' },
          { id: 'target', type: 'straight', x: 208, y: 100, zMm: 115, rotation: 0, zOrder: 2, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' },
          { id: 'downstream', type: 'straight', x: 262, y: 100, zMm: 115, rotation: 0, zOrder: 3, colorKey: 'default', routeIndex: 0, entryConnectorId: 'a' }
        ],
        connections: [
          { partAId: 'start', connectorAId: 'b', partBId: 'upstream-slope', connectorBId: 'a', createdOrder: 1 },
          { partAId: 'upstream-slope', connectorAId: 'b', partBId: 'target', connectorBId: 'a', createdOrder: 2 },
          { partAId: 'target', connectorAId: 'b', partBId: 'downstream', connectorBId: 'a', createdOrder: 3 }
        ],
        activeConnection: null,
        selectedType: 'straight',
        rotation: 0
      });
      debug.setMode('color');
      debug.setSelectedIds(['target']);
    });
    await page.locator('#straightColorBehaviorSelect').selectOption('slope-by-color');
    await page.locator('[data-color-key="blue"]').click();

    const downhill = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const state = debug.getState();
      const runtime = debug.getRuntimeState();
      return {
        target: state.parts.find(part => part.id === 'target'),
        downstream: state.parts.find(part => part.id === 'downstream'),
        warnings: runtime.layoutWarnings
      };
    });
    assert.equal(downhill.target.type, 'slope');
    assert.equal(downhill.target.rotation, 180);
    assert.equal(downhill.target.entryConnectorId, 'b');
    assert.equal(downhill.target.zMm, 0);
    assert.equal(downhill.downstream.zMm, 0);
    assert.equal(downhill.warnings.some(warning => warning.type === 'height-mismatch'), false);
    console.log('✓ blue Straight becomes a downhill slope and lowers downstream by 115mm');

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
