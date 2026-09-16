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

function connectorSpanMm(type) {
  const connectors = GRAPH.connectorsForDefinition(PARTS[type]);
  assert.equal(connectors.length, 2, type + ' must expose exactly two placement connectors for this audit');
  return Math.hypot(
    connectors[1].localX - connectors[0].localX,
    connectors[1].localY - connectors[0].localY
  ) * 10;
}

test('official JCJC public references are captured separately from runtime approximation values', () => {
  assert.equal(CATALOG.DIMENSION_AUDIT_VERSION, '2026-09-16');
  assert.equal(CATALOG.OFFICIAL_JCJC_LANE_WIDTH_MM, 115);
  assert.equal(CATALOG.OFFICIAL_JCJC_FENCE_HEIGHT_MM, 50);
  assert.equal(CATALOG.OFFICIAL_JCJC_CURVE_90_OUTER_MM, 717);
  assert.equal(CATALOG.OFFICIAL_JCJC_CURVE_180_OUTER_WIDTH_MM, 1434);
});

test('verified direct placement spans already match the current runtime geometry', () => {
  assert.equal(connectorSpanMm('straight'), 540);
  assert.equal(PARTS.straight.dimensionAudit.placementSpanMm.status, 'verified');

  assert.equal(connectorSpanMm('lanechange'), 1620);
  assert.equal(PARTS.lanechange.dimensionAudit.placementSpanMm.status, 'verified');

  assert.equal(connectorSpanMm('slope'), 540);
  const slopeConnectors = GRAPH.connectorsForDefinition(PARTS.slope);
  assert.equal(slopeConnectors[1].localZMm - slopeConnectors[0].localZMm, 115);
  assert.equal(PARTS.slope.dimensionAudit.horizontalSpanMm.status, 'verified');
  assert.equal(PARTS.slope.dimensionAudit.heightDeltaMm.status, 'verified');

  assert.equal(connectorSpanMm('bank20'), 230);
  assert.equal(PARTS.bank20.dimensionAudit.projectedConnectorSpanMm.status, 'verified');
  assert.equal(PARTS.bank20.dimensionAudit.bankAngleDeg.value, 20);
  assert.equal(PARTS.bank20.dimensionAudit.bankAngleDeg.status, 'verified');
});

test('Tamiya nominal 11cm slope copy is recorded without overwriting the approved 115mm project rise', () => {
  assert.equal(PARTS.slope.dimensionAudit.tamiyaPublishedNominalDropMm.value, 110);
  assert.equal(PARTS.slope.dimensionAudit.tamiyaPublishedNominalDropMm.status, 'verified');
  assert.equal(PARTS.slope.dimensionAudit.heightDeltaMm.value, 115);
  assert.equal(PARTS.slope.geometry.connectors[1].localZMm, 115);
});

test('corner official aggregate footprint is verified but the local 45-degree decomposition remains provisional', () => {
  for (const type of ['corner-45-right', 'corner-45-left']) {
    const audit = PARTS[type].dimensionAudit;
    assert.equal(audit.officialAssembled90OuterMm.value, 717);
    assert.equal(audit.officialAssembled90OuterMm.status, 'verified');
    assert.equal(audit.officialAssembled180OuterWidthMm.value, 1434);
    assert.equal(audit.officialAssembled180OuterWidthMm.status, 'verified');
    assert.equal(audit.localGeometry.status, 'provisional');

    // Current local model is R540 with a 360mm radial course band, therefore
    // its outer radius is 720mm. Do not silently force this to 717mm without
    // a source that decomposes the official assembled footprint.
    assert.equal(PARTS[type].geometry.outerRadius * 10, 720);
    assert.notEqual(PARTS[type].geometry.outerRadius * 10, CATALOG.OFFICIAL_JCJC_CURVE_90_OUTER_MM);
  }
});

test('unpublished maximum footprints stay provisional or unknown rather than being promoted by inference', () => {
  assert.equal(PARTS.wave.dimensionAudit.maximumOuterFootprintMm.status, 'unknown');
  assert.equal(PARTS.lcjump.dimensionAudit.placementSpanMm.status, 'provisional');
  assert.equal(PARTS.lcjump.dimensionAudit.maximumOuterFootprintMm.status, 'unknown');
  assert.equal(PARTS.bank20.dimensionAudit.maximumOuterFootprintMm.status, 'unknown');
  assert.equal(PARTS.burning.dimensionAudit.runtimeDisplayBoundsMm.status, 'provisional');
  assert.equal(PARTS.burning.dimensionAudit.physicalFootprintMm.status, 'unknown');
});
