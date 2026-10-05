'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const STORAGE_KEY = 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1';
const TIMEOUT = 15000;

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.dismiss());
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  const seed = {
    app: 'mini4wd-course-layout-mouse-flow',
    version: '1.1.0-RC3',
    field: { originX: 0, originY: 0, widthCm: 500, heightCm: 500, gridCm: 10 },
    roomCutouts: [],
    obstacles: [],
    parts: [
      { id:'straight-a', type:'straight', x:177, y:250, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'blue', zMm:0, pitchDeg:0, bankAngleDeg:0, zOrder:1, zIndex:1 }
    ],
    start: { id:'start', type:'start', x:123, y:250, rotation:0, zMm:0, pitchDeg:0, bankAngleDeg:0, zOrder:0, zIndex:0, colorKey:'default' },
    startPhase: 'done',
    selectedType: 'straight',
    rotation: 0,
    activeConnection: null,
    connections: [
      { partAId:'start', connectorAId:'b', partBId:'straight-a', connectorBId:'a', createdOrder:1 }
    ]
  };

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(({ key, seed }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(seed));
    }, { key: STORAGE_KEY, seed });
    await page.reload({ waitUntil: 'networkidle', timeout: 20000 });

    await page.waitForFunction(() => !!window.M4WD_PRESENTATION, null, { timeout: TIMEOUT });
    await page.locator('#outputTabBtn').waitFor({ state:'visible', timeout:TIMEOUT });

    const initial = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
    assert.equal(initial.parts.length, 1);
    assert.equal(initial.parts[0].id, 'straight-a');
    assert.equal(initial.parts[0].colorKey, 'blue');

    assert.equal(await page.locator('#layoutTabBtn').textContent(), 'LAYOUT');
    assert.equal(await page.locator('#outputTabBtn').textContent(), 'OUTPUT');
    assert.equal(await page.locator('#layoutTabBtn').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#outputTabBtn').getAttribute('aria-selected'), 'false');

    await page.locator('#outputTabBtn').click();
    await page.waitForFunction(() => document.body.classList.contains('presentation-mode-open'));
    await page.locator('#presentationView').waitFor({ state:'visible', timeout:TIMEOUT });

    assert.equal(await page.locator('#presentationLayoutTabBtn').textContent(), 'LAYOUT');
    assert.equal(await page.locator('#presentationOutputTabBtn').textContent(), 'OUTPUT');
    assert.equal(await page.locator('#presentationOutputTabBtn').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#presentationLayoutTabBtn').getAttribute('aria-selected'), 'false');
    await page.locator('#presentationPngBtn').waitFor({ state:'visible', timeout:TIMEOUT });
    await page.locator('#presentationPrintBtn').waitFor({ state:'visible', timeout:TIMEOUT });

    const outputSections = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.presentation-section-card')).map(section => ({
        id: section.id,
        title: section.querySelector('.presentation-section-title')?.textContent || ''
      }))
    );
    assert.deepEqual(outputSections, [
      { id:'presentation2dSection', title:'2D確認' },
      { id:'presentation3dSection', title:'3D確認' },
      { id:'presentationExportSection', title:'出力操作' }
    ]);
    assert.equal(await page.locator('#presentation2dSection').evaluate(el => el.classList.contains('is-current')), true);
    assert.equal(await page.locator('#presentation3dCameraGroup').evaluate(el => el.hidden), true);
    assert.equal(await page.locator('#presentationExportSection #presentationPngBtn').count(), 1);
    assert.equal(await page.locator('#presentationExportSection #presentationPrintBtn').count(), 1);
    await page.waitForFunction(() => document.querySelector('#presentationExportSection #presentationCourseOnlyPngBtn'));
    assert.equal(await page.locator('#presentationExportSection #presentationCourseOnlyPngBtn').count(), 1);

    await page.locator('#presentationView3d').click();
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getOutputView() === '3d');
    assert.equal(await page.locator('#presentation3dSection').evaluate(el => el.classList.contains('is-current')), true);
    assert.equal(await page.locator('#presentation3dCameraGroup').evaluate(el => el.hidden), false);

    await page.locator('#presentationView2d').click();
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getOutputView() === '2d');
    assert.equal(await page.locator('#presentation2dSection').evaluate(el => el.classList.contains('is-current')), true);
    assert.equal(await page.locator('#presentation3dCameraGroup').evaluate(el => el.hidden), true);

    await page.locator('#presentationLayoutTabBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('presentation-mode-open'));
    await page.locator('#courseCanvas').waitFor({ state:'visible', timeout:TIMEOUT });

    assert.equal(await page.locator('#layoutTabBtn').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#outputTabBtn').getAttribute('aria-selected'), 'false');

    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
    assert.equal(after.parts.length, 1);
    assert.equal(after.parts[0].id, 'straight-a');
    assert.equal(after.parts[0].colorKey, 'blue');
    assert.deepEqual(after.connections, initial.connections);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log('✓ LAYOUT and OUTPUT tabs are visible with the approved English labels');
    console.log('✓ OUTPUT is grouped in 2D確認 / 3D確認 / 出力操作 order');
    console.log('✓ 2D/3D switching exposes 3D camera controls only when needed');
    console.log('✓ PNG and A4 controls stay inside the export section');
    console.log('✓ returning to LAYOUT preserves the course and connection state');
    console.log('Browser workspace tab rehearsal passed.');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
