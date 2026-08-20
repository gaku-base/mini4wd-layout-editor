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
    return (document.querySelector('#statusCount')?.textContent || '').trim() === String(expectedCount);
  }, expected, { timeout: TIMEOUT });
}

async function openSavedSpaceLibrary(page) {
  const library = page.locator('#savedSpaceLibraryPanel');
  if (!(await library.isVisible())) await page.locator('#newBtn').click();
  await library.waitFor({ state: 'visible', timeout: TIMEOUT });
}

function edgeTouchesStart(edge) {
  return edge?.partAId === 'start' || edge?.partBId === 'start';
}

function courseSnapshot(layout) {
  return {
    parts: (layout?.parts || []).map(part => ({
      id: part.id, type: part.type, x: part.x, y: part.y, zMm: part.zMm, rotation: part.rotation
    })),
    connections: (layout?.connections || []).map(edge => ({
      partAId: edge.partAId, connectorAId: edge.connectorAId,
      partBId: edge.partBId, connectorBId: edge.connectorBId
    }))
  };
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

  // Keep the QA handle visible only inside this Chromium test process.
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
    await page.waitForFunction(() => document.querySelector('#startReplacementSnapGuide'), { timeout: TIMEOUT });

    await openSavedSpaceLibrary(page);
    await page.locator('#createNewSpaceBtn').click();
    await waitVisible(page, '#layoutSpacePanel');
    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await waitVisible(page, '#spaceSaveControls');
    await page.locator('#savedSpaceNameInput').fill('Start Resnap Space');
    await page.locator('#saveSpaceAndStartBtn').click();
    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });

    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox && canvasBox.width > 100 && canvasBox.height > 100);
    const centerX = canvasBox.x + canvasBox.width / 2;
    const centerY = canvasBox.y + canvasBox.height / 2;

    // Build a simple connected course: Start -> Straight -> Straight.
    await page.mouse.click(centerX, centerY);
    await waitStatusCount(page, 1);
    await page.keyboard.press('1');
    await page.mouse.click(centerX + Math.min(90, canvasBox.width * 0.12), centerY);
    await waitStatusCount(page, 2);
    await page.keyboard.press('1');
    await page.mouse.click(centerX + Math.min(170, canvasBox.width * 0.22), centerY);
    await waitStatusCount(page, 3);

    const built = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    assert.ok(built.start && built.parts.length === 2);
    assert.ok(built.connections.length >= 2, 'setup should contain connected course edges');

    // Delete only Start. The rest of the course and its internal connection stay.
    await page.evaluate(() => window.__mini4wdCourseDebug.deleteParts(['start']));
    await waitStatusCount(page, 2);
    const missing = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    assert.equal(missing.start, null);
    assert.equal(missing.connections.some(edge => edgeTouchesStart(edge)), false);
    const missingCourse = courseSnapshot(missing);
    assert.ok(missingCourse.connections.length >= 1, 'internal course connection must survive Start deletion');

    const targetInfo = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      debug.selectPartType('start');
      const runtime = debug.getRuntimeState();
      const layout = debug.getState();
      const graph = window.M4WD_LAYOUT_GRAPH;
      const catalog = window.M4WD_PART_CATALOG;
      const used = new Set();
      for (const edge of runtime.connections || []) {
        used.add(`${edge.partAId}\u0000${edge.connectorAId}`);
        used.add(`${edge.partBId}\u0000${edge.connectorBId}`);
      }
      const targets = (runtime.openConnections || []).filter(endpoint => {
        const partId = endpoint.partId || endpoint.sourceId;
        return !used.has(`${partId}\u0000${endpoint.connectorId}`)
          && Math.abs(Number(endpoint.zMm) || 0) < 0.01
          && Math.abs(Number(endpoint.pitchDeg) || 0) < 0.1
          && Math.abs(Number(endpoint.bankAngleDeg ?? endpoint.connectionState?.bankAngle) || 0) < 0.1;
      });
      if (!targets.length) throw new Error('free flat endpoint not found');
      const target = targets[0];
      const free = {
        id: 'test-start', type: 'start', x: target.x + 27, y: target.y,
        zMm: 0, rotation: 0, pitchDeg: 0, bankAngleDeg: 0, zOrder: 0
      };
      const connectors = graph.connectorsForDefinition(catalog.PARTS.start);
      const candidates = [];
      connectors.forEach((connector, index) => {
        const pose = graph.solveSnapPose(free, connector, {
          ...target,
          partId: target.partId || target.sourceId,
          directionDeg: target.directionDeg ?? target.heading,
          bankAngleDeg: Number(target.bankAngleDeg ?? target.connectionState?.bankAngle) || 0
        });
        const localWorld = graph.worldConnector(pose, connector, index);
        if (graph.connectorCompatible(localWorld, {
          ...target,
          partId: target.partId || target.sourceId,
          directionDeg: target.directionDeg ?? target.heading,
          bankAngleDeg: Number(target.bankAngleDeg ?? target.connectionState?.bankAngle) || 0
        })) candidates.push({ pose, connectorId: connector.id, index });
      });
      if (!candidates.length) throw new Error('compatible Start connector not found');
      const chosen = candidates[0];
      const local = window.M4WD_ROOM_BOUNDARY.worldToScreen({ x: chosen.pose.x, y: chosen.pose.y }, runtime.view);
      const rect = document.querySelector('#courseCanvas').getBoundingClientRect();
      return {
        screen: { x: rect.left + local.x + 5, y: rect.top + local.y },
        target: {
          partId: String(target.partId || target.sourceId),
          connectorId: String(target.connectorId),
          x: Number(target.x), y: Number(target.y)
        }
      };
    });

    await page.mouse.move(targetInfo.screen.x, targetInfo.screen.y);
    await page.waitForFunction(expected => {
      const guide = document.querySelector('#startReplacementSnapGuide');
      return guide?.dataset.snapped === '1'
        && guide.dataset.targetPartId === expected.partId
        && guide.dataset.targetConnectorId === expected.connectorId
        && !guide.hidden;
    }, targetInfo.target, { timeout: TIMEOUT });

    const snappedBeforeClick = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const runtime = debug.getRuntimeState();
      const layout = debug.getState();
      const guide = document.querySelector('#startReplacementSnapGuide');
      return {
        cursor: runtime.cursor,
        rotation: layout.rotation,
        startConnectorId: guide.dataset.startConnectorId,
        targetPartId: guide.dataset.targetPartId,
        targetConnectorId: guide.dataset.targetConnectorId
      };
    });
    assert.ok(snappedBeforeClick.startConnectorId);
    console.log('✓ Start ghost visibly snaps to an unused existing course endpoint');

    await page.mouse.click(targetInfo.screen.x, targetInfo.screen.y);
    await waitStatusCount(page, 3);
    await page.waitForFunction(() => {
      const layout = window.__mini4wdCourseDebug.getState();
      return Boolean(layout.start && layout.connections.some(edge => edge.partAId === 'start' || edge.partBId === 'start'));
    }, { timeout: TIMEOUT });

    const restored = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    assert.ok(restored.start);
    const startEdge = restored.connections.find(edge => edgeTouchesStart(edge));
    assert.ok(startEdge, 'replaced Start must be connected in the layout graph');
    assert.equal(restored.connections.length, missing.connections.length + 1);
    for (const edge of missing.connections) {
      assert.ok(restored.connections.some(candidate =>
        candidate.partAId === edge.partAId && candidate.connectorAId === edge.connectorAId
        && candidate.partBId === edge.partBId && candidate.connectorBId === edge.connectorBId),
      'existing internal connection must be preserved');
    }

    const seam = await page.evaluate(({ target, startConnectorId }) => {
      const layout = window.__mini4wdCourseDebug.getState();
      const graph = window.M4WD_LAYOUT_GRAPH;
      const catalog = window.M4WD_PART_CATALOG;
      const connector = graph.connectorsForDefinition(catalog.PARTS.start)
        .find(item => item.id === startConnectorId);
      const world = graph.worldConnector({ ...layout.start, id: 'start', type: 'start' }, connector);
      return { dx: world.x - target.x, dy: world.y - target.y, zMm: world.zMm };
    }, { target: targetInfo.target, startConnectorId: snappedBeforeClick.startConnectorId });
    assert.ok(Math.hypot(seam.dx, seam.dy) < 1e-6, `Start connector seam must be exact: ${JSON.stringify(seam)}`);
    assert.ok(Math.abs(seam.zMm) < 0.01);
    console.log('✓ replacement commits the exact snapped pose and connection edge');

    // One Undo must remove only the replacement and restore the surviving course.
    await page.locator('#undoBtn').click();
    await waitStatusCount(page, 2);
    const undone = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    assert.equal(undone.start, null);
    assert.deepEqual(courseSnapshot(undone), missingCourse);
    console.log('✓ one Undo restores the exact pre-replacement course');

    await page.locator('#redoBtn').click();
    await waitStatusCount(page, 3);
    const redone = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    assert.ok(redone.start);
    assert.ok(redone.connections.some(edge => edgeTouchesStart(edge)));
    console.log('✓ Redo restores the snapped Start and graph connection');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    console.log('Browser Start replacement snap regression test passed.');
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'start-resnap-failure.png');
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
