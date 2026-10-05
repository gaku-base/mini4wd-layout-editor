'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;
const VIEWPORTS = [
  {width:390,height:844},
  {width:430,height:932},
  {width:480,height:900}
];

async function visible(page, selector) {
  return page.locator(selector).evaluate(el => {
    const r=el.getBoundingClientRect(), s=getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1;
  });
}

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');
  fs.mkdirSync(ARTIFACT_DIR,{recursive:true});
  const browser=await chromium.launch({executablePath:CHROME_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:VIEWPORTS[0]});
  const page=await context.newPage();
  const pageErrors=[];
  const consoleErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text());});
  page.on('dialog',async d=>d.dismiss());
  await page.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));

  try {
    await page.goto(BASE_URL,{waitUntil:'networkidle',timeout:20000});
    await page.waitForFunction(()=>document.documentElement.dataset.uiControlsCleanupInstalled==='1',{timeout:TIMEOUT});
    await page.evaluate(()=>{const d=document.querySelector('#setupDialog'); if(d?.open)d.close();});

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(140);
      const metrics=await page.evaluate(() => {
        const topbar=document.querySelector('.topbar').getBoundingClientRect();
        const toolbar=document.querySelector('#canvasToolbar').getBoundingClientRect();
        const canvas=document.querySelector('#courseCanvas').getBoundingClientRect();
        return {
          width:innerWidth,
          topbarHeight:topbar.height,
          toolbarHeight:toolbar.height,
          chromeHeight:toolbar.bottom,
          canvasTop:canvas.top,
          pageHorizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });
      assert.equal(metrics.pageHorizontalOverflow,false,`${viewport.width}: no page horizontal overflow`);
      assert.ok(metrics.topbarHeight <= 90,`${viewport.width}: topbar compact enough: ${metrics.topbarHeight}`);
      assert.ok(metrics.toolbarHeight <= 105,`${viewport.width}: toolbar compact enough: ${metrics.toolbarHeight}`);
      assert.ok(metrics.chromeHeight <= 195,`${viewport.width}: combined chrome compact enough: ${metrics.chromeHeight}`);
      assert.ok(metrics.canvasTop <= 195,`${viewport.width}: canvas starts early enough: ${metrics.canvasTop}`);

      for (const selector of ['#newBtn','#layoutTabBtn','#outputTabBtn','#undoBtn','#redoBtn','#rewindBtn','#rotateLeftBtn','#rotateRightBtn','#dragTrash','#detailsToggleBtn','#simpleToolbarMoreBtn','#courseCanvas']) {
        assert.equal(await visible(page,selector),true,`${viewport.width}: ${selector} remains visible`);
      }

      await page.locator('#detailsToggleBtn').click();
      await page.waitForTimeout(220);
      const drawer=await page.evaluate(() => {
        const d=document.querySelector('.right-sidebar').getBoundingClientRect();
        const t=document.querySelector('#canvasToolbar').getBoundingClientRect();
        return {right:d.right,top:d.top,toolbarBottom:t.bottom,innerWidth};
      });
      assert.ok(drawer.right <= drawer.innerWidth + 1,`${viewport.width}: Details drawer inside viewport`);
      assert.ok(drawer.top >= drawer.toolbarBottom - 1,`${viewport.width}: Details drawer below toolbar`);
      await page.locator('.simple-drawer-close').click();

      console.log(`✓ compact phone LAYOUT chrome ${viewport.width}px: top=${metrics.topbarHeight.toFixed(1)} toolbar=${metrics.toolbarHeight.toFixed(1)} combined=${metrics.chromeHeight.toFixed(1)}`);
    }

    await page.setViewportSize({width:720,height:844});
    await page.waitForTimeout(100);
    const tablet=await page.evaluate(() => ({
      horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      canvasVisible:document.querySelector('#courseCanvas').getBoundingClientRect().width > 1
    }));
    assert.equal(tablet.horizontalOverflow,false);
    assert.equal(tablet.canvasVisible,true);
    console.log('✓ 720px existing responsive layout remains usable');

    assert.deepEqual(pageErrors,[]);
    assert.deepEqual(consoleErrors,[]);
    console.log('Browser compact phone LAYOUT rehearsal passed.');
  } catch (error) {
    try { await page.screenshot({path:`${ARTIFACT_DIR}/layout-phone-density-failure.png`,fullPage:true}); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
