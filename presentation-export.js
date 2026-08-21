(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PRESENTATION_EXPORT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const A4_MM = Object.freeze({ short: 210, long: 297 });
  const DEFAULT_DPI = 300;
  const RACING_FONT = '"Bahnschrift SemiCondensed", "Arial Narrow", "Roboto Condensed", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
  const BODY_FONT = '"Bahnschrift", "Segoe UI", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
  const RACING_RED = '#e52f38';

  function mmToPx(mm, dpi = DEFAULT_DPI) {
    return Math.round(Number(mm) / 25.4 * Number(dpi));
  }

  function pageSize(orientation = 'landscape', dpi = DEFAULT_DPI) {
    const landscape = orientation === 'landscape';
    return Object.freeze({
      width: mmToPx(landscape ? A4_MM.long : A4_MM.short, dpi),
      height: mmToPx(landscape ? A4_MM.short : A4_MM.long, dpi),
      orientation: landscape ? 'landscape' : 'portrait',
      dpi
    });
  }

  function resolveOrientation(model, requested = 'auto') {
    if (requested === 'portrait' || requested === 'landscape') return requested;
    const field = model?.field || {};
    const width = Number(field.widthCm) || 0;
    const height = Number(field.heightCm) || 0;
    return width >= height ? 'landscape' : 'portrait';
  }

  function racingFont(weight, size, italic = false) {
    return `${italic ? 'italic ' : ''}${weight} ${Math.max(1, Math.round(size))}px ${RACING_FONT}`;
  }

  function bodyFont(weight, size) {
    return `${weight} ${Math.max(1, Math.round(size))}px ${BODY_FONT}`;
  }

  function fitFont(context, lines, maxWidth, initialPx, minPx, fontBuilder = racingFont) {
    let size = initialPx;
    while (size > minPx) {
      context.font = fontBuilder(850, size, true);
      if (lines.every(line => context.measureText(line || '').width <= maxWidth)) break;
      size -= 1;
    }
    return Math.max(minPx, size);
  }

  function drawTitle(context, model, rect) {
    const metadata = model.metadata || {};
    const lines = [metadata.eventNameLine1, metadata.eventNameLine2].filter(Boolean);
    context.save();
    context.fillStyle = '#202428';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Title intentionally uses about half the visual weight of the first presentation design.
    const desired = Math.min(rect.h * .34, rect.w * .035);
    const minimum = Math.max(15, rect.h * .20);
    const titleSize = fitFont(context, lines, rect.w * .82, desired, minimum);
    context.font = racingFont(850, titleSize, true);
    const lineStep = titleSize * 1.00;
    const titleHeight = Math.max(titleSize, lines.length * lineStep);
    const layouterHeight = metadata.layouterName ? Math.max(11, titleSize * .34) + titleSize * .22 : 0;
    const blockHeight = titleHeight + layouterHeight;
    const top = rect.y + Math.max(2, (rect.h - blockHeight) / 2);

    lines.forEach((line, index) => {
      context.fillText(line, rect.x + rect.w / 2, top + titleSize * .52 + index * lineStep);
    });

    if (metadata.layouterName) {
      context.fillStyle = '#626971';
      context.font = bodyFont(650, Math.max(11, titleSize * .34));
      context.fillText(`レイアウター：${metadata.layouterName}`, rect.x + rect.w / 2, top + titleHeight + titleSize * .30);
    }

    context.strokeStyle = RACING_RED;
    context.globalAlpha = .78;
    context.lineWidth = Math.max(1, rect.h * .006);
    context.beginPath();
    context.moveTo(rect.x + rect.w * .38, rect.y + rect.h - Math.max(2, rect.h * .04));
    context.lineTo(rect.x + rect.w * .62, rect.y + rect.h - Math.max(2, rect.h * .04));
    context.stroke();
    context.restore();
  }

  function createCanvas(documentValue, width, height) {
    const canvas = documentValue.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function drawLength(context, model, rect) {
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#202428';
    context.font = racingFont(850, Math.max(17, rect.h * .36), true);
    context.fillText(`全延長  ${model.length?.display || '算出不可'}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
    context.restore();
  }

  function splitRows(items, columns) {
    const rows = [];
    for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));
    return rows;
  }

  function drawCounts(context, documentValue, model, rect, options) {
    const renderer = options.renderer;
    const items = model.counts || [];
    if (!items.length) return;
    const maxColumns = options.orientation === 'landscape' ? 6 : 3;
    const columns = Math.min(maxColumns, Math.max(1, items.length));
    const rows = splitRows(items, columns);
    const rowHeight = rect.h / rows.length;
    const gap = Math.max(5, rect.w * .004);
    context.save();

    rows.forEach((row, rowIndex) => {
      const cellWidth = (rect.w - gap * (columns - 1)) / columns;
      row.forEach((item, columnIndex) => {
        const x = rect.x + columnIndex * (cellWidth + gap);
        const y = rect.y + rowIndex * rowHeight;
        // Parts summary is intentionally compact so the course remains the hero.
        const iconSize = Math.min(rowHeight * .48, cellWidth * .18);
        const icon = createCanvas(documentValue, iconSize, iconSize);
        const representativeType = item.key === 'corner45' ? 'corner-45-right' : item.type;
        renderer.drawPartIcon(icon, representativeType, { ...(item.representative || {}), colorKey:'default' }, options.rendererOptions);
        context.drawImage(icon, x + 2, y + (rowHeight - iconSize) / 2, iconSize, iconSize);

        const textX = x + iconSize + Math.max(5, cellWidth * .025);
        const labelWidth = Math.max(1, cellWidth - iconSize - 8);
        context.fillStyle = '#4b5157';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        let labelSize = Math.min(rowHeight * .16, cellWidth * .055);
        const minLabel = Math.max(8, rowHeight * .10);
        context.font = bodyFont(700, labelSize);
        while (labelSize > minLabel && context.measureText(`${item.label} ×${item.count}`).width > labelWidth) {
          labelSize -= .5;
          context.font = bodyFont(700, labelSize);
        }
        context.fillText(`${item.label} ×${item.count}`, textX, y + rowHeight / 2, labelWidth);
      });
    });
    context.restore();
  }

  function unionBounds(left, right) {
    if (!left) return right ? { ...right } : null;
    if (!right) return { ...left };
    return {
      minX:Math.min(left.minX,right.minX), minY:Math.min(left.minY,right.minY),
      maxX:Math.max(left.maxX,right.maxX), maxY:Math.max(left.maxY,right.maxY)
    };
  }

  function placedCourseBounds(model, renderer, catalog) {
    const layout = model?.layout || {};
    const definitions = catalog?.PARTS || catalog || {};
    let bounds = null;
    if (layout.start && definitions.start && renderer?.transformedBounds) {
      bounds = unionBounds(bounds, renderer.transformedBounds({ ...layout.start, type:'start' }, definitions.start));
    }
    for (const part of Array.isArray(layout.parts) ? layout.parts : []) {
      if (part?.type && definitions[part.type] && renderer?.transformedBounds) {
        bounds = unionBounds(bounds, renderer.transformedBounds(part, definitions[part.type]));
      }
    }
    if (!bounds) return null;
    return Object.freeze({
      ...bounds,
      width:Math.max(1,bounds.maxX-bounds.minX),
      height:Math.max(1,bounds.maxY-bounds.minY)
    });
  }

  function courseFirstModel(model, renderer, catalog) {
    const bounds = placedCourseBounds(model, renderer, catalog);
    if (!bounds) return model;
    const layout = model.layout || {};
    return {
      ...model,
      layout:{
        ...layout,
        field:{
          ...(layout.field || {}),
          originX:bounds.minX,
          originY:bounds.minY,
          widthCm:bounds.width,
          heightCm:bounds.height
        }
      }
    };
  }

  function layoutRects(page, orientation) {
    const margin = Math.round(Math.min(page.width,page.height) * .022);
    const usableW = page.width - margin * 2;
    const usableH = page.height - margin * 2;
    const titleH = Math.round(usableH * (orientation === 'landscape' ? .080 : .075));
    const statsH = Math.round(usableH * .050);
    const countsH = Math.round(usableH * (orientation === 'landscape' ? .090 : .110));
    const courseH = usableH - titleH - statsH - countsH;
    const title = { x:margin,y:margin,w:usableW,h:titleH };
    const course = { x:margin,y:margin+titleH,w:usableW,h:courseH };
    const stats = { x:margin,y:course.y+course.h,w:usableW,h:statsH };
    const counts = { x:margin,y:stats.y+stats.h,w:usableW,h:countsH };
    return Object.freeze({ margin, usableW, usableH, title, course, stats, counts });
  }

  function composePresentation(canvas, model, options = {}) {
    if (!canvas?.getContext) throw new Error('Canvas is required.');
    const documentValue = options.document || (typeof document !== 'undefined' ? document : null);
    const renderer = options.renderer || (typeof globalThis !== 'undefined' ? globalThis.M4WD_PRESENTATION_RENDERER : null);
    if (!documentValue || !renderer) throw new Error('Presentation renderer and document are required.');
    const background = ['grid','white','transparent'].includes(options.background) ? options.background : 'grid';
    const orientation = resolveOrientation(model, options.orientation || 'auto');
    const dpi = Number(options.dpi) || DEFAULT_DPI;
    const page = options.width && options.height
      ? { width:Math.round(options.width), height:Math.round(options.height), orientation, dpi }
      : pageSize(orientation, dpi);

    canvas.width = page.width;
    canvas.height = page.height;
    const context = canvas.getContext('2d');
    context.setTransform(1,0,0,1,0,0);
    context.clearRect(0,0,page.width,page.height);
    if (background !== 'transparent') {
      context.fillStyle = '#ffffff';
      context.fillRect(0,0,page.width,page.height);
    }

    const rects = layoutRects(page, orientation);
    drawTitle(context, model, rects.title);

    const fittedModel = courseFirstModel(model, renderer, options.catalog);
    const courseCanvas = createCanvas(documentValue, rects.course.w, rects.course.h);
    const rendererOptions = {
      catalog: options.catalog,
      dependencies: options.dependencies,
      width: rects.course.w,
      height: rects.course.h,
      paddingPx: Math.max(10, Math.round(rects.course.h * .016)),
      background
    };
    const courseDiagnostics = renderer.renderCourse(courseCanvas, fittedModel, rendererOptions);
    context.drawImage(courseCanvas, rects.course.x, rects.course.y);
    drawLength(context, model, rects.stats);
    drawCounts(context, documentValue, model, rects.counts, {
      renderer,
      orientation,
      rendererOptions:{ catalog:options.catalog, dependencies:options.dependencies }
    });

    return Object.freeze({
      page:Object.freeze(page),
      background,
      orientation,
      courseDiagnostics,
      fittedCourseBounds:placedCourseBounds(model, renderer, options.catalog),
      rects:Object.freeze({ title:rects.title, course:rects.course, stats:rects.stats, counts:rects.counts })
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG generation failed.')), 'image/png');
    });
  }

  async function downloadPng(canvas, filename, documentValue) {
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    try {
      const anchor = documentValue.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      documentValue.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    return blob;
  }

  function printPageRule(orientation) {
    return `@page { size: A4 ${orientation}; margin: 10mm; }`;
  }

  return Object.freeze({
    A4_MM,
    DEFAULT_DPI,
    RACING_FONT,
    BODY_FONT,
    mmToPx,
    pageSize,
    resolveOrientation,
    placedCourseBounds,
    courseFirstModel,
    layoutRects,
    composePresentation,
    canvasToBlob,
    downloadPng,
    printPageRule
  });
});
