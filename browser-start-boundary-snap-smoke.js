'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 8000;
const EPSILON = 1e-6;

async function waitVisible(page, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  return locator;
}

async function ghostBounds(page) {
  return page.evaluate(() => {
    const debug = window.__mini4wdCourseDebug;
    const runtime = debug.getRuntimeState();
    const layout = debug.getState();
    const graph = window.M4WD_LAYOUT_GRAPH;
    const def = window.M4WD_PART_CATALOG.PARTS.start;
    return graph.polygonBounds(graph.occupancyPolygon({
      id: 'start-boundary-smoke', type: 'start',
      x: runtime.cursor.x, y: runtime.cursor.y,
      rotation: layout.rotation
    }, def));
  });
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
  const consoleErrors = [];
  const pageErrors = [];

  // Keep the QA handle visible only for this browser rehearsal. Production
  // still lets the existing extension bootstrap own and remove its private bridge.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__mini4wdCourseDebug', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: undefined
    });
    window.__COURSE_ENABLE_DEBUG__ = true;
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('dialog', async dialog => dialog.accept());

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await waitVisible(page, '#courseCanvas');
    await page.waitForFunction(() => typeof window.__mini4wdCourseDebug?.getRuntimeState === 'function', { timeout: TIMEOUT });

    const library = page.locator('#savedSpaceLibraryPanel');
    if (!(await library.isVisible())) await page.locator('#newBtn').click();
    await library.waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('#createNewSpaceBtn').click();
    await waitVisible(page, '#layoutSpacePanel');
    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await waitVisible(page, '#spaceSaveControls');
    await page.locator('#skipSpaceSaveBtn').click();
    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });

    const targetScreen = await page.evaluate(() => {
      const runtime = window.__mini4wdCourseDebug.getRuntimeState();
      const canvas = document.querySelector('#courseCanvas');
      const rect = canvas.getBoundingClientRect();
      const local = window.M4WD_ROOM_BOUNDARY.worldToScreen({ x: 30, y: 30 }, runtime.view);
      return { x: rect.left + local.x, y: rect.top + local.y };
    });

    await page.mouse.move(targetScreen.x, targetScreen.y);
    await page.waitForFunction(() => {
      const cursor = window.__mini4wdCourseDebug.getRuntimeState().cursor;
      return Math.abs(cursor.x - 27) < 1e-6 && Math.abs(cursor.y - 18) < 1e-6;
    }, { timeout: TIMEOUT });
    let bounds = await ghostBounds(page);
    assert.ok(Math.abs(bounds.minX) < EPSILON, `0deg left edge must be flush: ${JSON.stringify(bounds)}`);
    assert.ok(Math.abs(bounds.minY) < EPSILON, `0deg top edge must be flush: ${JSON.stringify(bounds)}`);
    console.log('✓ 0° Start snaps flush to the top-left field edges');

    await page.keyboard.press('x');
    await page.mouse.move(targetScreen.x, targetScreen.y);
    await page.waitForFunction(() => window.__mini4wdCourseDebug.getState().rotation === 45, { timeout: TIMEOUT });
    bounds = await ghostBounds(page);
    assert.ok(Math.abs(bounds.minX) < EPSILON, `45deg left edge must be flush: ${JSON.stringify(bounds)}`);
    assert.ok(Math.abs(bounds.minY) < EPSILON, `45deg top edge must be flush: ${JSON.stringify(bounds)}`);
    console.log('✓ 45° Start re-snaps using its rotated occupancy bounds');

    await page.mouse.click(targetScreen.x, targetScreen.y);
    await page.waitForFunction(() => Boolean(window.__mini4wdCourseDebug.getState().start), { timeout: TIMEOUT });
    const committed = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const layout = debug.getState();
      const graph = window.M4WD_LAYOUT_GRAPH;
      const def = window.M4WD_PART_CATALOG.PARTS.start;
      const bounds = graph.polygonBounds(graph.occupancyPolygon({ ...layout.start, id: 'start', type: 'start' }, def));
      return { start: layout.start, bounds, overflow: debug.getOutOfBoundsItems() };
    });
    assert.ok(Math.abs(committed.bounds.minX) < EPSILON, `committed left edge must stay flush: ${JSON.stringify(committed)}`);
    assert.ok(Math.abs(committed.bounds.minY) < EPSILON, `committed top edge must stay flush: ${JSON.stringify(committed)}`);
    assert.equal(committed.overflow.some(item => item.id === 'start'), false, 'flush Start must remain inside the field');
    console.log('✓ click commits the exact edge-aligned Start pose without overflow');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    console.log('Browser Start boundary snap regression test passed.');
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'start-boundary-snap-failure.png');
    try {
      await page.screenshot({ path: screenshot, fullPage: true });
      console.error(`Failure screenshot: ${screenshot}`);
    } catch (screenshotError) {
      console.error(`Could not save failure screenshot: ${screenshotError.message}`);
    }
    if (pageErrors.length) console.error(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) console.error(`Console errors:\n${consoleErrors.join('\n')}`);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
