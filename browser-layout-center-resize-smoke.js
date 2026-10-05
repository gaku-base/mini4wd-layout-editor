'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const TIMEOUT = 12000;

async function fieldCenterDelta(page) {
  return page.evaluate(() => {
    const canvas=document.querySelector('#courseCanvas');
    const rect=canvas.getBoundingClientRect();
    const ctx=canvas.getContext('2d');
    const image=ctx.getImageData(0,0,canvas.width,canvas.height);
    let minX=canvas.width, minY=canvas.height, maxX=-1, maxY=-1, hits=0;
    const step=Math.max(1,Math.round(canvas.width/800));
    for(let y=0;y<canvas.height;y+=step){
      for(let x=0;x<canvas.width;x+=step){
        const i=(y*canvas.width+x)*4;
        const r=image.data[i], g=image.data[i+1], b=image.data[i+2], a=image.data[i+3];
        if(a>240 && r>225 && g>225 && b>218){
          minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); hits++;
        }
      }
    }
    if(hits<100 || maxX<0) return {found:false,hits};
    const fieldCx=(minX+maxX)/2, fieldCy=(minY+maxY)/2;
    const cssScaleX=rect.width/canvas.width, cssScaleY=rect.height/canvas.height;
    return {
      found:true,hits,
      dx:(fieldCx-canvas.width/2)*cssScaleX,
      dy:(fieldCy-canvas.height/2)*cssScaleY,
      canvasWidth:rect.width,
      canvasHeight:rect.height
    };
  });
}

async function main(){
  if(!CHROME_BIN) throw new Error('CHROME_BIN is required');
  fs.mkdirSync(ARTIFACT_DIR,{recursive:true});
  const browser=await chromium.launch({executablePath:CHROME_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await context.newPage();
  try{
    await page.goto(BASE_URL,{waitUntil:'networkidle',timeout:20000});
    await page.evaluate(()=>{const d=document.querySelector('#setupDialog'); if(d?.open)d.close();});
    await page.locator('#simpleToolbarMoreBtn').click();
    await page.locator('#fitViewBtn').click();
    await page.waitForTimeout(120);
    const before=await fieldCenterDelta(page);
    assert.equal(before.found,true);
    assert.ok(Math.abs(before.dx)<4 && Math.abs(before.dy)<4,`fit centre before resize dx=${before.dx} dy=${before.dy}`);

    await page.setViewportSize({width:1920,height:1080});
    await page.waitForTimeout(180);
    const wide=await fieldCenterDelta(page);
    assert.equal(wide.found,true);
    assert.ok(Math.abs(wide.dx)<5 && Math.abs(wide.dy)<5,`wide resize centre dx=${wide.dx} dy=${wide.dy}`);
    console.log('✓ LAYOUT field remains centred when resizing 1366→1920');

    await page.setViewportSize({width:1180,height:800});
    await page.waitForTimeout(180);
    const narrow=await fieldCenterDelta(page);
    assert.equal(narrow.found,true);
    assert.ok(Math.abs(narrow.dx)<5 && Math.abs(narrow.dy)<5,`narrow resize centre dx=${narrow.dx} dy=${narrow.dy}`);
    console.log('✓ LAYOUT field remains centred when resizing 1920→1180');

    await page.setViewportSize({width:1600,height:900});
    await page.waitForTimeout(120);
    await page.locator('#simpleToolbarMoreBtn').click();
    await page.locator('#fitViewBtn').click();
    await page.waitForTimeout(160);
    const explicitFit=await fieldCenterDelta(page);
    assert.ok(Math.abs(explicitFit.dx)<5 && Math.abs(explicitFit.dy)<5,`explicit fit double-shifted dx=${explicitFit.dx} dy=${explicitFit.dy}`);
    console.log('✓ explicit 全体表示 does not receive double resize compensation');
    console.log('Browser LAYOUT resize-centering rehearsal passed.');
  } catch(error){
    try{await page.screenshot({path:`${ARTIFACT_DIR}/layout-resize-centering-failure.png`,fullPage:true});}catch(_){}
    throw error;
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
