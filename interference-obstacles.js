(function attachInterferenceObstacles(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_INTERFERENCE_OBSTACLES = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  const MAX_DIMENSION_CM = 5000;
  const finite = value => Number.isFinite(Number(value));
  const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
  const normalizeRotation = value => ((number(value) % 360) + 360) % 360;

  function normalizeObstacle(value, options = {}) {
    if (!value || typeof value !== 'object') return null;
    const widthCm = Number(value.widthCm);
    const depthCm = Number(value.depthCm);
    const x = Number(value.x);
    const y = Number(value.y);
    if (typeof value.id !== 'string' || !value.id || !Number.isFinite(x) || !Number.isFinite(y)
      || !Number.isFinite(widthCm) || !Number.isFinite(depthCm) || widthCm <= 0 || depthCm <= 0
      || widthCm > MAX_DIMENSION_CM || depthCm > MAX_DIMENSION_CM) return null;
    const fallbackName = options.fallbackName || '設置不可エリア';
    const name = String(value.name || fallbackName).trim().slice(0, 80) || fallbackName;
    return {
      id: value.id,
      name,
      x,
      y,
      widthCm,
      depthCm,
      rotation: normalizeRotation(value.rotation),
      visible: value.visible !== false,
      locked: value.locked === true
    };
  }

  function normalizeObstacles(values) {
    const ids = new Set();
    return (Array.isArray(values) ? values : []).map(normalizeObstacle).filter(obstacle => {
      if (!obstacle || ids.has(obstacle.id)) return false;
      ids.add(obstacle.id);
      return true;
    });
  }

  function createObstacle(values, makeId, index = 0) {
    return normalizeObstacle({
      id: makeId(),
      name: values?.name || `エリア${index + 1}`,
      x: values?.x,
      y: values?.y,
      widthCm: values?.widthCm,
      depthCm: values?.depthCm,
      rotation: values?.rotation || 0,
      visible: true,
      locked: false
    });
  }

  function updateObstacle(obstacle, changes) {
    return normalizeObstacle({ ...obstacle, ...changes }, { fallbackName: obstacle?.name || '設置不可エリア' });
  }

  function duplicateObstacle(obstacle, makeId, isValid) {
    const offsets = [[20, 20], [20, 0], [0, 20], [-20, 20], [20, -20], [-20, 0], [0, -20]];
    for (const [dx, dy] of offsets) {
      const copy = normalizeObstacle({ ...obstacle, id: makeId(), name: `${obstacle.name} コピー`, x: obstacle.x + dx, y: obstacle.y + dy, locked: false });
      if (copy && (!isValid || isValid(copy))) return copy;
    }
    return null;
  }

  return Object.freeze({ MAX_DIMENSION_CM, normalizeRotation, normalizeObstacle, normalizeObstacles, createObstacle, updateObstacle, duplicateObstacle });
}));
