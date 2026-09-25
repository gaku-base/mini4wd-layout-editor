'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';
const STORAGE_KEY = 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1';
let SOURCE = null;

const SRC_CONNECTORS = {
  Str1: [[-27,0],[27,0]],
  Str2: [[-27,0],[27,0]],
  Cor1: [[-26,-8],[12.2,7.8]],
  Chi1: [[-27,3],[27,3]],
  Lan1: [[-81,0],[81,0]],
  Ban1: [[-14,0],[14,0]]
};
const TYPE_MAP = {
  Str1: 'straight',
  Cor1: 'corner-45-right',
  Chi1: 'wave',
  Lan1: 'lanechange',
  Ban1: 'bank20'
};
const COLOR_MAP = { 0: 'default', 2: 'blue', 3: 'red' };

function rotate([x,y], angleDeg) {
  const r = angleDeg * Math.PI / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}
function worldPoint(pose, local) {
  const [x,y] = rotate(local, pose.rotation);
  return [pose.x + x, pose.y + y];
}
function distance(a,b) { return Math.hypot(a[0]-b[0], a[1]-b[1]); }

function parseSource() {
  return SOURCE.split('#').filter(Boolean).map((elem,index) => {
    const [sourceType,x,y,angle,color] = elem.split(';');
    const p = { index, sourceType, x:Number(x), y:Number(y), rotation:Number(angle), color:Number(color) };
    p.connectors = SRC_CONNECTORS[sourceType].map(local => worldPoint(p, local));
    return p;
  });
}
function buildAdjacency(source) {
  const adj = new Map(source.map(p => [p.index, []]));
  const used = new Set();
  for (const p of source) {
    p.connectors.forEach((point, connectorIndex) => {
      let best = null;
      for (const q of source) {
        if (q.index === p.index) continue;
        q.connectors.forEach((other, otherIndex) => {
          const d = distance(point, other);
          if (!best || d < best.d) best = { d, q:q.index, otherIndex };
        });
      }
      assert.ok(best && best.d < 0.2, `unmatched source connector ${p.index}:${connectorIndex} d=${best?.d}`);
      const key = [[p.index,connectorIndex],[best.q,best.otherIndex]]
        .sort((a,b) => a[0]-b[0] || a[1]-b[1]).map(v => v.join(':')).join('|');
      if (used.has(key)) return;
      used.add(key);
      adj.get(p.index).push({ other:best.q, ownConnector:connectorIndex, otherConnector:best.otherIndex, distance:best.d });
      adj.get(best.q).push({ other:p.index, ownConnector:best.otherIndex, otherConnector:connectorIndex, distance:best.d });
    });
  }
  for (const [id,edges] of adj) assert.equal(edges.length, 2, `source degree ${id}`);
  return adj;
}

function buildLayout(catalog) {
  const source = parseSource();
  const adj = buildAdjacency(source);
  const startIndex = source.find(p => p.sourceType === 'Str2').index;
  const start = source[startIndex];
  const exitNeighbor = adj.get(startIndex).find(edge => edge.ownConnector === 1)?.other;
  assert.notEqual(exitNeighbor, undefined);

  const seq = [startIndex];
  let previous = startIndex;
  let current = exitNeighbor;
  while (current !== startIndex) {
    seq.push(current);
    const candidates = adj.get(current);
    const next = candidates[0].other === previous ? candidates[1].other : candidates[0].other;
    previous = current;
    current = next;
    assert.ok(seq.length <= source.length, 'route loop overflow');
  }
  assert.equal(seq.length, source.length);

  const entryInfo = seq.map((id,k) => {
    const previousId = seq[(k - 1 + seq.length) % seq.length];
    const nextId = seq[(k + 1) % seq.length];
    const prevEdge = adj.get(id).find(edge => edge.other === previousId);
    const nextEdge = adj.get(id).find(edge => edge.other === nextId);
    return { entry:prevEdge.ownConnector, exit:nextEdge.ownConnector };
  });

  const idFor = index => index === startIndex ? 'start' : `tpb7w4-${String(index).padStart(2,'0')}`;
  const placed = new Map();
  placed.set(startIndex, { x:start.x, y:start.y, rotation:start.rotation });

  const startDef = catalog.PARTS.start;
  const startConnectors = startDef.geometry.connectors;
  let open = worldPoint(placed.get(startIndex), [startConnectors[entryInfo[0].exit].x, startConnectors[entryInfo[0].exit].y]);

  for (let k=1; k<seq.length; k++) {
    const index = seq[k];
    const src = source[index];
    const type = TYPE_MAP[src.sourceType];
    const def = catalog.PARTS[type];
    const connector = def.geometry.connectors[entryInfo[k].entry];
    const rotated = rotate([connector.x, connector.y], src.rotation);
    const pose = { x:open[0]-rotated[0], y:open[1]-rotated[1], rotation:src.rotation };
    placed.set(index, pose);
    const out = def.geometry.connectors[entryInfo[k].exit];
    open = worldPoint(pose, [out.x, out.y]);
  }
  const startEntry = startConnectors[entryInfo[0].entry];
  const closeTarget = worldPoint(placed.get(startIndex), [startEntry.x,startEntry.y]);
  assert.ok(distance(open, closeTarget) < 0.001, `rebuilt closure gap ${distance(open,closeTarget)} cm`);

  const parts = [];
  for (let k=1; k<seq.length; k++) {
    const index=seq[k], src=source[index], pose=placed.get(index);
    parts.push({
      id:idFor(index), type:TYPE_MAP[src.sourceType],
      x:pose.x, y:pose.y, rotation:pose.rotation,
      routeIndex:entryInfo[k].entry,
      entryConnectorId:entryInfo[k].entry === 0 ? 'a' : 'b',
      colorKey:COLOR_MAP[src.color] || 'default',
      zMm:0, pitchDeg:0, bankAngleDeg:0,
      zOrder:k, zIndex:k
    });
  }
  const connections = seq.map((index,k) => {
    const nextIndex=seq[(k+1)%seq.length];
    return {
      partAId:idFor(index),
      connectorAId:entryInfo[k].exit === 0 ? 'a' : 'b',
      partBId:idFor(nextIndex),
      connectorBId:entryInfo[(k+1)%seq.length].entry === 0 ? 'a' : 'b',
      createdOrder:k+1
    };
  });
  return {
    app:'mini4wd-course-layout-mouse-flow', version:'1.1.0-RC3',
    field:{ originX:0, originY:0, widthCm:1000, heightCm:650, gridCm:100 },
    siteBoundary:{ name:'TPB7W4比較範囲', shape:'rectangle', x:0, y:0, width:10000, height:6500, visible:true },
    roomCutouts:[], obstacles:[], parts,
    start:{ id:'start', type:'start', x:start.x, y:start.y, rotation:start.rotation, zMm:0, pitchDeg:0, bankAngleDeg:0, zOrder:0, zIndex:0 },
    startPhase:'position', selectedType:'straight', rotation:180, activeConnection:null, connections
  };
}

