(function preloadSlopeUnderpassRuntime(root) {
  'use strict';
  if (!root || !root.document) return;
  const documentRef = root.document;
  if (root.M4WD_SLOPE_UNDERPASS_RUNTIME) return;
  if (documentRef.readyState !== 'loading' || typeof documentRef.write !== 'function') return;

  const CACHE_KEY = 'v1.1-rc6-slope-underpass1';
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
