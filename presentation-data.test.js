'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('./presentation-data.js');

const catalog = {
  PARTS: {
    start: { name: 'スタート' },
    straight: { name: 'ストレート' },
    'corner-45-right': { name: '右' },
    'corner-45-left': { name: '左' },
    lanechange: { name: 'レーンチェンジ' },
    wave: { name: 'ウェーブ' },
    slope: { name: 'スロープ' },
    bank20: { name: '20度バンク' },
    lcjump: { name: 'LCジャンプ' },
    burning: { name: 'バーニングLC' },
    unknown: { name: '未定義' }
  }
};

test('metadata requires only the first tournament-name line and keeps layouter optional', () => {
  assert.equal(DATA.validateMetadata({ eventNameLine1:'  第19回  ', eventNameLine2:'大会', layouterName:'' }).valid, true);
  assert.deepEqual(DATA.normalizeMetadata({ eventNameLine1:'  第19回\n', eventNameLine2:' 大会 ', layouterName:' GAKU ' }), {
    eventNameLine1:'第19回', eventNameLine2:'大会', layouterName:'GAKU'
  });
  assert.equal(DATA.validateMetadata({ eventNameLine1:' ' }).reason, 'event-name-required');
});

test('part counts group left/right 45-degree corners and ignore color differences', () => {
  const layout = {
    start: { id:'start', colorKey:'red' },
    parts: [
      { id:'1', type:'straight', colorKey:'red' },
      { id:'2', type:'straight', colorKey:'blue' },
      { id:'3', type:'corner-45-right', colorKey:'green' },
      { id:'4', type:'corner-45-left', colorKey:'orange' }
    ]
  };
  const counts = DATA.collectPartCounts(layout, catalog);
  assert.deepEqual(counts.map(item => [item.key, item.count]), [['start',1],['straight',2],['corner45',2]]);
});

test('Pimentoso-compatible length table uses three-lane total values', () => {
  assert.equal(DATA.partLengthCm('straight', catalog.PARTS.straight), 162);
  assert.equal(DATA.partLengthCm('start', catalog.PARTS.start), 162);
  assert.equal(DATA.partLengthCm('wave', catalog.PARTS.wave), 162);
  assert.equal(DATA.partLengthCm('slope', catalog.PARTS.slope), 162);
  assert.equal(DATA.partLengthCm('lcjump', catalog.PARTS.lcjump), 162);
  assert.equal(DATA.partLengthCm('corner-45-right', catalog.PARTS['corner-45-right']), 127);
  assert.equal(DATA.partLengthCm('corner-45-left', catalog.PARTS['corner-45-left']), 127);
  assert.equal(DATA.partLengthCm('lanechange', catalog.PARTS.lanechange), 486);
  assert.equal(DATA.partLengthCm('bank20', catalog.PARTS.bank20), 66);
  assert.equal(DATA.partLengthCm('burning', catalog.PARTS.burning), 981);
});

test('track total sums one run of each of the three lanes per placed part', () => {
  const layout = {
    start: {},
    parts: [
      { type:'straight' },
      { type:'corner-45-right' },
      { type:'slope' },
      { type:'bank20' }
    ]
  };
  const total = DATA.computeTrackLength(layout, catalog);
  assert.equal(total.available, true);
  assert.equal(total.totalCm, 679);
  assert.equal(total.totalM, 6.79);
  assert.equal(total.display, '6.79 m');
});

test('undefined length fails closed instead of treating the part as zero', () => {
  const total = DATA.computeTrackLength({ parts:[{type:'unknown'}] }, catalog);
  assert.equal(total.available, false);
  assert.equal(total.display, '算出不可');
  assert.deepEqual(total.unknownTypes, ['unknown']);
});

test('presentation model clones layout and keeps metadata out of mutable source state', () => {
  const layout = { field:{ originX:0, originY:0, widthCm:500, heightCm:400 }, parts:[{id:'1',type:'straight'}], start:null };
  const model = DATA.buildPresentationModel(layout, { eventNameLine1:'大会' }, catalog);
  model.layout.parts[0].type = 'changed-copy';
  assert.equal(layout.parts[0].type, 'straight');
  assert.equal(model.metadata.layouterName, '');
  assert.equal(model.field.widthCm, 500);
});

test('metadata can be embedded in JSON without changing the input layout', () => {
  const layout = { app:'x', parts:[] };
  const enriched = DATA.withMetadata(layout, { eventNameLine1:'大会', layouterName:'GAKU' });
  assert.equal(layout.presentation, undefined);
  assert.equal(enriched.presentation.eventNameLine1, '大会');
  assert.equal(DATA.metadataFromLayout(enriched).layouterName, 'GAKU');
  assert.equal(DATA.sanitizeFilename(enriched.presentation), '大会');
});
