(function bootstrapPresentationMode(root) {
  'use strict';
  if (!root || !root.document || root.M4WD_PRESENTATION?.version >= 3) return;

  const DATA = root.M4WD_PRESENTATION_DATA;
  const RENDERER = root.M4WD_PRESENTATION_RENDERER;
  const EXPORT = root.M4WD_PRESENTATION_EXPORT;
  const GEOMETRY_3D = root.M4WD_PART_GEOMETRY_3D;
  const RENDERER_3D = root.M4WD_OUTPUT_3D_RENDERER;
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
    burningApi: root.M4WD_BURNING_CHANGER_VISUAL,
    slopeProfile: root.M4WD_SLOPE_LONGITUDINAL_PROFILE
  });

  let background = 'grid';
  let orientation = 'auto';
  let outputView = '2d';
  let camera3d = RENDERER_3D?.normalizeCamera?.(RENDERER_3D.ISO_CAMERA) || { yawDeg:-42, tiltDeg:58, zoom:1 };
  let cameraDrag3d = null;
  let metadata = loadMetadata();
  let currentModel = null;
  let lastDiagnostics = null;
  let last3dDiagnostics = null;
  let previewScheduled = false;
  let runtimeGuardAtOpen = null;
  let pendingNewLayout = null;
  let reviewState = { viewed2d:false, viewed3d:false, exported:false };

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

  function syncWorkspaceTabs(mode) {
    const outputActive = mode === 'output';
    const pairs = [
      [root.document.getElementById('layoutTabBtn'), !outputActive],
      [root.document.getElementById('outputTabBtn'), outputActive],
      [root.document.getElementById('presentationLayoutTabBtn'), !outputActive],
      [root.document.getElementById('presentationOutputTabBtn'), outputActive]
    ];
    for (const [button, active] of pairs) {
      if (!button) continue;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    }
  }

  function ensureEntryButton() {
    const outputTab = root.document.getElementById('outputTabBtn');
    const layoutTab = root.document.getElementById('layoutTabBtn');
    if (outputTab) {
      if (outputTab.dataset.presentationBound !== '1') {
        outputTab.dataset.presentationBound = '1';
        outputTab.addEventListener('click', open);
      }
      if (layoutTab && layoutTab.dataset.presentationBound !== '1') {
        layoutTab.dataset.presentationBound = '1';
        layoutTab.addEventListener('click', close);
      }
      syncWorkspaceTabs('layout');
      return outputTab;
    }

    let button = root.document.getElementById('presentationBtn');
    if (button) return button;
    const exportButton = root.document.getElementById('exportBtn');
    const host = exportButton?.parentElement || root.document.querySelector('.top-actions') || root.document.body;
    button = root.document.createElement('button');
    button.id = 'presentationBtn';
    button.type = 'button';
    button.className = 'secondary presentation-entry-btn';
    button.textContent = 'OUTPUT';
    button.title = '出力画面を表示';
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

  function createSummaryItem(id, labelText) {
    const item = root.document.createElement('div');
    item.className = 'presentation-summary-item';
    const label = root.document.createElement('span');
    label.className = 'presentation-summary-label';
    label.textContent = labelText;
    const value = root.document.createElement('strong');
    value.id = id;
    value.className = 'presentation-summary-value';
    value.textContent = '—';
    item.append(label, value);
    return item;
  }

  function createReviewItem(id, labelText) {
    const row = root.document.createElement('div');
    row.id = id;
    row.className = 'presentation-review-item';
    row.dataset.state = 'pending';
    const mark = root.document.createElement('span');
    mark.className = 'presentation-review-mark';
    mark.setAttribute('aria-hidden','true');
    mark.textContent = '○';
    const label = root.document.createElement('span');
    label.className = 'presentation-review-label';
    label.textContent = labelText;
    const status = root.document.createElement('strong');
    status.className = 'presentation-review-status';
    status.textContent = '未確認';
    row.append(mark, label, status);
    return row;
  }

  function resetReviewState() {
    reviewState = { viewed2d:false, viewed3d:false, exported:false };
    syncReview(currentModel, lastDiagnostics);
  }

  function markOutputDirty() {
    if (!reviewState.exported) return;
    reviewState.exported = false;
    syncReview(currentModel, lastDiagnostics);
  }

  function colorIntegrity(model) {
    const colors = new Set((CATALOG.COURSE_COLORS || []).map(color => color?.key).filter(Boolean));
    if (!colors.size) return false;
    const placements = [];
    if (model?.layout?.start) placements.push(model.layout.start);
    if (Array.isArray(model?.layout?.parts)) placements.push(...model.layout.parts);
    return placements.every(part => colors.has(part?.colorKey || 'default'));
  }

  function setReviewItem(id, complete, completeText, pendingText) {
    const row = root.document.getElementById(id);
    if (!row) return;
    const mark = row.querySelector('.presentation-review-mark');
    const status = row.querySelector('.presentation-review-status');
    row.dataset.state = complete ? 'complete' : 'pending';
    row.classList.toggle('is-complete', complete);
    if (mark) mark.textContent = complete ? '✓' : '○';
    if (status) status.textContent = complete ? completeText : pendingText;
  }

  function syncReview(model, diagnostics = lastDiagnostics) {
    const metadataOk = Boolean(model && DATA.validateMetadata(model.metadata).valid);
    const colorOk = Boolean(model && colorIntegrity(model));
    const invalid3d = diagnostics?.course3dDiagnostics?.invalidParts?.length || 0;
    const threeDOk = reviewState.viewed3d && invalid3d === 0;

    setReviewItem('presentationReview2d', reviewState.viewed2d, '確認済み', '2Dを表示');
    setReviewItem('presentationReview3d', threeDOk, '確認済み', invalid3d ? '形状エラー' : '3Dを表示');
    setReviewItem('presentationReviewColor', colorOk, 'OK', '要確認');
    setReviewItem('presentationReviewText', metadataOk, 'OK', '大会名を入力');
    setReviewItem('presentationReviewOutput', reviewState.exported, '確認済み', 'PNG / A4で確認');

    const completed = [reviewState.viewed2d, threeDOk, colorOk, metadataOk, reviewState.exported].filter(Boolean).length;
    const progress = root.document.getElementById('presentationReviewProgress');
    if (progress) progress.textContent = `${completed} / 5`;
    const card = root.document.getElementById('presentationReviewCard');
    if (card) card.classList.toggle('is-complete', completed === 5);
  }

  function createSectionCard(id, titleText, descriptionText) {
    const section = root.document.createElement('section');
    section.id = id;
    section.className = 'presentation-section-card';

    const heading = root.document.createElement('div');
    heading.className = 'presentation-section-heading';
    const title = root.document.createElement('strong');
    title.className = 'presentation-section-title';
    title.textContent = titleText;
    const description = root.document.createElement('span');
    description.className = 'presentation-section-description';
    description.textContent = descriptionText;
    heading.append(title, description);

    const body = root.document.createElement('div');
    body.className = 'presentation-section-body';
    section.append(heading, body);
    return { section, body };
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

    const windowHeader = root.document.createElement('div');
    windowHeader.className = 'presentation-window-header';

    const title = root.document.createElement('strong');
    title.className = 'presentation-window-title';
    title.textContent = 'COURSE LAYOUT';

    const tabs = root.document.createElement('div');
    tabs.className = 'presentation-workspace-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '画面切替');

    const layoutTab = root.document.createElement('button');
    layoutTab.id = 'presentationLayoutTabBtn';
    layoutTab.type = 'button';
    layoutTab.className = 'presentation-workspace-tab';
    layoutTab.setAttribute('role', 'tab');
    layoutTab.textContent = 'LAYOUT';
    layoutTab.addEventListener('click', close);

    const outputTab = root.document.createElement('button');
    outputTab.id = 'presentationOutputTabBtn';
    outputTab.type = 'button';
    outputTab.className = 'presentation-workspace-tab active';
    outputTab.setAttribute('role', 'tab');
    outputTab.textContent = 'OUTPUT';
    outputTab.addEventListener('click', () => {
      syncWorkspaceTabs('output');
      schedulePreview();
    });

    tabs.append(layoutTab, outputTab);
    windowHeader.append(title, tabs);

    const toolbar = root.document.createElement('div');
    toolbar.className = 'presentation-toolbar';

    const twoDSection = createSectionCard(
      'presentation2dSection',
      '2D確認',
      '上面図で全体・色・接続を確認'
    );
    const twoDGroup = root.document.createElement('div');
    twoDGroup.id = 'presentationViewModeGroup';
    twoDGroup.className = 'presentation-control-group presentation-view-mode-group presentation-single-choice-group';
    const twoDLabel = root.document.createElement('span');
    twoDLabel.className = 'presentation-control-label';
    twoDLabel.textContent = '表示モード';
    const view2d = optionButton('presentationView2d','2Dを表示','2d','output-view');
    twoDGroup.append(twoDLabel, view2d);
    twoDGroup.addEventListener('click', onChoice);
    twoDSection.body.append(twoDGroup);

    const threeDSection = createSectionCard(
      'presentation3dSection',
      '3D確認',
      '立体で高さ・接続・形状を確認'
    );
    const threeDGroup = root.document.createElement('div');
    threeDGroup.className = 'presentation-control-group presentation-view-mode-group presentation-single-choice-group';
    const threeDLabel = root.document.createElement('span');
    threeDLabel.className = 'presentation-control-label';
    threeDLabel.textContent = '表示モード';
    const view3d = optionButton('presentationView3d','3Dを表示','3d','output-view');
    if (!RENDERER_3D || !GEOMETRY_3D) {
      view3d.disabled = true;
      view3d.title = '3Dモジュールを読み込めません';
    }
    threeDGroup.append(threeDLabel, view3d);
    threeDGroup.addEventListener('click', onChoice);

    const cameraGroup = root.document.createElement('div');
    cameraGroup.id = 'presentation3dCameraGroup';
    cameraGroup.className = 'presentation-control-group presentation-3d-camera-group';
    const cameraLabel = root.document.createElement('span');
    cameraLabel.className = 'presentation-control-label';
    cameraLabel.textContent = '視点';
    const cameraTop = root.document.createElement('button');
    cameraTop.id = 'presentation3dTopBtn';
    cameraTop.type = 'button';
    cameraTop.className = 'presentation-choice';
    cameraTop.textContent = 'TOP';
    cameraTop.addEventListener('click', () => set3dCamera(RENDERER_3D?.TOP_CAMERA));
    const cameraIso = root.document.createElement('button');
    cameraIso.id = 'presentation3dIsoBtn';
    cameraIso.type = 'button';
    cameraIso.className = 'presentation-choice';
    cameraIso.textContent = 'ISO';
    cameraIso.addEventListener('click', () => set3dCamera(RENDERER_3D?.ISO_CAMERA));
    const cameraReset = root.document.createElement('button');
    cameraReset.id = 'presentation3dResetBtn';
    cameraReset.type = 'button';
    cameraReset.className = 'presentation-choice';
    cameraReset.textContent = 'リセット';
    cameraReset.addEventListener('click', () => set3dCamera(RENDERER_3D?.ISO_CAMERA));
    cameraGroup.append(cameraLabel, cameraTop, cameraIso, cameraReset);

    const cameraAdjust = root.document.createElement('div');
    cameraAdjust.id = 'presentation3dAdjustGroup';
    cameraAdjust.className = 'presentation-control-group presentation-3d-adjust-group';
    const adjustLabel = root.document.createElement('span');
    adjustLabel.className = 'presentation-control-label';
    adjustLabel.textContent = '簡単操作';
    const rotateLeft = root.document.createElement('button');
    rotateLeft.id = 'presentation3dRotateLeftBtn';
    rotateLeft.type = 'button';
    rotateLeft.className = 'presentation-choice';
    rotateLeft.textContent = '↶ 左回転';
    rotateLeft.addEventListener('click', () => adjust3dCamera({ yawDeg: -15 }));
    const rotateRight = root.document.createElement('button');
    rotateRight.id = 'presentation3dRotateRightBtn';
    rotateRight.type = 'button';
    rotateRight.className = 'presentation-choice';
    rotateRight.textContent = '↷ 右回転';
    rotateRight.addEventListener('click', () => adjust3dCamera({ yawDeg: 15 }));
    const zoomOut = root.document.createElement('button');
    zoomOut.id = 'presentation3dZoomOutBtn';
    zoomOut.type = 'button';
    zoomOut.className = 'presentation-choice';
    zoomOut.textContent = '− 縮小';
    zoomOut.addEventListener('click', () => adjust3dCamera({ zoomFactor: 0.85 }));
    const zoomIn = root.document.createElement('button');
    zoomIn.id = 'presentation3dZoomInBtn';
    zoomIn.type = 'button';
    zoomIn.className = 'presentation-choice';
    zoomIn.textContent = '＋ 拡大';
    zoomIn.addEventListener('click', () => adjust3dCamera({ zoomFactor: 1.18 }));
    const cameraHelp = root.document.createElement('span');
    cameraHelp.className = 'presentation-3d-help';
    cameraHelp.textContent = 'マウス操作も使用可: ドラッグで回転 / ホイールでズーム';
    cameraAdjust.append(adjustLabel, rotateLeft, rotateRight, zoomOut, zoomIn, cameraHelp);
    threeDSection.body.append(threeDGroup, cameraGroup, cameraAdjust);

    const back = root.document.createElement('button');
    back.id = 'presentationBackBtn';
    back.type = 'button';
    back.className = 'presentation-back';
    back.textContent = '← 編集へ戻る';
    back.addEventListener('click', close);

    const exportSection = createSectionCard(
      'presentationExportSection',
      '出力操作',
      '大会情報・背景・A4・保存/印刷をまとめて設定'
    );

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

    const exportActions = root.document.createElement('div');
    exportActions.className = 'presentation-export-actions';
    exportActions.append(png, print);
    exportSection.body.append(name1.label, name2.label, layouter.label, bgGroup, orientationGroup, exportActions, status);

    const reviewCard = root.document.createElement('section');
    reviewCard.id = 'presentationReviewCard';
    reviewCard.className = 'presentation-review-card';
    const reviewHeading = root.document.createElement('div');
    reviewHeading.className = 'presentation-review-heading';
    const reviewTitle = root.document.createElement('strong');
    reviewTitle.className = 'presentation-review-title';
    reviewTitle.textContent = '仕上げ確認';
    const reviewProgress = root.document.createElement('span');
    reviewProgress.id = 'presentationReviewProgress';
    reviewProgress.className = 'presentation-review-progress';
    reviewProgress.textContent = '0 / 5';
    reviewHeading.append(reviewTitle, reviewProgress);
    const reviewList = root.document.createElement('div');
    reviewList.className = 'presentation-review-list';
    reviewList.append(
      createReviewItem('presentationReview2d', '2D表示'),
      createReviewItem('presentationReview3d', '3D表示'),
      createReviewItem('presentationReviewColor', '色整合'),
      createReviewItem('presentationReviewText', '文字情報'),
      createReviewItem('presentationReviewOutput', '出力結果')
    );
    reviewCard.append(reviewHeading, reviewList);

    toolbar.append(back, twoDSection.section, threeDSection.section, exportSection.section, reviewCard);

    const main = root.document.createElement('div');
    main.className = 'presentation-main';

    const summary = root.document.createElement('div');
    summary.id = 'presentationSummary';
    summary.className = 'presentation-summary-bar';
    summary.setAttribute('aria-label', '出力情報');
    summary.append(
      createSummaryItem('presentationSummaryEvent', '大会名'),
      createSummaryItem('presentationSummaryLayouter', 'レイアウター'),
      createSummaryItem('presentationSummaryLength', '総延長'),
      createSummaryItem('presentationSummaryParts', 'パーツ数')
    );

    const stage = root.document.createElement('div');
    stage.className = 'presentation-stage';
    const canvas = root.document.createElement('canvas');
    canvas.id = 'presentationCanvas';
    canvas.className = 'presentation-canvas';
    stage.appendChild(canvas);
    main.append(summary, stage);
    canvas.addEventListener('pointerdown', on3dPointerDown);
    canvas.addEventListener('pointermove', on3dPointerMove);
    canvas.addEventListener('pointerup', on3dPointerUp);
    canvas.addEventListener('pointercancel', on3dPointerUp);
    canvas.addEventListener('wheel', on3dWheel, { passive:false });

    const printSheet = root.document.createElement('div');
    printSheet.id = 'presentationPrintSheet';
    printSheet.className = 'presentation-print-sheet';
    printSheet.setAttribute('aria-hidden','true');
    const printImage = root.document.createElement('img');
    printImage.id = 'presentationPrintImage';
    printImage.alt = '';
    printSheet.appendChild(printImage);

    view.append(windowHeader, toolbar, main, printSheet);
    root.document.body.appendChild(view);
    view.classList.add('has-workspace-tabs');
    syncMetadataInputs();
    syncChoiceButtons();
    syncOutputViewControls();
    syncWorkspaceTabs('layout');
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

  function syncSummary(model) {
    if (!model) return;
    const eventValue = root.document.getElementById('presentationSummaryEvent');
    const layouterValue = root.document.getElementById('presentationSummaryLayouter');
    const lengthValue = root.document.getElementById('presentationSummaryLength');
    const partsValue = root.document.getElementById('presentationSummaryParts');
    const eventName = [
      model.metadata?.eventNameLine1,
      model.metadata?.eventNameLine2
    ].filter(Boolean).join(' / ');
    const totalM = Number(model.length?.totalM);
    if (eventValue) eventValue.textContent = eventName || '未入力';
    if (layouterValue) layouterValue.textContent = model.metadata?.layouterName || '—';
    if (lengthValue) lengthValue.textContent = model.length?.available && Number.isFinite(totalM)
      ? `${totalM.toFixed(2)} m`
      : '—';
    if (partsValue) partsValue.textContent = `${Number(model.totalParts) || 0} 個`;
  }

  function onMetadataInput() {
    markOutputDirty();
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
    if (button.dataset.group === 'background') { background = button.dataset.value; markOutputDirty(); }
    if (button.dataset.group === 'orientation') { orientation = button.dataset.value; markOutputDirty(); }
    if (button.dataset.group === 'output-view') setOutputView(button.dataset.value);
    syncChoiceButtons();
    schedulePreview();
  }

  function syncChoiceButtons() {
    root.document.querySelectorAll('.presentation-choice[data-group="background"]').forEach(button => button.classList.toggle('is-active', button.dataset.value === background));
    root.document.querySelectorAll('.presentation-choice[data-group="orientation"]').forEach(button => button.classList.toggle('is-active', button.dataset.value === orientation));
    root.document.querySelectorAll('.presentation-choice[data-group="output-view"]').forEach(button => button.classList.toggle('is-active', button.dataset.value === outputView));
  }

  function syncOutputViewControls() {
    const is3d = outputView === '3d';
    const cameraGroup = root.document.getElementById('presentation3dCameraGroup');
    const cameraAdjust = root.document.getElementById('presentation3dAdjustGroup');
    if (cameraGroup) cameraGroup.hidden = !is3d;
    if (cameraAdjust) cameraAdjust.hidden = !is3d;
    const twoDSection = root.document.getElementById('presentation2dSection');
    const threeDSection = root.document.getElementById('presentation3dSection');
    if (twoDSection) twoDSection.classList.toggle('is-current', !is3d);
    if (threeDSection) threeDSection.classList.toggle('is-current', is3d);
    const canvas = root.document.getElementById('presentationCanvas');
    if (canvas) canvas.classList.toggle('is-3d', is3d);
  }

  function setOutputView(value) {
    const next = value === '3d' && RENDERER_3D && GEOMETRY_3D ? '3d' : '2d';
    if (outputView === next) {
      syncChoiceButtons();
      syncOutputViewControls();
      return outputView;
    }
    outputView = next;
    cameraDrag3d = null;
    markOutputDirty();
    syncChoiceButtons();
    syncOutputViewControls();
    schedulePreview();
    return outputView;
  }

  function set3dCamera(value) {
    if (!RENDERER_3D) return camera3d;
    markOutputDirty();
    camera3d = RENDERER_3D.normalizeCamera(value || RENDERER_3D.ISO_CAMERA);
    schedulePreview();
    return { ...camera3d };
  }

  function adjust3dCamera(change = {}) {
    if (!RENDERER_3D) return camera3d;
    markOutputDirty();
    const yawDelta = Number(change.yawDeg) || 0;
    const zoomFactor = Number(change.zoomFactor);
    camera3d = RENDERER_3D.normalizeCamera({
      ...camera3d,
      yawDeg: camera3d.yawDeg + yawDelta,
      zoom: Number.isFinite(zoomFactor) && zoomFactor > 0 ? camera3d.zoom * zoomFactor : camera3d.zoom
    });
    schedulePreview();
    return { ...camera3d };
  }

  function on3dPointerDown(event) {
    if (outputView !== '3d' || event.button !== 0 || !RENDERER_3D) return;
    const canvas = event.currentTarget;
    cameraDrag3d = { pointerId:event.pointerId, x:event.clientX, y:event.clientY, camera:{ ...camera3d } };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add('is-orbiting');
    event.preventDefault();
  }

  function on3dPointerMove(event) {
    if (!cameraDrag3d || event.pointerId !== cameraDrag3d.pointerId || !RENDERER_3D) return;
    markOutputDirty();
    const dx = event.clientX - cameraDrag3d.x;
    const dy = event.clientY - cameraDrag3d.y;
    camera3d = RENDERER_3D.normalizeCamera({
      ...cameraDrag3d.camera,
      yawDeg:cameraDrag3d.camera.yawDeg + dx * .35,
      tiltDeg:cameraDrag3d.camera.tiltDeg + dy * .28
    });
    schedulePreview();
    event.preventDefault();
  }

  function on3dPointerUp(event) {
    if (!cameraDrag3d || event.pointerId !== cameraDrag3d.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    event.currentTarget.classList.remove('is-orbiting');
    cameraDrag3d = null;
  }

  function on3dWheel(event) {
    if (outputView !== '3d' || !RENDERER_3D) return;
    markOutputDirty();
    const factor = Math.exp(-Number(event.deltaY || 0) * .0012);
    camera3d = RENDERER_3D.normalizeCamera({ ...camera3d, zoom:camera3d.zoom * factor });
    schedulePreview();
    event.preventDefault();
  }

  function rendererOptions() {
    return { catalog: CATALOG, dependencies };
  }

  function previewSize(model) {
    const resolved = EXPORT.resolveOrientation(model, orientation);
    return resolved === 'landscape' ? { width:1440, height:1018 } : { width:960, height:1358 };
  }

  function composeOutput(canvas, model, options = {}) {
    const mode = options.viewMode || outputView;
    const diagnostics = EXPORT.composePresentation(canvas, model, {
      document:root.document,
      renderer:RENDERER,
      catalog:CATALOG,
      dependencies,
      background:options.background || background,
      orientation:options.orientation || orientation,
      width:options.width,
      height:options.height,
      dpi:options.dpi
    });
    if (mode !== '3d' || !RENDERER_3D || !GEOMETRY_3D) {
      last3dDiagnostics = null;
      return Object.freeze({ ...diagnostics, viewMode:'2d', course3dDiagnostics:null });
    }

    const rect = diagnostics.rects?.course;
    if (!rect) return Object.freeze({ ...diagnostics, viewMode:'3d', course3dDiagnostics:null });
    const courseCanvas = root.document.createElement('canvas');
    courseCanvas.width = Math.max(1, Math.round(rect.w));
    courseCanvas.height = Math.max(1, Math.round(rect.h));
    const course3dDiagnostics = RENDERER_3D.renderCourse3D(courseCanvas, model, {
      geometryApi:GEOMETRY_3D,
      catalog:CATALOG,
      dependencies,
      camera:camera3d,
      background:options.background || background,
      width:courseCanvas.width,
      height:courseCanvas.height
    });
    const context = canvas.getContext('2d');
    context.clearRect(rect.x, rect.y, rect.w, rect.h);
    context.drawImage(courseCanvas, rect.x, rect.y, rect.w, rect.h);
    context.save();
    context.strokeStyle = '#9fa9b4';
    context.lineWidth = Math.max(1, Math.min(rect.w, rect.h) * .0015);
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    context.restore();
    last3dDiagnostics = course3dDiagnostics;
    return Object.freeze({ ...diagnostics, viewMode:'3d', course3dDiagnostics });
  }

  function refresh() {
    previewScheduled = false;
    const view = ensureView();
    if (view.hidden) return null;
    const model = buildModel();
    const canvas = root.document.getElementById('presentationCanvas');
    if (model) syncSummary(model);
    if (!model || !canvas) {
      setStatus('レイアウトを読み込めません', true);
      return null;
    }
    const size = previewSize(model);
    lastDiagnostics = composeOutput(canvas, model, {
      background,
      orientation,
      width:size.width,
      height:size.height,
      dpi:120,
      viewMode:outputView
    });
    const invalid3d = lastDiagnostics?.course3dDiagnostics?.invalidParts?.length || 0;
    if (outputView === '2d') reviewState.viewed2d = true;
    if (outputView === '3d' && invalid3d === 0) reviewState.viewed3d = true;
    syncReview(model, lastDiagnostics);
    if (outputView === '3d' && invalid3d) {
      setStatus(`3D形状チェックエラー ${invalid3d}件`, true);
    } else {
      setStatus(DATA.validateMetadata(metadata).valid ? '' : '大会名1行目を入力してください', false);
    }
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
    resetReviewState();
    syncMetadataInputs();
    view.hidden = false;
    root.document.body.classList.add('presentation-mode-open');
    syncWorkspaceTabs('output');
    schedulePreview();
    return true;
  }

  function close() {
    const view = root.document.getElementById('presentationView');
    if (view) view.hidden = true;
    root.document.body.classList.remove('presentation-mode-open');
    syncWorkspaceTabs('layout');
    root.requestAnimationFrame(() => {
      root.dispatchEvent(new Event('resize'));
      root.document.getElementById('courseCanvas')?.focus?.({ preventScroll: true });
    });
    return true;
  }

  async function exportPng() {
    if (!requireMetadata()) return null;
    const model = buildModel();
    if (!model) return null;
    const canvas = root.document.createElement('canvas');
    const diagnostics = composeOutput(canvas, model, {
      background, orientation, dpi:EXPORT.DEFAULT_DPI, viewMode:outputView
    });
    const suffix = outputView === '3d' ? '_3D' : '';
    const filename = `${DATA.sanitizeFilename(metadata)}_レイアウト${suffix}.png`;
    setStatus('PNGを作成しています…', false);
    const blob = await EXPORT.downloadPng(canvas, filename, root.document);
    reviewState.exported = true;
    syncReview(model, diagnostics);
    setStatus(`PNG保存完了 (${Math.round(blob.size / 1024)} KB)`, false);
    return { blob, filename, diagnostics };
  }

  async function printA4() {
    if (!requireMetadata()) return null;
    const model = buildModel();
    if (!model) return null;
    const resolved = EXPORT.resolveOrientation(model, orientation);
    const canvas = root.document.createElement('canvas');
    const diagnostics = composeOutput(canvas, model, {
      background, orientation:resolved, dpi:180, viewMode:outputView
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
    reviewState.exported = true;
    syncReview(model, diagnostics);
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
      outputView,
      camera3d,
      render:lastDiagnostics ? {
        page:lastDiagnostics.page,
        viewMode:lastDiagnostics.viewMode || outputView,
        courseGridCm:lastDiagnostics.courseDiagnostics?.gridCm,
        courseViewport:lastDiagnostics.courseDiagnostics?.viewport,
        course3d:lastDiagnostics.course3dDiagnostics || last3dDiagnostics
      } : null,
      runtimeGuardAtOpen,
      runtimeNow
    });
  }

  function composeForTest(options = {}) {
    const model = buildModel();
    const canvas = root.document.createElement('canvas');
    const diagnostics = composeOutput(canvas, model, {
      background:options.background || background,
      orientation:options.orientation || orientation,
      width:options.width,
      height:options.height,
      dpi:options.dpi || 96,
      viewMode:options.viewMode || outputView
    });
    return { canvas, diagnostics };
  }

  ensureEntryButton();
  ensureView();
  installJsonPersistenceBridge();
  installNewLayoutMetadataGuard();

  const api = Object.freeze({
    version:3,
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
    setOrientation:value => { if (['auto','landscape','portrait'].includes(value)) { orientation=value; syncChoiceButtons(); schedulePreview(); } return orientation; },
    getOutputView:() => outputView,
    setOutputView,
    get3dCamera:() => ({ ...camera3d }),
    set3dCamera
  });
  Object.defineProperty(root, 'M4WD_PRESENTATION', { configurable:true, enumerable:false, writable:false, value:api });
})(typeof window !== 'undefined' ? window : null);
