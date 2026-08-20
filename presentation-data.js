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

  function connectorPoint(connector, metadata) {
    if (!connector) return null;
    const x = Number(connector.x ?? connector.localX);
    const y = Number(connector.y ?? connector.localY);
    const zMm = Number(connector.localZMm ?? metadata?.localZMm ?? 0);
    if (![x, y, zMm].every(Number.isFinite)) return null;
    return { x, y, zCm: zMm / 10 };
  }

  function definitionConnectors(definition = {}) {
    const direct = Array.isArray(definition.geometry?.connectors) ? definition.geometry.connectors : [];
    const metadata = Array.isArray(definition.geometry?.connectorMetadata) ? definition.geometry.connectorMetadata : [];
    return direct.map((connector, index) => connectorPoint(connector, metadata[index])).filter(Boolean);
  }

  function integrateWaveLengthCm(definition, samples = 512) {
    const width = Number(definition?.w ?? definition?.geometry?.width);
    const amplitude = Number(definition?.geometry?.amplitude ?? definition?.amplitude);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(amplitude)) return null;
    let length = 0;
    let previous = { x: -width / 2, y: 0 };
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      const x = -width / 2 + width * t;
      const y = -amplitude * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t));
      length += Math.hypot(x - previous.x, y - previous.y);
      previous = { x, y };
    }
    return length;
  }

  function partLengthCm(type, definition = {}) {
    if (!definition || typeof definition !== 'object') return null;
    if (definition.corner45) {
      const radius = Number(definition.geometry?.centerlineRadius ?? definition.radius);
      const angleDeg = Number(definition.geometry?.angleDeg ?? 45);
      return Number.isFinite(radius) && radius > 0 && Number.isFinite(angleDeg)
        ? radius * Math.abs(angleDeg) * Math.PI / 180
        : null;
    }
    if (definition.wave) return integrateWaveLengthCm(definition);
    if (definition.burning) {
      const g = definition.geometry || {};
      const endpointX = Number(g.endpointX);
      const arcCenterX = Number(g.arcCenterX);
      const radius = Number(g.centerlineRadius);
      if (![endpointX, arcCenterX, radius].every(Number.isFinite) || radius <= 0) return null;
      return Math.abs(arcCenterX - endpointX) * 2 + Math.PI * radius;
    }
    const connectors = definitionConnectors(definition);
    if (connectors.length >= 2) {
      const a = connectors[0];
      const b = connectors[1];
      return Math.hypot(b.x - a.x, b.y - a.y, b.zCm - a.zCm);
    }
    const width = Number(definition.w ?? definition.geometry?.width);
    return Number.isFinite(width) && width > 0 ? width : null;
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
