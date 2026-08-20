'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 8000;

async function waitVisible(page, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  return locator;
}

async function waitStatusCount(page, expected) {
  await page.waitForFunction(expectedCount => {
    const value = document.querySelector('#statusCount')?.textContent || '';
    return value.trim() === String(expectedCount);
  }, expected, { timeout: TIMEOUT });
}

async function openSavedSpaceLibrary(page) {
  const library = page.locator('#savedSpaceLibraryPanel');
  if (!(await library.isVisible())) await page.locator('#newBtn').click();
  await library.waitFor({ state: 'visible', timeout: TIMEOUT });
}

function fitFieldScreenRect(canvasBox, field) {
  const margin = 42;
  const widthCm = Number(field?.widthCm) || 1;
  const heightCm = Number(field?.heightCm) || 1;
  const scale = Math.min(
    (canvasBox.width - margin * 2) / widthCm,
    (canvasBox.height - margin * 2) / heightCm
  );
  const width = widthCm * scale;
  const height = heightCm * scale;
  return {
    left: canvasBox.x + (canvasBox.width - width) / 2,
    top: canvasBox.y + (canvasBox.height - height) / 2,
    right: canvasBox.x + (canvasBox.width + width) / 2,
    bottom: canvasBox.y + (canvasBox.height + height) / 2
  };
}

async function readLayout(page) {
  return page.evaluate(() => window.__mini4wdCourseDebug.getState());
}

async function previewWholeField(page, start, end, modeKey, expectedMode, expectedRgb, expectedIds) {
  await page.keyboard.press(modeKey);
  await page.waitForFunction(mode => {
    const debugMode = window.__mini4wdCourseDebug?.getRuntimeState?.().mode;
    return debugMode === mode;
  }, expectedMode, { timeout: TIMEOUT });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });

  await page.waitForFunction(({ mode, count }) => {
    const overlay = document.querySelector('#marqueeTargetPreviewCanvas');
    return overlay?.dataset.mode === mode
      && overlay.dataset.targetCount === String(count)
      && getComputedStyle(overlay).display !== 'none';
  }, { mode: expectedMode, count: expectedIds.length }, { timeout: TIMEOUT });

  const preview = await page.evaluate(({ expectedMode: mode }) => {
    const overlay = document.querySelector('#marqueeTargetPreviewCanvas');
    const debug = window.__mini4wdCourseDebug;
    const layout = debug.getState();
    const runtime = debug.getRuntimeState();
    const part = layout.parts[0] || layout.start;
    const point = window.M4WD_ROOM_BOUNDARY.worldToScreen({ x: part.x, y: part.y }, runtime.view);
    const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    const pixel = Array.from(overlay.getContext('2d').getImageData(
      Math.max(0, Math.min(overlay.width - 1, Math.round(point.x * dpr))),
      Math.max(0, Math.min(overlay.height - 1, Math.round(point.y * dpr))),
      1,
      1
    ).data);
    let ids = [];
    try { ids = JSON.parse(overlay.dataset.targetIds || '[]'); } catch (_) {}
    return {
      mode: overlay.dataset.mode,
      count: Number(overlay.dataset.targetCount || 0),
      ids: ids.map(String).sort(),
      pixel,
      display: getComputedStyle(overlay).display
    };
  }, { expectedMode });

  assert.equal(preview.mode, expectedMode);
  assert.equal(preview.count, expectedIds.length);
  assert.deepEqual(preview.ids, [...expectedIds].map(String).sort());
  assert.notEqual(preview.display, 'none');
  expectedRgb.forEach((value, index) => {
    assert.ok(Math.abs(preview.pixel[index] - value) <= 4,
      `${expectedMode} preview RGB channel ${index} expected ${value}, got ${preview.pixel[index]}`);
  });
  assert.ok(preview.pixel[3] > 20, `${expectedMode} preview must visibly fill the target part`);

  // Return to a tiny empty rectangle before release so delete/color modes do
  // not mutate the layout. This keeps all three mode checks independent.
  await page.mouse.move(start.x + 1, start.y + 1, { steps: 8 });
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#marqueeTargetPreviewCanvas');
    return overlay?.dataset.targetCount === '0' && getComputedStyle(overlay).display === 'none';
  }, { timeout: TIMEOUT });
  await page.mouse.up();
  await waitStatusCount(page, 3);
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

  // Keep the QA handle available only in this Chromium process so the test can
  // read exact layout/view state while production still hides the public handle.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__mini4wdCourseDebug', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: undefined
    });
  });

  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('dialog', async dialog => dialog.accept());

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    const canvas = await waitVisible(page, '#courseCanvas');
    await page.waitForFunction(() => typeof window.__mini4wdCourseDebug?.getRuntimeState === 'function', { timeout: TIMEOUT });
    await page.waitForFunction(() => document.querySelector('#marqueeTargetPreviewCanvas'), { timeout: TIMEOUT });

    await openSavedSpaceLibrary(page);
    await page.locator('#createNewSpaceBtn').click();
    await waitVisible(page, '#layoutSpacePanel');
    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await waitVisible(page, '#spaceSaveControls');
    await page.locator('#savedSpaceNameInput').fill('Marquee Preview Space');
    await page.locator('#saveSpaceAndStartBtn').click();
    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });

    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox && canvasBox.width > 100 && canvasBox.height > 100);
    const centerX = canvasBox.x + canvasBox.width / 2;
    const centerY = canvasBox.y + canvasBox.height / 2;

    await page.mouse.click(centerX, centerY);
    await waitStatusCount(page, 1);
    await page.keyboard.press('1');
    await page.mouse.click(centerX + Math.min(120, canvasBox.width * 0.14), centerY);
    await waitStatusCount(page, 2);
    await page.keyboard.press('1');
    await page.mouse.click(centerX - Math.min(120, canvasBox.width * 0.14), centerY + Math.min(110, canvasBox.height * 0.14));
    await waitStatusCount(page, 3);

    const layout = await readLayout(page);
    assert.ok(layout.start && layout.parts.length === 2);
    const expectedIds = [layout.start.id || 'start', ...layout.parts.map(part => part.id)];
    const fieldRect = fitFieldScreenRect(canvasBox, layout.field);
    const start = { x: fieldRect.left + 5, y: fieldRect.top + 5 };
    const end = { x: fieldRect.right - 5, y: fieldRect.bottom - 5 };

    await previewWholeField(page, start, end, 'q', 'move', [85, 215, 255], expectedIds);
    console.log('✓ move marquee previews every touched part with the move hover color');

    await previewWholeField(page, start, end, 'w', 'delete', [255, 82, 104], expectedIds);
    console.log('✓ delete marquee previews every touched part with the delete hover color');

    await previewWholeField(page, start, end, 'e', 'color', [200, 136, 255], expectedIds);
    console.log('✓ color marquee previews every touched part with the color hover color');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    console.log('Browser marquee target preview regression test passed.');
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'marquee-preview-failure.png');
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
