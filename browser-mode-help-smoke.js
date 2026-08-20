'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 8000;

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required for browser smoke tests');

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1288, height: 720 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForFunction(() => {
      const instruction = document.querySelector('#instruction');
      return instruction?.parentElement?.id === 'canvasToolbar'
        && instruction.classList.contains('toolbar-mode-help');
    }, { timeout: TIMEOUT });

    const geometry = await page.evaluate(() => {
      const toolbar = document.querySelector('#canvasToolbar');
      const instruction = document.querySelector('#instruction');
      const canvas = document.querySelector('#courseCanvas');
      const style = getComputedStyle(instruction);
      const toolbarRect = toolbar.getBoundingClientRect();
      const instructionRect = instruction.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        parentId: instruction.parentElement?.id || '',
        position: style.position,
        boxShadow: style.boxShadow,
        backgroundColor: style.backgroundColor,
        flexDirection: style.flexDirection,
        toolbarTop: toolbarRect.top,
        toolbarBottom: toolbarRect.bottom,
        instructionTop: instructionRect.top,
        instructionBottom: instructionRect.bottom,
        canvasTop: canvasRect.top,
        text: instruction.textContent || ''
      };
    });

    assert.equal(geometry.parentId, 'canvasToolbar');
    assert.equal(geometry.position, 'static');
    assert.equal(geometry.boxShadow, 'none');
    assert.equal(geometry.flexDirection, 'row');
    assert.ok(
      geometry.backgroundColor === 'rgba(0, 0, 0, 0)' || geometry.backgroundColor === 'transparent',
      `mode help background must be transparent, got ${geometry.backgroundColor}`
    );
    assert.ok(geometry.instructionTop >= geometry.toolbarTop - 1, 'mode help must start inside the toolbar');
    assert.ok(geometry.instructionBottom <= geometry.toolbarBottom + 1, 'mode help must end inside the toolbar');
    assert.ok(geometry.instructionBottom <= geometry.canvasTop + 1, 'mode help must not overlap the course canvas');
    assert.match(geometry.text, /スタート|配置|パーツ/);
    console.log('✓ mode instruction is integrated into the canvas toolbar without covering the course');

    await page.evaluate(() => {
      document.querySelector('#subEditModeBar').hidden = false;
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#instruction')).display === 'none', { timeout: TIMEOUT });
    console.log('✓ toolbar mode help remains suppressed while the sub-edit bar is active');

    await page.evaluate(() => {
      document.querySelector('#subEditModeBar').hidden = true;
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#instruction')).display !== 'none', { timeout: TIMEOUT });
    console.log('✓ toolbar mode help returns after the sub-edit bar closes');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    console.log('Browser toolbar mode-help regression test passed.');
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR, 'mode-help-failure.png');
    try {
      await page.screenshot({ path: screenshot, fullPage: true });
      console.error(`Failure screenshot: ${screenshot}`);
    } catch (screenshotError) {
      console.error(`Could not save failure screenshot: ${screenshotError.message}`);
    }
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
