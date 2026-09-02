(function (root, factory) {
  'use strict';
  const filter = typeof module === 'object' && module.exports
    ? require('./slope-underpass-warning-filter.js')
    : root?.M4WD_SLOPE_UNDERPASS_WARNING_FILTER;
  const api = factory(filter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.M4WD_SLOPE_UNDERPASS_RUNTIME = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FILTER) {
  'use strict';

  const WRAP_MARKER = '__m4wdSlopeUnderpassRuntimeWrapped';

  function install(rootValue) {
    const root = rootValue || (typeof globalThis !== 'undefined' ? globalThis : null);
    const graph = root?.M4WD_LAYOUT_GRAPH;
    if (!root || !graph || typeof graph.interferenceWarnings !== 'function') return false;
    if (!FILTER || typeof FILTER.filterApprovedSlopeUnderpassWarnings !== 'function') return false;
    if (graph[WRAP_MARKER] === true) return true;

    const originalInterferenceWarnings = graph.interferenceWarnings;
    const occupancyPolygon = graph.occupancyPolygon;
    if (typeof occupancyPolygon !== 'function') return false;

    function interferenceWarningsWithApprovedSlopeUnderpass(parts, catalog, boundsForPart, options = {}) {
      const legacyWarnings = originalInterferenceWarnings(parts, catalog, boundsForPart, options);
      return FILTER.filterApprovedSlopeUnderpassWarnings(legacyWarnings, {
        parts,
        catalog,
        occupancyPolygon
      });
    }

    root.M4WD_LAYOUT_GRAPH = Object.freeze({
      ...graph,
      [WRAP_MARKER]: true,
      interferenceWarnings: interferenceWarningsWithApprovedSlopeUnderpass
    });
    return true;
  }

  return Object.freeze({
    WRAP_MARKER,
    install
  });
});
