'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const STORAGE_KEY = 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1';
const TIMEOUT = 18000;

function checksum(data) {
  let value = 2166136261 >>> 0;
  const step = Math.max(4, Math.floor(data.length / 30000 / 4) * 4);
  for (let index = 0; index < data.length; index += step) {
    value ^= data[index];
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath:CHROME_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport:{ width:1600, height:1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', async dialog => dialog.dismiss());
  await page.route('**/favicon.ico', route => route.fulfill({ status:204, body:'' }));

  const parts = [
    { id:'up-1', type:'bank20', x:138, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'green', zMm:0, zOrder:1 },
    { id:'up-2', type:'bank20', x:160, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'green', zMm:0, zOrder:2 },
    { id:'up-3', type:'bank20', x:182, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'green', zMm:0, zOrder:3 },
    { id:'up-4', type:'bank20', x:204, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'green', zMm:0, zOrder:4 },
    { id:'banked-straight', type:'straight', x:242, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'blue', zMm:0, zOrder:5 },
    { id:'down-1', type:'bank20', x:280, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'green', zMm:0, zOrder:6 },
    { id:'down-2', type:'bank20', x:302, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'green', zMm:0, zOrder:7 },
    { id:'down-3', type:'bank20', x:324, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'green', zMm:0, zOrder:8 },
    { id:'down-4', type:'bank20', x:346, y:120, rotation:180, routeIndex:1, entryConnectorId:'b', colorKey:'green', zMm:0, zOrder:9 },
    { id:'flat-straight', type:'straight', x:384, y:120, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'red', zMm:0, zOrder:10 },
    { id:'slope-a', type:'slope', x:205, y:285, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'orange', zMm:0, zOrder:11 },
    { id:'corner-a', type:'corner-45-right', x:330, y:290, rotation:45, routeIndex:0, entryConnectorId:'a', colorKey:'white', zMm:230, zOrder:12 },
    { id:'wave-a', type:'wave', x:430, y:300, rotation:90, routeIndex:0, entryConnectorId:'a', colorKey:'red', zMm:115, zOrder:13 },
    { id:'lanechange-a', type:'lanechange', x:180, y:355, rotation:0, routeIndex:0, entryConnectorId:'a', colorKey:'white', zMm:0, zOrder:14 }
  ];
  const connections = [
    ['start','b','up-1','a'],
    ['up-1','b','up-2','a'],
    ['up-2','b','up-3','a'],
    ['up-3','b','up-4','a'],
    ['up-4','b','banked-straight','a'],
    ['banked-straight','b','down-1','b'],
    ['down-1','a','down-2','b'],
    ['down-2','a','down-3','b'],
    ['down-3','a','down-4','b'],
    ['down-4','a','flat-straight','a']
  ].map((edge,index)=>({
    partAId:edge[0], connectorAId:edge[1], partBId:edge[2], connectorBId:edge[3], createdOrder:index+1
  }));

  const seed = {
    app:'mini4wd-course-layout-mouse-flow',
    version:'1.1.0-RC3',
    field:{ originX:0, originY:0, widthCm:520, heightCm:400, gridCm:10 },
    roomCutouts:[],
    obstacles:[],
    parts,
    start:{ id:'start', type:'start', x:100, y:120, rotation:0, zMm:0, pitchDeg:0, bankAngleDeg:0, zOrder:0, zIndex:0, colorKey:'default' },
    startPhase:'done',
    selectedType:'straight',
    rotation:0,
    activeConnection:null,
    connections
  };

  try {
    await page.goto(BASE_URL, { waitUntil:'networkidle', timeout:20000 });
    await page.evaluate(({key,seed}) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(seed));
    }, {key:STORAGE_KEY,seed});
    await page.reload({ waitUntil:'networkidle', timeout:20000 });

    await page.waitForFunction(() =>
      window.M4WD_PRESENTATION?.version >= 3 &&
      !!window.M4WD_PART_GEOMETRY_3D &&
      !!window.M4WD_OUTPUT_3D_RENDERER,
      null,
      { timeout:TIMEOUT }
    );
    await page.evaluate(() => {
      const dialog=document.querySelector('#setupDialog');
      if(dialog?.open) dialog.close();
    });

    await page.locator('#outputTabBtn').click();
    await page.locator('#presentationView').waitFor({state:'visible',timeout:TIMEOUT});
    await page.locator('#presentationView2d').waitFor({state:'visible',timeout:TIMEOUT});
    await page.locator('#presentationView3d').waitFor({state:'visible',timeout:TIMEOUT});

    assert.equal(await page.locator('#presentationView2d').textContent(),'2D');
    assert.equal(await page.locator('#presentationView3d').textContent(),'3D');
    assert.equal(await page.locator('#presentationView2d').evaluate(el=>el.classList.contains('is-active')),true);

    const canvasChecksum = () => page.evaluate(() => {
      const canvas=document.querySelector('#presentationCanvas');
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let value=2166136261>>>0;
      const step=Math.max(4,Math.floor(data.length/30000/4)*4);
      for(let index=0;index<data.length;index+=step){
        value^=data[index];
        value=Math.imul(value,16777619)>>>0;
      }
      return {value,width:canvas.width,height:canvas.height};
    });

    await page.waitForTimeout(120);
    const twoD = await canvasChecksum();

    await page.locator('#presentationView3d').click();
    await page.waitForFunction(() =>
      window.M4WD_PRESENTATION.getOutputView() === '3d' &&
      window.M4WD_PRESENTATION.getDiagnostics()?.render?.viewMode === '3d'
    , null, {timeout:TIMEOUT});
    await page.waitForTimeout(120);

    const threeD = await canvasChecksum();
    assert.equal(twoD.width,threeD.width);
    assert.equal(twoD.height,threeD.height);
    assert.notEqual(twoD.value,threeD.value,'2D and 3D previews must render different pixels');

    const diagnostics = await page.evaluate(() => window.M4WD_PRESENTATION.getDiagnostics());
    assert.equal(diagnostics.outputView,'3d');
    assert.equal(diagnostics.render.viewMode,'3d');
    assert.equal(diagnostics.render.course3d.invalidParts.length,0);
    assert.equal(diagnostics.render.course3d.partCount,15);
    assert.equal(diagnostics.render.course3d.catalogVersion,'2026-10-01-lanechange-photo-fit-v3');
    assert.ok(diagnostics.render.course3d.sceneBounds.maxZ >= 230);

    const bankAudit = await page.evaluate(() => {
      const model=window.M4WD_PART_GEOMETRY_3D.buildPart3D(
        'bank20',
        {type:'bank20',bankAngleDeg:60,colorKey:'green'},
        window.M4WD_PART_CATALOG,
        {slopeProfile:window.M4WD_SLOPE_LONGITUDINAL_PROFILE}
      );
      return {
        valid:model.audit.valid,
        span:model.sourceDimensions.connectorSpanMm,
        low:model.paths[0].samples[0].bankDeg,
        high:model.paths[0].samples.at(-1).bankDeg
      };
    });
    assert.deepEqual(bankAudit,{valid:true,span:220,low:60,high:80});

    const slopeAudit = await page.evaluate(() => {
      const model=window.M4WD_PART_GEOMETRY_3D.buildPart3D(
        'slope',
        {type:'slope',bankAngleDeg:0},
        window.M4WD_PART_CATALOG,
        {slopeProfile:window.M4WD_SLOPE_LONGITUDINAL_PROFILE}
      );
      return {
        valid:model.audit.valid,
        span:model.sourceDimensions.horizontalSpanMm,
        rise:model.sourceDimensions.heightDeltaMm,
        z0:model.paths[0].samples[0].z,
        z1:model.paths[0].samples.at(-1).z
      };
    });
    assert.equal(slopeAudit.valid,true);
    assert.equal(slopeAudit.span,540);
    assert.equal(slopeAudit.rise,115);
    assert.ok(Math.abs(slopeAudit.z0)<1e-9);
    assert.ok(Math.abs(slopeAudit.z1-115)<1e-9);

    const laneChangeAudit = await page.evaluate(() => {
      const model=window.M4WD_PART_GEOMETRY_3D.buildPart3D(
        'lanechange',
        {type:'lanechange',bankAngleDeg:0,colorKey:'white'},
        window.M4WD_PART_CATALOG,
        {slopeProfile:window.M4WD_SLOPE_LONGITUDINAL_PROFILE}
      );
      const bridge=model.paths.find(path=>path.id==='bridge-elevated');
      return {
        valid:model.audit.valid,
        warning:model.audit.warnings.includes('lanechange-vertical-profile-photo-derived-provisional'),
        fidelity:model.fidelity,
        pathCount:model.paths.length,
        bridgeStart:bridge?.samples?.[0] || null,
        bridgeEnd:bridge?.samples?.at(-1) || null,
        peakZ:Math.max(...(bridge?.samples?.map(point=>point.z) || [0])),
        supportFaces:model.faces.filter(face=>String(face.pathId).startsWith('lanechange-support-')).length
      };
    });
    assert.equal(laneChangeAudit.valid,true);
    assert.equal(laneChangeAudit.warning,true);
    assert.equal(laneChangeAudit.fidelity,'photo-derived-provisional-3d');
    assert.equal(laneChangeAudit.pathCount,2);
    assert.ok(laneChangeAudit.bridgeStart);
    assert.ok(laneChangeAudit.bridgeEnd);
    assert.ok(Math.abs(laneChangeAudit.bridgeStart.z)<1e-9);
    assert.ok(Math.abs(laneChangeAudit.bridgeEnd.z)<1e-9);
    assert.ok(Math.abs(laneChangeAudit.peakZ-95)<.2);
    assert.equal(laneChangeAudit.supportFaces,2);

    const beforeDrag = await page.evaluate(() => window.M4WD_PRESENTATION.get3dCamera());
    const canvas = page.locator('#presentationCanvas');
    const box = await canvas.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.65,box.y+box.height*.48,{steps:6});
    await page.mouse.up();
    await page.waitForTimeout(80);
    const afterDrag = await page.evaluate(() => window.M4WD_PRESENTATION.get3dCamera());
    assert.notEqual(afterDrag.yawDeg,beforeDrag.yawDeg);
    assert.notEqual(afterDrag.tiltDeg,beforeDrag.tiltDeg);

    const beforeZoom=afterDrag.zoom;
    await canvas.hover();
    await page.mouse.wheel(0,-240);
    await page.waitForTimeout(80);
    const afterZoom=await page.evaluate(() => window.M4WD_PRESENTATION.get3dCamera());
    assert.ok(afterZoom.zoom>beforeZoom);

    await page.locator('#presentation3dTopBtn').click();
    await page.waitForTimeout(80);
    const topCamera=await page.evaluate(() => window.M4WD_PRESENTATION.get3dCamera());
    assert.equal(topCamera.yawDeg,0);
    assert.equal(topCamera.tiltDeg,0);

    await page.locator('#presentation3dIsoBtn').click();
    await page.waitForTimeout(80);
    const isoCamera=await page.evaluate(() => window.M4WD_PRESENTATION.get3dCamera());
    assert.equal(isoCamera.yawDeg,-42);
    assert.equal(isoCamera.tiltDeg,58);

    await page.locator('#presentationView2d').click();
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getOutputView()==='2d',null,{timeout:TIMEOUT});
    await page.locator('#presentationView3d').click();
    await page.waitForFunction(() => window.M4WD_PRESENTATION.getOutputView()==='3d',null,{timeout:TIMEOUT});
    await page.locator('#presentationLayoutTabBtn').click();
    await page.locator('#courseCanvas').waitFor({state:'visible',timeout:TIMEOUT});

    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)||'null'), STORAGE_KEY);
    assert.equal(after.parts.length,parts.length);
    assert.equal(after.connections.length,connections.length);
    assert.equal(after.parts.find(part=>part.id==='banked-straight')?.colorKey,'blue');

    assert.deepEqual(pageErrors,[]);
    assert.deepEqual(consoleErrors,[]);

    console.log('✓ OUTPUT switches between real 2D and 3D rendered previews');
    console.log('✓ 3D scene has no invalid part geometry and uses the current dimension-master version');
    console.log('✓ Slope is 540mm/115mm and Bank20 60→80° uses the measured 220mm span');
    console.log('✓ Lane Change renders a 95mm ±10mm photo-derived provisional bridge rise with two center supports');
    console.log('✓ 3D drag orbit, wheel zoom, TOP and ISO controls work');
    console.log('✓ returning to LAYOUT preserves parts and connections');
    console.log('Browser OUTPUT 3D rehearsal passed.');
  } catch(error) {
    try { await page.screenshot({path:`${ARTIFACT_DIR}/output-3d-failure.png`,fullPage:true}); } catch(_){}
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});
