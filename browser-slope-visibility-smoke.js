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
  const browser = await chromium.launch({ executablePath: CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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

    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.part-preview[data-preview-type="slope"]');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 32) visible += 1;
      return visible > 400;
    }, { timeout: TIMEOUT });

    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.part-preview[data-preview-type="slope"]');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = image;
      const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let visiblePixels = 0;
      let leftSum = 0;
      let leftCount = 0;
      let rightSum = 0;
      let rightCount = 0;
      for (let y = Math.floor(height * 0.22); y < Math.ceil(height * 0.78); y++) {
        for (let x = Math.floor(width * 0.12); x < Math.ceil(width * 0.88); x++) {
          const i = (y * width + x) * 4;
          const alpha = data[i + 3];
          if (alpha <= 32) continue;
          visiblePixels += 1;
          const lum = luminance(data[i], data[i + 1], data[i + 2]);
          if (x < width * 0.36) { leftSum += lum; leftCount += 1; }
          if (x > width * 0.64) { rightSum += lum; rightCount += 1; }
        }
      }
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      const ci = (cy * width + cx) * 4;
      return {
        visiblePixels,
        centerAlpha: data[ci + 3],
        leftLuminance: leftCount ? leftSum / leftCount : 0,
        rightLuminance: rightCount ? rightSum / rightCount : 0,
        assetFile: window.M4WD_PART_CATALOG?.PARTS?.slope?.visual?.file || null
      };
    });

    assert.equal(result.assetFile, 'assets/parts/slope-gradient.svg');
    assert.ok(result.visiblePixels > 400, `slope preview must contain visible pixels: ${result.visiblePixels}`);
    assert.ok(result.centerAlpha > 32, `slope preview center must be visible: alpha=${result.centerAlpha}`);
    assert.ok(result.rightLuminance > result.leftLuminance + 3,
      `high end must be visibly brighter than low end: left=${result.leftLuminance.toFixed(2)} right=${result.rightLuminance.toFixed(2)}`);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(`✓ slope preview visible; low=${result.leftLuminance.toFixed(2)} high=${result.rightLuminance.toFixed(2)}`);
    console.log('Browser slope visibility smoke test passed.');
  } catch (error) {
    try { await page.screenshot({ path: `${ARTIFACT_DIR}/slope-visibility-failure.png`, fullPage: true }); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
