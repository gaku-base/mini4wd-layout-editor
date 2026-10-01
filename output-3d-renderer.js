(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_OUTPUT_3D_RENDERER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const DEFAULT_CAMERA = Object.freeze({ yawDeg:-42, tiltDeg:58, zoom:1 });
  const TOP_CAMERA = Object.freeze({ yawDeg:0, tiltDeg:0, zoom:1 });
  const ISO_CAMERA = DEFAULT_CAMERA;

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

  function normalizeCamera(value = {}) {
    return Object.freeze({
      yawDeg:finite(value.yawDeg, DEFAULT_CAMERA.yawDeg),
      tiltDeg:clamp(finite(value.tiltDeg, DEFAULT_CAMERA.tiltDeg), 0, 82),
      zoom:clamp(finite(value.zoom, DEFAULT_CAMERA.zoom), .35, 4)
    });
  }

  function transformPoint(point, part) {
    const angle=degToRad(part?.rotation);
    const cos=Math.cos(angle);
    const sin=Math.sin(angle);
    const x=finite(point?.x);
    const y=finite(point?.y);
    return {
      x:finite(part?.x)*10 + x*cos - y*sin,
      y:finite(part?.y)*10 + x*sin + y*cos,
      z:finite(part?.zMm) + finite(point?.z)
    };
  }

  function boundsOfPoints(points) {
    if (!points.length) return Object.freeze({ minX:0,maxX:0,minY:0,maxY:0,minZ:0,maxZ:0,widthMm:0,depthMm:0,heightMm:0 });
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of points){
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
      minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
    }
    return Object.freeze({minX,maxX,minY,maxY,minZ,maxZ,widthMm:maxX-minX,depthMm:maxY-minY,heightMm:maxZ-minZ});
  }

  function mergeBounds(left,right){
    if(!left)return right;
    if(!right)return left;
    return Object.freeze({
      minX:Math.min(left.minX,right.minX),maxX:Math.max(left.maxX,right.maxX),
      minY:Math.min(left.minY,right.minY),maxY:Math.max(left.maxY,right.maxY),
      minZ:Math.min(left.minZ,right.minZ),maxZ:Math.max(left.maxZ,right.maxZ),
      widthMm:Math.max(left.maxX,right.maxX)-Math.min(left.minX,right.minX),
      depthMm:Math.max(left.maxY,right.maxY)-Math.min(left.minY,right.minY),
      heightMm:Math.max(left.maxZ,right.maxZ)-Math.min(left.minZ,right.minZ)
    });
  }

  function scenePart(type, part, options) {
    const geometryApi=options.geometryApi;
    const catalog=options.catalog;
    const local=geometryApi.buildPart3D(type,part,catalog,options.dependencies || {});
    const worldVertices=local.vertices.map(point=>Object.freeze(transformPoint(point,part)));
    const faces=local.faces.map(face=>Object.freeze({
      ...face,
      type,
      partId:String(part?.id ?? type),
      points:Object.freeze(face.indices.map(index=>worldVertices[index])),
      baseColor:face.kind==='wall'?local.colors.edge:local.colors.base
    }));
    const lines=local.lines.map(line=>Object.freeze({
      ...line,
      type,
      partId:String(part?.id ?? type),
      color:line.kind==='lane'?local.colors.lane:local.colors.edge,
      points:Object.freeze(line.points.map(point=>Object.freeze(transformPoint(point,part))))
    }));
    return Object.freeze({
      type,
      partId:String(part?.id ?? type),
      fidelity:local.fidelity,
      audit:local.audit,
      sourceDimensions:local.sourceDimensions,
      bounds:boundsOfPoints(worldVertices),
      faces:Object.freeze(faces),
      lines:Object.freeze(lines)
    });
  }

  function buildScene(model, options = {}) {
    const geometryApi=options.geometryApi || (typeof globalThis!=='undefined'?globalThis.M4WD_PART_GEOMETRY_3D:null);
    const catalog=options.catalog || (typeof globalThis!=='undefined'?globalThis.M4WD_PART_CATALOG:null);
    if(!geometryApi||!catalog)throw new Error('3D geometry API and catalog are required.');
    const layout=model?.layout || {};
    const parts=[];
    if(layout.start)parts.push(scenePart('start',{...layout.start,id:'start',type:'start'}, {...options,geometryApi,catalog}));
    for(const part of Array.isArray(layout.parts)?layout.parts:[]){
      if(!part?.type)continue;
      parts.push(scenePart(part.type,part,{...options,geometryApi,catalog}));
    }
    let bounds=null;
    for(const part of parts)bounds=mergeBounds(bounds,part.bounds);
    if(!bounds)bounds=boundsOfPoints([{x:0,y:0,z:0},{x:1000,y:1000,z:0}]);
    return Object.freeze({
      version:VERSION,
      parts:Object.freeze(parts),
      bounds,
      invalidParts:Object.freeze(parts.filter(part=>!part.audit.valid).map(part=>Object.freeze({partId:part.partId,type:part.type,errors:part.audit.errors}))),
      warnings:Object.freeze(parts.flatMap(part=>part.audit.warnings.map(warning=>Object.freeze({partId:part.partId,type:part.type,warning})))),
      catalogVersion:catalog?.PART_DIMENSIONS_MM?.version || null
    });
  }

  function cameraTransform(point, center, camera) {
    const dx=point.x-center.x;
    const dy=point.y-center.y;
    const dz=point.z-center.z;
    const yaw=degToRad(camera.yawDeg);
    const cy=Math.cos(yaw), sy=Math.sin(yaw);
    const x1=dx*cy-dy*sy;
    const y1=dx*sy+dy*cy;
    const tilt=degToRad(camera.tiltDeg);
    const ct=Math.cos(tilt), st=Math.sin(tilt);
    return {
      x:x1,
      y:y1*ct-dz*st,
      depth:y1*st+dz*ct
    };
  }

  function projectedScene(scene, width, height, cameraValue) {
    const camera=normalizeCamera(cameraValue);
    const center={
      x:(scene.bounds.minX+scene.bounds.maxX)/2,
      y:(scene.bounds.minY+scene.bounds.maxY)/2,
      z:(scene.bounds.minZ+scene.bounds.maxZ)/2
    };
    const allPoints=[];
    for(const part of scene.parts){
      for(const face of part.faces)allPoints.push(...face.points);
      for(const line of part.lines)allPoints.push(...line.points);
    }
    const transformed=allPoints.map(point=>cameraTransform(point,center,camera));
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of transformed){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    if(!Number.isFinite(minX)){minX=-500;maxX=500;minY=-500;maxY=500;}
    const spanX=Math.max(1,maxX-minX), spanY=Math.max(1,maxY-minY);
    const padding=Math.max(18,Math.min(width,height)*.055);
    const scale=Math.min((width-padding*2)/spanX,(height-padding*2)/spanY)*camera.zoom;
    const offsetX=width/2-((minX+maxX)/2)*scale;
    const offsetY=height/2-((minY+maxY)/2)*scale;
    const project=point=>{
      const p=cameraTransform(point,center,camera);
      return {x:offsetX+p.x*scale,y:offsetY+p.y*scale,depth:p.depth,world:point};
    };
    return Object.freeze({camera,center,scale,project,projectedBounds:Object.freeze({minX,maxX,minY,maxY})});
  }

  function parseHex(color) {
    const clean=String(color||'#cccccc').replace('#','').trim();
    if(!/^[0-9a-f]{6}$/i.test(clean))return {r:200,g:200,b:200};
    const value=parseInt(clean,16);
    return {r:(value>>16)&255,g:(value>>8)&255,b:value&255};
  }

  function shade(color, factor) {
    const rgb=parseHex(color);
    const f=clamp(factor,.35,1.25);
    return `rgb(${Math.round(clamp(rgb.r*f,0,255))},${Math.round(clamp(rgb.g*f,0,255))},${Math.round(clamp(rgb.b*f,0,255))})`;
  }

  function faceNormal(points) {
    if(points.length<3)return {x:0,y:0,z:1};
    const a=points[0],b=points[1],c=points[2];
    const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
    const ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
    const n={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};
    const length=Math.hypot(n.x,n.y,n.z)||1;
    return {x:n.x/length,y:n.y/length,z:n.z/length};
  }

  function faceLight(points) {
    const n=faceNormal(points);
    const light={x:-.35,y:-.45,z:.82};
    const dot=Math.abs(n.x*light.x+n.y*light.y+n.z*light.z);
    return .62+.43*dot;
  }

  function drawGroundGrid(context, projection, scene, width, height) {
    const span=Math.max(scene.bounds.widthMm,scene.bounds.depthMm,1000);
    const step=span>9000?2000:1000;
    const minX=Math.floor((scene.bounds.minX-step)/step)*step;
    const maxX=Math.ceil((scene.bounds.maxX+step)/step)*step;
    const minY=Math.floor((scene.bounds.minY-step)/step)*step;
    const maxY=Math.ceil((scene.bounds.maxY+step)/step)*step;
    const z=Math.min(0,scene.bounds.minZ);
    context.save();
    context.lineWidth=1;
    context.strokeStyle='rgba(74,92,108,.20)';
    for(let x=minX;x<=maxX;x+=step){
      const a=projection.project({x,y:minY,z});
      const b=projection.project({x,y:maxY,z});
      context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
    }
    for(let y=minY;y<=maxY;y+=step){
      const a=projection.project({x:minX,y,z});
      const b=projection.project({x:maxX,y,z});
      context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
    }
    context.restore();
  }

  function renderCourse3D(canvas, model, options = {}) {
    if(!canvas?.getContext)throw new Error('Canvas is required for 3D output.');
    const width=Math.max(1,Math.round(finite(options.width,canvas.width||1200)));
    const height=Math.max(1,Math.round(finite(options.height,canvas.height||800)));
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    const context=canvas.getContext('2d');
    const background=options.background || 'grid';
    context.setTransform(1,0,0,1,0,0);
    context.clearRect(0,0,width,height);
    if(background!=='transparent'){
      context.fillStyle=background==='white'?'#ffffff':'#eef2f5';
      context.fillRect(0,0,width,height);
    }

    const scene=buildScene(model,options);
    const projection=projectedScene(scene,width,height,options.camera || DEFAULT_CAMERA);
    if(background==='grid')drawGroundGrid(context,projection,scene,width,height);

    const faces=[];
    const lines=[];
    for(const part of scene.parts){
      for(const face of part.faces){
        const points=face.points.map(projection.project);
        const depth=points.reduce((sum,p)=>sum+p.depth,0)/points.length;
        faces.push({face,points,depth});
      }
      for(const line of part.lines){
        const points=line.points.map(projection.project);
        const depth=points.reduce((sum,p)=>sum+p.depth,0)/Math.max(1,points.length);
        lines.push({line,points,depth});
      }
    }
    faces.sort((a,b)=>a.depth-b.depth);
    for(const item of faces){
      const points=item.points;
      if(points.length<3)continue;
      context.beginPath();
      context.moveTo(points[0].x,points[0].y);
      for(let i=1;i<points.length;i+=1)context.lineTo(points[i].x,points[i].y);
      context.closePath();
      context.fillStyle=shade(item.face.baseColor,faceLight(item.face.points));
      context.fill();
      context.strokeStyle='rgba(58,66,72,.35)';
      context.lineWidth=.65;
      context.stroke();
    }

    lines.sort((a,b)=>a.depth-b.depth);
    for(const item of lines){
      if(item.points.length<2)continue;
      context.beginPath();
      context.moveTo(item.points[0].x,item.points[0].y);
      for(let i=1;i<item.points.length;i+=1)context.lineTo(item.points[i].x,item.points[i].y);
      context.strokeStyle=item.line.color;
      context.globalAlpha = item.line.auxiliary ? .8 : 1;
      context.lineWidth=item.line.kind==='lane'?Math.max(.8,projection.scale*1.3):Math.max(1,projection.scale*1.8);
      context.stroke();
      context.globalAlpha=1;
    }

    if(scene.invalidParts.length){
      context.save();
      context.fillStyle='rgba(135,19,29,.92)';
      context.fillRect(12,12,Math.min(width-24,460),34);
      context.fillStyle='#fff';
      context.font='700 13px system-ui,sans-serif';
      context.textBaseline='middle';
      context.fillText(`3D geometry check failed: ${scene.invalidParts.length} part(s)`,24,29);
      context.restore();
    }

    return Object.freeze({
      version:VERSION,
      camera:projection.camera,
      scale:projection.scale,
      sceneBounds:scene.bounds,
      partCount:scene.parts.length,
      invalidParts:scene.invalidParts,
      warnings:scene.warnings,
      catalogVersion:scene.catalogVersion
    });
  }

  return Object.freeze({
    VERSION,
    DEFAULT_CAMERA,
    TOP_CAMERA,
    ISO_CAMERA,
    normalizeCamera,
    transformPoint,
    buildScene,
    projectedScene,
    renderCourse3D
  });
});
