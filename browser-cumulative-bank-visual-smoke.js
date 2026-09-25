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
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.accept());
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => { window.__COURSE_ENABLE_DEBUG__ = true; });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => !!window.__mini4wdCourseDebug?.renderPartDataUrl, { timeout: TIMEOUT });

    const result = await page.evaluate(async () => {
      async function pixels(dataUrl) {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        function boundsForRange(minX, maxX) {
          let minY = canvas.height;
          let maxY = -1;
          let firstX = canvas.width;
          let lastX = -1;
          for (let y = 0; y < canvas.height; y++) {
            for (let x = minX; x <= maxX; x++) {
              const alpha = data[(y * canvas.width + x) * 4 + 3];
              if (alpha <= 24) continue;
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              firstX = Math.min(firstX, x);
              lastX = Math.max(lastX, x);
            }
          }
          return {
            width: lastX >= firstX ? lastX - firstX + 1 : 0,
            height: maxY >= minY ? maxY - minY + 1 : 0,
            minY,
            maxY
          };
        }

        const full = boundsForRange(0, canvas.width - 1);
        const edgeWindow = Math.max(3, Math.round(canvas.width * 0.10));
        const left = boundsForRange(0, edgeWindow);
        const right = boundsForRange(canvas.width - 1 - edgeWindow, canvas.width - 1);
        return { canvasWidth: canvas.width, canvasHeight: canvas.height, full, left, right };
      }

      const straight = {};
      for (const angle of [0, 20, 40, 60, 80]) {
        straight[angle] = await pixels(window.__mini4wdCourseDebug.renderPartDataUrl('straight', 'entry', 6, angle));
      }

      const bank = {};
      for (const baseAngle of [0, 20, 40, 60]) {
        bank[baseAngle] = await pixels(window.__mini4wdCourseDebug.renderPartDataUrl('bank20', 'entry', 8, baseAngle));
      }

      return { straight, bank };
    });

    const baseHeight = result.straight[0].full.height;
    const heights = [0, 20, 40, 60, 80].map(angle => result.straight[angle].full.height);
    for (let index = 1; index < heights.length; index++) {
      assert.ok(heights[index] < heights[index - 1], `visual height must shrink: ${heights.join(' > ')}`);
    }
    for (const angle of [20, 40, 60, 80]) {
      const expected = baseHeight * Math.cos(angle * Math.PI / 180);
      const actual = result.straight[angle].full.height;
      assert.ok(Math.abs(actual - expected) <= 7, `straight ${angle}° height ${actual} should be near ${expected.toFixed(1)}`);
    }

    for (const baseAngle of [0, 20, 40, 60]) {
      const measurement = result.bank[baseAngle];
      assert.ok(measurement.left.height > measurement.right.height,
        `Bank20 ${baseAngle}→${baseAngle + 20}° must taper: ${measurement.left.height} > ${measurement.right.height}`);
      const expectedLeft = measurement.canvasHeight * Math.cos(baseAngle * Math.PI / 180);
      const expectedRight = measurement.canvasHeight * Math.cos((baseAngle + 20) * Math.PI / 180);
      assert.ok(Math.abs(measurement.left.height - expectedLeft) <= 10,
        `Bank20 left ${baseAngle}°: ${measurement.left.height} vs ${expectedLeft.toFixed(1)}`);
      assert.ok(Math.abs(measurement.right.height - expectedRight) <= 10,
        `Bank20 right ${baseAngle + 20}°: ${measurement.right.height} vs ${expectedRight.toFixed(1)}`);
    }

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log(`✓ banked straight visual heights 0/20/40/60/80° = ${heights.join('/')}`);
    console.log('✓ Bank20 transitions taper correctly for 0→20, 20→40, 40→60 and 60→80 degrees');
    console.log('✓ cumulative bank visual browser rehearsal passed');
  } catch (error) {
    try { await page.screenshot({ path: `${ARTIFACT_DIR}/cumulative-bank-visual-failure.png`, fullPage: true }); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
