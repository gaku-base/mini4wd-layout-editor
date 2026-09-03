(function preloadSlopeUnderpassRuntime(root) {
  'use strict';
  if (!root || !root.document) return;
  const documentRef = root.document;
  if (documentRef.readyState !== 'loading' || typeof documentRef.write !== 'function') return;

  const CACHE_KEY = 'v1.1-rc6-slope-gradient1';

  if (!root.M4WD_SLOPE_GRADIENT_VISUAL) {
    documentRef.write(`<script src="slope-gradient-visual.js?v=${CACHE_KEY}" data-m4wd-slope-gradient-visual="1"><\/script>`);
  }

  if (root.M4WD_SLOPE_UNDERPASS_RUNTIME) return;

  const resources = [
    ['M4WD_SLOPE_LONGITUDINAL_PROFILE', 'slope-longitudinal-profile.js'],
    ['M4WD_SLOPE_UNDERPASS_OVERLAP', 'slope-underpass-overlap.js'],
    ['M4WD_SLOPE_UNDERPASS_PAIR_POLICY', 'slope-underpass-pair-policy.js'],
    ['M4WD_SLOPE_UNDERPASS_WARNING_FILTER', 'slope-underpass-warning-filter.js'],
    ['M4WD_SLOPE_UNDERPASS_RUNTIME', 'slope-underpass-runtime.js']
  ];

  resources.forEach(([globalName, file]) => {
    if (root[globalName]) return;
    documentRef.write(`<script src="${file}?v=${CACHE_KEY}" data-m4wd-slope-underpass-runtime="1"><\/script>`);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
