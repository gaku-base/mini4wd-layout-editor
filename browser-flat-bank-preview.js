'use strict';

const fs = require('node:fs');
const { chromium } = require('playwright-core');

const BASE_URL = process.env.BROWSER_SMOKE_BASE_URL || 'http://127.0.0.1:4173/index.html';
const CHROME_BIN = process.env.CHROME_BIN;
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1800, height: 1120 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__COURSE_ENABLE_DEBUG__ = true;
    Object.defineProperty(window, '__mini4wdCourseDebug', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: undefined
    });
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => !!window.__mini4wdCourseDebug?.loadState && !!window.M4WD_LAYOUT_GRAPH, null, { timeout: 12000 });

    const result = await page.evaluate(() => {
      const debug = window.__mini4wdCourseDebug;
      const G = window.M4WD_LAYOUT_GRAPH;
      const PARTS = window.M4WD_PART_CATALOG.PARTS;
      const base = debug.getState();

      const start = {
        id:'start', type:'start', x:130, y:280, rotation:0, zMm:0,
        pitchDeg:0, bankAngleDeg:0, zOrder:0, colorKey:'default'
      };

      const parts = [];
      const connections = [];
      let previous = { id:'start', connectorId:'b' };
      let target = G.worldConnector(start, G.connectorsForDefinition(PARTS.start)[1], 1);
      let zOrder = 1;

      function add(type, attachId, extra = {}) {
        const def = PARTS[type];
        const connectors = G.connectorsForDefinition(def);
        const attachIndex = connectors.findIndex(connector => String(connector.id) === String(attachId));
        if (attachIndex < 0) throw new Error(`connector ${attachId} not found for ${type}`);
        const otherIndex = attachIndex === 0 ? 1 : 0;
        const id = `p-${parts.length + 1}`;
        const seed = {
          id, type, x:0, y:0, zMm:0, rotation:0, pitchDeg:0, bankAngleDeg:0,
          colorKey:'default', zOrder:zOrder++, entryConnectorId:connectors[attachIndex].id,
          ...extra
        };
        const solved = G.solveSnapPose(seed, connectors[attachIndex], target);
        solved.entryConnectorId = connectors[attachIndex].id;
        Object.assign(solved, extra);
        parts.push(solved);
        connections.push({
          partAId: previous.id,
          connectorAId: previous.connectorId,
          partBId: id,
          connectorBId: connectors[attachIndex].id,
          createdOrder: connections.length + 1
        });
        previous = { id, connectorId: connectors[otherIndex].id };
        target = G.worldConnector(solved, connectors[otherIndex], otherIndex);
        return solved;
      }

      // 入口（青）→バンク区間の通常形状コーナー→出口（赤）
      // Bank20を4枚で0→20→40→60→80°、コーナーを180°ぶん回し、
      // 反対側で4枚を使って80→60→40→20→0°に戻す。
      for (let i = 0; i < 4; i++) add('bank20', 'a', { bankRole:'entry' });
      for (let i = 0; i < 4; i++) add('corner-45-right', 'a');
      add('straight', 'a');
      for (let i = 0; i < 4; i++) add('bank20', 'b', { bankRole:'exit' });
      add('straight', 'a');

      debug.loadState({
        ...base,
        field:{ ...base.field, originX:0, originY:0, widthCm:760, heightCm:520, gridCm:10 },
        start,
        parts,
        connections,
        activeConnection:null,
        selectedIds:[],
        selectedType:'straight',
        mode:'place',
        rotation:0,
        view:{ scale:1, offsetX:40, offsetY:40 }
      });

      const state = debug.getState();
      const bounds = debug.getLayoutBounds();
      const canvas = document.querySelector('#courseCanvas');
      const width = canvas?.clientWidth || 1300;
      const height = canvas?.clientHeight || 800;
      const spanX = Math.max(1, bounds.maxX - bounds.minX);
      const spanY = Math.max(1, bounds.maxY - bounds.minY);
      const padding = 80;
      const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 2.2);

      debug.loadState({
        ...state,
        view:{
          scale,
          offsetX:(width - spanX * scale) / 2 - bounds.minX * scale,
          offsetY:(height - spanY * scale) / 2 - bounds.minY * scale
        }
      });

      const finalState = debug.getState();
      return {
        version: document.querySelector('.version')?.textContent?.trim(),
        cornerAngles: finalState.parts.filter(part => part.type.includes('corner')).map(part => part.bankAngleDeg),
        bankRoles: finalState.parts.filter(part => part.type === 'bank20').map(part => part.bankRole),
        bankEndpointAngles: finalState.parts.filter(part => part.type === 'bank20').map(part => (part.endpointStates || []).map(s => s.bankAngle))
      };
    });

    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/rc7-2-flat-bank-app.png`,
      fullPage: true
    });
    await page.locator('#courseCanvas').screenshot({
      path: `${ARTIFACT_DIR}/rc7-2-flat-bank-layout.png`
    });

    console.log('RC7.2 preview:', JSON.stringify(result));
    console.log('Saved actual-app RC7.2 preview screenshots.');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
