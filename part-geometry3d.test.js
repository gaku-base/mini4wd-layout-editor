'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const GEOMETRY = require('./part-geometry3d.js');
const SLOPE_PROFILE = require('./slope-longitudinal-profile.js');

function loadCatalog() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('part-catalog.js', 'utf8'), context, { filename:'part-catalog.js' });
  return context.window.M4WD_PART_CATALOG;
}

function cloneCatalog(catalog) {
  return {
    ...catalog,
    PART_DIMENSIONS_MM: JSON.parse(JSON.stringify(catalog.PART_DIMENSIONS_MM)),
    OFFICIAL_DIMENSION_REFERENCES_MM: JSON.parse(JSON.stringify(catalog.OFFICIAL_DIMENSION_REFERENCES_MM)),
    PARTS: catalog.PARTS
  };
}

const CATALOG = loadCatalog();
const DEPS = { slopeProfile:SLOPE_PROFILE };
const TYPES = ['straight','corner-45-right','corner-45-left','lanechange','wave','start','slope','bank20','lcjump','burning'];

test('all current 2D parts generate finite 3D geometry with no integrity errors', () => {
  const audit = GEOMETRY.auditAllParts(CATALOG, DEPS);
  assert.equal(audit.valid, true);
  assert.equal(audit.catalogVersion, CATALOG.PART_DIMENSIONS_MM.version);
  assert.deepEqual(audit.results.map(item => item.type), TYPES);
  for (const item of audit.results) {
    assert.equal(item.valid, true, `${item.type}: ${item.errors.join(', ')}`);
  }
});

test('Straight 3D uses the 2D dimension master directly', () => {
  const model = GEOMETRY.buildPart3D('straight', { colorKey:'default' }, CATALOG, DEPS);
  const d = CATALOG.PART_DIMENSIONS_MM;
  assert.equal(model.sourceDimensions.lengthMm, d.straight.lengthMm);
  assert.equal(model.sourceDimensions.depthMm, d.straight.depthMm);
  assert.equal(model.physicalTrackWidthMm, d.common.runtimeTrackWidthMm);
  const path = model.paths[0].samples;
  assert.equal(path[0].x, -d.straight.lengthMm / 2);
  assert.equal(path.at(-1).x, d.straight.lengthMm / 2);
  assert.equal(path[0].z, 0);
  assert.equal(path.at(-1).z, 0);
});

test('45-degree corner 3D connects to the exact same 2D connector centres', () => {
  const d = CATALOG.PART_DIMENSIONS_MM.corner45;
  for (const type of ['corner-45-right','corner-45-left']) {
    const model = GEOMETRY.buildPart3D(type, {}, CATALOG, DEPS);
    const path = model.paths[0].samples;
    const mirror = type === 'corner-45-left' ? -1 : 1;
    assert.ok(Math.abs(path[0].x - d.rightConnectorA.xMm) < 1e-9);
    assert.ok(Math.abs(path[0].y - d.rightConnectorA.yMm * mirror) < 1e-9);
    assert.ok(Math.abs(path.at(-1).x - d.rightConnectorB.xMm) < 1e-9);
    assert.ok(Math.abs(path.at(-1).y - d.rightConnectorB.yMm * mirror) < 1e-9);
    assert.equal(model.sourceDimensions.centerlineRadiusMm, d.centerlineRadiusMm);
    assert.equal(model.sourceDimensions.angleDeg, d.angleDeg);
  }
});

test('Wave 3D follows the same endpoint and amplitude contract as 2D', () => {
  const d = CATALOG.PART_DIMENSIONS_MM.wave;
  const model = GEOMETRY.buildPart3D('wave', {}, CATALOG, DEPS);
  const path = model.paths[0].samples;
  assert.equal(path[0].x, -d.lengthMm / 2);
  assert.equal(path.at(-1).x, d.lengthMm / 2);
  assert.ok(Math.abs(path[0].y - d.connectorYMm) < 1e-9);
  assert.ok(Math.abs(path.at(-1).y - d.connectorYMm) < 1e-9);
  const minY = Math.min(...path.map(point => point.y));
  assert.ok(Math.abs(minY - (d.connectorYMm - d.amplitudeMm)) < 1e-9);
});

test('Slope 3D uses the catalog span/rise and normalized verified profile', () => {
  const d = CATALOG.PART_DIMENSIONS_MM.slope;
  const model = GEOMETRY.buildPart3D('slope', {}, CATALOG, DEPS);
  const path = model.paths[0].samples;
  assert.equal(path[0].x, -d.horizontalSpanMm / 2);
  assert.equal(path.at(-1).x, d.horizontalSpanMm / 2);
  assert.ok(Math.abs(path[0].z) < 1e-9);
  assert.ok(Math.abs(path.at(-1).z - d.heightDeltaMm) < 1e-9);
  for (let i = 1; i < path.length; i += 1) {
    assert.ok(path[i].z >= path[i - 1].z - 1e-9, 'slope profile must not fold backwards in Z');
  }
});

