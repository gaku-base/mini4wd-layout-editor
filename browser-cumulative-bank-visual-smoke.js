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
    console.log('Measured banked straight heights:', JSON.stringify(result.straight));
    console.log('Measured Bank20 edge heights:', JSON.stringify(result.bank));
    for (let index = 1; index < heights.length; index++) {
      assert.ok(heights[index] < heights[index - 1], `visual height must shrink: ${heights.join(' > ')}`);
    }
    for (const angle of [20, 40, 60, 80]) {
      const expected = baseHeight * Math.cos(angle * Math.PI / 180);
      const actual = result.straight[angle].full.height;
      const tolerance = Math.max(12, expected * 0.08);
      assert.ok(Math.abs(actual - expected) <= tolerance, `straight ${angle}° height ${actual} should be near ${expected.toFixed(1)} ± ${tolerance.toFixed(1)}`);
    }

    const bankStages = [0, 20, 40, 60].map(baseAngle => ({
      baseAngle,
      left: result.bank[baseAngle].left.height,
      right: result.bank[baseAngle].right.height
    }));
    for (const stage of bankStages) {
      assert.ok(stage.left > stage.right,
        `Bank20 ${stage.baseAngle}→${stage.baseAngle + 20}° must taper: ${stage.left} > ${stage.right}`);
    }
    for (let index = 1; index < bankStages.length; index++) {
      assert.ok(bankStages[index].left < bankStages[index - 1].left,
        `Bank20 incoming edge must shrink by stage: ${bankStages.map(stage => stage.left).join(' > ')}`);
      assert.ok(bankStages[index].right < bankStages[index - 1].right,
        `Bank20 outgoing edge must shrink by stage: ${bankStages.map(stage => stage.right).join(' > ')}`);
    }

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const base = debug.getState();
      const parts = [
        { id:'up-1', type:'bank20', x:138.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'default', zMm:0, zOrder:1 },
        { id:'up-2', type:'bank20', x:161.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'default', zMm:0, zOrder:2 },
        { id:'up-3', type:'bank20', x:184.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'default', zMm:0, zOrder:3 },
        { id:'up-4', type:'bank20', x:207.5, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'default', zMm:0, zOrder:4 },
        { id:'banked-straight', type:'straight', x:246, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'blue', zMm:0, zOrder:5 },
        { id:'down-1', type:'bank20', x:284.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'default', zMm:0, zOrder:6 },
        { id:'down-2', type:'bank20', x:307.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'default', zMm:0, zOrder:7 },
        { id:'down-3', type:'bank20', x:330.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'default', zMm:0, zOrder:8 },
        { id:'down-4', type:'bank20', x:353.5, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'default', zMm:0, zOrder:9 },
        { id:'flat-straight', type:'straight', x:392, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'red', zMm:0, zOrder:10 }
      ];
      const connections = [
        ['start','b','up-1','a'],
        ['up-1','b','up-2','a'],
        ['up-2','b','up-3','a'],
        ['up-3','b','up-4','a'],
        ['up-4','b','banked-straight','a'],
        ['banked-straight','b','down-1','b'],
        ['down-1','a','down-2','b'],
        ['down-2','a','down-3','b'],
        ['down-3','a','down-4','b'],
        ['down-4','a','flat-straight','a']
      ].map((edge, index) => ({
        partAId:edge[0], connectorAId:edge[1], partBId:edge[2], connectorBId:edge[3], createdOrder:index + 1
      }));
      debug.loadState({
        ...base,
        field:{ ...base.field, originX:0, originY:0, widthCm:520, heightCm:240, gridCm:10 },
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
          bankAngle:part.bankAngle,
          endpointAngles:(part.endpointStates || []).map(endpoint => endpoint.bankAngle)
        }])),
        bankWarnings:runtime.bankWarnings
      };
    });

    assert.deepEqual(propagated.parts['up-1'].endpointAngles, [0,20]);
    assert.deepEqual(propagated.parts['up-2'].endpointAngles, [20,40]);
    assert.deepEqual(propagated.parts['up-3'].endpointAngles, [40,60]);
    assert.deepEqual(propagated.parts['up-4'].endpointAngles, [60,80]);
    assert.equal(propagated.parts['banked-straight'].bankAngleDeg, 80);
    assert.deepEqual(propagated.parts['banked-straight'].endpointAngles, [80,80]);
    assert.deepEqual(propagated.parts['down-1'].endpointAngles, [60,80]);
    assert.deepEqual(propagated.parts['down-2'].endpointAngles, [40,60]);
    assert.deepEqual(propagated.parts['down-3'].endpointAngles, [20,40]);
    assert.deepEqual(propagated.parts['down-4'].endpointAngles, [0,20]);
    assert.equal(propagated.parts['flat-straight'].bankAngleDeg, 0);
    assert.deepEqual(propagated.parts['flat-straight'].endpointAngles, [0,0]);
    assert.deepEqual(propagated.bankWarnings, []);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log('✓ connected Bank20 chain propagates 0→20→40→60→80° and unwinds 80→60→40→20→0°');
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
