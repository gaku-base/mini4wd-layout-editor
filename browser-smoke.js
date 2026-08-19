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

async function text(locator) {
  return String(await locator.textContent() || '').trim();
}

async function waitStatusCount(page, expected) {
  await page.waitForFunction(expectedCount => {
    const value = document.querySelector('#statusCount')?.textContent || '';
    return value.trim() === String(expectedCount);
  }, expected, { timeout: TIMEOUT });
}

async function waitUnavailableAreaCount(page, expected) {
  await page.waitForFunction(expectedCount => {
    const value = document.querySelector('#subEditObstacleCount')?.textContent || '';
    return value.trim() === `配置済み ${expectedCount}件`;
  }, expected, { timeout: TIMEOUT });
}

async function readCurrentLayout(page) {
  return page.evaluate(() => {
    const key = window.M4WD_LAYOUT_PERSISTENCE?.STORAGE_KEY;
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  });
}

async function readSavedSpaceLibrary(page) {
  return page.evaluate(() => {
    const key = window.M4WD_SAVED_SPACES?.STORAGE_KEY;
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  });
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

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const dialogs = [];

  // Chromium may request /favicon.ico even when the application does not define one.
  // Fulfil only that browser-generated request so real application resource 404s still fail the smoke test.
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('dialog', async dialog => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await waitVisible(page, '#courseCanvas');
    logStep('application boots in Chromium');

    await openSavedSpaceLibrary(page);
    await waitVisible(page, '#createNewSpaceBtn');
    logStep('new layout opens the saved-space library');

    await page.locator('#createNewSpaceBtn').click();
    await waitVisible(page, '#layoutSpacePanel');

    assert.equal(await page.locator('#fieldWidthInput').inputValue(), '5.0');
    assert.equal(await page.locator('#fieldHeightInput').inputValue(), '5.0');
    assert.equal(await page.locator('#gridInput').inputValue(), '10');
    logStep('STEP 1 defaults are 5.0m × 5.0m / 10cm');

    await page.locator('#setupForm').evaluate(form => form.requestSubmit());
    await waitVisible(page, '#subEditModeBar');
    await waitVisible(page, '#spaceSaveControls');
    await waitVisible(page, '#savedSpaceNameInput');
    await waitUnavailableAreaCount(page, 0);
    logStep('STEP 1 advances to STEP 2');

    const canvas = page.locator('#courseCanvas');
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 100 && box.height > 100, 'course canvas has a usable size');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.locator('#addObstacleFromBarBtn').click();
    await waitVisible(page, '#venueAreaCreatePanel');
    assert.equal(await page.locator('#newObstacleWidthInput').inputValue(), '0.40');
    assert.equal(await page.locator('#newObstacleDepthInput').inputValue(), '0.40');
    await page.locator('#newObstacleWidthInput').fill('0.60');
    await page.locator('#newObstacleDepthInput').fill('0.40');
    await page.locator('#startObstaclePlacementBtn').click();
    await page.locator('#venueAreaCreatePanel').waitFor({ state: 'hidden', timeout: TIMEOUT });

    const obstacleX = centerX - Math.min(140, box.width * 0.18);
    const obstacleY = centerY - Math.min(120, box.height * 0.16);
    await page.mouse.move(obstacleX, obstacleY);
    await page.mouse.click(obstacleX, obstacleY);
    await waitVisible(page, '#obstacleEditorPanel');
    await waitUnavailableAreaCount(page, 1);
    assert.equal(await page.locator('#obstacleWidthInput').inputValue(), '0.60');
    assert.equal(await page.locator('#obstacleDepthInput').inputValue(), '0.40');
    logStep('dimension placement creates one unavailable area');

    const obstacleNameInput = page.locator('#obstacleNameInput');
    await obstacleNameInput.fill('Smoke Obstacle');
    await obstacleNameInput.press('Tab');
    await page.waitForFunction(() => document.querySelector('#obstacleNameInput')?.value === 'Smoke Obstacle', { timeout: TIMEOUT });
    logStep('unavailable area name can be edited before locking');

    await page.locator('#obstacleLockedInput').check();
    await page.waitForFunction(() => {
      const ids = ['obstacleNameInput', 'obstacleXInput', 'obstacleYInput', 'obstacleWidthInput', 'obstacleDepthInput', 'obstacleRotationInput', 'rotateObstacleLeftBtn', 'rotateObstacleRightBtn', 'deleteObstacleBtn'];
      return document.querySelector('#obstacleLockedInput')?.checked
        && ids.every(id => document.getElementById(id)?.disabled === true)
        && document.querySelector('#duplicateObstacleBtn')?.disabled === false;
    }, { timeout: TIMEOUT });
    logStep('locked unavailable area disables geometry, name, rotation, and delete controls');

    await page.locator('#duplicateObstacleBtn').click();
    await waitUnavailableAreaCount(page, 2);
    assert.equal(await page.locator('#obstacleLockedInput').isChecked(), false);
    assert.equal(await page.locator('#obstacleNameInput').isDisabled(), false);
    assert.equal(await page.locator('#deleteObstacleBtn').isDisabled(), false);
    logStep('locked unavailable area can be duplicated and the copy is unlocked');

    await page.locator('#deleteObstacleBtn').click();
    await waitUnavailableAreaCount(page, 1);
    logStep('unlocked duplicate can be deleted without removing the locked original');

    await page.locator('#savedSpaceNameInput').fill('Smoke Test Space');
    await page.locator('#saveSpaceAndStartBtn').click();

    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });
    logStep('saved space with unavailable area advances to STEP 3');

    const startBefore = await text(page.locator('#startText'));
    assert.match(startBefore, /未設定/);

    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);

    await page.waitForFunction(() => {
      const value = document.querySelector('#startText')?.textContent || '';
      return value.trim() && !value.includes('未設定');
    }, { timeout: TIMEOUT });
    await waitStatusCount(page, 1);

    const startAfterPlacement = await text(page.locator('#startText'));
    assert.doesNotMatch(startAfterPlacement, /未設定/);
    logStep('Start can be placed and normal course editing begins');

    await page.keyboard.press('1');
    const straightX = centerX + Math.min(100, box.width * 0.12);
    await page.mouse.move(straightX, centerY);
    await page.mouse.click(straightX, centerY);
    await waitStatusCount(page, 2);
    logStep('Straight can be placed after Start');

    await page.locator('#undoBtn').click();
    await waitStatusCount(page, 1);
    logStep('Undo removes the placed Straight');

    await page.locator('#redoBtn').click();
    await waitStatusCount(page, 2);
    logStep('Redo restores the placed Straight');

    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await waitVisible(page, '#courseCanvas');
    const startAfterReload = await text(page.locator('#startText'));
    assert.doesNotMatch(startAfterReload, /未設定/);
    await waitStatusCount(page, 2);

    const currentLayout = await readCurrentLayout(page);
    assert.ok(currentLayout, 'current layout persists in localStorage');
    assert.equal(currentLayout.obstacles?.length, 1);
    assert.equal(currentLayout.obstacles[0].name, 'Smoke Obstacle');
    assert.equal(currentLayout.obstacles[0].locked, true);
    assert.ok(currentLayout.start, 'Start persists after reload');
    assert.equal(currentLayout.parts?.length, 1);
    logStep('course and locked unavailable area restore after reload');

    const savedLibrary = await readSavedSpaceLibrary(page);
    assert.ok(savedLibrary, 'saved-space library persists in localStorage');
    assert.equal(savedLibrary.spaces?.length, 1);
    assert.equal(savedLibrary.spaces[0].name, 'Smoke Test Space');
    assert.equal(savedLibrary.spaces[0].unavailableAreas?.length, 1);
    assert.equal(savedLibrary.spaces[0].unavailableAreas[0].name, 'Smoke Obstacle');
    assert.equal(savedLibrary.spaces[0].unavailableAreas[0].locked, true);

    await openSavedSpaceLibrary(page);
    const savedCard = page.locator('.saved-space-card', { hasText: 'Smoke Test Space' });
    await savedCard.waitFor({ state: 'visible', timeout: TIMEOUT });
    assert.match(await text(savedCard), /設置不可エリア\s*1件/);
    logStep('saved-space library retains one locked unavailable area after reload');

    const startBeforeCancel = await text(page.locator('#startText'));
    const countBeforeCancel = await text(page.locator('#statusCount'));
    await page.locator('#cancelSavedSpaceLibraryBtn').click();
    await page.locator('#savedSpaceLibraryPanel').waitFor({ state: 'hidden', timeout: TIMEOUT });
    const startAfterCancel = await text(page.locator('#startText'));
    const countAfterCancel = await text(page.locator('#statusCount'));
    assert.equal(startAfterCancel, startBeforeCancel);
    assert.equal(countAfterCancel, countBeforeCancel);
    assert.doesNotMatch(startAfterCancel, /未設定/);
    assert.equal(countAfterCancel, '2');
    logStep('cancelling new-layout setup preserves the current course');

    await openSavedSpaceLibrary(page);
    const reusableCard = page.locator('.saved-space-card', { hasText: 'Smoke Test Space' });
    await reusableCard.waitFor({ state: 'visible', timeout: TIMEOUT });
    await reusableCard.getByRole('button', { name: 'このスペースを使う' }).click();

    await page.waitForFunction(() => {
      const bar = document.querySelector('#initialSetupStepBar');
      return bar && !bar.hidden && /STEP\s*3\s*\/\s*3/.test(bar.textContent || '');
    }, { timeout: TIMEOUT });
    assert.match(await text(page.locator('#startText')), /未設定/);
    await waitStatusCount(page, 0);
    logStep('saved space starts a fresh course without carrying Start or course parts');

    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    await page.waitForFunction(() => {
      const value = document.querySelector('#startText')?.textContent || '';
      return value.trim() && !value.includes('未設定');
    }, { timeout: TIMEOUT });
    await waitStatusCount(page, 1);

    const reusedLayout = await readCurrentLayout(page);
    assert.ok(reusedLayout, 'reused saved space persists as the current layout');
    assert.equal(reusedLayout.obstacles?.length, 1);
    assert.equal(reusedLayout.obstacles[0].name, 'Smoke Obstacle');
    assert.equal(reusedLayout.obstacles[0].locked, true);
    assert.ok(reusedLayout.start, 'Start can be placed on a reused saved space');
    assert.equal(reusedLayout.parts?.length, 0);

    const libraryAfterReuse = await readSavedSpaceLibrary(page);
    assert.equal(libraryAfterReuse.spaces?.length, 1);
    assert.equal(libraryAfterReuse.spaces[0].unavailableAreas?.length, 1);
    assert.equal(libraryAfterReuse.spaces[0].unavailableAreas[0].name, 'Smoke Obstacle');
    assert.equal(libraryAfterReuse.spaces[0].unavailableAreas[0].locked, true);
    logStep('reused saved space keeps its unavailable area and leaves the template unchanged');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    logStep('console error / page error = 0');

    console.log(`Browser smoke test passed${dialogs.length ? ` (${dialogs.length} dialog(s) handled)` : ''}.`);
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'failure.png');
    try {
      await page.screenshot({ path: screenshot, fullPage: true });
      console.error(`Failure screenshot: ${screenshot}`);
    } catch (screenshotError) {
      console.error(`Could not save failure screenshot: ${screenshotError.message}`);
    }
    if (pageErrors.length) console.error(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) console.error(`Console errors:\n${consoleErrors.join('\n')}`);
    if (dialogs.length) console.error(`Dialogs:\n${dialogs.join('\n')}`);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
