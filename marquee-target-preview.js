(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_MARQUEE_TARGET_PREVIEW = api;
  if (root && root.document) api.install(root.document, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTIVE_MODES = Object.freeze(['move', 'delete', 'color']);
  const EPSILON = 1e-7;

  function hoverStyleForMode(mode) {
    if (mode === 'delete') return Object.freeze({ stroke: '#ff5268', fill: 'rgba(255,82,104,.22)' });
    if (mode === 'color') return Object.freeze({ stroke: '#c888ff', fill: 'rgba(200,136,255,.20)' });
    return Object.freeze({ stroke: '#55d7ff', fill: 'rgba(85,215,255,.18)' });
  }

  function normalizeRect(a = {}, b = {}) {
    const ax = Number(a.x) || 0;
    const ay = Number(a.y) || 0;
    const bx = Number(b.x) || 0;
    const by = Number(b.y) || 0;
    return {
      minX: Math.min(ax, bx),
      minY: Math.min(ay, by),
      maxX: Math.max(ax, bx),
      maxY: Math.max(ay, by)
    };
  }

  function pointInRect(point, rect) {
    return Number(point?.x) >= rect.minX - EPSILON
      && Number(point?.x) <= rect.maxX + EPSILON
      && Number(point?.y) >= rect.minY - EPSILON
      && Number(point?.y) <= rect.maxY + EPSILON;
  }

  function cross(a, b, c) {
    return (Number(b.x) - Number(a.x)) * (Number(c.y) - Number(a.y))
      - (Number(b.y) - Number(a.y)) * (Number(c.x) - Number(a.x));
  }

  function pointOnSegment(point, a, b) {
    if (Math.abs(cross(a, b, point)) > EPSILON) return false;
    return Number(point.x) >= Math.min(Number(a.x), Number(b.x)) - EPSILON
      && Number(point.x) <= Math.max(Number(a.x), Number(b.x)) + EPSILON
      && Number(point.y) >= Math.min(Number(a.y), Number(b.y)) - EPSILON
      && Number(point.y) <= Math.max(Number(a.y), Number(b.y)) + EPSILON;
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
      && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
    return pointOnSegment(c, a, b) || pointOnSegment(d, a, b)
      || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
  }

  function pointInPolygon(point, polygon) {
    const points = Array.isArray(polygon) ? polygon : [];
    if (points.length < 3) return false;
    for (let index = 0; index < points.length; index += 1) {
      if (pointOnSegment(point, points[index], points[(index + 1) % points.length])) return true;
    }
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
      const a = points[index];
      const b = points[previous];
      const intersects = ((Number(a.y) > Number(point.y)) !== (Number(b.y) > Number(point.y)))
        && (Number(point.x) < (Number(b.x) - Number(a.x)) * (Number(point.y) - Number(a.y))
          / ((Number(b.y) - Number(a.y)) || Number.EPSILON) + Number(a.x));
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function polygonIntersectsRect(polygon, rect) {
    const points = Array.isArray(polygon) ? polygon : [];
    if (!points.length) return false;
    if (points.some(point => pointInRect(point, rect))) return true;
    const corners = [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY }
    ];
    if (corners.some(point => pointInPolygon(point, points))) return true;
    const rectEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (rectEdges.some(([c, d]) => segmentsIntersect(a, b, c, d))) return true;
    }
    return false;
  }

  function polygonBounds(polygon) {
    const points = Array.isArray(polygon) ? polygon : [];
    if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return {
      minX: Math.min(...points.map(point => Number(point.x) || 0)),
      minY: Math.min(...points.map(point => Number(point.y) || 0)),
      maxX: Math.max(...points.map(point => Number(point.x) || 0)),
      maxY: Math.max(...points.map(point => Number(point.y) || 0))
    };
  }

  function transformedBounds(localBounds = {}, x = 0, y = 0, rotation = 0) {
    const minX = Number(localBounds.minX) || 0;
    const minY = Number(localBounds.minY) || 0;
    const maxX = Number(localBounds.maxX) || 0;
    const maxY = Number(localBounds.maxY) || 0;
    const radians = (Number(rotation) || 0) * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const corners = [
      { x: minX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: maxY }, { x: minX, y: maxY }
    ].map(point => ({
      x: Number(x) + point.x * cosine - point.y * sine,
      y: Number(y) + point.x * sine + point.y * cosine
    }));
    return polygonBounds(corners);
  }

  function boundsIntersectRect(bounds, rect) {
    return bounds.maxX >= rect.minX - EPSILON
      && bounds.minX <= rect.maxX + EPSILON
      && bounds.maxY >= rect.minY - EPSILON
      && bounds.minY <= rect.maxY + EPSILON;
  }

  function definitionForPart(part, catalog) {
    const type = part?.id === 'start' ? 'start' : part?.type;
    return catalog?.PARTS?.[type] || null;
  }

  function occupancyPolygon(part, catalog, graph) {
    const definition = definitionForPart(part, catalog);
    if (!part || !definition || typeof graph?.occupancyPolygon !== 'function') return [];
    return graph.occupancyPolygon(part, definition) || [];
  }

  function partIntersectsRect(part, rect, catalog, graph) {
    const definition = definitionForPart(part, catalog);
    if (!definition) return false;
    const polygon = occupancyPolygon(part, catalog, graph);
    if (part?.id === 'start' || part?.type === 'start' || definition.corner45) {
      return polygonIntersectsRect(polygon, rect);
    }
    const localBounds = definition.geometry?.bounds;
    const bounds = localBounds
      ? transformedBounds(localBounds, part.x, part.y, part.rotation)
      : polygonBounds(polygon);
    return boundsIntersectRect(bounds, rect);
  }

  function targetPartsInRect(layout, rect, catalog, graph) {
    const matches = (Array.isArray(layout?.parts) ? layout.parts : [])
      .filter(part => partIntersectsRect(part, rect, catalog, graph));
    if (layout?.start && partIntersectsRect({ ...layout.start, id: 'start', type: 'start' }, rect, catalog, graph)) {
      matches.push({ ...layout.start, id: 'start', type: 'start' });
    }
    return matches;
  }

  function pointHitsCoursePart(layout, point, catalog, graph) {
    const all = [
      ...(Array.isArray(layout?.parts) ? layout.parts : []),
      ...(layout?.start ? [{ ...layout.start, id: 'start', type: 'start' }] : [])
    ];
    return all.some(part => pointInPolygon(point, occupancyPolygon(part, catalog, graph)));
  }

  function pointHitsObstacle(layout, point, obstacleGeometry) {
    if (!obstacleGeometry || typeof obstacleGeometry.corners !== 'function') return false;
    return (Array.isArray(layout?.obstacles) ? layout.obstacles : []).some(obstacle => {
      if (obstacle?.visible === false) return false;
      const polygon = obstacleGeometry.corners(obstacle) || [];
      if (typeof obstacleGeometry.pointInPolygon === 'function') return obstacleGeometry.pointInPolygon(point, polygon);
      return pointInPolygon(point, polygon);
    });
  }

  function install(documentRef, rootRef) {
    if (!documentRef || !rootRef || rootRef.__M4WD_MARQUEE_TARGET_PREVIEW_INSTALLED__) return false;
    const courseCanvas = documentRef.getElementById('courseCanvas');
    if (!courseCanvas) return false;

    const catalog = rootRef.M4WD_PART_CATALOG;
    const graph = rootRef.M4WD_LAYOUT_GRAPH;
    const roomBoundary = rootRef.M4WD_ROOM_BOUNDARY;
    const obstacleGeometry = rootRef.M4WD_OBSTACLE_GEOMETRY;
    if (!catalog?.PARTS || typeof graph?.occupancyPolygon !== 'function'
      || typeof roomBoundary?.screenToWorld !== 'function' || typeof roomBoundary?.worldToScreen !== 'function') return false;

    rootRef.__M4WD_MARQUEE_TARGET_PREVIEW_INSTALLED__ = true;

    const overlay = documentRef.createElement('canvas');
    overlay.id = 'marqueeTargetPreviewCanvas';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.targetIds = '[]';
    overlay.dataset.targetCount = '0';
    overlay.dataset.mode = '';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      zIndex: '18',
      pointerEvents: 'none',
      display: 'none'
    });
    documentRef.body.appendChild(overlay);

    let debug = null;
    let active = null;
    let lastView = null;
    let lastTargets = [];
    let attachAttempts = 0;

    const clearOverlay = () => {
      const context = overlay.getContext('2d');
      if (context) context.clearRect(0, 0, overlay.width, overlay.height);
      overlay.style.display = 'none';
      overlay.dataset.targetIds = '[]';
      overlay.dataset.targetCount = '0';
      overlay.dataset.mode = '';
      lastTargets = [];
      lastView = null;
    };

    const syncOverlayGeometry = () => {
      const rect = courseCanvas.getBoundingClientRect();
      const dpr = Math.max(1, Number(rootRef.devicePixelRatio) || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      if (overlay.width !== width) overlay.width = width;
      if (overlay.height !== height) overlay.height = height;
      return { rect, dpr };
    };

    const drawTargets = (targets, mode, view) => {
      const { dpr } = syncOverlayGeometry();
      const context = overlay.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);
      const style = hoverStyleForMode(mode);
      context.save();
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = 2.5;
      context.strokeStyle = style.stroke;
      context.fillStyle = style.fill;
      context.shadowColor = style.stroke;
      context.shadowBlur = 12;
      targets.forEach(part => {
        const polygon = occupancyPolygon(part, catalog, graph);
        if (polygon.length < 3) return;
        context.beginPath();
        polygon.forEach((point, index) => {
          const screen = roomBoundary.worldToScreen(point, view || {});
          if (index === 0) context.moveTo(screen.x, screen.y);
          else context.lineTo(screen.x, screen.y);
        });
        context.closePath();
        context.fill();
        context.stroke();
      });
      context.restore();
      overlay.style.display = targets.length ? 'block' : 'none';
      overlay.dataset.targetIds = JSON.stringify(targets.map(part => String(part.id)));
      overlay.dataset.targetCount = String(targets.length);
      overlay.dataset.mode = String(mode || '');
      lastTargets = targets;
      lastView = view ? { ...view } : null;
    };

    const eventWorldPoint = event => {
      const runtime = debug?.getRuntimeState?.();
      const rect = courseCanvas.getBoundingClientRect();
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      return {
        world: roomBoundary.screenToWorld(local, runtime?.view || {}),
        local,
        runtime
      };
    };

    const finishPreview = () => {
      active = null;
      clearOverlay();
    };

    const wire = debugHandle => {
      debug = debugHandle;

      documentRef.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target !== courseCanvas) return;
        let runtime;
        let layout;
        try {
          runtime = debug.getRuntimeState();
          layout = debug.getState();
        } catch (_) { return; }
        if (!ACTIVE_MODES.includes(runtime?.mode)) return;
        const rect = courseCanvas.getBoundingClientRect();
        const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const world = roomBoundary.screenToWorld(local, runtime.view || {});
        if (pointHitsCoursePart(layout, world, catalog, graph)) return;
        if (runtime.mode === 'move' && pointHitsObstacle(layout, world, obstacleGeometry)) return;
        active = {
          pointerId: event.pointerId,
          mode: runtime.mode,
          layout,
          startWorld: world,
          startLocal: local
        };
        clearOverlay();
      }, true);

      documentRef.addEventListener('pointermove', event => {
        if (!active || active.pointerId !== event.pointerId) return;
        let current;
        try { current = eventWorldPoint(event); } catch (_) { return; }
        if (!current?.world) return;
        if (Math.hypot(current.local.x - active.startLocal.x, current.local.y - active.startLocal.y) < 2) {
          clearOverlay();
          return;
        }
        const rect = normalizeRect(active.startWorld, current.world);
        const targets = targetPartsInRect(active.layout, rect, catalog, graph);
        drawTargets(targets, active.mode, current.runtime?.view || {});
      }, true);

      documentRef.addEventListener('pointerup', event => {
        if (active?.pointerId === event.pointerId) finishPreview();
      }, true);
      documentRef.addEventListener('pointercancel', event => {
        if (active?.pointerId === event.pointerId) finishPreview();
      }, true);
      courseCanvas.addEventListener('lostpointercapture', () => {
        if (active) finishPreview();
      });

      rootRef.addEventListener?.('resize', () => {
        if (active && lastTargets.length && lastView) drawTargets(lastTargets, active.mode, lastView);
      });
      rootRef.addEventListener?.('scroll', () => {
        if (active && lastTargets.length && lastView) drawTargets(lastTargets, active.mode, lastView);
      }, true);
    };

    const attach = () => {
      const candidate = rootRef.__mini4wdCourseDebug;
      if (candidate && typeof candidate.getState === 'function' && typeof candidate.getRuntimeState === 'function') {
        wire(candidate);
        return;
      }
      attachAttempts += 1;
      if (attachAttempts < 80 && rootRef.setTimeout) rootRef.setTimeout(attach, 0);
    };

    attach();
    return true;
  }

  return Object.freeze({
    ACTIVE_MODES,
    hoverStyleForMode,
    normalizeRect,
    pointInRect,
    pointInPolygon,
    polygonIntersectsRect,
    transformedBounds,
    boundsIntersectRect,
    partIntersectsRect,
    targetPartsInRect,
    install
  });
});
