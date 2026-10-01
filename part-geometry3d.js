(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PART_GEOMETRY_3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const EPS = 1e-6;
  const DEFAULT_SAMPLES = 24;
  const CURVE_SAMPLES = 20;
  const WAVE_SAMPLES = 36;
  const BURNING_ARC_SAMPLES = 36;
  const BURNING_BRIDGE_SAMPLES = 24;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function degToRad(value) {
    return finite(value) * Math.PI / 180;
  }

  function cmToMm(value) {
    return finite(value) * 10;
  }

  function clonePoint(point) {
    return { x: finite(point?.x), y: finite(point?.y), z: finite(point?.z) };
  }

  function catalogDimensions(catalog) {
    const dimensions = catalog?.PART_DIMENSIONS_MM;
    if (!dimensions) throw new Error('PART_DIMENSIONS_MM is required for 3D generation.');
    return dimensions;
  }

  function definitionFor(type, catalog) {
    const definition = catalog?.PARTS?.[type];
    if (!definition) throw new Error(`Unknown part type: ${type}`);
    return definition;
  }

  function runtimeTrackWidthMm(catalog, type = null) {
    const dimensions = catalogDimensions(catalog);
    if (type === 'wave') return finite(dimensions.wave?.trackWidthMm, dimensions.common?.runtimeTrackWidthMm);
    if (type === 'corner-45-right' || type === 'corner-45-left') {
      return finite(dimensions.corner45?.trackWidthMm, dimensions.common?.runtimeTrackWidthMm);
    }
    if (type === 'burning') return finite(dimensions.burning?.trackWidthMm, dimensions.common?.runtimeTrackWidthMm);
    const width = finite(dimensions.common?.runtimeTrackWidthMm, NaN);
    if (!Number.isFinite(width) || width <= 0) throw new Error('runtimeTrackWidthMm is required for 3D generation.');
    return width;
  }

  function fenceHeightMm(type, catalog) {
    const definition = definitionFor(type, catalog);
    const measured = finite(definition?.measurements?.sideWallHeightAboveRunningSurfaceMm?.value, NaN);
    if (Number.isFinite(measured) && measured > 0) return measured;
    const official = finite(catalog?.OFFICIAL_DIMENSION_REFERENCES_MM?.fenceHeightMm, NaN);
    if (Number.isFinite(official) && official > 0) return official;
    throw new Error(`Fence height is required for 3D generation: ${type}`);
  }

  function colorContract(type, part = {}, catalog = {}) {
    const definition = definitionFor(type, catalog);
    const variants = {
      default: { base: definition.base || '#efede9', lane: definition.lane || '#8d8c89', edge: definition.edge || '#858480' },
      red: { base: '#df252d', lane: '#98141b', edge: '#7d1016' },
      blue: { base: '#087fc2', lane: '#07557f', edge: '#06405f' },
      orange: { base: '#f4b42b', lane: '#b67800', edge: '#865800' },
      green: { base: '#35bd8b', lane: '#1b8964', edge: '#156c4f' },
      white: { base: '#ffffff', lane: '#b5b5b2', edge: '#999995' }
    };
    return variants[part.colorKey] || variants.default;
  }

  function sourceDimensionSnapshot(type, catalog) {
    const d = catalogDimensions(catalog);
    const common = d.common || {};
    if (type === 'straight') return Object.freeze({ lengthMm:d.straight.lengthMm, depthMm:d.straight.depthMm, trackWidthMm:common.runtimeTrackWidthMm });
    if (type === 'start') return Object.freeze({ lengthMm:d.start.lengthMm, depthMm:d.start.depthMm, trackWidthMm:common.runtimeTrackWidthMm });
    if (type === 'corner-45-right' || type === 'corner-45-left') {
      return Object.freeze({
        centerlineRadiusMm:d.corner45.centerlineRadiusMm,
        innerRadiusMm:d.corner45.innerRadiusMm,
        outerRadiusMm:d.corner45.outerRadiusMm,
        trackWidthMm:d.corner45.trackWidthMm,
        angleDeg:d.corner45.angleDeg,
        connectorA:Object.freeze({ ...d.corner45.rightConnectorA }),
        connectorB:Object.freeze({ ...d.corner45.rightConnectorB })
      });
    }
    if (type === 'lanechange') return Object.freeze({ lengthMm:d.lanechange.lengthMm, depthMm:d.lanechange.depthMm, trackWidthMm:common.runtimeTrackWidthMm });
    if (type === 'wave') return Object.freeze({ lengthMm:d.wave.lengthMm, visualDepthMm:d.wave.visualDepthMm, trackWidthMm:d.wave.trackWidthMm, amplitudeMm:d.wave.amplitudeMm, connectorYMm:d.wave.connectorYMm });
    if (type === 'slope') return Object.freeze({ horizontalSpanMm:d.slope.horizontalSpanMm, depthMm:d.slope.depthMm, heightDeltaMm:d.slope.heightDeltaMm, trackWidthMm:common.runtimeTrackWidthMm });
    if (type === 'bank20') return Object.freeze({ connectorSpanMm:d.bank20.connectorSpanMm, depthMm:d.bank20.depthMm, bankAngleDeg:d.bank20.bankAngleDeg, trackWidthMm:common.runtimeTrackWidthMm });
    if (type === 'lcjump') return Object.freeze({ lengthMm:d.lcjump.lengthMm, depthMm:d.lcjump.depthMm, trackWidthMm:common.runtimeTrackWidthMm });
    if (type === 'burning') {
      return Object.freeze({
        displayWidthMm:d.burning.displayWidthMm,
        displayDepthMm:d.burning.displayDepthMm,
        trackWidthMm:d.burning.trackWidthMm,
        centerlineRadiusMm:d.burning.centerlineRadiusMm,
        innerRadiusMm:d.burning.innerRadiusMm,
        outerRadiusMm:d.burning.outerRadiusMm,
        endpointXMm:d.burning.endpointXMm,
        endpointYMm:d.burning.endpointYMm,
        arcCenterXMm:d.burning.arcCenterXMm
      });
    }
    return Object.freeze({});
  }

  function straightPath(lengthMm, zFn = () => 0, bankFn = () => 0, samples = DEFAULT_SAMPLES) {
    const length = finite(lengthMm);
    const count = Math.max(1, Math.trunc(samples));
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      points.push({
        x: -length / 2 + length * t,
        y: 0,
        z: finite(zFn(t)),
        bankDeg: finite(bankFn(t)),
        t
      });
    }
    return points;
  }

  function wavePath(type, part, catalog) {
    const d = catalogDimensions(catalog).wave;
    const length = finite(d.lengthMm);
    const amplitude = finite(d.amplitudeMm);
    const connectorY = finite(d.connectorYMm);
    const bank = finite(part?.bankAngleDeg);
    const points = [];
    for (let index = 0; index <= WAVE_SAMPLES; index += 1) {
      const t = index / WAVE_SAMPLES;
      const x = -length / 2 + length * t;
      const y = connectorY - amplitude * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t));
      points.push({ x, y, z:0, bankDeg:bank, t });
    }
    return points;
  }

  function slopePath(part, catalog, dependencies = {}) {
    const d = catalogDimensions(catalog).slope;
    const length = finite(d.horizontalSpanMm);
    const rise = finite(d.heightDeltaMm);
    const profile = dependencies.slopeProfile;
    const sourceLength = finite(profile?.horizontalMm, length) || length;
    const sourceRise = finite(profile?.riseMm, rise) || rise;
    const bank = finite(part?.bankAngleDeg);
    return straightPath(length, t => {
      if (!profile || typeof profile.heightAtHorizontalX !== 'function') return rise * t;
      const sourceX = sourceLength * t;
      const sourceZ = finite(profile.heightAtHorizontalX(sourceX), sourceRise * t);
      return sourceRise ? sourceZ / sourceRise * rise : rise * t;
    }, () => bank, 36);
  }

  function bankPath(part, catalog) {
    const d = catalogDimensions(catalog).bank20;
    const length = finite(d.connectorSpanMm);
    const base = finite(part?.bankAngleDeg);
    const delta = finite(d.bankAngleDeg);
    return straightPath(length, () => 0, t => base + delta * t, 18);
  }

  function cornerPath(type, part, catalog) {
    const d = catalogDimensions(catalog).corner45;
    const mirror = type === 'corner-45-left' ? -1 : 1;
    const start = {
      x: finite(d.rightConnectorA?.xMm),
      y: finite(d.rightConnectorA?.yMm) * mirror
    };
    const end = {
      x: finite(d.rightConnectorB?.xMm),
      y: finite(d.rightConnectorB?.yMm) * mirror
    };
    const radius = finite(d.centerlineRadiusMm);
    const angleMagnitude = degToRad(d.angleDeg);
    const startHeading = 0;
    const startNormal = { x:0, y:mirror };
    const center = {
      x: start.x + startNormal.x * radius,
      y: start.y + startNormal.y * radius
    };
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const direction = mirror;
    const bank = finite(part?.bankAngleDeg);
    const points = [];
    for (let index = 0; index <= CURVE_SAMPLES; index += 1) {
      const t = index / CURVE_SAMPLES;
      const angle = startAngle + direction * angleMagnitude * t;
      points.push({
        x:center.x + Math.cos(angle) * radius,
        y:center.y + Math.sin(angle) * radius,
        z:0,
        bankDeg:bank,
        t
      });
    }
    points[0].x = start.x;
    points[0].y = start.y;
    points[points.length - 1].x = end.x;
    points[points.length - 1].y = end.y;
    return points;
  }

  function pointOnCubic(curve, t) {
    const u = 1 - t;
    return {
      x:u ** 3 * curve.start.x + 3 * u ** 2 * t * curve.control1.x + 3 * u * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
      y:u ** 3 * curve.start.y + 3 * u ** 2 * t * curve.control1.y + 3 * u * t ** 2 * curve.control2.y + t ** 3 * curve.end.y
    };
  }

  function burningPaths(part, catalog) {
    const d = catalogDimensions(catalog).burning;
    const leftX = finite(d.endpointXMm);
    const endpointY = finite(d.endpointYMm);
    const centerX = finite(d.arcCenterXMm);
    const radius = finite(d.centerlineRadiusMm);
    const trackWidth = finite(d.trackWidthMm);
    const laneWidth = trackWidth / 3;
    const bank = finite(part?.bankAngleDeg);
    const base = [];

    const straightSamples = 12;
    for (let index = 0; index <= straightSamples; index += 1) {
      const t = index / straightSamples;
      base.push({ x:leftX + (centerX - leftX) * t, y:-endpointY, z:0, bankDeg:bank, t:t * .25 });
    }
    for (let index = 1; index <= BURNING_ARC_SAMPLES; index += 1) {
      const t = index / BURNING_ARC_SAMPLES;
      const angle = -Math.PI / 2 + Math.PI * t;
      base.push({ x:centerX + radius * Math.cos(angle), y:radius * Math.sin(angle), z:0, bankDeg:bank, t:.25 + t * .5 });
    }
    for (let index = 1; index <= straightSamples; index += 1) {
      const t = index / straightSamples;
      base.push({ x:centerX + (leftX - centerX) * t, y:endpointY, z:0, bankDeg:bank, t:.75 + t * .25 });
    }
    base[0] = { ...base[0], x:leftX, y:-endpointY };
    base[base.length - 1] = { ...base[base.length - 1], x:leftX, y:endpointY };

    const bridgeApproachX = leftX + (centerX - leftX) * .35;
    const bridgeControlX = centerX - laneWidth;
    const bridgeTopY = -endpointY + laneWidth;
    const bridgeBottomY = endpointY - laneWidth;
    const curve = {
      start:{ x:bridgeApproachX, y:bridgeTopY },
      control1:{ x:bridgeControlX, y:bridgeTopY },
      control2:{ x:bridgeControlX, y:bridgeBottomY },
      end:{ x:bridgeApproachX, y:bridgeBottomY }
    };
    const bridge = [{ x:leftX, y:bridgeTopY, z:0, bankDeg:bank, t:0 }];
    for (let index = 0; index <= 6; index += 1) {
      const t = index / 6;
      bridge.push({ x:leftX + (curve.start.x - leftX) * t, y:bridgeTopY, z:0, bankDeg:bank, t:.15 * t });
    }
    for (let index = 1; index <= BURNING_BRIDGE_SAMPLES; index += 1) {
      const t = index / BURNING_BRIDGE_SAMPLES;
      const point = pointOnCubic(curve, t);
      bridge.push({ x:point.x, y:point.y, z:0, bankDeg:bank, t:.15 + .7 * t });
    }
    for (let index = 1; index <= 6; index += 1) {
      const t = index / 6;
      bridge.push({ x:curve.end.x + (leftX - curve.end.x) * t, y:bridgeBottomY, z:0, bankDeg:bank, t:.85 + .15 * t });
    }
    return [
      { id:'base', samples:base, widthMm:trackWidth, laneCount:3, auxiliary:false },
      { id:'bridge-planar', samples:bridge, widthMm:laneWidth, laneCount:1, auxiliary:true }
    ];
  }

  function centerlinePaths(type, part, catalog, dependencies = {}) {
    const d = catalogDimensions(catalog);
    const bank = finite(part?.bankAngleDeg);
    if (type === 'straight') return [{ id:'main', samples:straightPath(d.straight.lengthMm, () => 0, () => bank), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3 }];
    if (type === 'start') return [{ id:'main', samples:straightPath(d.start.lengthMm, () => 0, () => bank), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3 }];
    if (type === 'lanechange') return [{ id:'main', samples:straightPath(d.lanechange.lengthMm, () => 0, () => bank), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3, simplifiedVertical:true }];
    if (type === 'lcjump') return [{ id:'main', samples:straightPath(d.lcjump.lengthMm, () => 0, () => bank), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3, simplifiedVertical:true }];
    if (type === 'wave') return [{ id:'main', samples:wavePath(type, part, catalog), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3 }];
    if (type === 'slope') return [{ id:'main', samples:slopePath(part, catalog, dependencies), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3 }];
    if (type === 'bank20') return [{ id:'main', samples:bankPath(part, catalog), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3 }];
    if (type === 'corner-45-right' || type === 'corner-45-left') return [{ id:'main', samples:cornerPath(type, part, catalog), widthMm:runtimeTrackWidthMm(catalog, type), laneCount:3 }];
    if (type === 'burning') return burningPaths(part, catalog);
    throw new Error(`3D centerline is not implemented for ${type}`);
  }

  function tangentAt(samples, index) {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    let dx = finite(next?.x) - finite(previous?.x);
    let dy = finite(next?.y) - finite(previous?.y);
    const length = Math.hypot(dx, dy);
    if (length <= EPS) return { x:1, y:0 };
    dx /= length;
    dy /= length;
    return { x:dx, y:dy };
  }

  function sectionPoint(sample, tangent, offsetMm, normalOffsetMm = 0) {
    const nx = -tangent.y;
    const ny = tangent.x;
    const bank = degToRad(sample.bankDeg);
    const cos = Math.cos(bank);
    const sin = Math.sin(bank);
    return {
      x:finite(sample.x) + nx * offsetMm * cos - nx * normalOffsetMm * sin,
      y:finite(sample.y) + ny * offsetMm * cos - ny * normalOffsetMm * sin,
      z:finite(sample.z) + offsetMm * sin + normalOffsetMm * cos
    };
  }

  function addVertex(vertices, point) {
    vertices.push(Object.freeze(clonePoint(point)));
    return vertices.length - 1;
  }

  function addFace(faces, indices, kind, pathId, auxiliary = false) {
    faces.push(Object.freeze({ indices:Object.freeze(indices.slice()), kind, pathId, auxiliary:Boolean(auxiliary) }));
  }

  function buildRibbon(path, fenceHeight, colors) {
    const samples = path.samples || [];
    const width = finite(path.widthMm);
    const laneCount = Math.max(1, Math.trunc(finite(path.laneCount, 3)));
    if (samples.length < 2 || width <= 0) throw new Error('Ribbon requires at least two samples and a positive width.');

    const vertices = [];
    const faces = [];
    const lines = [];
    const sections = [];

    samples.forEach((sample, index) => {
      const tangent = tangentAt(samples, index);
      const left = addVertex(vertices, sectionPoint(sample, tangent, -width / 2, 0));
      const right = addVertex(vertices, sectionPoint(sample, tangent, width / 2, 0));
      const leftTop = addVertex(vertices, sectionPoint(sample, tangent, -width / 2, fenceHeight));
      const rightTop = addVertex(vertices, sectionPoint(sample, tangent, width / 2, fenceHeight));
      sections.push({ left, right, leftTop, rightTop, tangent });
    });

    for (let index = 0; index < sections.length - 1; index += 1) {
      const a = sections[index];
      const b = sections[index + 1];
      addFace(faces, [a.left, a.right, b.right, b.left], 'surface', path.id, path.auxiliary);
      addFace(faces, [a.left, b.left, b.leftTop, a.leftTop], 'wall', path.id, path.auxiliary);
      addFace(faces, [a.right, a.rightTop, b.rightTop, b.right], 'wall', path.id, path.auxiliary);
    }

    for (let lane = 1; lane < laneCount; lane += 1) {
      const offset = -width / 2 + width * lane / laneCount;
      const points = samples.map((sample, index) => sectionPoint(sample, sections[index].tangent, offset, 1.2));
      lines.push(Object.freeze({ kind:'lane', pathId:path.id, auxiliary:Boolean(path.auxiliary), points:Object.freeze(points.map(point => Object.freeze(point))) }));
    }

    const leftTopLine = sections.map(section => vertices[section.leftTop]);
    const rightTopLine = sections.map(section => vertices[section.rightTop]);
    lines.push(Object.freeze({ kind:'edge', pathId:path.id, auxiliary:Boolean(path.auxiliary), points:Object.freeze(leftTopLine) }));
    lines.push(Object.freeze({ kind:'edge', pathId:path.id, auxiliary:Boolean(path.auxiliary), points:Object.freeze(rightTopLine) }));

    return { vertices, faces, lines, colors };
  }

  function mergeMeshes(meshes) {
    const vertices = [];
    const faces = [];
    const lines = [];
    for (const mesh of meshes) {
      const offset = vertices.length;
      vertices.push(...mesh.vertices);
      for (const face of mesh.faces) faces.push(Object.freeze({ ...face, indices:Object.freeze(face.indices.map(index => index + offset)) }));
      lines.push(...mesh.lines);
    }
    return { vertices:Object.freeze(vertices), faces:Object.freeze(faces), lines:Object.freeze(lines) };
  }

  function bounds3d(vertices) {
    if (!vertices?.length) return Object.freeze({ minX:0,maxX:0,minY:0,maxY:0,minZ:0,maxZ:0,widthMm:0,depthMm:0,heightMm:0 });
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const point of vertices) {
      minX=Math.min(minX,point.x); maxX=Math.max(maxX,point.x);
      minY=Math.min(minY,point.y); maxY=Math.max(maxY,point.y);
      minZ=Math.min(minZ,point.z); maxZ=Math.max(maxZ,point.z);
    }
    return Object.freeze({ minX,maxX,minY,maxY,minZ,maxZ,widthMm:maxX-minX,depthMm:maxY-minY,heightMm:maxZ-minZ });
  }

  function connectorContract(type, catalog) {
    const d = catalogDimensions(catalog);
    if (type === 'straight') return [{ x:-d.straight.lengthMm/2,y:0,z:0 },{ x:d.straight.lengthMm/2,y:0,z:0 }];
    if (type === 'start') return [{ x:-d.start.lengthMm/2,y:0,z:0 },{ x:d.start.lengthMm/2,y:0,z:0 }];
    if (type === 'lanechange') return [{ x:-d.lanechange.lengthMm/2,y:0,z:0 },{ x:d.lanechange.lengthMm/2,y:0,z:0 }];
    if (type === 'wave') return [{ x:-d.wave.lengthMm/2,y:d.wave.connectorYMm,z:0 },{ x:d.wave.lengthMm/2,y:d.wave.connectorYMm,z:0 }];
    if (type === 'slope') return [{ x:-d.slope.horizontalSpanMm/2,y:0,z:0 },{ x:d.slope.horizontalSpanMm/2,y:0,z:d.slope.heightDeltaMm }];
    if (type === 'bank20') return [{ x:-d.bank20.connectorSpanMm/2,y:0,z:0 },{ x:d.bank20.connectorSpanMm/2,y:0,z:0 }];
    if (type === 'lcjump') return [{ x:-d.lcjump.lengthMm/2,y:0,z:0 },{ x:d.lcjump.lengthMm/2,y:0,z:0 }];
    if (type === 'corner-45-right') return [
      { x:d.corner45.rightConnectorA.xMm,y:d.corner45.rightConnectorA.yMm,z:0 },
      { x:d.corner45.rightConnectorB.xMm,y:d.corner45.rightConnectorB.yMm,z:0 }
    ];
    if (type === 'corner-45-left') return [
      { x:d.corner45.rightConnectorA.xMm,y:-d.corner45.rightConnectorA.yMm,z:0 },
      { x:d.corner45.rightConnectorB.xMm,y:-d.corner45.rightConnectorB.yMm,z:0 }
    ];
    if (type === 'burning') return [
      { x:d.burning.endpointXMm,y:-d.burning.endpointYMm,z:0 },
      { x:d.burning.endpointXMm,y:d.burning.endpointYMm,z:0 }
    ];
    return [];
  }

  function distance3(a, b) {
    return Math.hypot(finite(a?.x)-finite(b?.x), finite(a?.y)-finite(b?.y), finite(a?.z)-finite(b?.z));
  }

  function triangleArea3(a, b, c) {
    const ab = { x:b.x-a.x, y:b.y-a.y, z:b.z-a.z };
    const ac = { x:c.x-a.x, y:c.y-a.y, z:c.z-a.z };
    const cross = {
      x:ab.y*ac.z-ab.z*ac.y,
      y:ab.z*ac.x-ab.x*ac.z,
      z:ab.x*ac.y-ab.y*ac.x
    };
    return Math.hypot(cross.x,cross.y,cross.z)/2;
  }

  function validateMeshIntegrity(mesh) {
    const errors = [];
    const warnings = [];
    const vertices = mesh?.vertices || [];
    const faces = mesh?.faces || [];
    const lines = mesh?.lines || [];

    if (!vertices.length) errors.push('no-vertices');
    for (let index=0; index<vertices.length; index+=1) {
      const point=vertices[index];
      if (![point.x,point.y,point.z].every(Number.isFinite)) errors.push(`non-finite-vertex:${index}`);
    }
    for (let index=0; index<faces.length; index+=1) {
      const face=faces[index];
      if (!Array.isArray(face.indices) || face.indices.length < 3) {
        errors.push(`invalid-face:${index}`);
        continue;
      }
      if (face.indices.some(vertexIndex => !Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertices.length)) {
        errors.push(`out-of-range-face:${index}`);
        continue;
      }
      const unique=[...new Set(face.indices)];
      if (unique.length < 3) {
        errors.push(`degenerate-face:${index}`);
        continue;
      }
      const area=triangleArea3(vertices[unique[0]],vertices[unique[1]],vertices[unique[2]]);
      if (!(area > EPS)) errors.push(`zero-area-face:${index}`);
    }
    for (let index=0; index<lines.length; index+=1) {
      const line=lines[index];
      if (!line.points || line.points.length < 2) warnings.push(`short-line:${index}`);
      if ((line.points || []).some(point => ![point.x,point.y,point.z].every(Number.isFinite))) errors.push(`non-finite-line:${index}`);
    }
    return Object.freeze({ valid:errors.length===0, errors:Object.freeze(errors), warnings:Object.freeze(warnings) });
  }

  function auditPart3D(type, model, catalog) {
    const errors = [];
    const warnings = [];
    const contract = connectorContract(type, catalog);
    const primaryPath = model?.paths?.[0]?.samples || [];
    if (contract.length === 2 && primaryPath.length >= 2) {
      const first=primaryPath[0];
      const last=primaryPath[primaryPath.length-1];
      if (distance3(first,contract[0]) > .05) errors.push(`connector-a-mismatch:${distance3(first,contract[0]).toFixed(4)}mm`);
      if (distance3(last,contract[1]) > .05) errors.push(`connector-b-mismatch:${distance3(last,contract[1]).toFixed(4)}mm`);
    }

    const expectedWidth = runtimeTrackWidthMm(catalog,type);
    const primaryWidth = finite(model?.paths?.[0]?.widthMm);
    if (Math.abs(expectedWidth-primaryWidth) > .001) errors.push(`track-width-mismatch:${primaryWidth}!=${expectedWidth}`);

    const integrity=validateMeshIntegrity(model);
    errors.push(...integrity.errors);
    warnings.push(...integrity.warnings);
    if (type === 'lanechange' || type === 'lcjump') warnings.push('vertical-detail-not-yet-measured');
    if (type === 'burning') warnings.push('burning-bridge-vertical-detail-not-yet-measured');

    return Object.freeze({
      type,
      valid:errors.length===0,
      errors:Object.freeze(errors),
      warnings:Object.freeze(warnings),
      sourceDimensions:model.sourceDimensions,
      bounds:model.bounds
    });
  }

  function buildPart3D(type, part = {}, catalog, dependencies = {}) {
    definitionFor(type,catalog);
    const paths=centerlinePaths(type,part,catalog,dependencies);
    const fence=fenceHeightMm(type,catalog);
    const colors=colorContract(type,part,catalog);
    const ribbons=paths.map(path => buildRibbon(path,fence,colors));
    const merged=mergeMeshes(ribbons);
    const model={
      version:VERSION,
      type,
      fidelity:(type==='lanechange'||type==='lcjump'||type==='burning')?'planar-dimensions-verified':'dimensional-3d',
      sourceCatalogVersion:catalog?.PART_DIMENSIONS_MM?.version || null,
      sourceDimensions:sourceDimensionSnapshot(type,catalog),
      physicalTrackWidthMm:runtimeTrackWidthMm(catalog,type),
      fenceHeightMm:fence,
      colors:Object.freeze({ ...colors }),
      paths:Object.freeze(paths.map(path => Object.freeze({ ...path, samples:Object.freeze(path.samples.map(sample=>Object.freeze({ ...sample }))) }))),
      vertices:merged.vertices,
      faces:merged.faces,
      lines:merged.lines
    };
    model.bounds=bounds3d(model.vertices);
    model.audit=auditPart3D(type,model,catalog);
    return Object.freeze(model);
  }

  function auditAllParts(catalog, dependencies = {}) {
    const types=['straight','corner-45-right','corner-45-left','lanechange','wave','start','slope','bank20','lcjump','burning'];
    const results=types.map(type => {
      const part={ type, bankAngleDeg:type==='bank20'?0:0, colorKey:'default' };
      const model=buildPart3D(type,part,catalog,dependencies);
      return model.audit;
    });
    return Object.freeze({
      valid:results.every(result=>result.valid),
      results:Object.freeze(results),
      catalogVersion:catalog?.PART_DIMENSIONS_MM?.version || null
    });
  }

  return Object.freeze({
    VERSION,
    sourceDimensionSnapshot,
    centerlinePaths,
    buildPart3D,
    bounds3d,
    connectorContract,
    validateMeshIntegrity,
    auditPart3D,
    auditAllParts
  });
});
