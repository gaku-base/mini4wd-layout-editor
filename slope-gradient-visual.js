(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.M4WD_SLOPE_GRADIENT_VISUAL = api;
    if (root.document) api.applySlopeGradientVisual(root.M4WD_PART_CATALOG);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TARGET_FILE = 'assets/parts/slope-gradient.svg';

  function applySlopeGradientVisual(catalog) {
    const slope = catalog?.PARTS?.slope;
    const visual = slope?.visual;
    if (!visual || typeof visual !== 'object') {
      return Object.freeze({ applied: false, reason: 'slope-visual-unavailable', file: null });
    }
    if (visual.file === TARGET_FILE) {
      return Object.freeze({ applied: true, reason: 'already-applied', file: TARGET_FILE });
    }
    try {
      visual.file = TARGET_FILE;
    } catch (_) {
      return Object.freeze({ applied: false, reason: 'slope-visual-readonly', file: visual.file || null });
    }
    if (visual.file !== TARGET_FILE) {
      return Object.freeze({ applied: false, reason: 'slope-visual-readonly', file: visual.file || null });
    }
    return Object.freeze({ applied: true, reason: 'applied', file: TARGET_FILE });
  }

  return Object.freeze({ TARGET_FILE, applySlopeGradientVisual });
});
