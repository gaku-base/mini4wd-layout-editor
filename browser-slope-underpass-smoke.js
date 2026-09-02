'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';

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
    await page.evaluate(() => document.querySelector('#setupDialog')?.close());

    const result = await page.evaluate(() => {
      const graph = window.M4WD_LAYOUT_GRAPH;
      const catalog = window.M4WD_PART_CATALOG?.PARTS;
      if (!graph || !catalog) throw new Error('layout graph/catalog unavailable');

      const part = (id, type, x, y, rotation = 0, zMm = 0) => ({
        id, type, x, y, rotation, zMm, pitchDeg: 0, bankAngleDeg: 0
      });
      const slope = part('slope', 'slope', 0, 0, 0, 0);
      const boundsForPart = value => graph.polygonBounds(graph.occupancyPolygon(value, catalog[value.type]));
      const warningsFor = lower => graph.interferenceWarnings(
        [slope, lower],
        catalog,
        boundsForPart,
        { edges: [] }
      );
      const summarize = lower => warningsFor(lower).map(warning => ({
        type: warning.type,
        underpassStatus: warning.slopeUnderpass?.status || null,
        blockedThroughXMm: warning.slopeUnderpass?.blockedThroughXMm ?? null,
        overlapMinXMm: warning.slopeUnderpass?.overlapMinXMm ?? null
      }));

      return {
        runtimeWrapped: Boolean(graph.__m4wdSlopeUnderpassRuntimeWrapped),
        straightLow: summarize(part('straight-low', 'straight', 0, 0, 90)),
        straightHigh: summarize(part('straight-high', 'straight', 20, 0, 90)),
        straightBoundary: summarize(part('straight-boundary', 'straight', 18.2, 0, 90)),
        straightBeyond: summarize(part('straight-beyond', 'straight', 18.2001, 0, 90)),
        diagonalLow: summarize(part('diagonal-low', 'straight', 30, 0, 45)),
        diagonalHigh: summarize(part('diagonal-high', 'straight', 35, 0, 45)),
        cornerLow: summarize(part('corner-low', 'corner-45-right', 0, 0, 0)),
        cornerHigh: summarize(part('corner-high', 'corner-45-right', 40, 0, 0))
      };
    });

    const assertBlocked = (warnings, label) => {
      assert.equal(warnings.length, 1, `${label}: blocked crossing must keep one warning`);
      assert.equal(warnings[0].type, 'interference', `${label}: warning type`);
      assert.equal(warnings[0].underpassStatus, 'blocked-underpass', `${label}: slope underpass status`);
      assert.equal(warnings[0].blockedThroughXMm, 272, `${label}: approved boundary`);
      assert.ok(warnings[0].overlapMinXMm <= 272, `${label}: overlap must enter blocked zone`);
    };
    const assertClear = (warnings, label) => {
      assert.equal(warnings.length, 0, `${label}: approved high-side underpass must suppress interference warning`);
    };

    assert.equal(result.runtimeWrapped, true, 'browser must use the installed slope-underpass runtime wrapper');
    assertBlocked(result.straightLow, 'straight low-side');
    assertClear(result.straightHigh, 'straight high-side');
    assertBlocked(result.straightBoundary, 'straight X=272mm boundary');
    assertClear(result.straightBeyond, 'straight just beyond X=272mm');
    assertBlocked(result.diagonalLow, '45deg diagonal entering blocked zone');
    assertClear(result.diagonalHigh, '45deg diagonal wholly on high side');
    assertBlocked(result.cornerLow, '45deg corner low-side');
    assertClear(result.cornerHigh, '45deg corner high-side');

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log('✓ slope underpass browser regression: low/boundary/diagonal/corner cases passed');
    console.log('Browser slope underpass smoke test passed.');
  } catch (error) {
    try {
      await page.screenshot({ path: `${ARTIFACT_DIR}/slope-underpass-failure.png`, fullPage: true });
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
