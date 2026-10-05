'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;
const VIEWPORTS = [
  {width:1920,height:1080},{width:1600,height:1000},{width:1366,height:768},{width:1180,height:800},
  {width:1024,height:768},{width:860,height:768},{width:720,height:844},{width:390,height:844}
];

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');
  fs.mkdirSync(ARTIFACT_DIR,{recursive:true});
  const browser=await chromium.launch({executablePath:CHROME_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:VIEWPORTS[0]});
  const page=await context.newPage();
  try {
    await page.goto(BASE_URL,{waitUntil:'networkidle',timeout:20000});
    await page.waitForFunction(()=>document.documentElement.dataset.uiControlsCleanupInstalled==='1',{timeout:TIMEOUT});
    await page.evaluate(()=>{const d=document.querySelector('#setupDialog'); if(d?.open)d.close();});
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(120);
      if (await page.locator('#simpleEditorDrawer.simple-drawer-open').count()) await page.locator('.simple-drawer-close').click();
      await page.locator('#detailsToggleBtn').click();
      await page.waitForFunction(() => {
        const drawer = document.querySelector('.right-sidebar');
        if (!drawer?.classList.contains('simple-drawer-open')) return false;
        const transform = getComputedStyle(drawer).transform;
        if (!transform || transform === 'none') return true;
        return Math.abs(new DOMMatrix(transform).m41) < 1;
      }, {timeout:TIMEOUT});
      const result=await page.evaluate(() => {
        const drawer=document.querySelector('.right-sidebar').getBoundingClientRect();
        const toolbar=document.querySelector('#canvasToolbar').getBoundingClientRect();
        const controls=Array.from(document.querySelectorAll('#canvasToolbar button,#canvasToolbar .drag-trash'))
          .filter(el => {
            const r=el.getBoundingClientRect(), s=getComputedStyle(el);
            return s.display!=='none' && s.visibility!=='hidden' && r.width>1 && r.height>1;
          })
          .map(el => ({id:el.id,rect:el.getBoundingClientRect().toJSON()}));
        const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
        return {
          drawer:{left:drawer.left,top:drawer.top,right:drawer.right,bottom:drawer.bottom},
          toolbar:{left:toolbar.left,top:toolbar.top,right:toolbar.right,bottom:toolbar.bottom},
          viewport:{width:innerWidth,height:innerHeight},
          drawerVisibleRight:drawer.right <= innerWidth + 1,
          belowToolbar:drawer.top >= toolbar.bottom - 1,
          covered:controls.filter(item => overlap(drawer,item.rect)>4).map(item=>item.id)
        };
      });
      assert.equal(result.drawerVisibleRight,true,`${viewport.width}: drawer must stay inside viewport`);
      assert.equal(result.belowToolbar,true,`${viewport.width}: drawer must start below toolbar`);
      assert.deepEqual(result.covered,[],`${viewport.width}: drawer must not cover toolbar controls`);
      console.log('✓ Details drawer clears toolbar at '+viewport.width+'x'+viewport.height);
      await page.locator('.simple-drawer-close').click();
    }
    console.log('Browser LAYOUT Details drawer overlap rehearsal passed.');
  } catch (error) {
    try { await page.screenshot({path:`${ARTIFACT_DIR}/layout-details-drawer-failure.png`,fullPage:true}); } catch (_) {}
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