test('Bank20 3D uses measured 2D span and cumulative bank angles', () => {
  const d = CATALOG.PART_DIMENSIONS_MM.bank20;
  const base60 = GEOMETRY.buildPart3D('bank20', { bankAngleDeg:60 }, CATALOG, DEPS);
  const path = base60.paths[0].samples;
  assert.equal(path[0].x, -d.connectorSpanMm / 2);
  assert.equal(path.at(-1).x, d.connectorSpanMm / 2);
  assert.equal(path[0].bankDeg, 60);
  assert.equal(path.at(-1).bankDeg, 60 + d.bankAngleDeg);
  assert.equal(base60.sourceDimensions.connectorSpanMm, d.connectorSpanMm);
});

test('Lane Change mirrors the adopted 2D bridge plan without inventing bridge height', () => {
  const d = CATALOG.PART_DIMENSIONS_MM.lanechange;
  const model = GEOMETRY.buildPart3D('lanechange', {}, CATALOG, DEPS);
  assert.equal(model.fidelity, 'planar-dimensions-verified');
  assert.equal(model.audit.valid, true);
  assert.ok(model.audit.warnings.includes('vertical-detail-not-yet-measured'));
  assert.equal(model.paths.length, 2);

  const base = model.paths.find(path => path.id === 'main');
  const bridge = model.paths.find(path => path.id === 'bridge-planar');
  assert.ok(base);
  assert.ok(bridge);
  assert.equal(bridge.auxiliary, true);
  assert.equal(bridge.planSource, 'assets/templates/lane-change.svg');
  assert.equal(bridge.widthMm, CATALOG.PART_DIMENSIONS_MM.common.runtimeTrackWidthMm / 3);

  assert.equal(bridge.samples[0].x, -d.lengthMm / 2);
  assert.ok(Math.abs(bridge.samples[0].y - d.depthMm / 3) < 1e-9);
  assert.equal(bridge.samples.at(-1).x, d.lengthMm / 2);
  assert.ok(Math.abs(bridge.samples.at(-1).y + d.depthMm / 3) < 1e-9);
  assert.ok(bridge.samples.every(point => point.z === 0));
  assert.ok(base.samples.every(point => point.z === 0));
});

test('LC jump preserves verified 2D footprint without inventing vertical dimensions', () => {
  const model = GEOMETRY.buildPart3D('lcjump', {}, CATALOG, DEPS);
  assert.equal(model.fidelity, 'planar-dimensions-verified');
  assert.equal(model.audit.valid, true);
  assert.ok(model.audit.warnings.includes('vertical-detail-not-yet-measured'));
  const zValues = model.paths[0].samples.map(point => point.z);
  assert.ok(zValues.every(z => z === 0));
});

test('Burning LC keeps 2D endpoints and flags unmeasured bridge height instead of inventing it', () => {
  const d = CATALOG.PART_DIMENSIONS_MM.burning;
  const model = GEOMETRY.buildPart3D('burning', {}, CATALOG, DEPS);
  const base = model.paths[0].samples;
  assert.equal(base[0].x, d.endpointXMm);
  assert.equal(base[0].y, -d.endpointYMm);
  assert.equal(base.at(-1).x, d.endpointXMm);
  assert.equal(base.at(-1).y, d.endpointYMm);
  assert.equal(model.audit.valid, true);
  assert.ok(model.audit.warnings.includes('burning-bridge-vertical-detail-not-yet-measured'));
});

test('changing the 2D dimension master automatically changes generated 3D geometry', () => {
  const changed = cloneCatalog(CATALOG);
  changed.PART_DIMENSIONS_MM.version = 'future-dimension-change-test';
  changed.PART_DIMENSIONS_MM.straight.lengthMm = 600;
  changed.PART_DIMENSIONS_MM.slope.horizontalSpanMm = 600;
  changed.PART_DIMENSIONS_MM.slope.heightDeltaMm = 130;
  changed.PART_DIMENSIONS_MM.bank20.connectorSpanMm = 250;
  changed.PART_DIMENSIONS_MM.wave.lengthMm = 600;

  const straight = GEOMETRY.buildPart3D('straight', {}, changed, DEPS);
  assert.equal(straight.paths[0].samples[0].x, -300);
  assert.equal(straight.paths[0].samples.at(-1).x, 300);

  const slope = GEOMETRY.buildPart3D('slope', {}, changed, DEPS);
  assert.equal(slope.paths[0].samples[0].x, -300);
  assert.equal(slope.paths[0].samples.at(-1).x, 300);
  assert.ok(Math.abs(slope.paths[0].samples.at(-1).z - 130) < 1e-9);

  const bank = GEOMETRY.buildPart3D('bank20', {}, changed, DEPS);
  assert.equal(bank.paths[0].samples[0].x, -125);
  assert.equal(bank.paths[0].samples.at(-1).x, 125);

  const wave = GEOMETRY.buildPart3D('wave', {}, changed, DEPS);
  assert.equal(wave.paths[0].samples[0].x, -300);
  assert.equal(wave.paths[0].samples.at(-1).x, 300);

  assert.equal(straight.sourceCatalogVersion, 'future-dimension-change-test');
  assert.equal(slope.sourceCatalogVersion, 'future-dimension-change-test');
});

test('shape integrity rejects broken meshes instead of silently rendering them', () => {
  const result = GEOMETRY.validateMeshIntegrity({
    vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}],
    faces:[{indices:[0,1,2]}],
    lines:[]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.startsWith('zero-area-face:')));
});
