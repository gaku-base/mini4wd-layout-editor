(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PLACEMENT_PROPOSAL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function freezeDeep(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach(child => freezeDeep(child, seen));
    return Object.freeze(value);
  }

  // The rendered proposal is immutable. A placement receives a distinct deep
  // clone, so a later ghost refresh can never mutate the confirmed part.
  function snapshotVisibleProposal(proposal, placementId) {
    if (!proposal) return null;
    return freezeDeep({ ...clone(proposal), placementId: String(placementId) });
  }

  function cloneForCommit(snapshot) {
    return clone(snapshot);
  }

  function physicalPose(value = {}) {
    return {
      rotation: Number(value.rotation) || 0,
      cornerMirror: Boolean(value.cornerMirror),
      handedness: value.appliedHandedness || value.handedness || value.cornerHandedness || null
    };
  }

  return Object.freeze({ clone, freezeDeep, snapshotVisibleProposal, cloneForCommit, physicalPose });
});
