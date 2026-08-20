(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PRESENTATION_RENDERER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PALETTES = Object.freeze({
    default: Object.freeze({ base:'#efede9', lane:'#8d8c89', edge:'#858480', accent:'#e52f38' }),
    red: Object.freeze({ base:'#df252d', lane:'#98141b', edge:'#7d1016', accent:'#f7bdc0' }),
    blue: Object.freeze({ base:'#087fc2', lane:'#07557f', edge:'#06405f', accent:'#b8e5ff' }),
    orange: Object.freeze({ base:'#f4b42b', lane:'#b67800', edge:'#865800', accent:'#fff0bd' }),
    green: Object.freeze({ base:'#35bd8b', lane:'#1b8964', edge:'#156c4f', accent:'#c4f4e2' }),
    white: Object.freeze({ base:'#ffffff', lane:'#b5b5b2', edge:'#999995', accent:'#e52f38' })
  });
  const BACKGROUNDS = Object.freeze(['grid','white','transparent']);
  const GRID_CM = 100;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function paletteFor(part) {
    return PALETTES[part?.colorKey] || PALETTES.default;
  }

  function rotatePoint(point, degrees) {
    const radians = finite(degrees) * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  function localBounds(definition = {}) {
    const bounds = definition.geometry?.bounds;
    if (bounds) return { minX:finite(bounds.minX), minY:finite(bounds.minY), maxX:finite(bounds.maxX), maxY:finite(bounds.maxY) };
    return { minX:-finite(definition.w)/2, minY:-finite(definition.h)/2, maxX:finite(definition.w)/2, maxY:finite(definition.h)/2 };
  }

  function transformedBounds(part, definition) {
    const b = localBounds(definition);
    const corners = [
      {x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}
    ].map(point => {
      const rotated = rotatePoint(point, part?.rotation);
      return { x:finite(part?.x)+rotated.x, y:finite(part?.y)+rotated.y };
    });
    return {
      minX:Math.min(...corners.map(p=>p.x)), minY:Math.min(...corners.map(p=>p.y)),
      maxX:Math.max(...corners.map(p=>p.x)), maxY:Math.max(...corners.map(p=>p.y))
    };
  }

  function unionBounds(left, right) {
    if (!left) return right ? { ...right } : null;
    if (!right) return { ...left };
    return { minX:Math.min(left.minX,right.minX), minY:Math.min(left.minY,right.minY), maxX:Math.max(left.maxX,right.maxX), maxY:Math.max(left.maxY,right.maxY) };
  }

  function presentationWorldBounds(layout = {}, catalog = {}) {
    const field = layout.field || {};
    let result = {
      minX:finite(field.originX), minY:finite(field.originY),
      maxX:finite(field.originX)+Math.max(0,finite(field.widthCm)),
      maxY:finite(field.originY)+Math.max(0,finite(field.heightCm))
    };
    const definitions = catalog.PARTS || catalog;
    if (layout.start && definitions.start) result = unionBounds(result, transformedBounds({ ...layout.start, type:'start' }, definitions.start));
    (Array.isArray(layout.parts) ? layout.parts : []).forEach(part => {
      if (definitions?.[part.type]) result = unionBounds(result, transformedBounds(part, definitions[part.type]));
    });
    result.width = Math.max(1, result.maxX - result.minX);
    result.height = Math.max(1, result.maxY - result.minY);
    return Object.freeze(result);
  }

  function computeViewport(layout, catalog, width, height, paddingPx = 26) {
    const bounds = presentationWorldBounds(layout, catalog);
    const innerWidth = Math.max(1, width - paddingPx * 2);
    const innerHeight = Math.max(1, height - paddingPx * 2);
    const scale = Math.max(0.0001, Math.min(innerWidth / bounds.width, innerHeight / bounds.height));
    const drawnWidth = bounds.width * scale;
    const drawnHeight = bounds.height * scale;
    return Object.freeze({
      bounds, scale,
      offsetX: paddingPx + (innerWidth - drawnWidth) / 2 - bounds.minX * scale,
      offsetY: paddingPx + (innerHeight - drawnHeight) / 2 - bounds.minY * scale,
      paddingPx
    });
  }

  function drawGrid(context, bounds) {
    context.save();
    context.strokeStyle = '#d9dde1';
    context.lineWidth = 0.9;
    const startX = Math.floor(bounds.minX / GRID_CM) * GRID_CM;
    const startY = Math.floor(bounds.minY / GRID_CM) * GRID_CM;
    context.beginPath();
    for (let x = startX; x <= bounds.maxX + 0.001; x += GRID_CM) {
      context.moveTo(x, bounds.minY); context.lineTo(x, bounds.maxY);
    }
    for (let y = startY; y <= bounds.maxY + 0.001; y += GRID_CM) {
      context.moveTo(bounds.minX, y); context.lineTo(bounds.maxX, y);
    }
    context.stroke();
    context.restore();
  }

  function drawBackground(context, canvas, viewport, mode) {
    context.save();
    context.setTransform(1,0,0,1,0,0);
    context.clearRect(0,0,canvas.width,canvas.height);
    if (mode !== 'transparent') {
      context.fillStyle = '#ffffff';
      context.fillRect(0,0,canvas.width,canvas.height);
    }
    context.restore();
    if (mode === 'grid') drawGrid(context, viewport.bounds);
    if (mode !== 'transparent') {
      context.save();
      context.strokeStyle = '#aeb4ba';
      context.lineWidth = 1 / viewport.scale;
      context.strokeRect(viewport.bounds.minX, viewport.bounds.minY, viewport.bounds.width, viewport.bounds.height);
      context.restore();
    }
  }

  function drawStraightLike(c, def, palette, part) {
    const b = localBounds(def);
    c.fillStyle = palette.base;
    c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
    c.strokeStyle = palette.edge;
    c.lineWidth = 1.05;
    c.strokeRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
    c.strokeStyle = palette.lane;
    c.lineWidth = .8;
    const trackHeight = finite(def.geometry?.height, finite(def.h,36));
    const centerY = (b.minY+b.maxY)/2;
    for (const offset of [-trackHeight/6,trackHeight/6]) {
      c.beginPath(); c.moveTo(b.minX,centerY+offset); c.lineTo(b.maxX,centerY+offset); c.stroke();
    }
    if (def.slope) {
      const gradient = c.createLinearGradient(b.minX,0,b.maxX,0);
      gradient.addColorStop(0,'rgba(0,0,0,.18)'); gradient.addColorStop(.5,'rgba(255,255,255,.08)'); gradient.addColorStop(1,'rgba(0,0,0,.09)');
      c.fillStyle = gradient; c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
    }
    if (def.bank20) {
      const gradient = c.createLinearGradient(b.minX,0,b.maxX,0);
      gradient.addColorStop(0,'rgba(0,0,0,.16)'); gradient.addColorStop(1,'rgba(255,255,255,.12)');
      c.fillStyle = gradient; c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
      c.fillStyle = palette.edge; c.font = '700 4.5px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(part?.bankRole === 'exit' ? 'OUT':'IN',0,0);
    }
    if (def.lcjump) {
      c.fillStyle = 'rgba(110,110,108,.30)';
      c.fillRect(b.minX,b.maxY-11,Math.min(39,b.maxX-b.minX),11);
    }
  }

  function drawCorner(c, def, palette, poseApi) {
    const g = poseApi?.cornerGeometry ? poseApi.cornerGeometry(def) : null;
    if (!g) return drawStraightLike(c,def,palette,{});
    c.save();
    if (def.geometry?.pathOrientation === 'left') c.scale(1,-1);
    c.translate(g.center.x,g.center.y);
    c.strokeStyle=palette.base; c.lineWidth=finite(def.trackWidth,36); c.beginPath(); c.arc(0,0,g.r,g.startAngle,g.endAngle,false); c.stroke();
    c.strokeStyle=palette.edge; c.lineWidth=1.05;
    for (const radius of [g.ri,g.ro]) { c.beginPath(); c.arc(0,0,radius,g.startAngle,g.endAngle,false); c.stroke(); }
    c.strokeStyle=palette.lane; c.lineWidth=.8;
    for (const offset of [-finite(def.trackWidth,36)/6,finite(def.trackWidth,36)/6]) { c.beginPath(); c.arc(0,0,g.r+offset,g.startAngle,g.endAngle,false); c.stroke(); }
    c.restore();
  }

  function waveY(def,x) {
    const width=finite(def.w,54); const amp=finite(def.geometry?.amplitude ?? def.amplitude,4);
    const t=(x+width/2)/width;
    return -amp*(.5-.5*Math.cos(Math.PI*2*t));
  }

  function drawWave(c,def,palette) {
    const width=finite(def.w,54); const trackWidth=finite(def.geometry?.trackWidth,36); const samples=72;
    c.beginPath();
    for(let i=0;i<=samples;i++){ const x=-width/2+width*i/samples; const y=-trackWidth/2+waveY(def,x); if(!i)c.moveTo(x,y);else c.lineTo(x,y); }
    for(let i=samples;i>=0;i--){ const x=-width/2+width*i/samples; c.lineTo(x,trackWidth/2+waveY(def,x)); }
    c.closePath(); c.fillStyle=palette.base; c.strokeStyle=palette.edge; c.lineWidth=1.05; c.fill(); c.stroke();
    c.strokeStyle=palette.lane;c.lineWidth=.8;
    for(let lane=1;lane<3;lane++){ const base=-trackWidth/2+trackWidth*lane/3;c.beginPath();for(let i=0;i<=samples;i++){const x=-width/2+width*i/samples;const y=base+waveY(def,x);if(!i)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}
  }

  function drawLaneChange(c,def,palette,laneApi) {
    drawStraightLike(c,def,palette,{});
    const geometry = laneApi?.createGeometry?.(finite(def.w,162), finite(def.geometry?.height,36));
    if (!geometry?.guides) return;
    c.strokeStyle=palette.lane;c.lineWidth=.8;
    for(const guide of geometry.guides){c.beginPath();c.moveTo(guide.start.x,guide.start.y);c.lineTo(guide.transitionStart.x,guide.transitionStart.y);c.bezierCurveTo(guide.control1.x,guide.control1.y,guide.control2.x,guide.control2.y,guide.transitionEnd.x,guide.transitionEnd.y);c.lineTo(guide.end.x,guide.end.y);c.stroke();}
  }

  function drawBurning(c,def,palette,burningApi) {
    const g=burningApi?.createGeometry?.(def.geometry||{});
    if(!g) return drawStraightLike(c,def,palette,{});
    c.save(); c.lineCap='butt'; c.lineJoin='round';
    c.strokeStyle=palette.base;c.lineWidth=g.trackWidth;c.beginPath();c.moveTo(g.leftX,g.topY);c.lineTo(g.arcCenterX,g.topY);c.arc(g.arcCenterX,0,g.centerlineRadius,-Math.PI/2,Math.PI/2,false);c.lineTo(g.leftX,g.bottomY);c.stroke();
    c.strokeStyle=palette.edge;c.lineWidth=1.05;
    for(const radius of [g.innerRadius,g.outerRadius]){const outer=radius===g.outerRadius;c.beginPath();c.moveTo(g.leftX,outer?-g.outerRadius:-g.innerRadius);c.lineTo(g.arcCenterX,outer?-g.outerRadius:-g.innerRadius);c.arc(g.arcCenterX,0,radius,-Math.PI/2,Math.PI/2,false);c.lineTo(g.leftX,outer?g.outerRadius:g.innerRadius);c.stroke();}
    c.strokeStyle=palette.lane;c.lineWidth=.8;
    for(const laneOffset of g.laneOffsets||[]){c.beginPath();c.moveTo(g.leftX,g.topY+laneOffset);c.lineTo(g.arcCenterX,g.topY+laneOffset);c.arc(g.arcCenterX,0,g.centerlineRadius-laneOffset,-Math.PI/2,Math.PI/2,false);c.lineTo(g.leftX,g.bottomY-laneOffset);c.stroke();}
    if(g.bridge){c.beginPath();c.moveTo(g.bridge.start.x,g.bridge.start.y);c.lineTo(g.bridge.approachStart.x,g.bridge.approachStart.y);c.bezierCurveTo(g.bridge.curve.control1.x,g.bridge.curve.control1.y,g.bridge.curve.control2.x,g.bridge.curve.control2.y,g.bridge.curve.end.x,g.bridge.curve.end.y);c.lineTo(g.bridge.end.x,g.bridge.end.y);c.strokeStyle=palette.edge;c.lineWidth=g.bridge.edgeWidth;c.stroke();c.strokeStyle=palette.base;c.lineWidth=g.bridge.width;c.stroke();}
    c.restore();
  }

  function drawStart(c,def,palette) {
    drawStraightLike(c,def,palette,{});
    c.fillStyle=palette.accent||'#e52f38';
    c.fillRect(-finite(def.w,54)/2,-finite(def.h,36)/2,5,finite(def.h,36)/3);
    c.fillRect(-finite(def.w,54)/2,finite(def.h,36)/6,5,finite(def.h,36)/3);
    c.fillStyle=palette.edge;c.font='italic 900 8px Arial,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('START',1,0);
  }

  function drawPart(c,part,definition,dependencies={}) {
    if(!definition)return;
    const palette=paletteFor(part);
    c.save();c.translate(finite(part.x),finite(part.y));c.rotate(finite(part.rotation)*Math.PI/180);
    if(definition.corner45) drawCorner(c,definition,palette,dependencies.poseApi);
    else if(definition.wave) drawWave(c,definition,palette);
    else if(definition.lanechange) drawLaneChange(c,definition,palette,dependencies.laneApi);
    else if(definition.burning) drawBurning(c,definition,palette,dependencies.burningApi);
    else if(part.type==='start') drawStart(c,definition,palette);
    else drawStraightLike(c,definition,palette,part);
    c.restore();
  }

  function layerValue(part,index){const value=Number(part?.zOrder??part?.zIndex);return Number.isFinite(value)?value:index+1;}

  function renderCourse(canvas, model, options={}) {
    if(!canvas?.getContext) throw new Error('Canvas is required.');
    const layout=model?.layout||model||{}; const catalog=options.catalog||{}; const definitions=catalog.PARTS||catalog;
    const mode=BACKGROUNDS.includes(options.background)?options.background:'grid';
    const width=Math.max(1,Math.round(finite(options.width,canvas.width||1200))); const height=Math.max(1,Math.round(finite(options.height,canvas.height||800)));
    canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d');
    const viewport=computeViewport(layout,catalog,width,height,finite(options.paddingPx,30));
    c.save();c.translate(viewport.offsetX,viewport.offsetY);c.scale(viewport.scale,viewport.scale);
    drawBackground(c,canvas,viewport,mode);
    if(layout.start&&definitions.start) drawPart(c,{...layout.start,id:'start',type:'start'},definitions.start,options.dependencies);
    (Array.isArray(layout.parts)?layout.parts:[]).map((part,index)=>({part,index,layer:layerValue(part,index)})).sort((a,b)=>a.layer-b.layer||a.index-b.index).forEach(item=>drawPart(c,item.part,definitions[item.part.type],options.dependencies));
    c.restore();
    return Object.freeze({ background:mode, viewport, gridCm:mode==='grid'?GRID_CM:null, width, height });
  }

  function drawPartIcon(canvas, type, part, options={}) {
    const catalog=options.catalog||{};const definition=(catalog.PARTS||catalog)[type];if(!definition||!canvas?.getContext)return false;
    const size=Math.max(24,Math.round(finite(options.size,72)));canvas.width=size;canvas.height=size;
    const c=canvas.getContext('2d');c.clearRect(0,0,size,size);
    const b=localBounds(definition);const w=Math.max(1,b.maxX-b.minX),h=Math.max(1,b.maxY-b.minY);const scale=Math.min((size-10)/w,(size-10)/h);
    c.save();c.translate(size/2,size/2);c.scale(scale,scale);c.translate(-(b.minX+b.maxX)/2,-(b.minY+b.maxY)/2);drawPart(c,{...(part||{}),type,x:0,y:0,rotation:0},definition,options.dependencies);c.restore();return true;
  }

  return Object.freeze({ PALETTES,BACKGROUNDS,GRID_CM,localBounds,transformedBounds,presentationWorldBounds,computeViewport,renderCourse,drawPartIcon });
});
