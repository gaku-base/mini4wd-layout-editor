'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 8000;

function logStep(message) {
  console.log(`✓ ${message}`);
}

async function waitVisible(page, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: TIMEOUT });
  return locator;
}

async function waitStatusCount(page, expected) {
  await page.waitForFunction(expectedCount => {
    const value = document.querySelector('#statusCount')?.textContent || '';
    return value.trim() === String(expectedCount);
  }, expected, { timeout: TIMEOUT });
}

async function readCurrentLayout(page) {
  return page.evaluate(() => {
    const key = window.M4WD_LAYOUT_PERSISTENCE?.STORAGE_KEY;
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  });
}

async function readSelectedIds(page) {
  return page.evaluate(() => {
    const raw = document.querySelector('#simpleUiSelectionIdentity')?.dataset.selectedIds || '[]';
    try {
      const ids = JSON.parse(raw);
      return Array.isArray(ids) ? ids : [];
    } catch (_) {
      return [];
    }
  });
}

async function waitSelectedIds(page, expectedIds) {
  const expected = [...expectedIds].map(String).sort();
  await page.waitForFunction(expectedSelection => {
    const raw = document.querySelector('#simpleUiSelectionIdentity')?.dataset.selectedIds || '[]';
    try {
      const actual = JSON.parse(raw);
      if (!Array.isArray(actual)) return false;
      return JSON.stringify([...actual].map(String).sort()) === JSON.stringify(expectedSelection);
    } catch (_) {
      return false;
    }
  }, expected, { timeout: TIMEOUT });
  assert.deepEqual((await readSelectedIds(page)).map(String).sort(), expected);
}

function fitViewScreenPoint(canvasBox, field, point) {
  const margin = 42;
  const widthCm = Number(field?.widthCm) || 1;
  const heightCm = Number(field?.heightCm) || 1;
  const originX = Number(field?.originX) || 0;
  const originY = Number(field?.originY) || 0;
  const scale = Math.min(
    (canvasBox.width - margin * 2) / widthCm,
    (canvasBox.height - margin * 2) / heightCm
  );
  const offsetX = (canvasBox.width - widthCm * scale) / 2 - originX * scale;
  const offsetY = (canvasBox.height - heightCm * scale) / 2 - originY * scale;
  return {
    x: canvasBox.x + offsetX + Number(point?.x || 0) * scale,
    y: canvasBox.y + offsetY + Number(point?.y || 0) * scale
  };
}

function coordinateSnapshot(layout) {
  const rows = [];
  if (layout?.start) {
    rows.push({ role: 'start', id: layout.start.id, x: layout.start.x, y: layout.start.y });
  }
  for (const part of layout?.parts || []) {
    rows.push({ role: 'part', id: part.id, x: part.x, y: part.y });
  }
  return rows.sort((a, b) => `${a.role}:${a.id}`.localeCompare(`${b.role}:${b.id}`));
}

async function dragPointToTrash(page, from, trashBox) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.move(
    trashBox.x + trashBox.width / 2,
    trashBox.y + trashBox.height / 2,
    { steps: 8 }
  );
  await page.mouse.up();
}

async function marqueeSelectWholeCanvas(page, canvasBox) {
  const inset = 8;
  await page.mouse.move(canvasBox.x + inset, canvasBox.y + inset);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width - inset,
    canvasBox.y + canvasBox.height - inset,
    { steps: 12 }
  );
  await page.mouse.up();
}

