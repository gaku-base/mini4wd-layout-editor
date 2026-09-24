'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const STORAGE_KEY = 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1';
const TIMEOUT = 12000;

function colorsOf(layout) {
  return Object.fromEntries((layout?.parts || []).map(part => [part.id, part.colorKey || 'default']));
}

async function readLayout(page) {
  const raw = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function fitViewPoint(page, xCm, yCm) {
  return page.evaluate(({ xCm, yCm }) => {
    const wrap = document.querySelector('#canvasWrap')?.getBoundingClientRect();
    const canvas = document.querySelector('#courseCanvas')?.getBoundingClientRect();
    if (!wrap || !canvas) return null;
    const margin = 42;
    const widthCm = 500;
    const heightCm = 500;
    const scale = Math.min(
      (wrap.width - margin * 2) / widthCm,
      (wrap.height - margin * 2) / heightCm
    );
    const offsetX = (wrap.width - widthCm * scale) / 2;
    const offsetY = (wrap.height - heightCm * scale) / 2;
    return {
      x: canvas.left + offsetX + xCm * scale,
      y: canvas.top + offsetY + yCm * scale
    };
  }, { xCm, yCm });
}

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');
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

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('dialog', async dialog => dialog.accept());
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  const seed = {
    app: 'mini4wd-course-layout-mouse-flow',
    version: '1.1.0-RC3',
    field: { originX: 0, originY: 0, widthCm: 500, heightCm: 500, gridCm: 10 },
    roomCutouts: [],
    obstacles: [],
    parts: [
      { id: 'slope-a', type: 'slope', x: 140, y: 140, rotation: 0, routeIndex: 0, entryConnectorId: 'a', colorKey: 'default', zMm: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 1, zIndex: 1 },
      { id: 'slope-b', type: 'slope', x: 140, y: 240, rotation: 0, routeIndex: 0, entryConnectorId: 'a', colorKey: 'default', zMm: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 2, zIndex: 2 },
      { id: 'bank-a', type: 'bank20', x: 320, y: 140, rotation: 0, routeIndex: 0, entryConnectorId: 'a', colorKey: 'default', zMm: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 3, zIndex: 3 },
      { id: 'bank-b', type: 'bank20', x: 320, y: 240, rotation: 0, routeIndex: 0, entryConnectorId: 'a', colorKey: 'default', zMm: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 4, zIndex: 4 }
    ],
    start: { id: 'start', type: 'start', x: 250, y: 380, rotation: 0, zMm: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 0, zIndex: 0 },
    startPhase: 'position',
    selectedType: 'straight',
    rotation: 0,
    activeConnection: null,
    connections: []
  };

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(({ key, seed }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(seed));
    }, { key: STORAGE_KEY, seed });

    await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
    await page.locator('#courseCanvas').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.evaluate(() => {
      const dialog = document.querySelector('#setupDialog');
      if (dialog?.open) dialog.close();
    });

    await page.locator('#fitViewBtn').click();
    await page.waitForTimeout(350);

    assert.deepEqual(colorsOf(await readLayout(page)), {
      'slope-a': 'default',
      'slope-b': 'default',
      'bank-a': 'default',
      'bank-b': 'default'
    });

    const assets = await page.evaluate(() => ({
      slope: window.M4WD_PART_CATALOG?.PARTS?.slope?.visual?.file || null,
      bank: window.M4WD_PART_CATALOG?.PARTS?.bank20?.visual?.file || null
    }));
    assert.equal(assets.slope, 'assets/parts/slope-gradient.svg');
    assert.equal(assets.bank, 'assets/templates/bank20.svg');

    const slopeA = await fitViewPoint(page, 140, 140);
    const bankA = await fitViewPoint(page, 320, 140);
    assert.ok(slopeA && bankA);

    await page.locator('[data-mode="color"]').click();
    await page.waitForTimeout(100);

    await page.mouse.click(slopeA.x, slopeA.y);
    await page.waitForFunction(key => {
      const raw = localStorage.getItem(key);
      const layout = raw ? JSON.parse(raw) : null;
      return layout?.parts?.find(part => part.id === 'slope-a')?.colorKey === 'red';
    }, STORAGE_KEY, { timeout: TIMEOUT });

    let colors = colorsOf(await readLayout(page));
    assert.deepEqual(colors, {
      'slope-a': 'red',
      'slope-b': 'default',
      'bank-a': 'default',
      'bank-b': 'default'
    });

    await page.mouse.click(bankA.x, bankA.y);
    await page.mouse.click(bankA.x, bankA.y);
    await page.waitForFunction(key => {
      const raw = localStorage.getItem(key);
      const layout = raw ? JSON.parse(raw) : null;
      return layout?.parts?.find(part => part.id === 'bank-a')?.colorKey === 'blue';
    }, STORAGE_KEY, { timeout: TIMEOUT });

    colors = colorsOf(await readLayout(page));
    assert.deepEqual(colors, {
      'slope-a': 'red',
      'slope-b': 'default',
      'bank-a': 'blue',
      'bank-b': 'default'
    });

    await page.screenshot({ path: `${ARTIFACT_DIR}/independent-colors-before-reload.png`, fullPage: true });

    await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(() => {
      const dialog = document.querySelector('#setupDialog');
      if (dialog?.open) dialog.close();
    });
    await page.locator('#fitViewBtn').click();
    await page.waitForTimeout(300);

    assert.deepEqual(colorsOf(await readLayout(page)), {
      'slope-a': 'red',
      'slope-b': 'default',
      'bank-a': 'blue',
      'bank-b': 'default'
    });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log('✓ slope A changed independently to red; slope B stayed default');
    console.log('✓ Bank20 A changed independently to blue; Bank20 B stayed default');
    console.log('✓ slope and Bank20 colors stayed independent from each other');
    console.log('✓ independent colors survived reload');
    console.log('✓ default slope and Bank20 use the intended green SVG assets');
    console.log('Browser independent part-color rehearsal passed.');
  } catch (error) {
    try {
      await page.screenshot({ path: `${ARTIFACT_DIR}/independent-colors-failure.png`, fullPage: true });
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
