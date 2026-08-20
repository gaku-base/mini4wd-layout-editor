(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PRESENTATION_EXPORT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const A4_MM = Object.freeze({ short: 210, long: 297 });
  const DEFAULT_DPI = 300;

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

  function fitFont(context, lines, maxWidth, initialPx, minPx) {
    let size = initialPx;
    while (size > minPx) {
      context.font = `800 ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      if (lines.every(line => context.measureText(line || '').width <= maxWidth)) break;
      size -= 2;
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
    const titleSize = fitFont(context, lines, rect.w * .88, Math.min(rect.h * .28, 78), 30);
    context.font = `800 ${Math.round(titleSize)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const titleBlockHeight = Math.max(titleSize, lines.length * titleSize * 1.02);
    const titleTop = rect.y + Math.max(4, (rect.h - titleBlockHeight - (metadata.layouterName ? titleSize * .48 : 0)) / 2);
    lines.forEach((line, index) => context.fillText(line, rect.x + rect.w / 2, titleTop + titleSize * (.55 + index * 1.02)));
    if (metadata.layouterName) {
      context.fillStyle = '#5f666d';
      context.font = `600 ${Math.max(18, Math.round(titleSize * .34))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      context.fillText(`レイアウター：${metadata.layouterName}`, rect.x + rect.w / 2, titleTop + titleSize * (lines.length + .62));
    }
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
    context.font = `800 ${Math.max(24, Math.round(rect.h * .42))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
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
    const maxColumns = options.orientation === 'landscape' ? 5 : 3;
    const columns = Math.min(maxColumns, Math.max(1, items.length));
    const rows = splitRows(items, columns);
    const rowHeight = rect.h / rows.length;
    const gap = Math.max(8, rect.w * .006);
    context.save();
    rows.forEach((row, rowIndex) => {
      const cellWidth = (rect.w - gap * (columns - 1)) / columns;
      row.forEach((item, columnIndex) => {
        const x = rect.x + columnIndex * (cellWidth + gap);
        const y = rect.y + rowIndex * rowHeight;
        const iconSize = Math.min(rowHeight * .68, cellWidth * .28, 86);
        const icon = createCanvas(documentValue, iconSize, iconSize);
        const representativeType = item.key === 'corner45' ? 'corner-45-right' : item.type;
        renderer.drawPartIcon(icon, representativeType, { ...(item.representative || {}), colorKey:'default' }, options.rendererOptions);
        context.drawImage(icon, x + 4, y + (rowHeight - iconSize) / 2, iconSize, iconSize);
        const textX = x + iconSize + 14;
        const labelWidth = cellWidth - iconSize - 18;
        context.fillStyle = '#40464b';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        let labelSize = Math.min(25, rowHeight * .22);
        context.font = `700 ${Math.round(labelSize)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        while (labelSize > 14 && context.measureText(`${item.label} ×${item.count}`).width > labelWidth) {
          labelSize -= 1;
          context.font = `700 ${Math.round(labelSize)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        }
        context.fillText(`${item.label} ×${item.count}`, textX, y + rowHeight / 2, labelWidth);
      });
    });
    context.restore();
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

    const margin = Math.round(Math.min(page.width,page.height) * .035);
    const usableW = page.width - margin * 2;
    const usableH = page.height - margin * 2;
    const titleH = Math.round(usableH * (orientation === 'landscape' ? .16 : .13));
    const statsH = Math.round(usableH * .075);
    const countsH = Math.round(usableH * (orientation === 'landscape' ? .17 : .20));
    const courseH = usableH - titleH - statsH - countsH;
    const titleRect = { x:margin,y:margin,w:usableW,h:titleH };
    const courseRect = { x:margin,y:margin+titleH,w:usableW,h:courseH };
    const statsRect = { x:margin,y:courseRect.y+courseRect.h,w:usableW,h:statsH };
    const countsRect = { x:margin,y:statsRect.y+statsRect.h,w:usableW,h:countsH };

    drawTitle(context, model, titleRect);
    const courseCanvas = createCanvas(documentValue, courseRect.w, courseRect.h);
    const rendererOptions = {
      catalog: options.catalog,
      dependencies: options.dependencies,
      width: courseRect.w,
      height: courseRect.h,
      paddingPx: Math.max(20, Math.round(courseRect.h * .035)),
      background
    };
    const courseDiagnostics = renderer.renderCourse(courseCanvas, model, rendererOptions);
    context.drawImage(courseCanvas, courseRect.x, courseRect.y);
    drawLength(context, model, statsRect);
    drawCounts(context, documentValue, model, countsRect, { renderer, orientation, rendererOptions:{ catalog:options.catalog, dependencies:options.dependencies } });

    return Object.freeze({
      page:Object.freeze(page),
      background,
      orientation,
      courseDiagnostics,
      rects:Object.freeze({ title:titleRect, course:courseRect, stats:statsRect, counts:countsRect })
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
    mmToPx,
    pageSize,
    resolveOrientation,
    composePresentation,
    canvasToBlob,
    downloadPng,
    printPageRule
  });
});
