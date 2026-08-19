(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_COLLISION_PLACEMENT_ADAPTER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CM_TO_MM = 10;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const nonEmptyText = value => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text ? text : null;
  };

  function editorCmToMm(value) {
    const number = finite(value);
    if (number == null) return null;
    const millimetres = number * CM_TO_MM;
    return Number.isFinite(millimetres) ? millimetres : null;
  }

  function normalizeRequiredWallKeys(value) {
    if (!Array.isArray(value)) return [];
    const keys = [];
    const seen = new Set();
    value.forEach(item => {
      const key = nonEmptyText(item);
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
    return keys;
  }

  function profileBindingForPart(part, definition, resolver) {
    if (typeof resolver !== 'function') {
      return {
        profileRef: null,
        profile: null,
        requiredWallKeys: [],
        diagnostics: [{ code: 'collision-profile-unresolved', path: 'profile' }]
      };
    }

    let binding;
    try {
      binding = resolver(part, definition);
    } catch (error) {
      return {
        profileRef: null,
        profile: null,
        requiredWallKeys: [],
        diagnostics: [{
          code: 'collision-profile-resolver-error',
          path: 'profile',
          message: error && error.message ? String(error.message) : 'profile resolver failed'
        }]
      };
    }

    if (!binding || typeof binding !== 'object') {
      return {
        profileRef: null,
        profile: null,
        requiredWallKeys: [],
        diagnostics: [{ code: 'collision-profile-unresolved', path: 'profile' }]
      };
    }

    const profile = binding.profile && typeof binding.profile === 'object' ? binding.profile : null;
    const profileRef = binding.profileRef == null
      ? (profile?.id == null ? null : String(profile.id))
      : String(binding.profileRef);
    const requiredWallKeys = normalizeRequiredWallKeys(binding.requiredWallKeys);
    const diagnostics = [];
    if (!profile) diagnostics.push({ code: 'collision-profile-unresolved', path: 'profile' });
    if (requiredWallKeys.length === 0) diagnostics.push({ code: 'collision-wall-schema-unresolved', path: 'requiredWallKeys' });
    return { profileRef, profile, requiredWallKeys, diagnostics };
  }

  function adaptEditorPlacement(part, options = {}) {
    const type = part?.type == null ? null : String(part.type);
    const definitions = options.partDefinitions && typeof options.partDefinitions === 'object'
      ? options.partDefinitions
      : null;
    const definition = type && definitions ? definitions[type] || null : null;
    const binding = profileBindingForPart(part, definition, options.resolveCollisionProfile);

    return {
      partId: part?.id == null ? '' : part.id,
      profileRef: binding.profileRef,
      profile: binding.profile,
      requiredWallKeys: binding.requiredWallKeys,
      positionMm: {
        x: editorCmToMm(part?.x),
        y: editorCmToMm(part?.y),
        z: finite(part?.zMm)
      },
      rotationDeg: finite(part?.rotation),
      sourceType: type,
      adapterDiagnostics: binding.diagnostics
    };
  }

  function adaptEditorLayout(layout, options = {}) {
    const placements = [];
    if (layout?.start != null) placements.push(adaptEditorPlacement(layout.start, options));
    if (Array.isArray(layout?.parts)) layout.parts.forEach(part => placements.push(adaptEditorPlacement(part, options)));
    return placements;
  }

  return Object.freeze({
    CM_TO_MM,
    editorCmToMm,
    normalizeRequiredWallKeys,
    adaptEditorPlacement,
    adaptEditorLayout
  });
});