async function openSavedSpaceLibrary(page) {
  const library = page.locator('#savedSpaceLibraryPanel');
  if (!(await library.isVisible())) {
    await page.locator('#newBtn').click();
  }
  await library.waitFor({ state: 'visible', timeout: TIMEOUT });
  return library;
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

  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('dialog', async dialog => dialog.accept());

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    const canvas = await waitVisible(page, '#courseCanvas');

    await openSavedSpaceLibrary(page);
    await page.locator('#createNewSpaceBtn').click();
    await waitVisible(page, '#layoutSpacePanel');
    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await waitVisible(page, '#spaceSaveControls');
    await page.locator('#savedSpaceNameInput').fill('Trash Regression Space');
    await page.locator('#saveSpaceAndStartBtn').click();
    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });

    const initialCanvasBox = await canvas.boundingBox();
    assert.ok(initialCanvasBox && initialCanvasBox.width > 100 && initialCanvasBox.height > 100);
    const centerX = initialCanvasBox.x + initialCanvasBox.width / 2;
    const centerY = initialCanvasBox.y + initialCanvasBox.height / 2;

    await page.mouse.click(centerX, centerY);
    await waitStatusCount(page, 1);

    await page.keyboard.press('1');
    await page.mouse.click(centerX + Math.min(120, initialCanvasBox.width * 0.14), centerY);
    await waitStatusCount(page, 2);
    await page.keyboard.press('1');
    await page.mouse.click(centerX - Math.min(120, initialCanvasBox.width * 0.14), centerY + Math.min(110, initialCanvasBox.height * 0.14));
    await waitStatusCount(page, 3);
    logStep('Start and two course parts are available for trash regression tests');

    await page.keyboard.press('q');
    await page.waitForFunction(() => /パーツ移動/.test(document.querySelector('#statusMode')?.textContent || ''), { timeout: TIMEOUT });
    const trash = page.locator('#dragTrash');
    await trash.waitFor({ state: 'visible', timeout: TIMEOUT });
    const trashBox = await trash.boundingBox();
    assert.ok(trashBox && trashBox.width >= 30 && trashBox.height >= 28);

    const beforeSingleTrash = await readCurrentLayout(page);
    const beforeSingleCoordinates = coordinateSnapshot(beforeSingleTrash);
    assert.ok(beforeSingleTrash?.start && beforeSingleTrash?.parts?.length === 2);
    const singleCanvasBox = await canvas.boundingBox();
    assert.ok(singleCanvasBox);
    const startPoint = fitViewScreenPoint(singleCanvasBox, beforeSingleTrash.field, beforeSingleTrash.start);

    await dragPointToTrash(page, startPoint, trashBox);
    await waitStatusCount(page, 2);
    const afterSingleDelete = await readCurrentLayout(page);
    assert.equal(afterSingleDelete?.start, null);

    await page.locator('#undoBtn').click();
    await waitStatusCount(page, 3);
    const afterSingleUndo = await readCurrentLayout(page);
    assert.deepEqual(
      coordinateSnapshot(afterSingleUndo),
      beforeSingleCoordinates,
      'Undo after drag-to-trash must restore every X/Y coordinate exactly'
    );
    logStep('one Undo restores the exact pre-drag X/Y coordinates');

    const beforeMultiTrash = await readCurrentLayout(page);
    assert.ok(beforeMultiTrash?.start && beforeMultiTrash?.parts?.length === 2);
    const beforeMultiCoordinates = coordinateSnapshot(beforeMultiTrash);
    const multiCanvasBox = await canvas.boundingBox();
    assert.ok(multiCanvasBox);
    const expectedSelectedIds = [
      beforeMultiTrash.start.id,
      ...beforeMultiTrash.parts.map(part => part.id)
    ].map(String).sort();

    await marqueeSelectWholeCanvas(page, multiCanvasBox);
    await waitSelectedIds(page, expectedSelectedIds);
    logStep('Start and both regular parts can be marquee-selected together in move mode');

    const selectedStartPoint = fitViewScreenPoint(multiCanvasBox, beforeMultiTrash.field, beforeMultiTrash.start);
    await dragPointToTrash(page, selectedStartPoint, trashBox);
    await waitStatusCount(page, 0);
    const afterMultiDelete = await readCurrentLayout(page);
    assert.equal(afterMultiDelete?.start, null, 'selected Start must be deleted with the selection');
    assert.equal(afterMultiDelete?.parts?.length, 0, 'both selected regular parts must be deleted with the selection');
    logStep('dragging one selected object to trash deletes the full three-object selection');

    await page.locator('#undoBtn').click();
    await waitStatusCount(page, 3);
    const afterMultiUndo = await readCurrentLayout(page);
    assert.ok(afterMultiUndo?.start, 'Start must be restored by one Undo');
    assert.equal(afterMultiUndo?.parts?.length, 2, 'both regular parts must be restored by one Undo');
    assert.deepEqual(
      coordinateSnapshot(afterMultiUndo),
      beforeMultiCoordinates,
      'one Undo after multi-selection trash must restore every selected object at exact coordinates'
    );
    logStep('one Undo restores the full multi-selection at exact original coordinates');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    console.log('Browser trash regression test passed.');
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'trash-failure.png');
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
