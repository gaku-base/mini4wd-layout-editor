(() => {
  'use strict';

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const normalizeAngle = value => ((finite(value) % 360) + 360) % 360;

  function resolvePartPose(part = {}) {
    return Object.freeze({
      rotation: finite(part.rotation)
    });
  }

  function cornerY(definition, y) {
    return definition?.geometry?.pathOrientation === 'left' ? -finite(y) : finite(y);
  }

  function cornerGeometry(definition) {
    const trackWidth = finite(definition?.geometry?.outerRadius) - finite(definition?.geometry?.innerRadius);
    const r = finite(definition?.geometry?.centerlineRadius, finite(definition?.radius, 54));
    const angle = Math.PI / 4;
    const ri = finite(definition?.geometry?.innerRadius, r - trackWidth / 2);
    const ro = finite(definition?.geometry?.outerRadius, r + trackWidth / 2);
    const radialCentroid = (4 * Math.sin(angle / 2) / (3 * angle)) * ((ro ** 3 - ri ** 3) / (ro ** 2 - ri ** 2));
    const bisector = -3 * Math.PI / 8;
    const center = { x: -radialCentroid * Math.cos(bisector), y: -radialCentroid * Math.sin(bisector) };
    const startAngle = -Math.PI / 2;
    const endAngle = -Math.PI / 4;
    const entry = { x: center.x + r * Math.cos(startAngle), y: cornerY(definition, center.y + r * Math.sin(startAngle)) };
    const exit = { x: center.x + r * Math.cos(endAngle), y: cornerY(definition, center.y + r * Math.sin(endAngle)) };
    const points = localCornerPath(definition, 48, { r, ri, ro, center, startAngle, endAngle });
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    return { r, ri, ro, entry, exit, center, startAngle, endAngle, bounds: { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY } };
  }

  function localCornerPath(definition, samples = 48, resolvedGeometry = null) {
    const g = resolvedGeometry || cornerGeometry(definition);
    const count = Math.max(1, Math.round(finite(samples, 48)));
    const points = [];
    for (let index = 0; index <= count; index++) {
      const angle = g.startAngle + (g.endAngle - g.startAngle) * index / count;
      points.push({ x: g.center.x + g.ro * Math.cos(angle), y: cornerY(definition, g.center.y + g.ro * Math.sin(angle)) });
    }
    for (let index = count; index >= 0; index--) {
      const angle = g.startAngle + (g.endAngle - g.startAngle) * index / count;
      points.push({ x: g.center.x + g.ri * Math.cos(angle), y: cornerY(definition, g.center.y + g.ri * Math.sin(angle)) });
    }
    return points;
  }

  function transformPoint(part, point) {
    const localX = finite(point?.x);
    const localY = finite(point?.y);
    const rotation = finite(part?.rotation);
    const radians = rotation * Math.PI / 180;
    return {
      x: finite(part?.x) + localX * Math.cos(radians) - localY * Math.sin(radians),
      y: finite(part?.y) + localX * Math.sin(radians) + localY * Math.cos(radians)
    };
  }

  function tracePartPath(definition, part, samples = 48) {
    if (!definition) return [];
    const local = definition.corner45
      ? localCornerPath(definition, samples)
      : [
          { x: finite(definition.geometry?.bounds?.minX, -finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.minY, -finite(definition.h) / 2) },
          { x: finite(definition.geometry?.bounds?.maxX, finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.minY, -finite(definition.h) / 2) },
          { x: finite(definition.geometry?.bounds?.maxX, finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.maxY, finite(definition.h) / 2) },
          { x: finite(definition.geometry?.bounds?.minX, -finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.maxY, finite(definition.h) / 2) }
        ];
    return local.map(point => transformPoint(part, point));
  }

  function traceConnectors(definition, part) {
    return (definition?.geometry?.connectors || []).map((connector, index) => {
      const point = transformPoint(part, { x: connector.x, y: connector.y });
      return {
        id: connector.id || (index === 0 ? 'a' : 'b'),
        x: point.x,
        y: point.y,
        heading: normalizeAngle(finite(connector.heading) + finite(part.rotation))
      };
    });
  }

  function tracePart(definition, part, samples = 48) {
    return {
      pose: resolvePartPose(part),
      shapeVariant: definition?.renderKind || part?.type || null,
      path: tracePartPath(definition, part, samples),
      connectors: traceConnectors(definition, part)
    };
  }

  function readStatusRotation(documentValue) {
    const text = documentValue?.getElementById?.('statusRotation')?.textContent;
    const match = String(text == null ? '' : text).match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function rotatedRectSize(width, height, rotationDeg) {
    const w = Number(width);
    const h = Number(height);
    const rotation = Number(rotationDeg);
    if (![w, h, rotation].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    const radians = rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    return { w: w * cos + h * sin, h: w * sin + h * cos };
  }

  function startOutlineGuideGeometry(definition, sourceRect, rotationDeg, lineWidth = 0) {
    const width = Number(definition?.w);
    const height = Number(definition?.h);
    const x = Number(sourceRect?.x);
    const y = Number(sourceRect?.y);
    const sourceWidth = Number(sourceRect?.w);
    const sourceHeight = Number(sourceRect?.h);
    const rotation = Number(rotationDeg);
    const strokeWidth = Number(lineWidth);
    if (![width, height, x, y, sourceWidth, sourceHeight, rotation, strokeWidth].every(Number.isFinite)
        || width <= 0 || height <= 0 || sourceWidth < 0 || sourceHeight < 0 || strokeWidth < 0) return null;
    const padding = strokeWidth / 2;
    return {
      center: { x: x + sourceWidth / 2, y: y + sourceHeight / 2 },
      rotationDeg: normalizeAngle(rotation),
      rect: {
        x: -width / 2 - padding,
        y: -height / 2 - padding,
        w: width + padding * 2,
        h: height + padding * 2
      }
    };
  }

  function sourceRectMatchesRotatedStart(definition, sourceRect, rotationDeg, epsilon = 1e-6) {
    const expected = rotatedRectSize(definition?.w, definition?.h, rotationDeg);
    const sourceWidth = Number(sourceRect?.w);
    const sourceHeight = Number(sourceRect?.h);
    const tolerance = Number(epsilon);
    if (!expected || ![sourceWidth, sourceHeight, tolerance].every(Number.isFinite) || tolerance < 0) return false;
    return Math.abs(sourceWidth - expected.w) <= tolerance
      && Math.abs(sourceHeight - expected.h) <= tolerance;
  }

  function sourceRectIsPhysicalStartBody(definition, sourceRect, epsilon = 1e-6) {
    const width = Number(definition?.w);
    const height = Number(definition?.h);
    const x = Number(sourceRect?.x);
    const y = Number(sourceRect?.y);
    const sourceWidth = Number(sourceRect?.w);
    const sourceHeight = Number(sourceRect?.h);
    const tolerance = Number(epsilon);
    if (![width, height, x, y, sourceWidth, sourceHeight, tolerance].every(Number.isFinite)
        || width <= 0 || height <= 0 || tolerance < 0) return false;
    return Math.abs(x + width / 2) <= tolerance
      && Math.abs(y + height / 2) <= tolerance
      && Math.abs(sourceWidth - width) <= tolerance
      && Math.abs(sourceHeight - height) <= tolerance;
  }

  function isPhysicalStartBodyStroke(context, startDefinition, sourceRect) {
    if (!context || context.canvas?.id !== 'courseCanvas') return false;
    if (!context.canvas.classList?.contains?.('mode-start-position')) return false;
    const dash = typeof context.getLineDash === 'function' ? context.getLineDash() : [];
    if (Array.isArray(dash) && dash.length !== 0) return false;
    return sourceRectIsPhysicalStartBody(startDefinition, sourceRect);
  }

  function shouldReplaceStartGuideStroke(context, documentValue, startDefinition, sourceRect, pendingStartGuide = false) {
    if (!pendingStartGuide) return false;
    if (!context || context.canvas?.id !== 'courseCanvas') return false;
    if (!context.canvas.classList?.contains?.('mode-start-position')) return false;
    const dash = typeof context.getLineDash === 'function' ? context.getLineDash() : [];
    if (!Array.isArray(dash) || dash.length === 0) return false;
    const rotation = readStatusRotation(documentValue);
    if (!Number.isFinite(rotation)) return false;
    return sourceRectMatchesRotatedStart(startDefinition, sourceRect, rotation);
  }

  function installStartPlacementOutlineGuide(rootValue) {
    const root = rootValue || (typeof window !== 'undefined' ? window : null);
    const prototype = root?.CanvasRenderingContext2D?.prototype;
    if (!prototype || typeof prototype.strokeRect !== 'function') return false;
    if (prototype.__m4wdStartOutlineGuideInstalled) return true;
    const originalStrokeRect = prototype.strokeRect;
    const pendingStartGuideContexts = new WeakSet();
    Object.defineProperty(prototype, '__m4wdStartOutlineGuideInstalled', {
      configurable: true,
      value: true
    });
    prototype.strokeRect = function (x, y, w, h) {
      const documentValue = root.document;
      const startDefinition = root.M4WD_PART_CATALOG?.PARTS?.start;
      const sourceRect = { x, y, w, h };
      if (isPhysicalStartBodyStroke(this, startDefinition, sourceRect)) {
        pendingStartGuideContexts.add(this);
        return originalStrokeRect.call(this, x, y, w, h);
      }
      const pendingStartGuide = pendingStartGuideContexts.has(this);
      if (pendingStartGuide) pendingStartGuideContexts.delete(this);
      if (shouldReplaceStartGuideStroke(this, documentValue, startDefinition, sourceRect, pendingStartGuide)) {
        const geometry = startOutlineGuideGeometry(
          startDefinition,
          sourceRect,
          readStatusRotation(documentValue),
          Number(this.lineWidth) || 0
        );
        if (geometry) {
          this.save();
          this.translate(geometry.center.x, geometry.center.y);
          this.rotate(geometry.rotationDeg * Math.PI / 180);
          originalStrokeRect.call(this, geometry.rect.x, geometry.rect.y, geometry.rect.w, geometry.rect.h);
          this.restore();
          return;
        }
      }
      return originalStrokeRect.call(this, x, y, w, h);
    };
    return true;
  }

  const api = Object.freeze({
    resolvePartPose,
    cornerGeometry,
    localCornerPath,
    transformPoint,
    tracePartPath,
    traceConnectors,
    tracePart,
    readStatusRotation,
    rotatedRectSize,
    startOutlineGuideGeometry,
    sourceRectMatchesRotatedStart,
    sourceRectIsPhysicalStartBody,
    isPhysicalStartBodyStroke,
    shouldReplaceStartGuideStroke,
    installStartPlacementOutlineGuide
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.M4WD_PART_RENDER_POSE = api;
    installStartPlacementOutlineGuide(window);
  }
})();