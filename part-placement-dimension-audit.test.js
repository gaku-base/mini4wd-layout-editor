'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const GRAPH = require('./layout-graph.js');

function loadCatalog() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('./part-catalog.js', 'utf8'), context, { filename: 'part-catalog.js' });
  return context.window.M4WD_PART_CATALOG;
}

const CATALOG = loadCatalog();
const PARTS = CATALOG.PARTS;
const DIM = CATALOG.PART_DIMENSIONS_MM;

const close = (actual, expected, message = 'value') => {
  assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-9, `${message}: ${actual} !== ${expected}`);
};

function connectorSpanMm(type) {
  const connectors = GRAPH.connectorsForDefinition(PARTS[type]);
  assert.equal(connectors.length, 2, type + ' must expose exactly two placement connectors for this audit');
  return Math.hypot(
    connectors[1].localX - connectors[0].localX,
    connectors[1].localY - connectors[0].localY
  ) * 10;
}

function assertDeepFrozen(value, path = 'root') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, path + ' must be frozen');
  Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, path + '.' + key));
}

test('molded-fit part dimension master is the project placement authority and is immutable at runtime', () => {
  assert.equal(DIM.version, '2026-09-16-molded-fit-v1');
  assert.equal(DIM.basis, 'project-owner-approved-current-runtime-with-molding-tolerance');
  assertDeepFrozen(DIM, 'PART_DIMENSIONS_MM');
  assert.equal(CATALOG.TRACK_WIDTH_CM * 10, DIM.common.runtimeTrackWidthMm);
  assert.equal(CATALOG.STRAIGHT_CONNECTION_WIDTH_MM, DIM.common.connectionFaceOuterWidthMm);
});

test('official nominal references stay separate and never replace adopted molded-fit dimensions', () => {
  assert.equal(CATALOG.DIMENSION_AUDIT_VERSION, '2026-09-16');
  assert.equal(CATALOG.OFFICIAL_JCJC_LANE_WIDTH_MM, 115);
  assert.equal(CATALOG.OFFICIAL_JCJC_FENCE_HEIGHT_MM, 50);
  assert.equal(CATALOG.OFFICIAL_JCJC_CURVE_90_OUTER_MM, 717);
  assert.equal(CATALOG.OFFICIAL_JCJC_CURVE_180_OUTER_WIDTH_MM, 1434);

  assert.equal(DIM.corner45.outerRadiusMm, 720);
  assert.notEqual(DIM.corner45.outerRadiusMm, CATALOG.OFFICIAL_JCJC_CURVE_90_OUTER_MM);
  assert.equal(PARTS['corner-45-right'].dimensionAudit.officialAssembled90OuterMm.usage, 'reference-only');
  assert.equal(PARTS['corner-45-left'].dimensionAudit.officialAssembled180OuterWidthMm.usage, 'reference-only');
  assert.equal(PARTS['corner-45-right'].dimensionAudit.localGeometry.status, 'verified');

  assert.equal(DIM.slope.heightDeltaMm, 115);
  assert.equal(CATALOG.OFFICIAL_DIMENSION_REFERENCES_MM.slopeNominalDropMm, 110);
  assert.equal(PARTS.slope.dimensionAudit.tamiyaPublishedNominalDropMm.usage, 'reference-only');
});

test('straight and Start runtime geometry is derived from the mm master', () => {
  for (const type of ['straight', 'start']) {
    const source = DIM[type];
    close(PARTS[type].w * 10, source.lengthMm, type + ' width');
    close(PARTS[type].h * 10, source.depthMm, type + ' depth');
    const connectors = GRAPH.connectorsForDefinition(PARTS[type]);
    close((connectors[1].localX - connectors[0].localX) * 10, source.lengthMm, type + ' connector span');
    assert.equal(PARTS[type].dimensionAudit.runtimeFootprintMm.status, 'verified');
  }
});

