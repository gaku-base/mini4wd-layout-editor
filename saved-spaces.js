(function attachSavedSpaces(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_SAVED_SPACES = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  'use strict';

  const STORAGE_KEY = 'mini4wd-layout-saved-spaces-v1';
  const VERSION = 1;
  const MIN_FIELD_CM = 100;
  const MAX_FIELD_CM = 5000;
  const GRID_VALUES = Object.freeze([5, 10, 25, 50]);

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeName(value) {
    return String(value ?? '').trim().slice(0, 80);
  }

  function sameName(first, second) {
    return normalizeName(first).localeCompare(normalizeName(second), 'ja', { sensitivity: 'accent' }) === 0;
  }

  function validateAreaName(value, areas = [], currentId = null) {
    const name = normalizeName(value);
    if (!name) return { valid: false, reason: 'empty-name', name: '' };
    const duplicate = (Array.isArray(areas) ? areas : [])
      .some(area => area?.id !== currentId && sameName(area?.name, name));
    return duplicate
      ? { valid: false, reason: 'duplicate-name', name }
      : { valid: true, reason: null, name };
  }

  function normalizeRotation(value) {
    const rotation = Number(value);
    if (!Number.isInteger(rotation)) return null;
    return ((rotation % 360) + 360) % 360;
  }

  function normalizeField(value) {
    if (!value || typeof value !== 'object') return null;
    const widthCm = Number(value.widthCm);
    const heightCm = Number(value.heightCm);
    const gridCm = Number(value.gridCm);
    if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm)
      || widthCm < MIN_FIELD_CM || heightCm < MIN_FIELD_CM
      || widthCm > MAX_FIELD_CM || heightCm > MAX_FIELD_CM
      || !GRID_VALUES.includes(gridCm)) return null;
    return { widthCm, heightCm, gridCm };
  }

  function normalizeArea(value, fallbackId = '') {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || fallbackId).trim();
    const name = normalizeName(value.name);
    const x = Number(value.x);
    const y = Number(value.y);
    const widthCm = Number(value.widthCm);
    const depthCm = Number(value.depthCm);
    const rotation = normalizeRotation(value.rotation);
    if (!id || !name || !Number.isFinite(x) || !Number.isFinite(y)
      || !Number.isFinite(widthCm) || !Number.isFinite(depthCm)
      || widthCm < 1 || depthCm < 1 || widthCm > MAX_FIELD_CM || depthCm > MAX_FIELD_CM
      || rotation == null) return null;
    return {
      id, name, x, y, widthCm, depthCm, rotation,
      visible: value.visible !== false,
      locked: value.locked === true
    };
  }

  function areaInsideField(area, field, epsilon = 1e-7) {
    const normalizedArea = normalizeArea(area, area?.id || 'area');
    const normalizedField = normalizeField(field);
    if (!normalizedArea || !normalizedField) return false;
    const radians = normalizedArea.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const halfWidth = normalizedArea.widthCm / 2;
    const halfDepth = normalizedArea.depthCm / 2;
    return [-1, 1].every(sx => [-1, 1].every(sy => {
      const x = normalizedArea.x + cos * halfWidth * sx - sin * halfDepth * sy;
      const y = normalizedArea.y + sin * halfWidth * sx + cos * halfDepth * sy;
      return x >= -epsilon && y >= -epsilon
        && x <= normalizedField.widthCm + epsilon
        && y <= normalizedField.heightCm + epsilon;
    }));
  }

  function normalizeSpace(value) {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || '').trim();
    const name = normalizeName(value.name);
    const field = normalizeField(value.field);
    const createdAt = String(value.createdAt || '');
    const updatedAt = String(value.updatedAt || '');
    if (!id || !name || !field || !createdAt || !updatedAt || !Array.isArray(value.unavailableAreas)) return null;
    const areaIds = new Set();
    const areaNames = new Set();
    const unavailableAreas = [];
    for (const raw of value.unavailableAreas) {
      const area = normalizeArea(raw);
      const foldedName = area?.name.toLocaleLowerCase('ja');
      if (!area || areaIds.has(area.id) || areaNames.has(foldedName)) return null;
      areaIds.add(area.id);
      areaNames.add(foldedName);
      unavailableAreas.push(area);
    }
    return { id, name, field, unavailableAreas, createdAt, updatedAt };
  }

  function normalizeLibrary(value) {
    if (!value || typeof value !== 'object' || value.version !== VERSION || !Array.isArray(value.spaces)) return null;
    const ids = new Set();
    const names = new Set();
    const spaces = [];
    for (const raw of value.spaces) {
      const space = normalizeSpace(raw);
      const foldedName = space?.name.toLocaleLowerCase('ja');
      if (!space || ids.has(space.id) || names.has(foldedName)) return null;
      ids.add(space.id);
      names.add(foldedName);
      spaces.push(space);
    }
    return { version: VERSION, spaces };
  }

  function uniqueName(baseName, spaces = [], suffix = ' コピー') {
    const base = normalizeName(baseName) || '保存済みスペース';
    const names = (Array.isArray(spaces) ? spaces : []).map(space => space?.name || '');
    const available = candidate => !names.some(name => sameName(name, candidate));
    const first = `${base}${suffix}`;
    if (available(first)) return first;
    let index = 2;
    while (!available(`${first}${index}`)) index += 1;
    return `${first}${index}`;
  }

  function createSpace(values, options = {}) {
    const makeId = options.makeId || (() => `space-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    const now = options.now || (() => new Date().toISOString());
    const timestamp = now();
    return normalizeSpace({
      id: makeId('space'),
      name: values?.name,
      field: values?.field,
      unavailableAreas: (values?.unavailableAreas || []).map(area => ({ ...area, id: area.id || makeId('area') })),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  function spaceAreasInsideField(space) {
    return Boolean(space && Array.isArray(space.unavailableAreas)
      && space.unavailableAreas.every(area => areaInsideField(area, space.field)));
  }

  function replaceSpace(spaces, id, values, options = {}) {
    const source = spaces.find(space => space.id === id);
    if (!source) return { ok: false, reason: 'not-found', spaces };
    const name = normalizeName(values?.name ?? source.name);
    if (!name) return { ok: false, reason: 'invalid-name', spaces };
    if (spaces.some(space => space.id !== id && sameName(space.name, name))) return { ok: false, reason: 'duplicate-name', spaces };
    const now = options.now || (() => new Date().toISOString());
    const next = normalizeSpace({
      ...source,
      ...deepClone(values),
      id: source.id,
      name,
      createdAt: source.createdAt,
      updatedAt: now()
    });
    if (!next || !spaceAreasInsideField(next)) return { ok: false, reason: 'invalid-space', spaces };
    return { ok: true, space: next, spaces: spaces.map(space => space.id === id ? next : space) };
  }

  function createSavedSpaceStore(storage, options = {}) {
    const key = options.key || STORAGE_KEY;
    const makeId = options.makeId || (prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    const now = options.now || (() => new Date().toISOString());
    let library = { version: VERSION, spaces: [] };

    function persist(next) {
      const normalized = normalizeLibrary(next);
      if (!normalized) return { status: 'failed', reason: 'invalid-library' };
      try {
        storage.setItem(key, JSON.stringify(normalized));
        library = deepClone(normalized);
        return { status: 'saved', library: deepClone(library) };
      } catch (error) {
        return { status: 'unavailable', error };
      }
    }

    function restore() {
      let raw;
      try { raw = storage.getItem(key); } catch (error) { return { status: 'unavailable', error, spaces: [] }; }
      if (!raw) {
        library = { version: VERSION, spaces: [] };
        return { status: 'empty', spaces: [] };
      }
      try {
        const normalized = normalizeLibrary(JSON.parse(raw));
        if (!normalized) return { status: 'corrupt', spaces: [] };
        library = normalized;
        return { status: 'restored', spaces: deepClone(library.spaces) };
      } catch (error) {
        return { status: 'corrupt', error, spaces: [] };
      }
    }

    function list() { return deepClone(library.spaces); }

    function create(values) {
      const name = normalizeName(values?.name);
      if (!name) return { status: 'failed', reason: 'invalid-name' };
      if (library.spaces.some(space => sameName(space.name, name))) return { status: 'failed', reason: 'duplicate-name' };
      const space = createSpace({ ...values, name }, { makeId, now });
      if (!space || !spaceAreasInsideField(space)) return { status: 'failed', reason: 'invalid-space' };
      const saved = persist({ version: VERSION, spaces: [...library.spaces, space] });
      return saved.status === 'saved' ? { ...saved, status: 'created', space: deepClone(space) } : saved;
    }

    function update(id, values) {
      const result = replaceSpace(library.spaces, id, values, { now });
      if (!result.ok) return { status: 'failed', reason: result.reason };
      const saved = persist({ version: VERSION, spaces: result.spaces });
      return saved.status === 'saved' ? { ...saved, status: 'updated', space: deepClone(result.space) } : saved;
    }

    function rename(id, name) { return update(id, { name }); }

    function duplicate(id) {
      const source = library.spaces.find(space => space.id === id);
      if (!source) return { status: 'failed', reason: 'not-found' };
      const copy = createSpace({
        name: uniqueName(source.name, library.spaces),
        field: source.field,
        unavailableAreas: source.unavailableAreas.map(area => ({ ...area, id: makeId('area') }))
      }, { makeId, now });
      if (!copy || !spaceAreasInsideField(copy)) return { status: 'failed', reason: 'invalid-space' };
      const saved = persist({ version: VERSION, spaces: [...library.spaces, copy] });
      return saved.status === 'saved' ? { ...saved, status: 'duplicated', space: deepClone(copy) } : saved;
    }

    function remove(id) {
      if (!library.spaces.some(space => space.id === id)) return { status: 'failed', reason: 'not-found' };
      const saved = persist({ version: VERSION, spaces: library.spaces.filter(space => space.id !== id) });
      return saved.status === 'saved' ? { ...saved, status: 'deleted', id } : saved;
    }

    function get(id) {
      const space = library.spaces.find(item => item.id === id);
      return space ? deepClone(space) : null;
    }

    return Object.freeze({ key, restore, list, get, create, update, rename, duplicate, delete: remove, serialize: () => JSON.stringify(library) });
  }

  return Object.freeze({
    STORAGE_KEY, VERSION, MIN_FIELD_CM, MAX_FIELD_CM, GRID_VALUES,
    deepClone, normalizeName, sameName, validateAreaName, normalizeRotation, normalizeField,
    normalizeArea, areaInsideField, normalizeSpace, normalizeLibrary, uniqueName, createSpace,
    replaceSpace, createSavedSpaceStore
  });
}));
