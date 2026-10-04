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
  await page.addInitScript(() => {
    window.__COURSE_ENABLE_DEBUG__ = true;
    Object.defineProperty(window, '__mini4wdCourseDebug', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: undefined
    });
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => !!window.__mini4wdCourseDebug?.renderPartDataUrl, null, { timeout: TIMEOUT });

    const result = await page.evaluate(async () => {
      async function imageStats(dataUrl) {
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
        let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1, visiblePixels = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const a = data[(y * canvas.width + x) * 4 + 3];
            if (a <= 24) continue;
            visiblePixels += 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
        return {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          width: maxX >= minX ? maxX - minX + 1 : 0,
          height: maxY >= minY ? maxY - minY + 1 : 0,
          visiblePixels
        };
      }

      async function markerColours(dataUrl) {
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
        const result = { red:0, blue:0 };
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 100) continue;
          if (r > 200 && g < 110 && b < 110) result.red += 1;
          if (b > 200 && r < 90 && g < 175) result.blue += 1;
        }
        return result;
      }

      const straight = {};
      for (const angle of [0,20,40,60,80]) {
        straight[angle] = await imageStats(
          window.__mini4wdCourseDebug.renderPartDataUrl('straight', 'entry', 6, angle, true)
        );
      }

      const corner = {};
      for (const angle of [0,20,40,60,80]) {
        corner[angle] = await imageStats(
          window.__mini4wdCourseDebug.renderPartDataUrl('corner-45-right', 'entry', 8, angle, true)
        );
      }

      const bankEntryStats = {};
      for (const angle of [0,20,40,60]) {
        bankEntryStats[angle] = await imageStats(
          window.__mini4wdCourseDebug.renderPartDataUrl('bank20', 'entry', 8, angle, true)
        );
      }
      const bankExitStats = await imageStats(
        window.__mini4wdCourseDebug.renderPartDataUrl('bank20', 'exit', 8, 60, true)
      );

      const slopeMarkers = await markerColours(
        window.__mini4wdCourseDebug.renderPartDataUrl('slope', 'entry', 6, 0, false)
      );
      const bankEntryMarkers = await markerColours(
        window.__mini4wdCourseDebug.renderPartDataUrl('bank20', 'entry', 8, 0, false)
      );
      const bankExitMarkers = await markerColours(
        window.__mini4wdCourseDebug.renderPartDataUrl('bank20', 'exit', 8, 20, false)
      );

      return { straight, corner, bankEntryStats, bankExitStats, slopeMarkers, bankEntryMarkers, bankExitMarkers };
    });

    const straightBase = result.straight[0];
    for (const angle of [20,40,60,80]) {
      const current = result.straight[angle];
      assert.equal(current.width, straightBase.width, `banked straight ${angle}° width must keep plan footprint`);
      assert.equal(current.height, straightBase.height, `banked straight ${angle}° height must keep plan footprint`);
      assert.equal(current.visiblePixels, straightBase.visiblePixels, `banked straight ${angle}° pixels must keep plan footprint`);
    }

    const cornerBase = result.corner[0];
    for (const angle of [20,40,60,80]) {
      const current = result.corner[angle];
      assert.equal(current.width, cornerBase.width, `banked corner ${angle}° width must match flat corner`);
      assert.equal(current.height, cornerBase.height, `banked corner ${angle}° height must match flat corner`);
      assert.equal(current.visiblePixels, cornerBase.visiblePixels, `banked corner ${angle}° must keep exact plan shape`);
    }

    const bankBase = result.bankEntryStats[0];
    for (const angle of [20,40,60]) {
      const current = result.bankEntryStats[angle];
      assert.equal(current.width, bankBase.width, `Bank20 ${angle}° base must keep rectangular plan width`);
      assert.equal(current.height, bankBase.height, `Bank20 ${angle}° base must keep rectangular plan height`);
      assert.equal(current.visiblePixels, bankBase.visiblePixels, `Bank20 ${angle}° base must keep rectangular plan area`);
    }
    assert.equal(result.bankExitStats.width, bankBase.width);
    assert.equal(result.bankExitStats.height, bankBase.height);

    assert.ok(result.slopeMarkers.blue > 100, `Slope must keep blue LOW line: ${result.slopeMarkers.blue}`);
    assert.ok(result.slopeMarkers.red > 100, `Slope must keep red HIGH line: ${result.slopeMarkers.red}`);

    assert.ok(result.bankEntryMarkers.blue > 100, `Bank entrance must render BLUE line: ${result.bankEntryMarkers.blue}`);
    assert.equal(result.bankEntryMarkers.red, 0, `Bank entrance must not render RED line: ${result.bankEntryMarkers.red}`);
    assert.ok(result.bankExitMarkers.red > 100, `Bank exit must render RED line: ${result.bankExitMarkers.red}`);
    assert.equal(result.bankExitMarkers.blue, 0, `Bank exit must not render BLUE line: ${result.bankExitMarkers.blue}`);

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const base = debug.getState();
      const parts = [
        { id:'up-1', type:'bank20', x:138.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', bankRole:'entry', colorKey:'default', zMm:0, zOrder:1 },
        { id:'up-2', type:'bank20', x:161.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', bankRole:'entry', colorKey:'default', zMm:0, zOrder:2 },
        { id:'up-3', type:'bank20', x:184.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', bankRole:'entry', colorKey:'default', zMm:0, zOrder:3 },
        { id:'up-4', type:'bank20', x:207.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', bankRole:'entry', colorKey:'default', zMm:0, zOrder:4 },
        { id:'banked-corner', type:'corner-45-right', x:246, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'default', zMm:0, zOrder:5 },
        { id:'banked-straight', type:'straight', x:300, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'blue', zMm:0, zOrder:6 },
        { id:'down-1', type:'bank20', x:338.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', bankRole:'exit', colorKey:'default', zMm:0, zOrder:7 },
        { id:'down-2', type:'bank20', x:361.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', bankRole:'exit', colorKey:'default', zMm:0, zOrder:8 },
        { id:'down-3', type:'bank20', x:384.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', bankRole:'exit', colorKey:'default', zMm:0, zOrder:9 },
        { id:'down-4', type:'bank20', x:407.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', bankRole:'exit', colorKey:'default', zMm:0, zOrder:10 }
      ];
      const connections = [
        ['start','b','up-1','a'],
        ['up-1','b','up-2','a'],
        ['up-2','b','up-3','a'],
        ['up-3','b','up-4','a'],
        ['up-4','b','banked-corner','a'],
        ['banked-corner','b','banked-straight','a'],
        ['banked-straight','b','down-1','b'],
        ['down-1','a','down-2','b'],
        ['down-2','a','down-3','b'],
        ['down-3','a','down-4','b']
      ].map((edge, index) => ({
        partAId:edge[0], connectorAId:edge[1], partBId:edge[2], connectorBId:edge[3], createdOrder:index + 1
      }));
      debug.loadState({
        ...base,
        field:{ ...base.field, originX:0, originY:0, widthCm:560, heightCm:240, gridCm:10 },
        start:{ id:'start', type:'start', x:100, y:120, rotation:0, zMm:0, pitchDeg:0, bankAngleDeg:0, zOrder:0, colorKey:'default' },
        parts,
        connections,
        activeConnection:null,
        selectedType:'straight',
        rotation:0
      });
    });

    const propagated = await page.evaluate(() => {
      const state = window.__mini4wdCourseDebug.getState();
      const runtime = window.__mini4wdCourseDebug.getRuntimeState();
      return {
        parts:Object.fromEntries(state.parts.map(part => [part.id, {
          bankAngleDeg:part.bankAngleDeg,
          endpointAngles:(part.endpointStates || []).map(endpoint => endpoint.bankAngle)
        }])),
        bankWarnings:runtime.bankWarnings
      };
    });

    assert.deepEqual(propagated.parts['up-1'].endpointAngles, [0,20]);
    assert.deepEqual(propagated.parts['up-2'].endpointAngles, [20,40]);
    assert.deepEqual(propagated.parts['up-3'].endpointAngles, [40,60]);
    assert.deepEqual(propagated.parts['up-4'].endpointAngles, [60,80]);
    assert.equal(propagated.parts['banked-corner'].bankAngleDeg, 80);
    assert.deepEqual(propagated.parts['banked-corner'].endpointAngles, [80,80]);
    assert.equal(propagated.parts['banked-straight'].bankAngleDeg, 80);
    assert.deepEqual(propagated.parts['down-1'].endpointAngles, [60,80]);
    assert.deepEqual(propagated.parts['down-2'].endpointAngles, [40,60]);
    assert.deepEqual(propagated.parts['down-3'].endpointAngles, [20,40]);
    assert.deepEqual(propagated.parts['down-4'].endpointAngles, [0,20]);
    assert.deepEqual(propagated.bankWarnings, []);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log('✓ bank state still propagates 0→20→40→60→80° and unwinds without changing LAYOUT footprint');
    console.log('✓ straight and 45° corner plan shapes remain identical at 0/20/40/60/80°');
    console.log('✓ Bank20 remains a rectangular 22cm × 36cm plan footprint');
    console.log('✓ bank entrance is BLUE only; bank exit is RED only');
    console.log('✓ Slope remains LOW=blue and HIGH=red');
    console.log('✓ cumulative bank plan-view browser rehearsal passed');
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