test('lane change, wave, slope, Bank20 and LC Jump runtime placement comes from the mm master', () => {
  close(connectorSpanMm('lanechange'), DIM.lanechange.lengthMm, 'lanechange span');
  close(PARTS.lanechange.h * 10, DIM.lanechange.depthMm, 'lanechange depth');

  close(PARTS.wave.w * 10, DIM.wave.lengthMm, 'wave length');
  close(PARTS.wave.h * 10, DIM.wave.visualDepthMm, 'wave visual depth');
  close(PARTS.wave.geometry.amplitude * 10, DIM.wave.amplitudeMm, 'wave amplitude');
  close(PARTS.wave.geometry.connectors[0].y * 10, DIM.wave.connectorYMm, 'wave connector y');

  close(connectorSpanMm('slope'), DIM.slope.horizontalSpanMm, 'slope span');
  const slopeConnectors = GRAPH.connectorsForDefinition(PARTS.slope);
  close(slopeConnectors[1].localZMm - slopeConnectors[0].localZMm, DIM.slope.heightDeltaMm, 'slope height');
  close(PARTS.slope.h * 10, DIM.slope.depthMm, 'slope depth');

  close(connectorSpanMm('bank20'), DIM.bank20.connectorSpanMm, 'Bank20 span');
  close(PARTS.bank20.h * 10, DIM.bank20.depthMm, 'Bank20 depth');
  assert.equal(PARTS.bank20.bank.angleDeg, DIM.bank20.bankAngleDeg);

  close(connectorSpanMm('lcjump'), DIM.lcjump.lengthMm, 'LC Jump span');
  close(PARTS.lcjump.h * 10, DIM.lcjump.depthMm, 'LC Jump depth');

  for (const type of ['lanechange', 'wave', 'slope', 'bank20', 'lcjump']) {
    const audit = PARTS[type].dimensionAudit;
    const status = audit.runtimeFootprintMm?.status
      || audit.runtimeFootprintDepthMm?.status
      || audit.horizontalSpanMm?.status
      || audit.projectedConnectorSpanMm?.status;
    assert.equal(status, 'verified', type + ' adopted placement dimensions must be verified by project decision');
  }
});

test('45-degree corner local geometry and mirrored connectors are derived from one adopted master', () => {
  const right = PARTS['corner-45-right'];
  const left = PARTS['corner-45-left'];

  for (const part of [right, left]) {
    close(part.geometry.centerlineRadius * 10, DIM.corner45.centerlineRadiusMm, 'corner centerline radius');
    close(part.geometry.innerRadius * 10, DIM.corner45.innerRadiusMm, 'corner inner radius');
    close(part.geometry.outerRadius * 10, DIM.corner45.outerRadiusMm, 'corner outer radius');
    close(part.trackWidth * 10, DIM.corner45.trackWidthMm, 'corner track width');
    close(part.w * 10, DIM.corner45.visualWidthMm, 'corner visual width');
    close(part.h * 10, DIM.corner45.visualHeightMm, 'corner visual height');
  }

  close(right.geometry.connectors[0].x * 10, DIM.corner45.rightConnectorA.xMm, 'right A x');
  close(right.geometry.connectors[0].y * 10, DIM.corner45.rightConnectorA.yMm, 'right A y');
  close(right.geometry.connectors[1].x * 10, DIM.corner45.rightConnectorB.xMm, 'right B x');
  close(right.geometry.connectors[1].y * 10, DIM.corner45.rightConnectorB.yMm, 'right B y');
  close(left.geometry.connectors[0].x, right.geometry.connectors[0].x, 'left/right A x');
  close(left.geometry.connectors[0].y, -right.geometry.connectors[0].y, 'left/right A mirror');
  close(left.geometry.connectors[1].x, right.geometry.connectors[1].x, 'left/right B x');
  close(left.geometry.connectors[1].y, -right.geometry.connectors[1].y, 'left/right B mirror');
});

test('Burning Lane Change display and connector geometry comes from the adopted master', () => {
  const part = PARTS.burning;
  close(part.w * 10, DIM.burning.displayWidthMm, 'Burning width');
  close(part.h * 10, DIM.burning.displayDepthMm, 'Burning depth');
  close(part.geometry.trackWidth * 10, DIM.burning.trackWidthMm, 'Burning track width');
  close(part.geometry.centerlineRadius * 10, DIM.burning.centerlineRadiusMm, 'Burning centerline radius');
  close(part.geometry.innerRadius * 10, DIM.burning.innerRadiusMm, 'Burning inner radius');
  close(part.geometry.outerRadius * 10, DIM.burning.outerRadiusMm, 'Burning outer radius');
  close(part.geometry.endpointX * 10, DIM.burning.endpointXMm, 'Burning endpoint x');
  close(part.geometry.endpointY * 10, DIM.burning.endpointYMm, 'Burning endpoint y');
  close(part.geometry.arcCenterX * 10, DIM.burning.arcCenterXMm, 'Burning arc center');
  assert.equal(part.dimensionAudit.runtimeDisplayBoundsMm.status, 'verified');
});

test('renderer reads per-part catalog dimensions instead of freezing the current 360mm body size into each drawing', () => {
  const source = fs.readFileSync('./app.js', 'utf8');
  assert.match(source, /const trackWidth = g\.ro - g\.ri;/);
  assert.match(source, /const trackWidth = Number\(def\.geometry\?\.height\) \|\| Number\(def\.h\) \|\| TRACK_WIDTH_CM;/);
  assert.match(source, /const deckHeight = def\.h \* 25 \/ 36;/);
  assert.match(source, /const supportW = def\.w \* 39 \/ 54;/);
});
