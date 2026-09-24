(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_SVG_PART_ASSETS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_PALETTE = Object.freeze({
    base: '#efede9',
    lane: '#8d8c89',
    edge: '#858480',
    accent: '#e52f38'
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHex(value, fallback) {
    const text = String(value || fallback || '').trim();
    const match = /^#([0-9a-f]{6})$/i.exec(text);
    return match ? `#${match[1].toLowerCase()}` : fallback;
  }

  function shadeColor(hex, amount) {
    const normalized = normalizeHex(hex, DEFAULT_PALETTE.base);
    const value = parseInt(normalized.slice(1), 16);
    const r = clamp((value >> 16) + Math.round(255 * amount), 0, 255);
    const g = clamp(((value >> 8) & 255) + Math.round(255 * amount), 0, 255);
    const b = clamp((value & 255) + Math.round(255 * amount), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function paletteVariables(palette = {}) {
    const base = normalizeHex(palette.base, DEFAULT_PALETTE.base);
    const lane = normalizeHex(palette.lane, DEFAULT_PALETTE.lane);
    const edge = normalizeHex(palette.edge, DEFAULT_PALETTE.edge);
    const accent = normalizeHex(palette.accent, DEFAULT_PALETTE.accent);
    return Object.freeze({
      '--part-base': base,
      '--part-lane': lane,
      '--part-edge': edge,
      '--part-accent': accent,
      '--part-base-m20': shadeColor(base, -.20),
      '--part-base-m18': shadeColor(base, -.18),
      '--part-base-m16': shadeColor(base, -.16),
      '--part-base-m12': shadeColor(base, -.12),
      '--part-base-p05': shadeColor(base, .05)
    });
  }

  function injectPalette(svgText, palette = {}) {
    const source = String(svgText || '');
    if (!/^\s*<svg\b/i.test(source)) throw new Error('SVG asset must start with <svg>');
    const declarations = Object.entries(paletteVariables(palette))
      .map(([name, value]) => `${name}:${value}`)
      .join(';');
    const style = `<style data-m4wd-part-palette>:root{${declarations}}</style>`;
    return source.replace(/(<svg\b[^>]*>)/i, `$1${style}`);
  }

  function toDataUri(svgText, palette = {}) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(injectPalette(svgText, palette))}`;
  }

  return Object.freeze({
    DEFAULT_PALETTE,
    shadeColor,
    paletteVariables,
    injectPalette,
    toDataUri
  });
});
