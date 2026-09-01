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
  const browser = await chromium.launch({ executablePath:CHROME_BIN, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport:{ width:1600, height:1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.accept());
  await page.route('**/favicon.ico', route => route.fulfill({status:204,body:''}));

  try {
    await page.goto(BASE_URL, { waitUntil:'networkidle', timeout:20000 });
    await page.waitForFunction(() => document.documentElement.dataset.uiControlsCleanupInstalled === '1', {timeout:TIMEOUT});
    await page.waitForFunction(() => document.querySelector('#presentationBtn')?.textContent?.includes('発表・出力'), {timeout:TIMEOUT});
    await page.evaluate(() => {
      const setupDialog = document.querySelector('#setupDialog');
      if (setupDialog?.open) setupDialog.close();
    });
    await page.waitForFunction(() => !document.querySelector('#setupDialog')?.open, {timeout:TIMEOUT});

    const top = await page.evaluate(() => ({
      newText:document.querySelector('#newBtn')?.textContent?.trim(),
      saveText:document.querySelector('#saveBtn')?.textContent?.trim(),
      loadText:document.querySelector('#loadInput')?.closest('label')?.textContent?.trim(),
      presentationText:document.querySelector('#presentationBtn')?.textContent?.trim(),
      legacyHidden:getComputedStyle(document.querySelector('#exportBtn')).display === 'none'
    }));
    assert.equal(top.newText, '＋ 新規作成');
    assert.equal(top.saveText, '💾 レイアウト保存');
    assert.equal(top.loadText, '📂 レイアウト読込');
    assert.equal(top.presentationText, '▣ 発表・出力');
    assert.equal(top.legacyHidden, true);
    console.log('✓ top actions are consolidated into four clear user-facing controls');

    const editor = await page.evaluate(() => ({
      undo:document.querySelector('#undoBtn')?.textContent?.trim(),
      redo:document.querySelector('#redoBtn')?.textContent?.trim(),
      rewind:document.querySelector('#rewindBtn')?.textContent?.trim(),
      left:document.querySelector('#rotateLeftBtn')?.textContent?.trim(),
      right:document.querySelector('#rotateRightBtn')?.textContent?.trim(),
      details:document.querySelector('#detailsToggleBtn')?.textContent?.trim(),
      more:document.querySelector('#simpleToolbarMoreBtn')?.textContent?.trim(),
      trash:document.querySelector('#dragTrashLabel')?.textContent?.trim()
    }));
    assert.deepEqual(editor, {
      undo:'↶ 元に戻す', redo:'↷ やり直す', rewind:'↩ 1パーツ戻る',
      left:'↺ 左回転', right:'↻ 右回転', details:'ⓘ 詳細', more:'⋯ 表示・配置', trash:'削除'
    });
    console.log('✓ history, placement and action buttons use clear icon-plus-text labels');

    await page.locator('#simpleToolbarMoreBtn').click();
    await page.locator('#simpleToolbarMoreMenu').waitFor({state:'visible',timeout:TIMEOUT});
    const overflow = await page.locator('#simpleToolbarMoreMenu button').allTextContents();
    assert.deepEqual(overflow.map(text => text.trim()), [
      '▦ グリッド表示',
      '⊙ コース全体を表示',
      '✥ コース全体を移動',
      '↖ コースを左上へ整列',
      '⤢ 作成範囲をコースに合わせる'
    ]);
    console.log('✓ display and placement utilities are consolidated into one menu');

    await page.locator('#presentationBtn').click();
    await page.locator('#presentationView').waitFor({state:'visible',timeout:TIMEOUT});
    await page.waitForFunction(() => document.querySelector('#presentationCourseOnlyPngBtn'), {timeout:TIMEOUT});
    const outputs = await page.evaluate(() => ({
      png:document.querySelector('#presentationPngBtn')?.textContent?.trim(),
      print:document.querySelector('#presentationPrintBtn')?.textContent?.trim(),
      courseOnly:document.querySelector('#presentationCourseOnlyPngBtn')?.textContent?.trim()
    }));
    assert.deepEqual(outputs, {
      png:'PNG画像を保存', print:'A4で印刷', courseOnly:'コース図のみ保存'
    });

    const bridgeWorked = await page.evaluate(() => {
      const legacy = document.querySelector('#exportBtn');
      const courseOnly = document.querySelector('#presentationCourseOnlyPngBtn');
      let clicked = 0;
      legacy.click = () => { clicked += 1; };
      courseOnly.click();
      return clicked;
    });
    assert.equal(bridgeWorked, 1);
    console.log('✓ legacy course-only PNG remains available inside 発表・出力');

    await page.locator('#presentationBackBtn').click();
    await page.locator('#presentationView').waitFor({state:'hidden',timeout:TIMEOUT});
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(100);
    const phone = await page.evaluate(() => {
      const visible = selector => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const canvas = document.querySelector('#courseCanvas')?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        newButtonVisible: visible('#newBtn'),
        trashVisible: visible('#dragTrash'),
        moreVisible: visible('#simpleToolbarMoreBtn'),
        canvasVisible: visible('#courseCanvas'),
        canvasWidth: canvas?.width || 0
      };
    });
    assert.equal(phone.innerWidth, 390);
    assert.equal(phone.horizontalOverflow, false, '390px editor must not create page-level horizontal overflow');
    assert.equal(phone.newButtonVisible, true, 'new-layout control remains available at phone width');
    assert.equal(phone.trashVisible, true, 'toolbar trash remains available at phone width');
    assert.equal(phone.moreVisible, true, 'overflow controls remain available at phone width');
    assert.equal(phone.canvasVisible, true, 'course canvas remains visible at phone width');
    assert.ok(phone.canvasWidth >= 300 && phone.canvasWidth <= 390, `phone canvas width is usable: ${phone.canvasWidth}`);
    console.log('✓ general editor remains usable without page overflow at 390×844');

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log('Browser UI controls cleanup smoke test passed.');
  } catch (error) {
    try { await page.screenshot({path:`${ARTIFACT_DIR}/ui-controls-failure.png`,fullPage:true}); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
