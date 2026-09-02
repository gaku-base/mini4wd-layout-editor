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
    await page.evaluate(() => {
      const setupDialog = document.querySelector('#setupDialog');
      if (setupDialog?.open) setupDialog.close();
    });

    const bankButton = page.locator('button.part-button[data-part="bank20"]');
    await bankButton.waitFor({ state: 'visible', timeout: TIMEOUT });

    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.part-preview[data-preview-type="bank20"]');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 32) visible += 1;
      return visible > 250;
    }, { timeout: TIMEOUT });

    const result = await page.evaluate(() => {
      const bank = window.M4WD_PART_CATALOG?.PARTS?.bank20;
      const canvas = document.querySelector('canvas.part-preview[data-preview-type="bank20"]');
      const button = document.querySelector('button.part-button[data-part="bank20"]');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visiblePixels = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 32) visiblePixels += 1;
      return {
        projectedLengthMm: window.M4WD_PART_CATALOG?.BANK20_PROJECTED_LENGTH_MM,
        widthCm: bank?.w,
        geometryWidthCm: bank?.geometry?.width,
        connectorXs: bank?.geometry?.connectors?.map(connector => connector.x),
        bounds: bank?.geometry?.bounds,
        visualWidthCm: bank?.visual?.canvasWidth,
        visualOriginX: bank?.visual?.originX,
        angleDeg: bank?.bank?.angleDeg,
        measurementStatus: bank?.measurements?.projectedLengthMm?.status,
        visiblePixels,
        buttonText: button?.textContent || ''
      };
    });

    assert.equal(result.projectedLengthMm, 240);
    assert.equal(result.widthCm, 24);
    assert.equal(result.geometryWidthCm, 24);
    assert.deepEqual(result.connectorXs, [-12, 12]);
    assert.deepEqual(result.bounds, { minX: -12, maxX: 12, minY: -18, maxY: 18 });
    assert.equal(result.visualWidthCm, 24);
    assert.equal(result.visualOriginX, 12);
    assert.equal(result.angleDeg, 20);
    assert.equal(result.measurementStatus, 'verified');
    assert.ok(result.visiblePixels > 250, `Bank20 preview must remain visible: ${result.visiblePixels}`);
    assert.match(result.buttonText, /24cm\s*×\s*36cm/);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log(`✓ Bank20 preview visible; projected length=${result.projectedLengthMm}mm, connectors=${result.connectorXs.join('/')}cm`);
    console.log('Browser Bank20 240mm projection smoke test passed.');
  } catch (error) {
    try { await page.screenshot({ path: `${ARTIFACT_DIR}/bank20-projection-failure.png`, fullPage: true }); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
