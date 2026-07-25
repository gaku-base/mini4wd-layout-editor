'use strict';

const { chromium } = require('playwright');
const assert = require('assert');

let browser;

(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('http://127.0.0.1:4173/test-index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__mini4wdCourseDebug);
  await page.evaluate(() => document.getElementById('setupDialog')?.close());

  const fixture = {
    app: 'mini4wd-course-layout-mouse-flow',
    version: '1.1.0-RC2',
    field: { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    start: { x: -10, y: 90, rotation: 0 },
    parts: [
      { id: 'p1', type: 'straight', x: 620, y: 90, rotation: 0, colorKey: 'default', zIndex: 1 },
      { id: 'p2', type: 'corner45', x: 310, y: 430, rotation: 45, colorKey: 'default', zIndex: 2 }
    ],
    selectedType: 'straight',
    rotation: 0,
    activeConnection: null
  };

  await page.evaluate(data => window.__mini4wdCourseDebug.loadState(data), fixture);
  assert.strictEqual(await page.evaluate(() => window.__mini4wdCourseDebug.getOutOfBoundsItems().length), 3);
  assert.strictEqual(await page.locator('#statusOverflow').textContent(), '3');
  assert.match(await page.locator('#fieldOverflowText').textContent(), /3パーツ/);
  assert.strictEqual(await page.locator('#fieldOverflowNotice').evaluate(el => el.classList.contains('has-overflow')), true);

  const coordinatesBefore = await page.evaluate(() => {
    const state = window.__mini4wdCourseDebug.getState();
    return { start: state.start, parts: state.parts.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })) };
  });

  const fitted = await page.evaluate(() => {
    window.__mini4wdCourseDebug.autoFitFieldToLayout({ silent: true });
    return {
      field: window.__mini4wdCourseDebug.getFieldBounds(),
      layout: window.__mini4wdCourseDebug.getLayoutBounds(),
      outside: window.__mini4wdCourseDebug.getOutOfBoundsItems().length,
      state: window.__mini4wdCourseDebug.getState()
    };
  });
  assert.strictEqual(fitted.outside, 0);
  assert(fitted.field.minX < 0);
  assert(fitted.field.maxX > 600);
  assert(fitted.field.maxY > 400);
  assert.deepStrictEqual(
    { start: fitted.state.start, parts: fitted.state.parts.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })) },
    coordinatesBefore
  );

  const fieldOnce = fitted.state.field;
  const fieldTwice = await page.evaluate(() => {
    window.__mini4wdCourseDebug.autoFitFieldToLayout({ silent: true });
    return window.__mini4wdCourseDebug.getState().field;
  });
  assert.deepStrictEqual(fieldTwice, fieldOnce);

  await page.locator('#undoBtn').click();
  assert.strictEqual(await page.evaluate(() => window.__mini4wdCourseDebug.getOutOfBoundsItems().length), 3);
  const afterUndo = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
  assert.deepStrictEqual(
    { start: afterUndo.start, parts: afterUndo.parts.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })) },
    coordinatesBefore
  );

  await page.locator('#redoBtn').click();
  assert.strictEqual(await page.evaluate(() => window.__mini4wdCourseDebug.getOutOfBoundsItems().length), 0);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__mini4wdCourseDebug);
  const restored = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
  assert.deepStrictEqual(restored.field, fieldOnce);
  assert.strictEqual(await page.evaluate(() => window.__mini4wdCourseDebug.getOutOfBoundsItems().length), 0);

  const exportUrl = await page.evaluate(() => window.__mini4wdCourseDebug.renderExportDataUrl(1));
  assert(exportUrl.startsWith('data:image/png;base64,'));

  await page.evaluate(data => window.__mini4wdCourseDebug.loadState(data), fixture);
  await page.locator('#exportBtn').click();
  assert.strictEqual(await page.locator('#exportRangeDialog').evaluate(el => el.open), true);
  await page.locator('#exportRangeCancelBtn').click();
  assert.strictEqual(await page.locator('#exportRangeDialog').evaluate(el => el.open), false);

  assert.deepStrictEqual(errors, []);
  console.log('PASS browser field overflow/autofit QA');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => {});
});
