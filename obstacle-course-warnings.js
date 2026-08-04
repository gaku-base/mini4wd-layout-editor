(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_OBSTACLE_COURSE_WARNINGS = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function collect(obstacles, parts, obstaclePolygon, partPolygon, polygonsIntersect) {
    const warnings = [];
    (obstacles || []).filter(obstacle => obstacle && obstacle.visible).forEach(obstacle => {
      const obstacleShape = obstaclePolygon(obstacle);
      (parts || []).forEach(part => {
        if (!part || !polygonsIntersect(obstacleShape, partPolygon(part))) return;
        warnings.push({ type: 'obstacle-interference', obstacleId: obstacle.id, partIds: [part.id] });
      });
    });
    return warnings;
  }

  function partIdsFor(warnings, obstacleId) {
    return (warnings || []).filter(warning => warning.obstacleId === obstacleId).flatMap(warning => warning.partIds || []);
  }

  return { collect, partIdsFor };
});
