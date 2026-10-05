'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 15000;

const VIEWPORTS = [
  { width:1920, height:1080 },
  { width:1600, height:1000 },
  { width:1366, height:768 },
  { width:1180, height:800 },
  { width:1024, height:768 },
  { width:860, height:768 },
  { width:720, height:844 },
  { width:390, height:844 }
];

async function auditState(page, viewport, stateName) {
  return page.evaluate(({viewport,stateName}) => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 1
        && rect.height > 1;
    };
    const rectOf = element => {
      const r = element.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const overlapArea = (a,b) => {
      const w = Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left));
      const h = Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      return w*h;
    };
    const labelOf = element =>
      element.id || element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g,' ').slice(0,80) || element.tagName;

    const issues = [];
    const metrics = {};
    const topbar = document.querySelector('.topbar');
    const toolbar = document.querySelector('#canvasToolbar');
    const canvas = document.querySelector('#courseCanvas');
    const leftSidebar = document.querySelector('.left-sidebar');
    const drawer = document.querySelector('.right-sidebar');
    const moreMenu = document.querySelector('#simpleToolbarMoreMenu');
    const subEdit = document.querySelector('#subEditModeBar');
    const instruction = document.querySelector('#instruction');

    metrics.pageHorizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    metrics.topbarHeight = topbar?.getBoundingClientRect().height || 0;
    metrics.toolbarHeight = toolbar?.getBoundingClientRect().height || 0;
    metrics.drawerOpen = Boolean(drawer?.classList.contains('simple-drawer-open'));
    metrics.moreMenuOpen = Boolean(moreMenu && !moreMenu.hidden);
    metrics.subEditVisible = visible(subEdit);

    if (metrics.pageHorizontalOverflow) issues.push({type:'page-horizontal-overflow'});

    const topItems = ['.brand','#workspaceTabs','.top-actions']
      .map(selector => document.querySelector(selector))
      .filter(visible)
      .map(element => ({name:labelOf(element),rect:rectOf(element)}));
    for (let i=0;i<topItems.length;i++) {
      for (let j=i+1;j<topItems.length;j++) {
        const area = overlapArea(topItems[i].rect,topItems[j].rect);
        if (area > 4) issues.push({type:'topbar-overlap',a:topItems[i].name,b:topItems[j].name,area:Math.round(area)});
      }
    }

    const toolbarButtons = toolbar
      ? Array.from(toolbar.querySelectorAll('button,.drag-trash')).filter(visible)
      : [];
    const toolbarRects = toolbarButtons.map(element => ({element,name:labelOf(element),rect:rectOf(element)}));
    const rowTops = [];
    for (const item of toolbarRects) {
      if (!rowTops.some(top => Math.abs(top-item.rect.top)<4)) rowTops.push(item.rect.top);
    }
    metrics.toolbarRows = rowTops.length;
    metrics.visibleToolbarControls = toolbarRects.length;
    for (let i=0;i<toolbarRects.length;i++) {
      for (let j=i+1;j<toolbarRects.length;j++) {
        const area = overlapArea(toolbarRects[i].rect,toolbarRects[j].rect);
        if (area > 4) issues.push({type:'toolbar-control-overlap',a:toolbarRects[i].name,b:toolbarRects[j].name,area:Math.round(area)});
      }
    }
    if (toolbar && viewport.width > 720) {
      const tr = rectOf(toolbar);
      for (const item of toolbarRects) {
        if (item.rect.left < tr.left-1 || item.rect.right > tr.right+1 || item.rect.top < tr.top-1 || item.rect.bottom > tr.bottom+1) {
          issues.push({type:'toolbar-control-clipped',control:item.name});
        }
      }
    }

    if (visible(leftSidebar) && visible(canvas)) {
      const a=rectOf(leftSidebar), b=rectOf(canvas);
      const area=overlapArea(a,b);
      if (area>4) issues.push({type:'left-sidebar-canvas-overlap',area:Math.round(area)});
    }

    if (visible(toolbar) && visible(canvas)) {
      const a=rectOf(toolbar), b=rectOf(canvas);
      const area=overlapArea(a,b);
      if (area>4) issues.push({type:'toolbar-canvas-overlap',area:Math.round(area)});
    }

    if (visible(instruction) && visible(canvas)) {
      const a=rectOf(instruction), b=rectOf(canvas);
      const area=overlapArea(a,b);
      if (area>4) issues.push({type:'instruction-canvas-overlap',area:Math.round(area)});
    }

    if (visible(subEdit)) {
      if (visible(instruction)) issues.push({type:'subedit-instruction-both-visible'});
      if (visible(toolbar)) {
        const area=overlapArea(rectOf(subEdit),rectOf(toolbar));
        if (area>4) issues.push({type:'subedit-toolbar-overlap',area:Math.round(area)});
      }
      const sr=rectOf(subEdit);
      if (sr.left < -1 || sr.right > innerWidth+1 || sr.top < -1 || sr.bottom > innerHeight+1) {
        issues.push({type:'subedit-out-of-viewport'});
      }
    }

    if (visible(drawer) && drawer.classList.contains('simple-drawer-open')) {
      const dr=rectOf(drawer);
      metrics.drawerRect=dr;
      for (const item of toolbarRects) {
        const area=overlapArea(dr,item.rect);
        if (area>4) issues.push({type:'drawer-covers-toolbar-control',control:item.name,area:Math.round(area)});
      }
      if (visible(topbar)) {
        const area=overlapArea(dr,rectOf(topbar));
        if (area>4) issues.push({type:'drawer-topbar-overlap',area:Math.round(area)});
      }
    }

    if (visible(moreMenu) && !moreMenu.hidden) {
      const mr=rectOf(moreMenu);
      metrics.moreMenuRect=mr;
      if (mr.left < 7 || mr.right > innerWidth-7 || mr.top < 7 || mr.bottom > innerHeight-7) {
        issues.push({type:'overflow-menu-out-of-viewport',rect:mr});
      }
      const trigger=document.querySelector('#simpleToolbarMoreBtn');
      if (visible(trigger) && overlapArea(mr,rectOf(trigger))>4) {
        issues.push({type:'overflow-menu-covers-trigger'});
      }
    }

    if (viewport.width >= 1366 && metrics.toolbarRows > 1) {
      issues.push({type:'desktop-toolbar-wrap',rows:metrics.toolbarRows});
    }

    return {viewport,stateName,metrics,issues};
  }, {viewport,stateName});
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

  const results=[];
  try {
    await page.goto(BASE_URL,{waitUntil:'networkidle',timeout:20000});
    await page.waitForFunction(()=>document.documentElement.dataset.uiControlsCleanupInstalled==='1',{timeout:TIMEOUT});
    await page.evaluate(()=>{const d=document.querySelector('#setupDialog'); if(d?.open)d.close();});

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(120);

      if (await page.locator('#simpleEditorDrawer.simple-drawer-open').count()) {
        await page.locator('.simple-drawer-close').click().catch(()=>{});
      }
      if (await page.locator('#simpleToolbarMoreMenu:not([hidden])').count()) {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(40);
      results.push(await auditState(page,viewport,'base'));

      if (await page.locator('#detailsToggleBtn').isVisible()) {
        await page.locator('#detailsToggleBtn').click();
        await page.waitForTimeout(80);
        results.push(await auditState(page,viewport,'details-open'));
        await page.locator('.simple-drawer-close').click();
        await page.waitForTimeout(40);
      }

      if (await page.locator('#simpleToolbarMoreBtn').isVisible()) {
        await page.locator('#simpleToolbarMoreBtn').click();
        await page.waitForTimeout(60);
        results.push(await auditState(page,viewport,'overflow-menu-open'));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(40);
      }

      if (viewport.width >= 860) {
        const boundary = page.locator('[data-mode="boundary"]');
        if (await boundary.isVisible()) {
          await boundary.click();
          await page.waitForTimeout(80);
          if (await page.locator('#subEditModeBar').isVisible().catch(()=>false)) {
            results.push(await auditState(page,viewport,'subedit-boundary'));
            await page.locator('#returnToSetupBtn').click().catch(()=>{});
            await page.waitForTimeout(80);
            await page.evaluate(()=>{const d=document.querySelector('#setupDialog'); if(d?.open)d.close();});
          }
        }
      }

      const viewportIssues=results.filter(r=>r.viewport.width===viewport.width && r.viewport.height===viewport.height).flatMap(r=>r.issues);
      if (viewportIssues.length) {
        await page.screenshot({path:`${ARTIFACT_DIR}/layout-ui-${viewport.width}x${viewport.height}.png`,fullPage:true});
      }
    }

    for (const result of results) {
      console.log('LAYOUT_UI_AUDIT '+JSON.stringify(result));
    }
    assert.deepEqual(pageErrors,[]);
    assert.deepEqual(consoleErrors,[]);

    const issues=results.flatMap(result=>result.issues.map(issue=>({viewport:result.viewport,state:result.stateName,...issue})));
    console.log('LAYOUT_UI_AUDIT_SUMMARY '+JSON.stringify({states:results.length,issues}));
    assert.equal(issues.length,0,'LAYOUT UI visual audit found overlap/clipping/organization issues');
    console.log('Browser LAYOUT UI visual audit passed: no detected overlaps or clipping.');
  } finally {
    await browser.close();
  }
}

main().catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});
