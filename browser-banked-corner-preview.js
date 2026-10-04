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

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(() => {
      const setupDialog = document.querySelector('#setupDialog');
      if (setupDialog?.open) setupDialog.close();
    });
    await page.waitForFunction(() => !!window.__mini4wdCourseDebug && !!window.M4WD_LAYOUT_GRAPH, { timeout: 12000 });

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

      function add(type, attachId, colorKey='default') {
        const def = PARTS[type];
        const connectors = G.connectorsForDefinition(def);
        const attachIndex = connectors.findIndex(connector => String(connector.id) === String(attachId));
        if (attachIndex < 0) throw new Error(`connector ${attachId} not found for ${type}`);
        const otherIndex = attachIndex === 0 ? 1 : 0;
        const id = `p-${parts.length + 1}`;
        const seed = {
          id, type, x:0, y:0, zMm:0, rotation:0, pitchDeg:0, bankAngleDeg:0,
          colorKey, zOrder:zOrder++, entryConnectorId:connectors[attachIndex].id
        };
        const solved = G.solveSnapPose(seed, connectors[attachIndex], target);
        solved.entryConnectorId = connectors[attachIndex].id;
        if (def.bank20) solved.bankRole = attachIndex === 0 ? 'entry' : 'exit';
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

      // 0→20→40→60→80°へ立ち上げ、そのまま45°コーナー4枚を
      // 80°バンク区間として通し、最後に80→60→40→20→0°へ戻す。
      for (let i = 0; i < 4; i++) add('bank20', 'a');
      for (let i = 0; i < 4; i++) add('corner-45-right', 'a');
      add('straight', 'a', 'white');
      for (let i = 0; i < 4; i++) add('bank20', 'b');
      add('straight', 'a', 'white');

      const data = {
        ...base,
        field:{ ...base.field, originX:0, originY:0, widthCm:700, heightCm:560, gridCm:10 },
        start,
        parts,
        connections,
        activeConnection:null,
        selectedIds:[],
        selectedType:'straight',
        mode:'place',
        rotation:0,
        view:{ scale:1, offsetX:40, offsetY:40 }
      };
      debug.loadState(data);

      const bounds = debug.getLayoutBounds();
      const canvas = document.querySelector('#courseCanvas');
      const width = canvas?.clientWidth || 1300;
      const height = canvas?.clientHeight || 800;
      const spanX = Math.max(1, bounds.maxX - bounds.minX);
      const spanY = Math.max(1, bounds.maxY - bounds.minY);
      const padding = 70;
      const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 2.2);
      const centered = debug.getState();
      centered.view = {
        scale,
        offsetX: (width - spanX * scale) / 2 - bounds.minX * scale,
        offsetY: (height - spanY * scale) / 2 - bounds.minY * scale
      };
      debug.loadState(centered);

      const state = debug.getState();
      return {
        version: document.querySelector('.version')?.textContent?.trim(),
        cornerAngles: state.parts.filter(part => part.type.includes('corner')).map(part => part.bankAngleDeg),
        bankAngles: state.parts.filter(part => part.type === 'bank20').map(part => part.bankAngleDeg),
        bounds,
        scale
      };
    });

    await page.waitForTimeout(600);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/rc7-1-banked-corner-app.png`,
      fullPage: true
    });

    const canvas = page.locator('#courseCanvas');
    await canvas.screenshot({ path: `${ARTIFACT_DIR}/rc7-1-banked-corner-layout.png` });

    console.log('RC7.1 preview:', JSON.stringify(result));
    console.log('Saved actual-app screenshots for the banked corner preview.');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
