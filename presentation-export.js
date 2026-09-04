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
  const EXPORT_THEME = Object.freeze({
    ink:'#081019', ink2:'#101a25', ink3:'#172331', red:'#e52f38', redBright:'#ff3948',
    paper:'#ffffff', line:'#cfd5dc', soft:'#eef2f6', text:'#111820', muted:'#5f6975'
  });
  const RACING_RED = EXPORT_THEME.red;
  const PART_ICON_MODE = 'flat-monochrome';

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

  function fillRacingPanel(context, rect, color = EXPORT_THEME.ink) {
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  function drawHeader(context, model, rect) {
    const metadata = model.metadata || {};
    const lines = [metadata.eventNameLine1, metadata.eventNameLine2].filter(Boolean);
    context.save();
    fillRacingPanel(context, rect, EXPORT_THEME.ink);

    const slash = Math.max(10, rect.h * .12);
    context.fillStyle = EXPORT_THEME.red;
    context.beginPath();
    context.moveTo(rect.x, rect.y + rect.h * .72);
    context.lineTo(rect.x + slash * 1.8, rect.y + rect.h * .72);
    context.lineTo(rect.x + slash, rect.y + rect.h);
    context.lineTo(rect.x, rect.y + rect.h);
    context.closePath();
    context.fill();

    context.fillStyle = '#ffffff';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    const desired = Math.min(rect.h * .31, rect.w * .034);
    const minimum = Math.max(14, rect.h * .18);
    const titleSize = fitFont(context, lines, rect.w * .70, desired, minimum);
    context.font = racingFont(880, titleSize, true);
    const lineStep = titleSize * .92;
    const totalTitleH = Math.max(titleSize, lines.length * lineStep);
    const top = rect.y + (rect.h - totalTitleH) / 2;
    lines.forEach((line, index) => {
      context.fillText(line, rect.x + rect.w * .035, top + titleSize * .52 + index * lineStep, rect.w * .68);
    });

    context.textAlign = 'right';
    context.fillStyle = '#b9c2cc';
    context.font = bodyFont(700, Math.max(9, rect.h * .13));
    context.fillText('MINI 4WD  TRACK LAYOUT', rect.x + rect.w * .965, rect.y + rect.h * .32, rect.w * .25);
    if (metadata.layouterName) {
      context.fillStyle = '#ffffff';
      context.font = bodyFont(720, Math.max(9, rect.h * .14));
      context.fillText(`レイアウター：${metadata.layouterName}`, rect.x + rect.w * .965, rect.y + rect.h * .61, rect.w * .28);
    }

    context.fillStyle = EXPORT_THEME.red;
    context.fillRect(rect.x + rect.w * .02, rect.y + rect.h - Math.max(2, rect.h * .035), rect.w * .96, Math.max(2, rect.h * .035));
    context.restore();
  }

  function createCanvas(documentValue, width, height) {
    const canvas = documentValue.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function flattenMonochromeIcon(canvas) {
    const context = canvas?.getContext?.('2d');
    if (!context) return false;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) continue;
      const luminance = data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
      const tone = luminance > 210 ? 250 : luminance > 145 ? 145 : 24;
      data[index] = tone;
      data[index + 1] = tone;
      data[index + 2] = tone;
    }
    context.putImageData(image, 0, 0);
    return true;
  }

  function drawCourseFrame(context, rect) {
    context.save();
    context.strokeStyle = '#9fa9b4';
    context.lineWidth = Math.max(1, Math.min(rect.w, rect.h) * .0015);
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    const corner = Math.max(8, Math.min(rect.w, rect.h) * .018);
    context.strokeStyle = EXPORT_THEME.red;
    context.lineWidth = Math.max(2, Math.min(rect.w, rect.h) * .003);
    context.beginPath();
    context.moveTo(rect.x, rect.y + corner);
    context.lineTo(rect.x, rect.y);
    context.lineTo(rect.x + corner, rect.y);
    context.moveTo(rect.x + rect.w - corner, rect.y + rect.h);
    context.lineTo(rect.x + rect.w, rect.y + rect.h);
    context.lineTo(rect.x + rect.w, rect.y + rect.h - corner);
    context.stroke();
    context.restore();
  }

  function drawLength(context, model, rect) {
    context.save();
    fillRacingPanel(context, rect, EXPORT_THEME.ink);
    const wedgeW = rect.w * .19;
    context.fillStyle = EXPORT_THEME.ink2;
    context.beginPath();
    context.moveTo(rect.x, rect.y);
    context.lineTo(rect.x + wedgeW, rect.y);
    context.lineTo(rect.x + wedgeW - rect.h * .35, rect.y + rect.h);
    context.lineTo(rect.x, rect.y + rect.h);
    context.closePath();
    context.fill();
    context.strokeStyle = EXPORT_THEME.red;
    context.lineWidth = Math.max(2, rect.h * .025);
    context.beginPath();
    context.moveTo(rect.x, rect.y + rect.h - context.lineWidth / 2);
    context.lineTo(rect.x + wedgeW - rect.h * .35, rect.y + rect.h - context.lineWidth / 2);
    context.stroke();

    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.textAlign = 'left';
    context.font = racingFont(850, Math.max(14, rect.h * .28), true);
    context.fillText('総延長', rect.x + rect.w * .028, rect.y + rect.h / 2, wedgeW * .72);

    context.textAlign = 'center';
    context.font = racingFont(900, Math.max(22, rect.h * .57), true);
    context.fillText(model.length?.display || '算出不可', rect.x + rect.w * .56, rect.y + rect.h * .49, rect.w * .43);

    context.textAlign = 'right';
    context.fillStyle = '#d2d9e0';
    context.font = bodyFont(650, Math.max(8, rect.h * .15));
    context.fillText('※ 3レーンを各1回走った', rect.x + rect.w * .972, rect.y + rect.h * .39, rect.w * .25);
    context.fillText('3周分の合計です', rect.x + rect.w * .972, rect.y + rect.h * .63, rect.w * .25);
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
    const maxColumns = options.orientation === 'landscape' ? 9 : 4;
    const columns = Math.min(maxColumns, Math.max(1, items.length));
    const rows = splitRows(items, columns);
    const headingH = Math.max(18, rect.h * .18);
    const contentRect = { x:rect.x, y:rect.y + headingH, w:rect.w, h:Math.max(1, rect.h - headingH) };
    const rowHeight = contentRect.h / rows.length;
    const gap = Math.max(3, rect.w * .003);
    context.save();

    context.fillStyle = EXPORT_THEME.paper;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.fillStyle = EXPORT_THEME.red;
    context.beginPath();
    context.moveTo(rect.x, rect.y + headingH * .20);
    context.lineTo(rect.x + headingH * .28, rect.y + headingH * .20);
    context.lineTo(rect.x + headingH * .12, rect.y + headingH * .82);
    context.lineTo(rect.x, rect.y + headingH * .82);
    context.closePath();
    context.fill();
    context.fillStyle = EXPORT_THEME.text;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = racingFont(850, Math.max(11, headingH * .48), true);
    context.fillText('使用パーツ一覧', rect.x + headingH * .42, rect.y + headingH * .52, rect.w * .5);

    rows.forEach((row, rowIndex) => {
      const cellWidth = (contentRect.w - gap * (columns - 1)) / columns;
      row.forEach((item, columnIndex) => {
        const x = contentRect.x + columnIndex * (cellWidth + gap);
        const y = contentRect.y + rowIndex * rowHeight;
        context.fillStyle = '#ffffff';
        context.fillRect(x, y, cellWidth, rowHeight - gap);
        context.strokeStyle = '#d5dbe2';
        context.lineWidth = Math.max(1, rowHeight * .006);
        context.strokeRect(x + .5, y + .5, Math.max(1, cellWidth - 1), Math.max(1, rowHeight - gap - 1));

        const iconSize = Math.min(rowHeight * .46, cellWidth * .56);
        const icon = createCanvas(documentValue, iconSize, iconSize);
        const representativeType = item.key === 'corner45' ? 'corner-45-right' : item.type;
        renderer.drawPartIcon(icon, representativeType, { ...(item.representative || {}), colorKey:'default' }, options.rendererOptions);
        flattenMonochromeIcon(icon);
        context.drawImage(icon, x + (cellWidth - iconSize) / 2, y + rowHeight * .035, iconSize, iconSize);

        context.fillStyle = EXPORT_THEME.text;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const labelY = y + rowHeight * .64;
        let labelSize = Math.min(rowHeight * .125, cellWidth * .10);
        const minLabel = Math.max(7, rowHeight * .075);
        context.font = bodyFont(700, labelSize);
        while (labelSize > minLabel && context.measureText(item.label).width > cellWidth * .90) {
          labelSize -= .5;
          context.font = bodyFont(700, labelSize);
        }
        context.fillText(item.label, x + cellWidth / 2, labelY, cellWidth * .90);
        context.font = racingFont(850, Math.max(9, rowHeight * .15), true);
        context.fillText(`× ${item.count}`, x + cellWidth / 2, y + rowHeight * .84, cellWidth * .85);
      });
    });
    context.restore();
  }

  function drawFooter(context, rect) {
    context.save();
    fillRacingPanel(context, rect, EXPORT_THEME.ink);
    context.fillStyle = EXPORT_THEME.red;
    context.fillRect(rect.x, rect.y, rect.w, Math.max(2, rect.h * .10));
    context.fillStyle = '#c7d0da';
    context.textBaseline = 'middle';
    context.font = bodyFont(650, Math.max(7, rect.h * .28));
    context.textAlign = 'left';
    context.fillText('Mini 4WD Layout Editor', rect.x + rect.w * .018, rect.y + rect.h * .58, rect.w * .34);
    context.textAlign = 'right';
    context.fillText('ENJOY MINI 4WD  /  GOOD LAYOUT  /  GOOD RACING', rect.x + rect.w * .982, rect.y + rect.h * .58, rect.w * .58);
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
    const margin = Math.round(Math.min(page.width,page.height) * .018);
    const usableW = page.width - margin * 2;
    const usableH = page.height - margin * 2;
    const titleH = Math.round(usableH * (orientation === 'landscape' ? .085 : .075));
    const statsH = Math.round(usableH * (orientation === 'landscape' ? .078 : .068));
    const countsH = Math.round(usableH * (orientation === 'landscape' ? .135 : .180));
    const footerH = Math.round(usableH * .030);
    const courseH = usableH - titleH - statsH - countsH - footerH;
    const title = { x:margin,y:margin,w:usableW,h:titleH };
    const course = { x:margin,y:margin+titleH,w:usableW,h:courseH };
    const stats = { x:margin,y:course.y+course.h,w:usableW,h:statsH };
    const counts = { x:margin,y:stats.y+stats.h,w:usableW,h:countsH };
    const footer = { x:margin,y:counts.y+counts.h,w:usableW,h:footerH };
    return Object.freeze({ margin, usableW, usableH, title, course, stats, counts, footer });
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
    drawHeader(context, model, rects.title);

    const fittedModel = courseFirstModel(model, renderer, options.catalog);
    const courseCanvas = createCanvas(documentValue, rects.course.w, rects.course.h);
    const rendererOptions = {
      catalog: options.catalog,
      dependencies: options.dependencies,
      width: rects.course.w,
      height: rects.course.h,
      paddingPx: Math.max(10, Math.round(rects.course.h * .018)),
      background
    };
    const courseDiagnostics = renderer.renderCourse(courseCanvas, fittedModel, rendererOptions);
    context.drawImage(courseCanvas, rects.course.x, rects.course.y);
    drawCourseFrame(context, rects.course);
    drawLength(context, model, rects.stats);
    drawCounts(context, documentValue, model, rects.counts, {
      renderer,
      orientation,
      rendererOptions:{ catalog:options.catalog, dependencies:options.dependencies }
    });
    drawFooter(context, rects.footer);

    return Object.freeze({
      page:Object.freeze(page),
      background,
      orientation,
      courseDiagnostics,
      iconMode:PART_ICON_MODE,
      fittedCourseBounds:placedCourseBounds(model, renderer, options.catalog),
      rects:Object.freeze({ title:rects.title, course:rects.course, stats:rects.stats, counts:rects.counts, footer:rects.footer })
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
    EXPORT_THEME,
    PART_ICON_MODE,
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
