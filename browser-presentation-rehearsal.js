'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required for browser smoke tests');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME_BIN, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport:{ width:1600, height:1000 }, acceptDownloads:true });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  await page.addInitScript(() => {
    Object.defineProperty(window, '__mini4wdCourseDebug', {
      configurable:false, enumerable:false, writable:true, value:undefined
    });
  });
  await page.route('**/favicon.ico', route => route.fulfill({status:204,body:''}));
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.accept());

  try {
    await page.goto(BASE_URL, { waitUntil:'networkidle', timeout:20000 });
    await page.waitForFunction(() => typeof window.__mini4wdCourseDebug?.loadState === 'function', {timeout:TIMEOUT});
    await page.waitForFunction(() => window.M4WD_PRESENTATION?.version === 2 && document.querySelector('#presentationBtn'), {timeout:TIMEOUT});

    await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const base = debug.getState();
      debug.loadState({
        ...base,
        field:{ ...base.field, originX:0, originY:0, widthCm:900, heightCm:600, gridCm:10 },
        start:{ id:'start', x:110, y:120, zMm:0, rotation:0, zOrder:1, colorKey:'red' },
        parts:[
          {id:'p1',type:'straight',x:200,y:120,zMm:0,rotation:0,zOrder:2,colorKey:'blue'},
          {id:'p2',type:'corner-45-right',x:290,y:120,zMm:0,rotation:0,zOrder:3,colorKey:'red'},
          {id:'p3',type:'corner-45-left',x:370,y:155,zMm:0,rotation:45,zOrder:4,colorKey:'orange'},
          {id:'p4',type:'lanechange',x:520,y:180,zMm:0,rotation:0,zOrder:5,colorKey:'green'},
          {id:'p5',type:'wave',x:700,y:180,zMm:0,rotation:0,zOrder:6,colorKey:'white'},
          {id:'p6',type:'slope',x:700,y:280,zMm:0,rotation:90,zOrder:7,colorKey:'red'},
          {id:'p7',type:'bank20',x:600,y:350,zMm:0,rotation:0,zOrder:8,colorKey:'blue',bankRole:'entry'},
          {id:'p8',type:'lcjump',x:480,y:420,zMm:0,rotation:45,zOrder:9,colorKey:'orange'},
          {id:'p9',type:'burning',x:250,y:410,zMm:0,rotation:0,zOrder:10,colorKey:'green'}
        ],
        connections:[], activeConnection:null, selectedType:'straight', rotation:0
      });
      const setupDialog = document.querySelector('#setupDialog');
      if (setupDialog?.open) setupDialog.close();
    });
    await page.waitForFunction(() => !document.querySelector('#setupDialog')?.open, {timeout:TIMEOUT});

    const stateBefore = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    await page.locator('#presentationBtn').click();
    await page.locator('#presentationView').waitFor({state:'visible',timeout:TIMEOUT});
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getDiagnostics()?.render?.courseGridCm === 100, {timeout:TIMEOUT});
    console.log('✓ presentation view opens with a real 1m Grid on white');

    await page.locator('#presentationEventName1').fill('第19回');
    await page.locator('#presentationEventName2').fill('テストミニ四駆大会');
    let diagnostics = await page.evaluate(() => window.M4WD_PRESENTATION.getDiagnostics());
    assert.equal(diagnostics.metadata.eventNameLine1, '第19回');
    assert.equal(diagnostics.metadata.eventNameLine2, 'テストミニ四駆大会');
    assert.equal(diagnostics.metadata.layouterName, '');
    assert.equal(diagnostics.totalParts, 10);
    assert.deepEqual(diagnostics.counts.map(item => [item.key,item.count]), [
      ['start',1],['straight',1],['corner45',2],['lanechange',1],['wave',1],['slope',1],['bank20',1],['lcjump',1],['burning',1]
    ]);
    assert.equal(diagnostics.length.available, true);
    assert.ok(diagnostics.length.totalM > 0);
    console.log('✓ two-line tournament name, optional layouter, counts and total length are correct');

    await page.locator('#presentationLayouter').fill('GAKU');
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getMetadata().layouterName === 'GAKU');
    diagnostics = await page.evaluate(() => window.M4WD_PRESENTATION.getDiagnostics());
    assert.equal(diagnostics.metadata.layouterName, 'GAKU');
    console.log('✓ layouter is included only after input');

    const colorCoverage = await page.evaluate(() => {
      const canvas = document.querySelector('#presentationCanvas');
      const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      const targets = { red:[223,37,45], blue:[8,127,194], orange:[244,180,43], green:[53,189,139] };
      const counts = Object.fromEntries(Object.keys(targets).map(key => [key,0]));
      for (let i=0;i<data.length;i+=16) {
        for (const [key,rgb] of Object.entries(targets)) {
          if (data[i]===rgb[0] && data[i+1]===rgb[1] && data[i+2]===rgb[2] && data[i+3]===255) counts[key] += 1;
        }
      }
      return counts;
    });
    for (const [color,count] of Object.entries(colorCoverage)) assert.ok(count > 10, `${color} presentation pixels missing: ${count}`);
    console.log('✓ editor part colors are preserved in the flat presentation plan');

    await page.locator('#presentationBgWhite').click();
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getDiagnostics().background === 'white');
    assert.equal((await page.evaluate(() => window.M4WD_PRESENTATION.getDiagnostics())).render.courseGridCm, null);
    await page.locator('#presentationBgTransparent').click();
    const transparentAlpha = await page.evaluate(() => {
      const {canvas} = window.M4WD_PRESENTATION.composeForTest({background:'transparent',width:900,height:636});
      return canvas.getContext('2d').getImageData(0,0,1,1).data[3];
    });
    assert.equal(transparentAlpha, 0, 'transparent output must have real alpha=0 background');
    await page.locator('#presentationBgGrid').click();
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getDiagnostics().render.courseGridCm === 100);
    console.log('✓ Grid / White / Transparent backgrounds switch correctly, including real alpha transparency');

    const a4 = await page.evaluate(() => {
      const result = window.M4WD_PRESENTATION.composeForTest({background:'grid',orientation:'auto',dpi:300});
      return { width:result.canvas.width, height:result.canvas.height, orientation:result.diagnostics.orientation, gridCm:result.diagnostics.courseDiagnostics.gridCm };
    });
    assert.deepEqual(a4, {width:3508,height:2480,orientation:'landscape',gridCm:100});
    console.log('✓ high-resolution PNG composition is A4 300dpi and keeps the 1m grid');

    const pngDownloadPromise = page.waitForEvent('download', {timeout:TIMEOUT});
    await page.locator('#presentationPngBtn').click();
    const pngDownload = await pngDownloadPromise;
    assert.match(pngDownload.suggestedFilename(), /第19回_テストミニ四駆大会_レイアウト\.png$/);
    const pngPath = await pngDownload.path();
    assert.ok(pngPath && fs.statSync(pngPath).size > 20000, 'high-resolution PNG download should contain rendered image data');
    console.log('✓ PNG download completes with a safe tournament-based filename');

    await page.locator('#presentationOrientationPortrait').click();
    await page.evaluate(() => { window.__presentationPrintCalled = false; window.print = () => { window.__presentationPrintCalled = true; }; });
    await page.locator('#presentationPrintBtn').click();
    await page.waitForFunction(() => window.__presentationPrintCalled === true, {timeout:TIMEOUT});
    const printState = await page.evaluate(() => ({
      rule:document.querySelector('#presentationDynamicPageRule')?.textContent || '',
      image:document.querySelector('#presentationPrintImage')?.src || '',
      orientation:document.body.dataset.presentationPrintOrientation
    }));
    assert.equal(printState.rule, '@page { size: A4 portrait; margin: 10mm; }');
    assert.equal(printState.orientation, 'portrait');
    assert.match(printState.image, /^data:image\/png;base64,/);
    console.log('✓ A4 portrait print prepares a one-page image and explicit 10mm page margins');

    const jsonDownloadPromise = page.waitForEvent('download', {timeout:TIMEOUT});
    await page.locator('#saveBtn').evaluate(button => button.click());
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = await jsonDownload.path();
    const saved = JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    assert.deepEqual(saved.presentation, {eventNameLine1:'第19回',eventNameLine2:'テストミニ四駆大会',layouterName:'GAKU'});
    assert.equal(saved.parts.length, stateBefore.parts.length);
    console.log('✓ normal JSON save carries presentation metadata without changing the course schema');

    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(100);
    const mobile = await page.evaluate(() => ({
      scrollWidth:document.documentElement.scrollWidth,
      innerWidth:window.innerWidth,
      viewVisible:!document.querySelector('#presentationView').hidden
    }));
    assert.equal(mobile.viewVisible,true);
    assert.ok(mobile.scrollWidth <= mobile.innerWidth + 2, `mobile presentation must not overflow page: ${JSON.stringify(mobile)}`);
    await page.setViewportSize({width:1600,height:1000});
    await page.waitForTimeout(100);
    await page.screenshot({path:path.join(ARTIFACT_DIR,'presentation-rehearsal-preview.png'),fullPage:true});
    console.log('✓ presentation view remains usable at iPhone-class viewport width');

    await page.locator('#presentationBackBtn').click();
    await page.locator('#presentationView').waitFor({state:'hidden',timeout:TIMEOUT});
    const stateAfter = await page.evaluate(() => window.__mini4wdCourseDebug.getState());
    assert.deepEqual(stateAfter, stateBefore, 'presentation workflow must not mutate editor state or Undo/Redo snapshots');
    console.log('✓ returning to edit preserves the complete editor state');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`);
    await page.screenshot({path:path.join(ARTIFACT_DIR,'presentation-rehearsal-success.png'),fullPage:true});
    console.log('Presentation mode full rehearsal passed: ALL GREEN.');
  } catch (error) {
    const screenshot = path.join(ARTIFACT_DIR,'presentation-rehearsal-failure.png');
    try { await page.screenshot({path:screenshot,fullPage:true}); } catch (_) {}
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
