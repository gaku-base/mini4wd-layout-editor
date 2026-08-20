(function bootstrapPresentationMode(root) {
  'use strict';
  if (!root || !root.document || root.M4WD_PRESENTATION?.version >= 2) return;

  const DATA = root.M4WD_PRESENTATION_DATA;
  const RENDERER = root.M4WD_PRESENTATION_RENDERER;
  const EXPORT = root.M4WD_PRESENTATION_EXPORT;
  const CATALOG = root.M4WD_PART_CATALOG;
  if (!DATA || !RENDERER || !EXPORT || !CATALOG) return;

  // Capture only read-only functions from the short-lived private editor bridge.
  // The public debug handle is removed by simple-ui after helper boot completes.
  const privateDebug = root.__mini4wdCourseDebug;
  const readLayout = typeof privateDebug?.getState === 'function'
    ? () => privateDebug.getState()
    : () => {
        try {
          const key = root.M4WD_LAYOUT_PERSISTENCE?.STORAGE_KEY;
          return key ? JSON.parse(root.localStorage.getItem(key) || 'null') : null;
        } catch (_) { return null; }
      };
  const readRuntime = typeof privateDebug?.getRuntimeState === 'function'
    ? () => privateDebug.getRuntimeState()
    : () => null;

  const METADATA_KEY = 'mini4wd-course-presentation-metadata-v1';
  const dependencies = Object.freeze({
    poseApi: root.M4WD_PART_RENDER_POSE,
    laneApi: root.M4WD_LANE_CHANGE_VISUAL,
    burningApi: root.M4WD_BURNING_CHANGER_VISUAL
  });

  let background = 'grid';
  let orientation = 'auto';
  let metadata = loadMetadata();
  let currentModel = null;
  let lastDiagnostics = null;
  let previewScheduled = false;
  let runtimeGuardAtOpen = null;
  let pendingNewLayout = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function loadMetadata() {
    try {
      return DATA.normalizeMetadata(JSON.parse(root.localStorage.getItem(METADATA_KEY) || '{}'));
    } catch (_) {
      return DATA.normalizeMetadata({});
    }
  }

  function saveMetadata(nextMetadata) {
    metadata = DATA.normalizeMetadata(nextMetadata);
    try { root.localStorage.setItem(METADATA_KEY, JSON.stringify(metadata)); } catch (_) {}
    return metadata;
  }

  function clearMetadata() {
    saveMetadata({});
    syncMetadataInputs();
    schedulePreview();
  }

  function buildModel() {
    const layout = readLayout();
    if (!layout) return null;
    currentModel = DATA.buildPresentationModel(layout, metadata, CATALOG);
    return currentModel;
  }

  function ensureStyles() {
    for (const [id, href] of [['presentationModeStyles','presentation-mode.css?v=20260821-presentation1'],['presentationPrintStyles','presentation-print.css?v=20260821-presentation1']]) {
      if (root.document.getElementById(id)) continue;
      const link = root.document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      root.document.head.appendChild(link);
    }
  }

  function ensureEntryButton() {
    let button = root.document.getElementById('presentationBtn');
    if (button) return button;
    const exportButton = root.document.getElementById('exportBtn');
    const host = exportButton?.parentElement || root.document.querySelector('.top-actions') || root.document.body;
    button = root.document.createElement('button');
    button.id = 'presentationBtn';
    button.type = 'button';
    button.className = 'secondary presentation-entry-btn';
    button.textContent = '発表';
    button.title = '発表用レイアウトを表示';
    if (exportButton?.nextSibling) host.insertBefore(button, exportButton.nextSibling);
    else host.appendChild(button);
    button.addEventListener('click', open);
    return button;
  }

  function optionButton(id, label, value, group) {
    const button = root.document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'presentation-choice';
    button.textContent = label;
    button.dataset.value = value;
    button.dataset.group = group;
    return button;
  }

  function createLabeledInput(labelText, id, placeholder) {
    const label = root.document.createElement('label');
    label.className = 'presentation-field';
    const caption = root.document.createElement('span');
    caption.textContent = labelText;
    const input = root.document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    label.append(caption, input);
    return { label, input };
  }

  function ensureView() {
    let view = root.document.getElementById('presentationView');
    if (view) return view;
    ensureStyles();

    view = root.document.createElement('section');
    view.id = 'presentationView';
    view.className = 'presentation-view';
    view.hidden = true;
    view.setAttribute('aria-label', '発表用レイアウト');

    const toolbar = root.document.createElement('div');
    toolbar.className = 'presentation-toolbar';

    const back = root.document.createElement('button');
    back.id = 'presentationBackBtn';
    back.type = 'button';
    back.className = 'presentation-back';
    back.textContent = '← 編集へ戻る';
    back.addEventListener('click', close);

    const name1 = createLabeledInput('大会名 1行目', 'presentationEventName1', '例：第19回');
    const name2 = createLabeledInput('大会名 2行目', 'presentationEventName2', '例：ミニ四駆大会');
    const layouter = createLabeledInput('レイアウター名', 'presentationLayouter', '任意');
    [name1.input, name2.input, layouter.input].forEach(input => input.addEventListener('input', onMetadataInput));

    const bgGroup = root.document.createElement('div');
    bgGroup.className = 'presentation-control-group';
    const bgLabel = root.document.createElement('span');
    bgLabel.className = 'presentation-control-label';
    bgLabel.textContent = '背景';
    bgGroup.append(bgLabel,
      optionButton('presentationBgGrid','Grid','grid','background'),
      optionButton('presentationBgWhite','White','white','background'),
      optionButton('presentationBgTransparent','Transparent','transparent','background'));
    bgGroup.addEventListener('click', onChoice);

    const orientationGroup = root.document.createElement('div');
    orientationGroup.className = 'presentation-control-group';
    const orientationLabel = root.document.createElement('span');
    orientationLabel.className = 'presentation-control-label';
    orientationLabel.textContent = 'A4';
    orientationGroup.append(orientationLabel,
      optionButton('presentationOrientationAuto','自動','auto','orientation'),
      optionButton('presentationOrientationLandscape','横','landscape','orientation'),
      optionButton('presentationOrientationPortrait','縦','portrait','orientation'));
    orientationGroup.addEventListener('click', onChoice);

    const png = root.document.createElement('button');
    png.id = 'presentationPngBtn';
    png.type = 'button';
    png.className = 'presentation-primary';
    png.textContent = 'PNG保存';
    png.addEventListener('click', exportPng);

    const print = root.document.createElement('button');
    print.id = 'presentationPrintBtn';
    print.type = 'button';
    print.className = 'presentation-primary';
    print.textContent = 'A4印刷';
    print.addEventListener('click', printA4);

    const status = root.document.createElement('span');
    status.id = 'presentationStatus';
    status.className = 'presentation-status';
    status.setAttribute('role','status');

    toolbar.append(back, name1.label, name2.label, layouter.label, bgGroup, orientationGroup, png, print, status);

    const stage = root.document.createElement('div');
    stage.className = 'presentation-stage';
    const canvas = root.document.createElement('canvas');
    canvas.id = 'presentationCanvas';
    canvas.className = 'presentation-canvas';
    stage.appendChild(canvas);

    const printSheet = root.document.createElement('div');
    printSheet.id = 'presentationPrintSheet';
    printSheet.className = 'presentation-print-sheet';
    printSheet.setAttribute('aria-hidden','true');
    const printImage = root.document.createElement('img');
    printImage.id = 'presentationPrintImage';
    printImage.alt = '';
    printSheet.appendChild(printImage);

    view.append(toolbar, stage, printSheet);
    root.document.body.appendChild(view);
    syncMetadataInputs();
    syncChoiceButtons();
    return view;
  }

  function syncMetadataInputs() {
    const name1 = root.document.getElementById('presentationEventName1');
    const name2 = root.document.getElementById('presentationEventName2');
    const layouter = root.document.getElementById('presentationLayouter');
    if (name1 && name1.value !== metadata.eventNameLine1) name1.value = metadata.eventNameLine1;
    if (name2 && name2.value !== metadata.eventNameLine2) name2.value = metadata.eventNameLine2;
    if (layouter && layouter.value !== metadata.layouterName) layouter.value = metadata.layouterName;
  }

  function onMetadataInput() {
    saveMetadata({
      eventNameLine1: root.document.getElementById('presentationEventName1')?.value,
      eventNameLine2: root.document.getElementById('presentationEventName2')?.value,
      layouterName: root.document.getElementById('presentationLayouter')?.value
    });
    schedulePreview();
  }

  function onChoice(event) {
    const button = event.target.closest?.('button[data-group]');
    if (!button) return;
    if (button.dataset.group === 'background') background = button.dataset.value;
    if (button.dataset.group === 'orientation') orientation = button.dataset.value;
    syncChoiceButtons();
    schedulePreview();
  }

  function syncChoiceButtons() {
    root.document.querySelectorAll('.presentation-choice[data-group="background"]').forEach(button => button.classList.toggle('is-active', button.dataset.value === background));
    root.document.querySelectorAll('.presentation-choice[data-group="orientation"]').forEach(button => button.classList.toggle('is-active', button.dataset.value === orientation));
  }

  function rendererOptions() {
    return { catalog: CATALOG, dependencies };
  }

  function previewSize(model) {
    const resolved = EXPORT.resolveOrientation(model, orientation);
    return resolved === 'landscape' ? { width:1440, height:1018 } : { width:960, height:1358 };
  }

  function refresh() {
    previewScheduled = false;
    const view = ensureView();
    if (view.hidden) return null;
    const model = buildModel();
    const canvas = root.document.getElementById('presentationCanvas');
    if (!model || !canvas) {
      setStatus('レイアウトを読み込めません', true);
      return null;
    }
    const size = previewSize(model);
    lastDiagnostics = EXPORT.composePresentation(canvas, model, {
      document:root.document,
      renderer:RENDERER,
      catalog:CATALOG,
      dependencies,
      background,
      orientation,
      width:size.width,
      height:size.height,
      dpi:120
    });
    setStatus(DATA.validateMetadata(metadata).valid ? '' : '大会名1行目を入力してください', false);
    return lastDiagnostics;
  }

  function schedulePreview() {
    if (previewScheduled) return;
    previewScheduled = true;
    root.requestAnimationFrame(refresh);
  }

  function setStatus(text, error) {
    const status = root.document.getElementById('presentationStatus');
    if (!status) return;
    status.textContent = text || '';
    status.classList.toggle('is-error', Boolean(error));
  }

  function requireMetadata() {
    const result = DATA.validateMetadata(metadata);
    if (result.valid) return true;
    setStatus('大会名1行目を入力してください', true);
    const input = root.document.getElementById('presentationEventName1');
    input?.focus();
    input?.classList.add('is-required');
    root.setTimeout(() => input?.classList.remove('is-required'), 1400);
    return false;
  }

  function open() {
    const view = ensureView();
    const layout = readLayout();
    if (!layout) {
      setStatus('レイアウトを読み込めません', true);
      return false;
    }
    runtimeGuardAtOpen = clone(readRuntime());
    metadata = loadMetadata();
    syncMetadataInputs();
    view.hidden = false;
    root.document.body.classList.add('presentation-mode-open');
    schedulePreview();
    return true;
  }

  function close() {
    const view = root.document.getElementById('presentationView');
    if (view) view.hidden = true;
    root.document.body.classList.remove('presentation-mode-open');
    return true;
  }

  async function exportPng() {
    if (!requireMetadata()) return null;
    const model = buildModel();
    if (!model) return null;
    const canvas = root.document.createElement('canvas');
    const diagnostics = EXPORT.composePresentation(canvas, model, {
      document:root.document, renderer:RENDERER, catalog:CATALOG, dependencies,
      background, orientation, dpi:EXPORT.DEFAULT_DPI
    });
    const filename = `${DATA.sanitizeFilename(metadata)}_レイアウト.png`;
    setStatus('PNGを作成しています…', false);
    const blob = await EXPORT.downloadPng(canvas, filename, root.document);
    setStatus(`PNG保存完了 (${Math.round(blob.size / 1024)} KB)`, false);
    return { blob, filename, diagnostics };
  }

  async function printA4() {
    if (!requireMetadata()) return null;
    const model = buildModel();
    if (!model) return null;
    const resolved = EXPORT.resolveOrientation(model, orientation);
    const canvas = root.document.createElement('canvas');
    const diagnostics = EXPORT.composePresentation(canvas, model, {
      document:root.document, renderer:RENDERER, catalog:CATALOG, dependencies,
      background, orientation:resolved, dpi:180
    });
    const image = root.document.getElementById('presentationPrintImage');
    image.src = canvas.toDataURL('image/png');
    let style = root.document.getElementById('presentationDynamicPageRule');
    if (!style) {
      style = root.document.createElement('style');
      style.id = 'presentationDynamicPageRule';
      root.document.head.appendChild(style);
    }
    style.textContent = EXPORT.printPageRule(resolved);
    root.document.body.dataset.presentationPrintOrientation = resolved;
    setStatus(`A4${resolved === 'landscape' ? '横' : '縦'}で印刷`, false);
    await new Promise(resolve => root.requestAnimationFrame(() => root.requestAnimationFrame(resolve)));
    root.print();
    return diagnostics;
  }

  function exportEnhancedJson() {
    const layout = readLayout();
    if (!layout) return false;
    const enriched = DATA.withMetadata(layout, metadata);
    const blob = new Blob([JSON.stringify(enriched, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = root.document.createElement('a');
    anchor.href = url;
    anchor.download = 'course-layout.json';
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  function installJsonPersistenceBridge() {
    const saveButton = root.document.getElementById('saveBtn');
    saveButton?.addEventListener('click', event => {
      // Save the same editor snapshot, with presentation metadata added as an optional field.
      event.preventDefault();
      event.stopImmediatePropagation();
      exportEnhancedJson();
    }, true);

    const loadInput = root.document.getElementById('loadInput');
    loadInput?.addEventListener('change', event => {
      const file = event.target?.files?.[0];
      if (!file) return;
      file.text().then(text => {
        try {
          const parsed = JSON.parse(text);
          saveMetadata(DATA.metadataFromLayout(parsed));
          syncMetadataInputs();
          schedulePreview();
        } catch (_) {}
      });
    }, true);
  }

  function installNewLayoutMetadataGuard() {
    const newButton = root.document.getElementById('newBtn');
    const dialog = root.document.getElementById('setupDialog');
    if (!newButton || !dialog) return;
    newButton.addEventListener('click', () => {
      pendingNewLayout = {
        metadata: clone(metadata),
        before: JSON.stringify(readLayout() || null)
      };
    }, true);
    dialog.addEventListener('close', () => {
      if (!pendingNewLayout) return;
      const pending = pendingNewLayout;
      pendingNewLayout = null;
      root.setTimeout(() => {
        const afterLayout = readLayout();
        const after = JSON.stringify(afterLayout || null);
        const newEmptyCourse = afterLayout && !afterLayout.start && Array.isArray(afterLayout.parts) && afterLayout.parts.length === 0;
        if (newEmptyCourse && after !== pending.before) clearMetadata();
        else saveMetadata(pending.metadata);
      }, 0);
    });
  }

  function getDiagnostics() {
    const runtimeNow = clone(readRuntime());
    const model = currentModel || buildModel();
    return clone({
      background,
      orientation,
      resolvedOrientation: model ? EXPORT.resolveOrientation(model, orientation) : null,
      metadata,
      totalParts:model?.totalParts ?? null,
      counts:model?.counts?.map(item => ({ key:item.key, count:item.count, label:item.label })) || [],
      length:model?.length || null,
      field:model?.field || null,
      render:lastDiagnostics ? {
        page:lastDiagnostics.page,
        courseGridCm:lastDiagnostics.courseDiagnostics?.gridCm,
        courseViewport:lastDiagnostics.courseDiagnostics?.viewport
      } : null,
      runtimeGuardAtOpen,
      runtimeNow
    });
  }

  function composeForTest(options = {}) {
    const model = buildModel();
    const canvas = root.document.createElement('canvas');
    const diagnostics = EXPORT.composePresentation(canvas, model, {
      document:root.document, renderer:RENDERER, catalog:CATALOG, dependencies,
      background:options.background || background,
      orientation:options.orientation || orientation,
      width:options.width,
      height:options.height,
      dpi:options.dpi || 96
    });
    return { canvas, diagnostics };
  }

  ensureEntryButton();
  ensureView();
  installJsonPersistenceBridge();
  installNewLayoutMetadataGuard();

  const api = Object.freeze({
    version:2,
    open,
    close,
    refresh,
    exportPng,
    printA4,
    getDiagnostics,
    composeForTest,
    getMetadata:() => ({ ...metadata }),
    setMetadata:value => { saveMetadata(value); syncMetadataInputs(); schedulePreview(); return { ...metadata }; },
    setBackground:value => { if (RENDERER.BACKGROUNDS.includes(value)) { background=value; syncChoiceButtons(); schedulePreview(); } return background; },
    setOrientation:value => { if (['auto','landscape','portrait'].includes(value)) { orientation=value; syncChoiceButtons(); schedulePreview(); } return orientation; }
  });
  Object.defineProperty(root, 'M4WD_PRESENTATION', { configurable:true, enumerable:false, writable:false, value:api });
})(typeof window !== 'undefined' ? window : null);