function layoutBounds(pageLayout, catalog, poseApi) {
  const all = [pageLayout.start, ...pageLayout.parts];
  const points=[];
  for (const part of all) {
    const def=catalog.PARTS[part.type];
    const path=poseApi.tracePartPath(def,part,96);
    points.push(...path);
  }
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  return {
    minX:Math.min(...xs), minY:Math.min(...ys), maxX:Math.max(...xs), maxY:Math.max(...ys),
    widthCm:Math.max(...xs)-Math.min(...xs), heightCm:Math.max(...ys)-Math.min(...ys)
  };
}

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN required');
  const sourceResponse = await fetch('https://mini4wd-track-editor.pimentoso.com/load/TPB7W4.js');
  assert.equal(sourceResponse.status, 200);
  const sourceJs = await sourceResponse.text();
  const sourceMatch = sourceJs.match(/var text = '([^']*)'/);
  assert.ok(sourceMatch?.[1], 'TPB7W4 source track string not found');
  SOURCE = sourceMatch[1];
  fs.mkdirSync(ARTIFACT_DIR,{recursive:true});
  const browser=await chromium.launch({executablePath:CHROME_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1700,height:1050}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  page.on('dialog',async d=>d.accept());
  await page.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));

  try {
    await page.goto(BASE_URL,{waitUntil:'networkidle',timeout:20000});
    const layout=await page.evaluate(source => {
      const make = new Function('sourceText', `return sourceText`);
      return null;
    }, SOURCE);
    const rebuilt=await page.evaluate(({source,storageKey}) => {
      return { ready:Boolean(window.M4WD_PART_CATALOG), storageKey };
    },{source:SOURCE,storageKey:STORAGE_KEY});
    assert.equal(rebuilt.ready,true);

    // Build in Node using a compact catalogue snapshot read from the running app.
    const catalogSnapshot=await page.evaluate(() => {
      const wanted=['start','straight','corner-45-right','wave','lanechange','bank20'];
      const parts={};
      for(const type of wanted) parts[type]={
        geometry:{connectors:window.M4WD_PART_CATALOG.PARTS[type].geometry.connectors.map(c=>({x:c.x,y:c.y,id:c.id}))}
      };
      return {PARTS:parts};
    });
    const layoutData=buildLayout(catalogSnapshot);
    await page.evaluate(({key,data}) => { localStorage.clear(); localStorage.setItem(key,JSON.stringify(data)); }, {key:STORAGE_KEY,data:layoutData});
    await page.reload({waitUntil:'networkidle',timeout:20000});
    await page.evaluate(() => { const d=document.querySelector('#setupDialog'); if(d?.open)d.close(); document.querySelector('#fitViewBtn')?.click(); });
    await page.waitForTimeout(1200);

    const result=await page.evaluate(key => {
      const data=JSON.parse(localStorage.getItem(key));
      const all=[data.start,...data.parts];
      const points=[];
      for(const part of all){
        const def=window.M4WD_PART_CATALOG.PARTS[part.type];
        points.push(...window.M4WD_PART_RENDER_POSE.tracePartPath(def,part,96));
      }
      const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
      const counts={};
      for(const part of all) counts[part.type]=(counts[part.type]||0)+1;
      return {
        counts,
        bounds:{
          minX:Math.min(...xs), minY:Math.min(...ys), maxX:Math.max(...xs), maxY:Math.max(...ys),
          widthCm:Math.max(...xs)-Math.min(...xs), heightCm:Math.max(...ys)-Math.min(...ys)
        },
        stored:data
      };
    }, STORAGE_KEY);

    assert.equal(result.counts.straight,38);
    assert.equal(result.counts.start,1);
    assert.equal(result.counts['corner-45-right'],32);
    assert.equal(result.counts.wave,4);
    assert.equal(result.counts.lanechange,1);
    assert.equal(result.counts.bank20,2);
    assert.deepEqual(errors,[]);

    fs.writeFileSync(`${ARTIFACT_DIR}/TPB7W4-rebuilt.json`,JSON.stringify(result.stored,null,2));
    await page.screenshot({path:`${ARTIFACT_DIR}/TPB7W4-rebuilt-app.png`,fullPage:true});

    console.log('TPB7W4_REBUILT_BOUNDS',JSON.stringify(result.bounds));
    console.log('TPB7W4_REBUILT_COUNTS',JSON.stringify(result.counts));
    console.log('TPB7W4_REBUILD_PASSED');
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
