(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PRESENTATION_DATA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const METADATA_VERSION = 1;
  const DEFAULT_METADATA = Object.freeze({
    eventNameLine1: '',
    eventNameLine2: '',
    layouterName: ''
  });
  const GROUP_ORDER = Object.freeze([
    'start', 'straight', 'corner45', 'lanechange', 'wave', 'slope', 'bank20', 'lcjump', 'burning'
  ]);
  const GROUP_LABELS = Object.freeze({
    start: 'スタート',
    straight: 'ストレート',
    corner45: '45°コーナー',
    lanechange: 'レーンチェンジ',
    wave: 'ウェーブ',
    slope: 'スロープ',
    bank20: '20°バンク',
    lcjump: 'LCジャンプ',
    burning: 'バーニングLC'
  });

  // Pimentoso Mini4WD Online Track Editor compatible values for a 3-lane track.
  // Each value is the total distance travelled after running lane 1, lane 2 and
  // lane 3 once each (three laps in total). These values are intentionally kept
  // separate from placement/projection geometry so track rendering dimensions do
  // not change when the presentation total-length calculation changes.
  const PIMENTOSO_THREE_LANE_LENGTH_CM = Object.freeze({
    start: 162,
    straight: 162,
    'corner-45-right': 127,
    'corner-45-left': 127,
    lanechange: 486,
    wave: 162,
    slope: 162,
    bank20: 66,
    lcjump: 162,
    burning: 981
  });

  function cleanText(value, maxLength = 120) {
    return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
  }

  function normalizeMetadata(value = {}) {
    return Object.freeze({
      eventNameLine1: cleanText(value.eventNameLine1),
      eventNameLine2: cleanText(value.eventNameLine2),
      layouterName: cleanText(value.layouterName, 80)
    });
  }

  function validateMetadata(value = {}) {
    const metadata = normalizeMetadata(value);
    return Object.freeze({
      valid: metadata.eventNameLine1.length > 0,
      metadata,
      reason: metadata.eventNameLine1 ? null : 'event-name-required'
    });
  }

  function groupKeyForType(type) {
    if (type === 'corner-45-right' || type === 'corner-45-left') return 'corner45';
    return GROUP_ORDER.includes(type) ? type : type;
  }

  function partDisplayLabel(type, definition) {
    const groupKey = groupKeyForType(type);
    return GROUP_LABELS[groupKey] || definition?.name || type;
  }

  function collectPartCounts(layout = {}, catalog = {}) {
    const definitions = catalog.PARTS || catalog;
    const counts = new Map();
    const add = (type, part) => {
      if (!type) return;
      const key = groupKeyForType(type);
      const current = counts.get(key) || { key, type, label: partDisplayLabel(type, definitions[type]), count: 0, representative: part || { type } };
      current.count += 1;
      if (!current.representative && part) current.representative = part;
      counts.set(key, current);
    };
    if (layout.start) add('start', { ...layout.start, type: 'start', id: 'start' });
    (Array.isArray(layout.parts) ? layout.parts : []).forEach(part => add(part?.type, part));
    return [...counts.values()].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.key);
      const bi = GROUP_ORDER.indexOf(b.key);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || String(a.label).localeCompare(String(b.label), 'ja');
    }).map(item => Object.freeze({ ...item, representative: item.representative ? { ...item.representative } : null }));
  }

  function partLengthCm(type, definition = {}) {
    if (!definition || typeof definition !== 'object') return null;
    const lengthCm = PIMENTOSO_THREE_LANE_LENGTH_CM[type];
    return Number.isFinite(lengthCm) ? lengthCm : null;
  }

  function computeTrackLength(layout = {}, catalog = {}) {
    const definitions = catalog.PARTS || catalog;
    const entries = [];
    if (layout.start) entries.push({ type: 'start', part: layout.start });
    (Array.isArray(layout.parts) ? layout.parts : []).forEach(part => entries.push({ type: part?.type, part }));
    let totalCm = 0;
    const unknownTypes = new Set();
    for (const entry of entries) {
      const lengthCm = partLengthCm(entry.type, definitions?.[entry.type]);
      if (!Number.isFinite(lengthCm)) {
        unknownTypes.add(entry.type || 'unknown');
        continue;
      }
      totalCm += lengthCm;
    }
    if (unknownTypes.size) {
      return Object.freeze({ available: false, totalCm: null, totalM: null, display: '算出不可', unknownTypes: [...unknownTypes] });
    }
    const totalM = totalCm / 100;
    return Object.freeze({ available: true, totalCm, totalM, display: `${totalM.toFixed(2)} m`, unknownTypes: [] });
  }

  function fieldBounds(layout = {}) {
    const field = layout.field || {};
    const originX = Number(field.originX) || 0;
    const originY = Number(field.originY) || 0;
    const widthCm = Number(field.widthCm) || 0;
    const heightCm = Number(field.heightCm) || 0;
    return Object.freeze({ minX: originX, minY: originY, maxX: originX + widthCm, maxY: originY + heightCm, widthCm, heightCm });
  }

  function buildPresentationModel(layout = {}, metadata = {}, catalog = {}) {
    const safeMetadata = normalizeMetadata(metadata);
    return Object.freeze({
      version: METADATA_VERSION,
      metadata: safeMetadata,
      field: fieldBounds(layout),
      layout: JSON.parse(JSON.stringify(layout || {})),
      counts: collectPartCounts(layout, catalog),
      length: computeTrackLength(layout, catalog),
      totalParts: (Array.isArray(layout.parts) ? layout.parts.length : 0) + (layout.start ? 1 : 0)
    });
  }

  function metadataFromLayout(layout = {}) {
    return normalizeMetadata(layout.presentation || DEFAULT_METADATA);
  }

  function withMetadata(layout = {}, metadata = {}) {
    return { ...JSON.parse(JSON.stringify(layout || {})), presentation: { ...normalizeMetadata(metadata) } };
  }

  function sanitizeFilename(value) {
    const raw = [value?.eventNameLine1, value?.eventNameLine2]
      .map(item => cleanText(item))
      .filter(Boolean)
      .join('_') || 'mini4wd-layout';
    return raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120);
  }

  return Object.freeze({
    METADATA_VERSION,
    DEFAULT_METADATA,
    GROUP_ORDER,
    GROUP_LABELS,
    PIMENTOSO_THREE_LANE_LENGTH_CM,
    normalizeMetadata,
    validateMetadata,
    groupKeyForType,
    collectPartCounts,
    partLengthCm,
    computeTrackLength,
    fieldBounds,
    buildPresentationModel,
    metadataFromLayout,
    withMetadata,
    sanitizeFilename
  });
});
