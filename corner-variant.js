(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_CORNER_VARIANT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RIGHT = 'corner-45-right';
  const LEFT = 'corner-45-left';
  const LEGACY_TYPES = new Set(['corner45', 'corner-45', 'curve']);

  function isCornerType(type) {
    return type === RIGHT || type === LEFT;
  }

  function variantForType(type) {
    return type === LEFT ? 'left' : 'right';
  }

  function typeForVariant(variant) {
    return variant === 'left' ? LEFT : RIGHT;
  }

  // Migration consumes only the semantic old direction field.  Geometry,
  // entry connector, rotation, and old mirror values never determine a new
  // part type.
  function migrateLegacyType(part = {}) {
    if (isCornerType(part.type)) return part.type;
    if (!LEGACY_TYPES.has(String(part.type || ''))) return String(part.type || '');
    return typeForVariant(part.handedness === 'left' || part.cornerHandedness === 'left' ? 'left' : 'right');
  }

  return Object.freeze({ RIGHT, LEFT, isCornerType, variantForType, typeForVariant, migrateLegacyType });
});
