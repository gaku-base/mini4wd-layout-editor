(() => {
  'use strict';

  const VERSION = '1.0.0-RC1';
  const CATALOG = window.M4WD_PART_CATALOG;
  if (!CATALOG) throw new Error('part-catalog.jsが読み込まれていません');
  const PERSISTENCE = window.M4WD_LAYOUT_PERSISTENCE;
  if (!PERSISTENCE) throw new Error('persistence.jsが読み込まれていません');
  const PART_SEAMS = window.M4WD_PART_SEAMS;
  if (!PART_SEAMS) throw new Error('part-seams.jsが読み込まれていません');
  const TRACK_WIDTH_CM = CATALOG.TRACK_WIDTH_CM;
  const STRAIGHT_CM = CATALOG.STRAIGHT_CM;
  const PARTS = CATALOG.PARTS;
  const PART_MENU_ORDER = CATALOG.MENU_ORDER;
  const START_DEF = PARTS.start;
  const HISTORY_LIMIT = 20;
  const GROUP_MOVE_SNAP_RADIUS_CM = 28;
  // 描画設定を1か所に集約し、将来の「継ぎ目表示」切替に備える。
  const RENDER_FEATURES = Object.freeze({ partSeams: true });
  const partAssetCache = new Map();
  // 標準グレー系は画像の色ムラを避け、同一パレットのベクター描画を使う。
  // Canva画像へ差し替える際は、この集合から対象を外せば画像表示へ戻せる。
  const VECTOR_DEFAULT_RENDER_KINDS = new Set([
    'straight', 'corner45', 'lanechange', 'wave', 'start', 'lcjump', 'burning'
  ]);

  const COLORS = [
    { key: 'default', name: '標準（グレー）', base: '#efede9', lane: '#8d8c89', edge: '#858480' },
    { key: 'red', name: 'レッド', base: '#df252d', lane: '#98141b', edge: '#7d1016' },
    { key: 'blue', name: 'ブルー', base: '#087fc2', lane: '#07557f', edge: '#06405f' },
    { key: 'orange', name: 'オレンジ', base: '#f4b42b', lane: '#b67800', edge: '#865800' },
    { key: 'green', name: 'グリーン', base: '#35bd8b', lane: '#1b8964', edge: '#156c4f' },
    { key: 'white', name: '白', base: '#ffffff', lane: '#b5b5b2', edge: '#999995' }
  ];

  const MODE_LABELS = {
    start: 'スタート', place: 'パーツ配置', move: 'パーツ移動', delete: 'パーツ削除', color: 'カラー変更', layoutMove: '全体移動'
  };

  const els = {};
  const state = {
    field: { widthCm: 600, heightCm: 400, gridCm: 10 },
    parts: [],
    start: null,
    startPhase: 'position',
    mode: 'start',
    selectedType: 'start',
    selectedIds: [],
    hoveredPartId: null,
    rotation: 0,
    activeConnection: null,
    cursor: { x: 300, y: 200 },
    view: { scale: 1, offsetX: 40, offsetY: 40 },
    showGrid: true,
    pointer: {
      x: 0, y: 0, down: false, panning: false, spaceDown: false,
      lastX: 0, lastY: 0, draggingParts: false, dragStart: null,
      dragBase: null, dragSnapshotTaken: false,
      marquee: false, marqueeStart: null, marqueeEnd: null, marqueeAdd: false,
      groupSnap: null
    },
    layoutMove: { active: false, anchor: null, base: null, previousMode: 'place', pointer: null },
    history: [],
    future: [],
    setupStarted: false,
    dirty: false,
    bankWarnings: [],
    assetsReady: 0
  };

  let ctx;
  let dpr = 1;
  let raf = 0;
  let toastTimer = 0;
  let layoutStore;

  function cacheElements() {
    const ids = [
      'courseCanvas','canvasWrap','setupDialog','setupForm','fieldWidthInput','fieldHeightInput','gridInput',
      'newBtn','saveBtn','loadInput','exportBtn','cancelSetupBtn','instruction','toast','partsList','partsSummary',
      'modeBadge','statusMode','statusPart','statusRotation','statusCursor','statusCount','statusZoom','statusConnection','statusSelected',
      'fieldWidthText','fieldHeightText','gridText','startText','connectionText','undoBtn','redoBtn','rewindBtn',
      'rotateLeftBtn','rotateRightBtn','gridBtn','fitViewBtn','manualFitBtn','topLeftFitBtn','editFieldBtn',
      'selectionInfo','clearSelectionBtn','deleteSelectionBtn','colorSelectionBtn','colorLegend','statusAssets','bankStateText'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
  }

  function init() {
    cacheElements();
    ctx = els.courseCanvas.getContext('2d');
    initializePartAssets();
    buildPartsList();
    buildColorLegend();
    resizeCanvas();
    layoutStore = PERSISTENCE.createLayoutStore(window.localStorage, {
      app: 'mini4wd-course-layout-mouse-flow',
      version: VERSION,
      partTypes: Object.keys(PARTS).filter(type => type !== 'start'),
      colorKeys: COLORS.map(color => color.key)
    });
    const restored = restoreLocal();
    bindEvents();
    if (!restored) {
      updateUI();
      render();
      openSetup(true);
    }
  }

  function buildPartsList() {
    els.partsList.innerHTML = '';
    PART_MENU_ORDER.forEach(type => {
      const p = PARTS[type];
      const button = document.createElement('button');
      button.className = `part-button${type === 'start' ? ' start-part-button' : ''}`;
      button.type = 'button';
      button.dataset.part = type;
      button.innerHTML = `
        <canvas class="part-preview" width="58" height="44" data-preview-type="${type}" aria-hidden="true"></canvas>
        <span class="part-copy"><strong>${p.name}</strong><small>${formatCm(p.w)} × ${formatCm(p.h)}</small></span>
        <kbd>${p.key}</kbd>`;
      button.addEventListener('click', () => selectPartType(type));
      els.partsList.appendChild(button);
    });
    renderPartPreviews();
  }



  function initializePartAssets() {
    const seen = new Set();
    const queueAsset = (file) => {
      if (!file || seen.has(file)) return;
      seen.add(file);
      const image = new Image();
      const record = { image, ready: false, failed: false, file };
      partAssetCache.set(file, record);
      image.onload = () => {
        record.ready = true;
        state.assetsReady = [...partAssetCache.values()].filter(item => item.ready).length;
        renderPartPreviews();
        updateUI();
        render();
      };
      image.onerror = () => {
        record.failed = true;
        state.assetsReady = [...partAssetCache.values()].filter(item => item.ready).length;
        updateUI();
      };
      image.src = file;
    };

    PART_MENU_ORDER.forEach(type => {
      const def = PARTS[type];
      if (def?.bank20) {
        queueAsset('assets/parts/bank20-entry.png');
        queueAsset('assets/parts/bank20-exit.png');
      } else if (!VECTOR_DEFAULT_RENDER_KINDS.has(def?.renderKind)) {
        queueAsset(def?.visual?.file);
      }
    });
  }

  function assetRecordFor(def) {
    const file = def?.visual?.file;
    return file ? partAssetCache.get(file) : null;
  }

  function drawPartAsset(c, def, colorKey = 'default', part = {}) {
    if (colorKey !== 'default') return false;
    // 標準グレーはコーナーパーツと完全に同じ色値で描画する。
    // バーニングLCもベクター描画にすることで内側・外側背景を完全透明にする。
    if (VECTOR_DEFAULT_RENDER_KINDS.has(def?.renderKind)) return false;
    let record = assetRecordFor(def);
    if (def?.bank20) {
      const role = part?.bankRole === 'exit' ? 'exit' : 'entry';
      record = partAssetCache.get(`assets/parts/bank20-${role}.png`) || record;
    }
    if (!record?.ready || !record.image?.naturalWidth) return false;
    const visual = def.visual;
    c.drawImage(record.image, -visual.originX, -visual.originY, visual.canvasWidth, visual.canvasHeight);
    return true;
  }

  function partDisplayName(part) {
    if (!part) return '';
    if (part.type === 'bank20') {
      if (part.bankRole === 'entry') return '20度バンク入口';
      if (part.bankRole === 'exit') return '20度バンク出口';
    }
    return PARTS[part.type]?.name || part.type;
  }

  function endpointState(value = {}) {
    return {
      bankAngle: Number(value.bankAngle) === 20 ? 20 : 0,
      bankSectionId: value.bankSectionId || null,
      elevationMm: Number(value.elevationMm) || 0
    };
  }

  function renderPartPreviews() {
    document.querySelectorAll('.part-preview').forEach(canvas => {
      const type = canvas.dataset.previewType;
      const pctx = canvas.getContext('2d');
      const def = PARTS[type];
      if (!def) return;
      pctx.clearRect(0, 0, canvas.width, canvas.height);
      pctx.save();
      pctx.translate(canvas.width / 2, canvas.height / 2);
      const bounds = type === 'start'
        ? { minX: -START_DEF.w / 2, maxX: START_DEF.w / 2, minY: -START_DEF.h / 2, maxY: START_DEF.h / 2, w: START_DEF.w, h: START_DEF.h }
        : localPartBounds(type);
      const scale = Math.min((canvas.width - 7) / Math.max(bounds.w, 1), (canvas.height - 7) / Math.max(bounds.h, 1));
      pctx.scale(scale, scale);
      pctx.translate(-(bounds.minX + bounds.maxX) / 2, -(bounds.minY + bounds.maxY) / 2);
      if (type === 'start') drawStartLane(pctx, { x: 0, y: 0, rotation: 0 }, true, false);
      else drawPart(pctx, { id: 'preview', type, x: 0, y: 0, rotation: 0, colorKey: 'default', bankRole: 'entry' }, { exportMode: true });
      pctx.restore();
    });
  }


  function buildColorLegend() {
    els.colorLegend.innerHTML = COLORS.map(color => {
      const sample = color.base || '#d9d9d5';
      return `<span class="color-chip"><i style="background:${sample}"></i>${color.name}</span>`;
    }).join('');
  }

  function on(el, eventName, handler, options) {
    if (el) el.addEventListener(eventName, handler, options);
  }

  function bindEvents() {
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    els.setupForm.addEventListener('submit', e => { e.preventDefault(); applySetup(); });
    els.cancelSetupBtn.addEventListener('click', () => { if (state.setupStarted) els.setupDialog.close(); });
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [w, h] = btn.dataset.preset.split(',');
        els.fieldWidthInput.value = w;
        els.fieldHeightInput.value = h;
      });
    });

    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    els.newBtn.addEventListener('click', () => {
      if ((state.parts.length || state.start) && !window.confirm('現在のレイアウトを消して新規作成しますか？')) return;
      openSetup(true);
    });
    els.editFieldBtn.addEventListener('click', () => openSetup(false));
    els.saveBtn.addEventListener('click', saveJson);
    els.loadInput.addEventListener('change', loadJson);
    els.exportBtn.addEventListener('click', exportPng);
    els.undoBtn.addEventListener('click', undo);
    els.redoBtn.addEventListener('click', redo);
    els.rewindBtn.addEventListener('click', rewindLastPart);
    els.rotateLeftBtn.addEventListener('click', () => rotateCurrent(-45));
    els.rotateRightBtn.addEventListener('click', () => rotateCurrent(45));
    els.gridBtn.addEventListener('click', toggleGrid);
    els.fitViewBtn.addEventListener('click', fitView);
    els.manualFitBtn.addEventListener('click', beginManualLayoutMove);
    els.topLeftFitBtn.addEventListener('click', autoAlignLayoutTopLeft);
    els.clearSelectionBtn.addEventListener('click', clearSelection);
    els.deleteSelectionBtn.addEventListener('click', () => deleteParts(state.selectedIds));
    els.colorSelectionBtn.addEventListener('click', () => cyclePartsColor(state.selectedIds));

    const canvas = els.courseCanvas;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  function openSetup(reset) {
    if (reset) {
      els.fieldWidthInput.value = '6.0';
      els.fieldHeightInput.value = '4.0';
      els.gridInput.value = '10';
      els.cancelSetupBtn.style.visibility = state.setupStarted ? 'visible' : 'hidden';
    } else {
      els.fieldWidthInput.value = (state.field.widthCm / 100).toFixed(1);
      els.fieldHeightInput.value = (state.field.heightCm / 100).toFixed(1);
      els.gridInput.value = String(state.field.gridCm);
      els.cancelSetupBtn.style.visibility = 'visible';
    }
    els.setupDialog.dataset.reset = reset ? 'true' : 'false';
    els.setupDialog.showModal();
    setTimeout(() => els.fieldWidthInput.focus(), 50);
  }

  function applySetup() {
    const widthM = Number(els.fieldWidthInput.value);
    const heightM = Number(els.fieldHeightInput.value);
    const gridCm = Number(els.gridInput.value);
    if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM < 1 || heightM < 1) {
      toast('1m以上のサイズを入力してください');
      return;
    }

    const reset = els.setupDialog.dataset.reset === 'true';
    if (!reset) snapshot();
    state.field = { widthCm: widthM * 100, heightCm: heightM * 100, gridCm };
    if (reset) {
      state.parts = [];
      state.start = null;
      state.startPhase = 'position';
      state.activeConnection = null;
      state.selectedIds = [];
      state.selectedType = 'start';
      state.rotation = 0;
      state.mode = 'start';
      state.cursor = { x: snap(state.field.widthCm / 2), y: snap(state.field.heightCm / 2) };
      state.history = [];
      state.future = [];
      resetPointerInteraction();
    } else {
      clampAllToField();
    }
    state.setupStarted = true;
    els.setupDialog.close();
    fitView();
    updateUI();
    render();
    els.courseCanvas.focus();
    persistLocal();
  }

  function setMode(mode) {
    if (state.layoutMove.active) cancelManualLayoutMove();
    if (!['place','move','delete','color'].includes(mode)) return;
    if (!state.start) return toast('先にスタートレーンを配置してください');
    state.mode = state.mode === mode && mode !== 'place' ? 'place' : mode;
    state.hoveredPartId = null;
    resetPointerInteraction();
    if (state.mode === 'place') clearSelection(false);
    updateUI();
    render();
    els.courseCanvas.focus();
  }

  function selectPartType(type) {
    if (!PARTS[type]) return;
    if (state.layoutMove.active) cancelManualLayoutMove();
    if (type === 'start') {
      if (state.start) {
        toast('スタートレーンはすでに配置されています');
        return;
      }
      state.selectedType = 'start';
      state.mode = 'start';
      clearSelection(false);
      updateUI();
      render();
      els.courseCanvas.focus();
      return;
    }
    if (!state.start) return toast('最初に「5 スタート」を配置してください');
    state.selectedType = type;
    state.mode = 'place';
    state.hoveredPartId = null;
    clearSelection(false);
    updateUI();
    render();
    els.courseCanvas.focus();
  }

  function snapshot() {
    state.history.push(JSON.stringify(serializeState()));
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.future = [];
    state.dirty = true;
  }

  function undo() {
    if (!state.history.length) return toast('戻せる操作がありません');
    state.future.push(JSON.stringify(serializeState()));
    if (state.future.length > HISTORY_LIMIT) state.future.shift();
    applySerialized(JSON.parse(state.history.pop()), false);
    toast('元に戻しました');
  }

  function redo() {
    if (!state.future.length) return toast('やり直せる操作がありません');
    state.history.push(JSON.stringify(serializeState()));
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    applySerialized(JSON.parse(state.future.pop()), false);
    toast('やり直しました');
  }

  function serializeState() {
    return {
      app: 'mini4wd-course-layout-mouse-flow',
      version: VERSION,
      field: { ...state.field },
      parts: state.parts.map(p => ({ ...p })),
      start: state.start ? { ...state.start } : null,
      startPhase: state.startPhase,
      selectedType: state.selectedType,
      rotation: state.rotation,
      activeConnection: state.activeConnection ? { ...state.activeConnection } : null
    };
  }

  function applySerialized(data, resetHistory = true, options = {}) {
    if (!data || !data.field || !Array.isArray(data.parts)) throw new Error('不正なレイアウトデータです');
    state.field = {
      widthCm: Number(data.field.widthCm) || 600,
      heightCm: Number(data.field.heightCm) || 400,
      gridCm: Number(data.field.gridCm) || 10
    };
    state.parts = data.parts.map((p, index) => ({
      id: String(p.id || makeId()),
      type: PARTS[p.type] && p.type !== 'start' ? p.type : ({ half: 'straight', curve: 'corner45' }[p.type] || 'straight'),
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      rotation: normalizeRotation(Number(p.rotation) || 0),
      routeIndex: Number.isInteger(Number(p.routeIndex)) ? clamp(Number(p.routeIndex), 0, 1) : 0,
      colorKey: COLORS.some(c => c.key === p.colorKey) ? p.colorKey : 'default',
      zIndex: Number.isFinite(Number(p.zIndex)) ? Number(p.zIndex) : index + 1
    }));

    const loadedRotation = normalizeRotation(Number(data.start?.rotation) || 0);
    if (data.start) {
      const loadedStart = { x: Number(data.start.x) || 0, y: Number(data.start.y) || 0, rotation: loadedRotation };
      const isLegacyStartPoint = !data.version || /^0\.[012](?:\.|$)/.test(String(data.version));
      if (isLegacyStartPoint) {
        const back = rotatePoint({ x: -START_DEF.w / 2, y: 0 }, loadedRotation);
        loadedStart.x += back.x;
        loadedStart.y += back.y;
      }
      state.start = loadedStart;
    } else {
      state.start = null;
    }

    state.startPhase = 'position';
    state.selectedType = state.start ? (PARTS[data.selectedType] && data.selectedType !== 'start' ? data.selectedType : 'straight') : 'start';
    state.rotation = normalizeRotation(Number(data.rotation) || 0);
    state.selectedIds = [];
    state.mode = state.start ? 'place' : 'start';
    state.layoutMove = { active: false, anchor: null, base: null, previousMode: 'place', pointer: null };
    resetPointerInteraction();
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
    state.cursor = state.activeConnection
      ? { x: state.activeConnection.x, y: state.activeConnection.y }
      : { x: snap(state.field.widthCm / 2), y: snap(state.field.heightCm / 2) };
    state.setupStarted = true;
    if (resetHistory) { state.history = []; state.future = []; }
    fitView();
    updateUI();
    render();
    if (options.persist !== false) persistLocal();
  }

  function persistLocal() {
    return layoutStore?.save(serializeState()) || { status: 'not-ready' };
  }

  function restoreLocal() {
    const restored = layoutStore.restore();
    if (restored.status === 'restored') {
      applySerialized(restored.layout, true, { persist: false });
      toast('保存済みレイアウトを復元しました');
      return true;
    }
    return false;
  }

  function saveJson() {
    const data = JSON.stringify(serializeState(), null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), `mini4wd-layout-${dateStamp()}.json`);
    persistLocal();
    toast('JSONを保存しました');
  }

  async function loadJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      applySerialized(JSON.parse(text), true);
      toast('レイアウトを読み込みました');
    } catch (err) {
      console.error(err);
      toast('JSONを読み込めませんでした');
    }
  }

  function exportPng() {
    const padding = 30;
    const exportScale = Math.min(2.2, Math.max(0.5, 1800 / Math.max(state.field.widthCm, state.field.heightCm)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(state.field.widthCm * exportScale + padding * 2);
    canvas.height = Math.ceil(state.field.heightCm * exportScale + padding * 2 + 54);
    const c = canvas.getContext('2d');
    c.fillStyle = '#f6f8fb';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(padding, padding + 34);
    c.scale(exportScale, exportScale);
    drawExport(c);
    c.restore();
    c.fillStyle = '#111821';
    c.font = '700 18px sans-serif';
    c.fillText('MINI 4WD COURSE LAYOUT', padding, 24);
    c.fillStyle = '#556171';
    c.font = '12px sans-serif';
    c.fillText(`${(state.field.widthCm/100).toFixed(2)}m × ${(state.field.heightCm/100).toFixed(2)}m  /  ${state.parts.length + (state.start ? 1 : 0)} parts`, padding, canvas.height - 15);
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, `mini4wd-layout-${dateStamp()}.png`);
      toast('PNGを書き出しました');
    }, 'image/png');
  }

  function layerValue(part, fallbackIndex = 0) {
    const value = Number(part?.zIndex);
    return Number.isFinite(value) ? value : fallbackIndex + 1;
  }

  function partsByLayer() {
    return state.parts
      .map((part, index) => ({ part, index, layer: layerValue(part, index) }))
      .sort((a, b) => a.layer - b.layer || a.index - b.index)
      .map(item => item.part);
  }

  function nextZIndex() {
    return state.parts.reduce((max, part, index) => Math.max(max, layerValue(part, index)), 0) + 1;
  }

  function promotePartsToFront(ids) {
    const wanted = new Set(ids);
    const moving = partsByLayer().filter(part => wanted.has(part.id));
    if (!moving.length) return;
    let z = nextZIndex();
    moving.forEach(part => { part.zIndex = z++; });
  }

  function drawTrackJointPatch(c, point, heading, part, options = {}) {
    const def = resolvePartDef(part);
    const patchLength = options.length ?? 5.8;
    const overscan = options.overscan ?? 0.9;
    const laneHalf = TRACK_WIDTH_CM / 2;
    c.save();
    c.translate(point.x, point.y);
    c.rotate(heading * Math.PI / 180);

    // 継ぎ目を少し広めに塗り直して、画像の端同士のわずかなズレを隠す。
    c.fillStyle = def.base;
    c.fillRect(-patchLength / 2, -laneHalf - overscan, patchLength, TRACK_WIDTH_CM + overscan * 2);

    c.lineCap = 'butt';
    c.strokeStyle = def.edge;
    c.lineWidth = 1.02;
    for (const y of [-laneHalf, laneHalf]) {
      c.beginPath(); c.moveTo(-patchLength / 2, y); c.lineTo(patchLength / 2, y); c.stroke();
    }

    c.strokeStyle = def.lane;
    c.lineWidth = .82;
    for (const y of [-TRACK_WIDTH_CM / 6, TRACK_WIDTH_CM / 6]) {
      c.beginPath(); c.moveTo(-patchLength / 2, y); c.lineTo(patchLength / 2, y); c.stroke();
    }

    c.restore();
  }

  function drawCornerJointsForPart(c, part, earlierParts) {
    const currentEnds = partEndpoints(part);
    const currentIsCorner = part.type === 'corner45';
    for (const earlier of earlierParts) {
      const earlierIsCorner = earlier.type === 'corner45';
      if (!currentIsCorner && !earlierIsCorner) continue;
      const earlierEnds = partEndpoints(earlier);
      for (const currentEnd of currentEnds) {
        const mate = earlierEnds.find(endpoint => endpointsConnect(currentEnd, endpoint));
        if (!mate) continue;
        const bothCorner = currentIsCorner && earlierIsCorner;
        // 正確な45度画像同士は接続面が一致するため、補正パッチを重ねない。
        // コーナーと他パーツの接続だけ、ごく短い補正を残す。
        if (!bothCorner) {
          drawTrackJointPatch(
            c,
            { x: (currentEnd.x + mate.x) / 2, y: (currentEnd.y + mate.y) / 2 },
            currentEnd.heading,
            part,
            { length: 2.2, overscan: 0.35 }
          );
        }
      }
    }
  }

  function drawPartsInLayerOrder(c, options = {}) {
    const earlier = [];
    for (const part of partsByLayer()) {
      drawPart(c, part, {
        exportMode: !!options.exportMode,
        selected: options.selected ? isSelected(part.id) : false,
        hovered: options.selected && state.hoveredPartId === part.id
      });
      drawCornerJointsForPart(c, part, earlier);
      earlier.push(part);
    }
    drawConnectedPartSeams(c, options);
  }

  function drawConnectedPartSeams(c, options = {}) {
    const seams = PART_SEAMS.findConnectedSeams(getAllEndpoints(), endpointsConnect);
    for (const seam of seams) {
      const selected = !!options.selected && seam.endpoints.some(endpoint => (
        endpoint.sourceId !== 'start' && isSelected(endpoint.sourceId)
      ));
      const style = PART_SEAMS.resolveStyle({
        enabled: RENDER_FEATURES.partSeams,
        selected,
        exportMode: !!options.exportMode
      });
      if (!style) continue;

      const halfWidth = TRACK_WIDTH_CM / 2 - style.edgeInset;
      c.save();
      c.translate(seam.point.x, seam.point.y);
      c.rotate(seam.heading * Math.PI / 180);
      c.strokeStyle = style.color;
      c.lineWidth = style.lineWidth;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(0, -halfWidth);
      c.lineTo(0, halfWidth);
      c.stroke();
      c.restore();
    }
  }

  function drawExport(c) {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, state.field.widthCm, state.field.heightCm);
    c.strokeStyle = '#2b3440';
    c.lineWidth = 1.2;
    c.strokeRect(0, 0, state.field.widthCm, state.field.heightCm);
    if (state.start) drawStartLane(c, state.start, true);
    drawPartsInLayerOrder(c, { exportMode: true });
  }

  function dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function resizeCanvas() {
    const rect = els.canvasWrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.courseCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
    els.courseCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
    els.courseCanvas.style.width = `${rect.width}px`;
    els.courseCanvas.style.height = `${rect.height}px`;
    render();
  }

  function fitView() {
    const rect = els.canvasWrap.getBoundingClientRect();
    const margin = 42;
    const sx = (rect.width - margin * 2) / state.field.widthCm;
    const sy = (rect.height - margin * 2) / state.field.heightCm;
    state.view.scale = clamp(Math.min(sx, sy), 0.12, 5);
    state.view.offsetX = (rect.width - state.field.widthCm * state.view.scale) / 2;
    state.view.offsetY = (rect.height - state.field.heightCm * state.view.scale) / 2;
    updateUI();
    render();
  }

  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const canvas = els.courseCanvas;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawBackground(w, h);
      ctx.save();
      ctx.translate(state.view.offsetX, state.view.offsetY);
      ctx.scale(state.view.scale, state.view.scale);
      drawField(ctx);
      if (state.start) drawStartLane(ctx, state.start, false);
      drawPartsInLayerOrder(ctx, { selected: true });
      if (state.layoutMove.active) drawLayoutMoveOverlay(ctx);
      drawCursorAndGhost(ctx);
      drawMarquee(ctx);
      ctx.restore();
    });
  }

  function drawBackground(w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#101820');
    g.addColorStop(1, '#18242e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawField(c) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,.5)';
    c.shadowBlur = 24 / state.view.scale;
    c.fillStyle = '#f7f6f2';
    c.fillRect(0, 0, state.field.widthCm, state.field.heightCm);
    c.shadowBlur = 0;
    if (state.showGrid) drawGrid(c);
    c.strokeStyle = '#6e716d';
    c.lineWidth = 1.6 / state.view.scale;
    c.setLineDash([8 / state.view.scale, 5 / state.view.scale]);
    c.strokeRect(0, 0, state.field.widthCm, state.field.heightCm);
    c.setLineDash([]);
    const m = 100;
    c.strokeStyle = '#555953';
    c.lineWidth = 2 / state.view.scale;
    c.beginPath();
    c.moveTo(10, state.field.heightCm - 18);
    c.lineTo(10 + m, state.field.heightCm - 18);
    c.stroke();
    c.fillStyle = '#555953';
    c.font = `${11 / state.view.scale}px sans-serif`;
    c.fillText('1m', 10 + m / 2 - 7 / state.view.scale, state.field.heightCm - 24);
    c.restore();
  }

  function drawGrid(c) {
    const step = state.field.gridCm;
    const majorEvery = Math.max(1, Math.round(100 / step));
    c.lineWidth = 1 / state.view.scale;
    for (let x = 0, i = 0; x <= state.field.widthCm + .001; x += step, i++) {
      c.strokeStyle = i % majorEvery === 0 ? '#ccc9c0' : '#e9e6df';
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, state.field.heightCm); c.stroke();
    }
    for (let y = 0, i = 0; y <= state.field.heightCm + .001; y += step, i++) {
      c.strokeStyle = i % majorEvery === 0 ? '#ccc9c0' : '#e9e6df';
      c.beginPath(); c.moveTo(0, y); c.lineTo(state.field.widthCm, y); c.stroke();
    }
  }

  function resolvePartDef(part) {
    const original = PARTS[part.type];
    const palette = COLORS.find(c => c.key === part.colorKey) || COLORS[0];
    if (!palette.base) return original;
    return { ...original, base: palette.base, lane: palette.lane, edge: palette.edge };
  }

  function drawPart(c, part, opts = {}) {
    const def = resolvePartDef(part);
    if (!def) return;
    const exportMode = !!opts.exportMode;
    const selected = !!opts.selected;
    c.save();
    c.translate(part.x, part.y);
    c.rotate(part.rotation * Math.PI / 180);

    const usedAsset = drawPartAsset(c, def, part.colorKey || 'default', part);
    if (!usedAsset) {
      if (def.corner45) drawCorner45(c, def, exportMode);
      else if (def.wave) drawWave(c, def, exportMode);
      else if (def.burning) drawBurningGraphic(c, def);
      else drawStraightLike(c, def, exportMode, part);
    }
    if (selected) drawPartSelectionEffect(c, part.type, '#46bfff', 'rgba(70,191,255,.10)', true);
    if (opts.hovered) drawPartHoverEffect(c, part.type);
    c.restore();
  }



  function drawTileShadow() {
    // 参照エディターに近いフラット表示にするため影は付けない。
  }


  function drawStraightLike(c, def, exportMode, part = {}) {
    if (def.lcjump) {
      drawJumpGraphic(c, def);
      return;
    }
    const vx = -(def.visual?.originX ?? def.w / 2);
    const vy = -(def.visual?.originY ?? def.h / 2);
    c.fillStyle = def.base;
    c.fillRect(vx, vy, def.w, def.h);
    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    c.strokeRect(vx, vy, def.w, def.h);

    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (let i = 1; i < 3; i++) {
      const y = vy + (TRACK_WIDTH_CM / 3) * i;
      c.beginPath(); c.moveTo(vx, y); c.lineTo(vx + def.w, y); c.stroke();
    }

    if (def.lanechange) drawLaneChangeGraphic(c, def);
    if (def.slope) drawSlopeGraphic(c, def);
    if (def.bank20) drawBankGraphic(c, def, part);
  }



  function drawLaneChangeGraphic(c, def) {
    const laneW = TRACK_WIDTH_CM / 3;
    const startX = -def.w / 2 + 42;
    const endX = def.w / 2 - 42;
    c.save();
    c.lineCap = 'butt';
    c.lineJoin = 'round';

    // 下側レーンから上側レーンへ渡る橋状リボン。
    c.strokeStyle = '#c0bcb8';
    c.lineWidth = laneW;
    c.beginPath();
    c.moveTo(startX, laneW);
    c.bezierCurveTo(-def.w * .12, laneW, def.w * .12, -laneW, endX, -laneW);
    c.stroke();
    c.strokeStyle = def.edge;
    c.lineWidth = .8;
    for (const offset of [-laneW / 2, laneW / 2]) {
      c.beginPath();
      c.moveTo(startX, laneW + offset);
      c.bezierCurveTo(-def.w * .12, laneW + offset, def.w * .12, -laneW + offset, endX, -laneW + offset);
      c.stroke();
    }

    // 残り2レーンの境界を緩やかに逃がす。
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    c.beginPath();
    c.moveTo(-def.w/2, -laneW/2);
    c.lineTo(-def.w*.18, -laneW/2);
    c.bezierCurveTo(-def.w*.05, -laneW/2, def.w*.05, laneW/2, def.w*.18, laneW/2);
    c.lineTo(def.w/2, laneW/2);
    c.stroke();
    c.beginPath();
    c.moveTo(-def.w/2, laneW/2);
    c.lineTo(-def.w*.18, laneW/2);
    c.bezierCurveTo(-def.w*.05, laneW/2, def.w*.05, -laneW/2, def.w*.18, -laneW/2);
    c.lineTo(def.w/2, -laneW/2);
    c.stroke();
    c.restore();
  }



  function drawSlopeGraphic(c, def) {
    c.save();
    const grad = c.createLinearGradient(-def.w / 2, 0, def.w / 2, 0);
    grad.addColorStop(0, shadeColor(def.base, -.16));
    grad.addColorStop(.42, def.base);
    grad.addColorStop(.58, def.base);
    grad.addColorStop(1, shadeColor(def.base, -.12));
    c.globalAlpha = .58;
    c.fillStyle = grad;
    c.fillRect(-def.w / 2 + 1, -def.h / 2 + 1, def.w - 2, def.h - 2);
    c.globalAlpha = 1;
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (let i = 1; i < 3; i++) {
      const y = -def.h / 2 + def.h * i / 3;
      c.beginPath(); c.moveTo(-def.w / 2, y); c.lineTo(def.w / 2, y); c.stroke();
    }
    c.restore();
  }


  function drawBankGraphic(c, def, part = {}) {
    c.save();
    const role = part.bankRole || 'entry';
    const reverse = role === 'exit' ? -1 : 1;
    const grad = c.createLinearGradient(-def.w / 2 * reverse, 0, def.w / 2 * reverse, 0);
    grad.addColorStop(0, shadeColor(def.base, -.16));
    grad.addColorStop(.52, def.base);
    grad.addColorStop(1, shadeColor(def.base, .05));
    c.globalAlpha = .82;
    c.fillStyle = grad;
    c.fillRect(-def.w / 2 + 1, -def.h / 2 + 1, def.w - 2, def.h - 2);
    c.globalAlpha = 1;
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (let i = 1; i < 3; i++) {
      const y = -TRACK_WIDTH_CM / 2 + TRACK_WIDTH_CM * i / 3;
      c.beginPath(); c.moveTo(-def.w / 2, y); c.lineTo(def.w / 2, y); c.stroke();
    }
    c.fillStyle = 'rgba(60,60,58,.68)';
    c.font = '700 4.5px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(role === 'exit' ? 'OUT' : 'IN', 0, 0);
    c.restore();
  }



  function drawJumpGraphic(c, def) {
    c.save();
    const vx = -(def.visual?.originX ?? 27);
    const vy = -(def.visual?.originY ?? 18);
    // 上側のコース本体（参照形状では下に支持ブロックが張り出す）。
    c.fillStyle = def.base;
    c.fillRect(vx, vy, def.w, 25);
    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    c.strokeRect(vx, vy, def.w, 25);
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    c.beginPath(); c.moveTo(vx, vy + 12); c.lineTo(vx + def.w, vy + 12); c.stroke();
    c.beginPath(); c.moveTo(vx, vy + 24); c.lineTo(vx + def.w, vy + 24); c.stroke();
    const supportW = 39;
    const supportY = vy + 25;
    c.fillStyle = 'rgba(172,168,164,.78)';
    c.fillRect(vx, supportY, supportW, 11);
    c.strokeStyle = def.edge;
    c.strokeRect(vx, supportY, supportW, 11);
    c.restore();
  }



  function drawBurningGraphic(c, def) {
    const g = burningGeometry(def);
    c.save();
    c.lineCap = 'butt';
    c.lineJoin = 'round';
    // U字の本体を太いストロークで作る。
    c.strokeStyle = def.base;
    c.lineWidth = TRACK_WIDTH_CM;
    c.beginPath();
    c.moveTo(g.leftX, -g.separation / 2);
    c.lineTo(g.arcCenterX, -g.separation / 2);
    c.arc(g.arcCenterX, 0, g.separation / 2, -Math.PI / 2, Math.PI / 2, false);
    c.lineTo(g.leftX, g.separation / 2);
    c.stroke();
    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    for (const offset of [-TRACK_WIDTH_CM / 2, TRACK_WIDTH_CM / 2]) {
      c.beginPath();
      c.moveTo(g.leftX, -g.separation / 2 + offset);
      c.lineTo(g.arcCenterX, -g.separation / 2 + offset);
      c.arc(g.arcCenterX, 0, g.separation / 2 - offset, -Math.PI / 2, Math.PI / 2, false);
      c.lineTo(g.leftX, g.separation / 2 - offset);
      c.stroke();
    }
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (const laneOffset of [-TRACK_WIDTH_CM / 6, TRACK_WIDTH_CM / 6]) {
      c.beginPath();
      c.moveTo(g.leftX, -g.separation / 2 + laneOffset);
      c.lineTo(g.arcCenterX, -g.separation / 2 + laneOffset);
      c.arc(g.arcCenterX, 0, g.separation / 2 - laneOffset, -Math.PI / 2, Math.PI / 2, false);
      c.lineTo(g.leftX, g.separation / 2 - laneOffset);
      c.stroke();
    }
    // 内側の交差ガイド。
    c.strokeStyle = def.base;
    c.lineWidth = TRACK_WIDTH_CM / 3 * .72;
    c.beginPath(); c.moveTo(g.leftX + 18, -g.separation / 2); c.bezierCurveTo(g.arcCenterX - 14, -g.separation/2, g.arcCenterX - 30, g.separation/2, g.leftX + 28, g.separation/2); c.stroke();
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    c.beginPath(); c.moveTo(g.leftX + 18, -g.separation / 2); c.bezierCurveTo(g.arcCenterX - 14, -g.separation/2, g.arcCenterX - 30, g.separation/2, g.leftX + 28, g.separation/2); c.stroke();
    c.restore();
  }


  function corner45Geometry(def) {
    const r = def.geometry?.centerlineRadius || def.radius || 54;
    const angle = Math.PI / 4;
    const ri = def.geometry?.innerRadius || r - TRACK_WIDTH_CM / 2;
    const ro = def.geometry?.outerRadius || r + TRACK_WIDTH_CM / 2;
    const radialCentroid = (4 * Math.sin(angle / 2) / (3 * angle)) * ((ro ** 3 - ri ** 3) / (ro ** 2 - ri ** 2));
    const bisector = -3 * Math.PI / 8;
    const center = { x: -radialCentroid * Math.cos(bisector), y: -radialCentroid * Math.sin(bisector) };
    const startAngle = -Math.PI / 2;
    const endAngle = -Math.PI / 4;
    const entry = { x: center.x + r * Math.cos(startAngle), y: center.y + r * Math.sin(startAngle) };
    const exit = { x: center.x + r * Math.cos(endAngle), y: center.y + r * Math.sin(endAngle) };
    const points = [];
    for (const radius of [ri, ro]) {
      for (let i = 0; i <= 48; i++) {
        const a = startAngle + (endAngle - startAngle) * i / 48;
        points.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
      }
    }
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    return { r, ri, ro, entry, exit, center, startAngle, endAngle, bounds: { minX, maxX, minY, maxY, w: maxX-minX, h:maxY-minY } };
  }



  function drawCorner45(c, def, exportMode) {
    const g = corner45Geometry(def);
    c.save();
    c.translate(g.center.x, g.center.y);
    c.strokeStyle = def.base;
    c.lineWidth = TRACK_WIDTH_CM;
    c.beginPath(); c.arc(0, 0, g.r, g.startAngle, g.endAngle, false); c.stroke();
    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    for (const radius of [g.ri, g.ro]) {
      c.beginPath(); c.arc(0, 0, radius, g.startAngle, g.endAngle, false); c.stroke();
    }
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (const offset of [-TRACK_WIDTH_CM / 6, TRACK_WIDTH_CM / 6]) {
      c.beginPath(); c.arc(0, 0, g.r + offset, g.startAngle, g.endAngle, false); c.stroke();
    }
    c.restore();
  }


  function tracePartShapePath(c, type) {
    const def = PARTS[type];
    if (!def) return false;
    if (def.corner45) {
      const g = corner45Geometry(def);
      c.beginPath();
      c.moveTo(g.center.x + g.ro * Math.cos(g.startAngle), g.center.y + g.ro * Math.sin(g.startAngle));
      c.arc(g.center.x, g.center.y, g.ro, g.startAngle, g.endAngle, false);
      c.lineTo(g.center.x + g.ri * Math.cos(g.endAngle), g.center.y + g.ri * Math.sin(g.endAngle));
      c.arc(g.center.x, g.center.y, g.ri, g.endAngle, g.startAngle, true);
      c.closePath();
      return true;
    }
    const b = localPartBounds(type);
    c.beginPath();
    c.rect(b.minX, b.minY, b.w, b.h);
    c.closePath();
    return true;
  }

  function drawPartSelectionEffect(c, type, stroke, fill, dashed = false) {
    c.save();
    if (!tracePartShapePath(c, type)) { c.restore(); return; }
    c.fillStyle = fill;
    c.strokeStyle = stroke;
    c.lineWidth = 2.5 / Math.max(state.view.scale, .15);
    if (dashed) c.setLineDash([6 / Math.max(state.view.scale, .15), 4 / Math.max(state.view.scale, .15)]);
    c.fill();
    c.stroke();
    c.restore();
  }

  function hoverStyleForMode() {
    if (state.mode === 'delete') return { stroke: '#ff5268', fill: 'rgba(255,82,104,.22)' };
    if (state.mode === 'color') return { stroke: '#c888ff', fill: 'rgba(200,136,255,.20)' };
    return { stroke: '#55d7ff', fill: 'rgba(85,215,255,.18)' };
  }

  function drawPartHoverEffect(c, type) {
    const style = hoverStyleForMode();
    c.save();
    c.shadowColor = style.stroke;
    c.shadowBlur = 12 / Math.max(state.view.scale, .15);
    drawPartSelectionEffect(c, type, style.stroke, style.fill, false);
    c.restore();
  }


  function drawWave(c, def, exportMode) {
    const amp = def.geometry?.amplitude || def.amplitude || 4;
    const trackWidth = def.geometry?.trackWidth || TRACK_WIDTH_CM;
    const samples = 72;
    const waveY = x => {
      const t = (x + def.w / 2) / def.w;
      return (def.geometry?.connectors?.[0]?.y || 0) - amp * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t));
    };
    c.save();
    c.fillStyle = def.base;
    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    c.beginPath();
    for (let i = 0; i <= samples; i++) {
      const x = -def.w / 2 + def.w * i / samples;
      const y = -trackWidth / 2 + waveY(x);
      if (!i) c.moveTo(x, y); else c.lineTo(x, y);
    }
    for (let i = samples; i >= 0; i--) {
      const x = -def.w / 2 + def.w * i / samples;
      c.lineTo(x, trackWidth / 2 + waveY(x));
    }
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (let laneIndex = 1; laneIndex < 3; laneIndex++) {
      const base = -trackWidth / 2 + trackWidth * laneIndex / 3;
      c.beginPath();
      for (let i = 0; i <= samples; i++) {
        const x = -def.w / 2 + def.w * i / samples;
        const y = base + waveY(x);
        if (!i) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.stroke();
    }
    c.restore();
  }



  function drawCurve(c, def, exportMode) {
    const outer = def.w;
    const inner = outer - TRACK_WIDTH_CM;
    c.save();
    c.translate(-def.w / 2, def.h / 2);
    c.shadowColor = 'rgba(20,30,32,.25)';
    c.shadowBlur = 4 / Math.max(state.view.scale, .15);
    c.strokeStyle = def.base;
    c.lineWidth = TRACK_WIDTH_CM;
    c.beginPath(); c.arc(0, 0, outer - TRACK_WIDTH_CM / 2, -Math.PI / 2, 0, false); c.stroke();
    c.shadowColor = 'transparent';
    c.strokeStyle = def.edge;
    c.lineWidth = 1.25;
    c.beginPath(); c.arc(0, 0, outer, -Math.PI / 2, 0, false); c.stroke();
    c.beginPath(); c.arc(0, 0, inner, -Math.PI / 2, 0, false); c.stroke();
    c.strokeStyle = def.lane;
    c.lineWidth = .9;
    for (let i = 1; i < 3; i++) {
      c.beginPath(); c.arc(0, 0, outer - (TRACK_WIDTH_CM / 3) * i, -Math.PI / 2, 0, false); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,.34)';
    c.lineWidth = .65;
    c.beginPath(); c.arc(0, 0, outer - 1, -Math.PI / 2, 0, false); c.stroke();
    c.restore();
  }

  function shadeColor(hex, amount) {
    const clean = String(hex || '#dddddd').replace('#','');
    const value = parseInt(clean.length === 3 ? clean.split('').map(x=>x+x).join('') : clean, 16);
    const r = clamp((value >> 16) + Math.round(255 * amount), 0, 255);
    const g = clamp(((value >> 8) & 255) + Math.round(255 * amount), 0, 255);
    const b = clamp((value & 255) + Math.round(255 * amount), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function burningGeometry(def) {
    const g = def.geometry || {};
    return {
      separation: (g.endpointY || 54) * 2,
      leftX: Number.isFinite(g.endpointX) ? g.endpointX : -def.w / 2,
      arcCenterX: Number.isFinite(g.arcCenterX) ? g.arcCenterX : 18
    };
  }


  function localPartBounds(type) {
    const def = PARTS[type];
    if (!def) return { minX:0,maxX:0,minY:0,maxY:0,w:0,h:0 };
    if (def.corner45) return corner45Geometry(def).bounds;
    const b = def.geometry?.bounds;
    if (b) return { ...b, w: b.maxX - b.minX, h: b.maxY - b.minY };
    return { minX: -def.w/2, maxX:def.w/2, minY:-def.h/2, maxY:def.h/2, w:def.w, h:def.h };
  }


  function startRoute(start) {
    const ends = startEndpoints(start);
    return {
      entry: { ...ends[0], heading: normalizeRotation(start.rotation + 180) },
      exit: { ...ends[1], heading: normalizeRotation(start.rotation) }
    };
  }


  function drawStartLane(c, start, exportMode, ghost = false) {
    c.save();
    c.translate(start.x, start.y);
    c.rotate(start.rotation * Math.PI / 180);
    if (!drawPartAsset(c, START_DEF, 'default')) {
      c.fillStyle = START_DEF.base;
      c.fillRect(-START_DEF.w / 2, -START_DEF.h / 2, START_DEF.w, START_DEF.h);
      c.strokeStyle = START_DEF.edge;
      c.lineWidth = 1.05;
      c.strokeRect(-START_DEF.w / 2, -START_DEF.h / 2, START_DEF.w, START_DEF.h);
      c.strokeStyle = START_DEF.lane;
      c.lineWidth = .8;
      for (let i = 1; i < 3; i++) {
        const y = -START_DEF.h / 2 + START_DEF.h * i / 3;
        c.beginPath(); c.moveTo(-START_DEF.w / 2, y); c.lineTo(START_DEF.w / 2, y); c.stroke();
      }
      const laneY = START_DEF.h / 3;
      c.fillStyle = START_DEF.accent;
      c.fillRect(-START_DEF.w/2, -START_DEF.h/2, 5, START_DEF.h/3);
      c.fillRect(-START_DEF.w/2, START_DEF.h/6, 5, START_DEF.h/3);
      for (const y of [-laneY, laneY]) {
        c.beginPath();
        c.moveTo(-START_DEF.w * .30, y);
        c.lineTo(-START_DEF.w * .05, y);
        c.lineTo(-START_DEF.w * .12, y - 2.4);
        c.moveTo(-START_DEF.w * .05, y);
        c.lineTo(-START_DEF.w * .12, y + 2.4);
        c.strokeStyle = START_DEF.accent;
        c.lineWidth = 2.2;
        c.stroke();
      }
      c.fillStyle = '#77736f';
      c.font = 'italic 900 8px Arial, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('START', 1, 0);
    }
    if (!ghost) {
      c.fillStyle = '#178b68';
      c.beginPath(); c.moveTo(START_DEF.w / 2 - 2, 0); c.lineTo(START_DEF.w / 2 - 7, -3.5); c.lineTo(START_DEF.w / 2 - 7, 3.5); c.closePath(); c.fill();
    }
    c.restore();
  }



  function startBounds(start) {
    return transformedBounds({ minX:-START_DEF.w/2,maxX:START_DEF.w/2,minY:-START_DEF.h/2,maxY:START_DEF.h/2 }, start.x, start.y, start.rotation);
  }


  function startInsideField(start) {
    const bounds = startBounds(start);
    return bounds.minX >= -.01 && bounds.minY >= -.01 && bounds.maxX <= state.field.widthCm + .01 && bounds.maxY <= state.field.heightCm + .01;
  }

  function placeStartLane() {
    const candidate = { x: state.cursor.x, y: state.cursor.y, rotation: state.rotation };
    if (!startInsideField(candidate)) return toast('スタートレーンが作成範囲からはみ出します');
    snapshot();
    state.start = candidate;
    state.startPhase = 'position';
    state.selectedType = 'straight';
    state.mode = 'place';
    const ends = startEndpoints(state.start);
    setActiveConnection({ ...ends[1], sourceId: 'start', endpointIndex: 1 });
    state.rotation = state.start.rotation;
    toast('スタートの前後どちら側からでも配置できます');
    persistLocal();
  }


  function localEndpoints(type) {
    const def = PARTS[type];
    if (!def) return [];
    if (def.geometry?.connectors?.length) {
      return def.geometry.connectors.map((connector, index) => ({
        x: connector.x,
        y: connector.y,
        heading: connector.heading,
        label: index === 0 ? 'A' : 'B'
      }));
    }
    if (def.corner45) {
      const g = corner45Geometry(def);
      return [
        { x: g.entry.x, y: g.entry.y, heading: 180, label: 'A' },
        { x: g.exit.x, y: g.exit.y, heading: 45, label: 'B' }
      ];
    }
    if (def.burning) {
      const g = burningGeometry(def);
      return [
        { x: g.leftX, y: -g.separation / 2, heading: 180, label: 'A' },
        { x: g.leftX, y: g.separation / 2, heading: 180, label: 'B' }
      ];
    }
    return [
      { x: -def.w / 2, y: 0, heading: 180, label: 'A' },
      { x: def.w / 2, y: 0, heading: 0, label: 'B' }
    ];
  }

  function rotatePoint(point, rotation) {
    const a = rotation * Math.PI / 180;
    return {
      x: point.x * Math.cos(a) - point.y * Math.sin(a),
      y: point.x * Math.sin(a) + point.y * Math.cos(a)
    };
  }

  function startEndpoints(start) {
    const local = [
      { x: -START_DEF.w / 2, y: 0, heading: 180, label: '後端' },
      { x: START_DEF.w / 2, y: 0, heading: 0, label: '前端' }
    ];
    return local.map((ep, endpointIndex) => {
      const offset = rotatePoint(ep, start.rotation);
      return {
        x: start.x + offset.x,
        y: start.y + offset.y,
        heading: normalizeRotation(ep.heading + start.rotation),
        sourceId: 'start', sourceType: 'start', endpointIndex, label: ep.label,
        connectionState: endpointState()
      };
    });
  }


  function partEndpoints(part) {
    return localEndpoints(part.type).map((ep, endpointIndex) => {
      const offset = rotatePoint(ep, part.rotation);
      const storedState = part.endpointStates?.[endpointIndex] || { bankAngle: part.bankAngle || 0, bankSectionId: part.bankSectionId || null };
      return {
        x: part.x + offset.x,
        y: part.y + offset.y,
        heading: normalizeRotation(ep.heading + part.rotation),
        sourceId: part.id,
        sourceType: part.type,
        endpointIndex,
        label: ep.label,
        connectionState: endpointState(storedState)
      };
    });
  }


  function globalRoute(part, routeIndex = 0) {
    const endpoints = partEndpoints(part);
    const attachedIndex = clamp(Number(routeIndex) || 0, 0, 1);
    const otherIndex = attachedIndex === 0 ? 1 : 0;
    return { entry: endpoints[attachedIndex], exit: endpoints[otherIndex] };
  }

  function getAllEndpoints() {
    const endpoints = [];
    if (state.start) endpoints.push(...startEndpoints(state.start));
    state.parts.forEach(part => endpoints.push(...partEndpoints(part)));
    return endpoints;
  }

  function endpointsConnect(a, b) {
    if (!a || !b || a.sourceId === b.sourceId) return false;
    const close = Math.hypot(a.x - b.x, a.y - b.y) <= 1.75;
    const faceToFace = angularDistance(a.heading, normalizeRotation(b.heading + 180)) <= .1;
    return close && faceToFace;
  }

  function unpairedEndpoints(endpoints) {
    const paired = new Set();
    for (let i = 0; i < endpoints.length; i++) {
      if (paired.has(i)) continue;
      let best = -1;
      let bestDistance = Infinity;
      for (let j = i + 1; j < endpoints.length; j++) {
        if (paired.has(j) || !endpointsConnect(endpoints[i], endpoints[j])) continue;
        const distance = Math.hypot(endpoints[i].x - endpoints[j].x, endpoints[i].y - endpoints[j].y);
        if (distance < bestDistance) { best = j; bestDistance = distance; }
      }
      if (best >= 0) {
        paired.add(i);
        paired.add(best);
      }
    }
    return endpoints.filter((_, index) => !paired.has(index));
  }

  function getOpenConnections() {
    return unpairedEndpoints(getAllEndpoints());
  }

  function groupMoveSnapProposal(movingParts, movingIds) {
    const movingSet = new Set(movingIds);
    const movingOpen = unpairedEndpoints(movingParts.flatMap(part => partEndpoints(part)));
    const stationaryEndpoints = [];
    if (state.start) stationaryEndpoints.push(...startEndpoints(state.start));
    state.parts.forEach(part => {
      if (!movingSet.has(part.id)) stationaryEndpoints.push(...partEndpoints(part));
    });
    const stationaryOpen = unpairedEndpoints(stationaryEndpoints);

    let best = null;
    for (const movingEndpoint of movingOpen) {
      for (const stationaryEndpoint of stationaryOpen) {
        const compatible = angularDistance(
          movingEndpoint.heading,
          normalizeRotation(stationaryEndpoint.heading + 180)
        ) <= .1;
        if (!compatible) continue;
        const distance = Math.hypot(
          movingEndpoint.x - stationaryEndpoint.x,
          movingEndpoint.y - stationaryEndpoint.y
        );
        if (!best || distance < best.distance) {
          best = { movingEndpoint, stationaryEndpoint, distance };
        }
      }
    }

    if (!best || best.distance > GROUP_MOVE_SNAP_RADIUS_CM) return null;
    return {
      ...best,
      correctionX: best.stationaryEndpoint.x - best.movingEndpoint.x,
      correctionY: best.stationaryEndpoint.y - best.movingEndpoint.y,
      point: { x: best.stationaryEndpoint.x, y: best.stationaryEndpoint.y }
    };
  }

  function connectionStateForPlacement(type, anchorState, attachedIndex, bankSectionId = null) {
    const incoming = endpointState(anchorState);
    const endpointStates = [endpointState(incoming), endpointState(incoming)];
    const otherIndex = attachedIndex === 0 ? 1 : 0;
    let bankRole = null;
    let partBankAngle = incoming.bankAngle;
    let sectionId = incoming.bankSectionId;
    if (type === 'bank20') {
      if (incoming.bankAngle === 20) {
        bankRole = 'exit';
        endpointStates[otherIndex] = endpointState({ bankAngle: 0, elevationMm: incoming.elevationMm });
        partBankAngle = 20;
      } else {
        bankRole = 'entry';
        sectionId = bankSectionId || `bank-pending`;
        endpointStates[otherIndex] = endpointState({ bankAngle: 20, bankSectionId: sectionId, elevationMm: incoming.elevationMm });
        partBankAngle = 20;
      }
    }
    return { endpointStates, bankRole, bankAngle: partBankAngle, bankSectionId: sectionId };
  }

  function freePlacement(type, x, y) {
    const proposal = { type, id: 'ghost', x, y, rotation: state.rotation, routeIndex: 0 };
    proposal.endpoints = partEndpoints(proposal);
    proposal.entry = proposal.endpoints[0];
    proposal.exit = proposal.endpoints[1];
    return proposal;
  }

  function getPlacementProposal() {
    const def = PARTS[state.selectedType];
    if (!def || state.selectedType === 'start') return null;
    const free = freePlacement(state.selectedType, state.cursor.x, state.cursor.y);
    const opens = getOpenConnections();
    if (!opens.length) {
      free.snapped = false;
      free.valid = false;
      free.reason = '接続可能な端点がありません';
      return free;
    }

    const candidates = [];
    opens.forEach(anchor => {
      free.endpoints.forEach((ghostEndpoint, attachedIndex) => {
        const compatible = angularDistance(ghostEndpoint.heading, normalizeRotation(anchor.heading + 180)) <= .1;
        if (!compatible) return;
        const distance = Math.hypot(ghostEndpoint.x - anchor.x, ghostEndpoint.y - anchor.y);
        const x = free.x + anchor.x - ghostEndpoint.x;
        const y = free.y + anchor.y - ghostEndpoint.y;
        const bank = connectionStateForPlacement(state.selectedType, anchor.connectionState, attachedIndex);
        const candidatePart = { ...free, x, y, routeIndex: attachedIndex, ...bank };
        const endpoints = partEndpoints(candidatePart);
        const otherIndex = attachedIndex === 0 ? 1 : 0;
        candidates.push({
          ...candidatePart,
          endpoints,
          entry: { ...anchor },
          exit: { ...endpoints[otherIndex] },
          anchor: { ...anchor },
          attachedIndex,
          otherIndex,
          endpointDistance: distance,
          centerDistance: Math.hypot(x - state.cursor.x, y - state.cursor.y)
        });
      });
    });

    candidates.sort((a,b) => a.endpointDistance - b.endpointDistance || a.centerDistance - b.centerDistance);
    const best = candidates[0];
    if (!best) {
      free.snapped = false;
      free.valid = false;
      free.reason = '現在の向きでは接続できません';
      return free;
    }
    const snapRadius = Math.max(32, Math.min(90, Math.hypot(def.w, def.h) * .58));
    if (best.endpointDistance <= snapRadius) {
      best.snapped = true;
      best.valid = isPartInsideField(best);
      return best;
    }
    free.snapped = false;
    free.valid = false;
    free.target = best;
    free.reason = '接続点へ近づけてください';
    return free;
  }


  function isPartInsideField(part) {
    const bounds = partBounds(part);
    return bounds.minX >= -.01 && bounds.minY >= -.01 && bounds.maxX <= state.field.widthCm + .01 && bounds.maxY <= state.field.heightCm + .01;
  }

  function normalizeConnection(connection) {
    return {
      x: Number(connection.x) || 0,
      y: Number(connection.y) || 0,
      heading: normalizeRotation(Number(connection.heading) || 0),
      sourceId: String(connection.sourceId || 'manual'),
      sourceType: connection.sourceType || '',
      endpointIndex: Number.isFinite(Number(connection.endpointIndex)) ? Number(connection.endpointIndex) : 0,
      label: connection.label || ''
    };
  }

  function setActiveConnection(connection) {
    state.activeConnection = connection ? normalizeConnection(connection) : null;
  }

  function rebuildActiveConnectionFromTail() {
    const opens = getOpenConnections();
    const tail = state.parts[state.parts.length - 1];
    const preferred = tail ? opens.find(ep => ep.sourceId === tail.id) : opens.find(ep => ep.sourceId === 'start' && ep.endpointIndex === 1);
    setActiveConnection(preferred || opens[0] || null);
  }

  function drawConnectionPoint(c, connection, color = '#59d499') {
    if (!connection) return;
    c.save();
    c.translate(connection.x, connection.y);
    c.rotate(connection.heading * Math.PI / 180);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 2 / state.view.scale;
    c.beginPath(); c.arc(0, 0, 7 / state.view.scale, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(13 / state.view.scale, 0);
    c.lineTo(5 / state.view.scale, -5 / state.view.scale);
    c.lineTo(5 / state.view.scale, 5 / state.view.scale);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawConnectionGuide(c, proposal) {
    if (!proposal) return;
    const color = proposal.valid ? '#249b74' : '#de4b5b';
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 1.3 / state.view.scale;
    c.setLineDash([5 / state.view.scale, 4 / state.view.scale]);
    if (proposal.anchor) {
      c.beginPath();
      c.moveTo(state.cursor.x, state.cursor.y);
      c.lineTo(proposal.anchor.x, proposal.anchor.y);
      c.stroke();
    } else if (proposal.target) {
      c.beginPath();
      c.moveTo(state.cursor.x, state.cursor.y);
      c.lineTo(proposal.target.anchor.x, proposal.target.anchor.y);
      c.stroke();
    }
    c.setLineDash([]);
    if (proposal.snapped) drawConnectionPoint(c, proposal.exit, color);
    c.restore();
  }


  function drawGroupMoveSnapGuide(c) {
    const snapInfo = state.pointer.groupSnap;
    if (!snapInfo || !state.pointer.draggingParts) return;
    c.save();
    c.strokeStyle = '#f2b84b';
    c.fillStyle = 'rgba(242,184,75,.18)';
    c.lineWidth = 2.4 / state.view.scale;
    c.beginPath();
    c.arc(snapInfo.point.x, snapInfo.point.y, 12 / state.view.scale, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#7a4d00';
    c.font = `700 ${11 / state.view.scale}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.fillText('接続吸着', snapInfo.point.x, snapInfo.point.y - 15 / state.view.scale);
    c.restore();
  }

  function angularDistance(a, b) {
    const d = Math.abs(normalizeRotation(a) - normalizeRotation(b));
    return Math.min(d, 360 - d);
  }

  function drawCursorAndGhost(c) {
    if (state.layoutMove.active) return;
    if (state.mode === 'move' && state.pointer.draggingParts) {
      drawGroupMoveSnapGuide(c);
      return;
    }
    if (state.mode === 'start') {
      const candidate = { x: state.cursor.x, y: state.cursor.y, rotation: state.rotation };
      const valid = startInsideField(candidate);
      c.save();
      c.globalAlpha = valid ? .76 : .34;
      drawStartLane(c, candidate, false, true);
      c.restore();
      const bounds = startBounds(candidate);
      c.save();
      c.strokeStyle = valid ? '#249b74' : '#de4b5b';
      c.lineWidth = 2 / state.view.scale;
      c.setLineDash([6 / state.view.scale, 4 / state.view.scale]);
      c.strokeRect(bounds.minX, bounds.minY, bounds.w, bounds.h);
      c.setLineDash([]);
      c.restore();
      drawPointerCrosshair(c, state.cursor.x, state.cursor.y, valid ? '#249b74' : '#de4b5b');
      return;
    }

    if (state.mode === 'place') {
      const opens = getOpenConnections();
      opens.forEach(ep => drawConnectionPoint(c, ep, '#62b99c'));
      const proposal = getPlacementProposal();
      if (proposal) {
        c.save();
        c.globalAlpha = proposal.valid ? .72 : .34;
        drawPart(c, {
          id: 'ghost', type: proposal.type, x: proposal.x, y: proposal.y,
          rotation: proposal.rotation, routeIndex: proposal.routeIndex, colorKey: 'default'
        });
        c.restore();
        drawConnectionGuide(c, proposal);
        if (proposal.anchor) drawConnectionPoint(c, proposal.anchor, proposal.valid ? '#1f9c71' : '#de4b5b');
      }
      drawPointerCrosshair(c, state.cursor.x, state.cursor.y, proposal?.valid ? '#249b74' : '#de4b5b');
    }
  }


  function drawPointerCrosshair(c, x, y, color) {
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.4 / state.view.scale;
    const size = 10 / state.view.scale;
    c.beginPath(); c.moveTo(x - size, y); c.lineTo(x + size, y); c.moveTo(x, y - size); c.lineTo(x, y + size); c.stroke();
    c.beginPath(); c.arc(x, y, 2.6 / state.view.scale, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function drawMarquee(c) {
    if (!state.pointer.marquee || !state.pointer.marqueeStart || !state.pointer.marqueeEnd) return;
    const rect = normalizedRect(state.pointer.marqueeStart, state.pointer.marqueeEnd);
    c.save();
    c.fillStyle = state.mode === 'delete' ? 'rgba(224,77,93,.12)' : state.mode === 'color' ? 'rgba(200,136,255,.12)' : 'rgba(83,198,255,.12)';
    c.strokeStyle = state.mode === 'delete' ? '#e04d5d' : state.mode === 'color' ? '#c888ff' : '#53c6ff';
    c.lineWidth = 2 / state.view.scale;
    c.setLineDash([6 / state.view.scale, 4 / state.view.scale]);
    c.fillRect(rect.minX, rect.minY, rect.w, rect.h);
    c.strokeRect(rect.minX, rect.minY, rect.w, rect.h);
    c.restore();
  }

  function onPointerDown(e) {
    els.courseCanvas.setPointerCapture(e.pointerId);
    els.courseCanvas.focus();
    const rect = els.courseCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const snappedWorld = { x: snap(world.x), y: snap(world.y) };

    state.pointer.down = true;
    state.pointer.lastX = e.clientX;
    state.pointer.lastY = e.clientY;
    state.pointer.x = world.x;
    state.pointer.y = world.y;
    state.pointer.groupSnap = null;

    if (state.layoutMove.active) {
      if (e.button === 2) cancelManualLayoutMove();
      else if (e.button === 0) finalizeManualLayoutMove();
      state.pointer.down = false;
      try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      return;
    }

    if (e.button === 1 || e.button === 2 || state.pointer.spaceDown) {
      state.pointer.panning = true;
      els.courseCanvas.classList.add('is-panning');
      return;
    }

    if (e.button !== 0) return;
    state.cursor = snappedWorld;

    if (state.mode === 'start') {
      placeStartLane();
      updateUI();
      render();
      return;
    }

    if (state.mode === 'place') {
      placePartAtCursor();
      updateUI();
      render();
      return;
    }

    const hit = hitTest(world.x, world.y);
    state.hoveredPartId = hit?.id || null;
    if (state.mode === 'move') {
      if (hit) {
        if (e.shiftKey) {
          toggleSelection(hit.id);
        } else {
          if (!isSelected(hit.id)) setSelection([hit.id]);
          state.pointer.draggingParts = true;
          state.pointer.dragStart = { ...snappedWorld };
          state.pointer.dragBase = selectedParts().map(p => ({ id: p.id, x: p.x, y: p.y }));
          state.pointer.dragSnapshotTaken = false;
          els.courseCanvas.classList.add('is-moving');
        }
      } else {
        beginMarquee(world, e.shiftKey);
      }
    } else if (state.mode === 'delete') {
      if (hit) {
        if (e.shiftKey) toggleSelection(hit.id);
        else deleteParts([hit.id]);
      } else {
        beginMarquee(world, e.shiftKey);
      }
    } else if (state.mode === 'color') {
      if (hit) {
        if (e.shiftKey) toggleSelection(hit.id);
        else {
          const ids = isSelected(hit.id) && state.selectedIds.length > 1 ? [...state.selectedIds] : [hit.id];
          setSelection(ids);
          cyclePartsColor(ids);
        }
      } else {
        beginMarquee(world, e.shiftKey);
      }
    }
    updateUI();
    render();
  }

  function onPointerMove(e) {
    const rect = els.courseCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    state.pointer.x = world.x;
    state.pointer.y = world.y;
    state.pointer.groupSnap = null;

    if (state.layoutMove.active) {
      const point = { x: snap(world.x), y: snap(world.y) };
      state.layoutMove.pointer = point;
      if (!state.layoutMove.anchor) state.layoutMove.anchor = point;
      else {
        const dx = point.x - state.layoutMove.anchor.x;
        const dy = point.y - state.layoutMove.anchor.y;
        if (dx || dy) translateWholeLayout(dx, dy);
        state.layoutMove.anchor = point;
      }
      updateUI(); render();
      return;
    }

    if (state.pointer.panning && state.pointer.down) {
      state.view.offsetX += e.clientX - state.pointer.lastX;
      state.view.offsetY += e.clientY - state.pointer.lastY;
      state.pointer.lastX = e.clientX;
      state.pointer.lastY = e.clientY;
      render();
      return;
    }

    state.cursor = { x: snap(world.x), y: snap(world.y) };

    const canHover = ['move','delete','color'].includes(state.mode) && !state.pointer.draggingParts && !state.pointer.marquee;
    const hovered = canHover ? hitTest(world.x, world.y) : null;
    state.hoveredPartId = hovered?.id || null;
    els.courseCanvas.classList.toggle('is-hovering-part', !!state.hoveredPartId);

    if (state.pointer.draggingParts && state.pointer.down && state.pointer.dragBase) {
      const current = { x: snap(world.x), y: snap(world.y) };
      const dx = current.x - state.pointer.dragStart.x;
      const dy = current.y - state.pointer.dragStart.y;
      if ((dx || dy) && !state.pointer.dragSnapshotTaken) {
        snapshot();
        state.pointer.dragSnapshotTaken = true;
      }
      if (state.pointer.dragSnapshotTaken) {
        const movingIds = state.pointer.dragBase.map(base => base.id);
        const proposedParts = state.pointer.dragBase.map(base => {
          const original = state.parts.find(part => part.id === base.id);
          return original ? { ...original, x: base.x + dx, y: base.y + dy } : null;
        }).filter(Boolean);
        const snapInfo = groupMoveSnapProposal(proposedParts, movingIds);
        const correctionX = snapInfo?.correctionX || 0;
        const correctionY = snapInfo?.correctionY || 0;
        state.pointer.groupSnap = snapInfo;

        state.pointer.dragBase.forEach(base => {
          const p = state.parts.find(part => part.id === base.id);
          if (!p) return;
          p.x = base.x + dx + correctionX;
          p.y = base.y + dy + correctionY;
        });
        recalculateBankStates();
        rebuildActiveConnectionFromTail();
      }
    }

    if (state.pointer.marquee && state.pointer.down) state.pointer.marqueeEnd = { ...world };
    updateStatusOnly();
    render();
  }

  function onPointerUp(e) {
    const movedIds = state.pointer.dragSnapshotTaken && state.pointer.dragBase
      ? state.pointer.dragBase.map(item => item.id)
      : [];

    if (state.pointer.marquee && state.pointer.marqueeStart && state.pointer.marqueeEnd) {
      const rect = normalizedRect(state.pointer.marqueeStart, state.pointer.marqueeEnd);
      const ids = partsInRect(rect).map(p => p.id);
      if (state.pointer.marqueeAdd) setSelection([...new Set([...state.selectedIds, ...ids])]);
      else setSelection(ids);
      if (state.mode === 'delete' && ids.length) deleteParts(state.selectedIds);
      else if (state.mode === 'color' && ids.length) cyclePartsColor(state.selectedIds);
    }

    if (movedIds.length) {
      const snappedAsGroup = !!state.pointer.groupSnap;
      promotePartsToFront(movedIds);
      toast(snappedAsGroup
        ? `${movedIds.length}個のパーツを接続して最前面へ移動しました`
        : `${movedIds.length}個のパーツを最前面へ移動しました`);
    }

    state.pointer.down = false;
    state.pointer.panning = false;
    state.pointer.draggingParts = false;
    state.pointer.dragStart = null;
    state.pointer.dragBase = null;
    state.pointer.dragSnapshotTaken = false;
    state.pointer.groupSnap = null;
    state.pointer.marquee = false;
    state.pointer.marqueeStart = null;
    state.pointer.marqueeEnd = null;
    state.pointer.marqueeAdd = false;
    const hoverAfter = ['move','delete','color'].includes(state.mode) ? hitTest(state.pointer.x, state.pointer.y) : null;
    state.hoveredPartId = hoverAfter?.id || null;
    els.courseCanvas.classList.toggle('is-hovering-part', !!state.hoveredPartId);
    els.courseCanvas.classList.remove('is-panning', 'is-moving');
    try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    persistLocal();
    updateUI();
    render();
  }

  function onPointerLeave() {
    if (state.pointer.down || state.layoutMove.active) return;
    state.hoveredPartId = null;
    els.courseCanvas.classList.remove('is-hovering-part');
    render();
  }


  function beginMarquee(world, add) {
    if (!add) clearSelection(false);
    state.pointer.marquee = true;
    state.pointer.marqueeStart = { ...world };
    state.pointer.marqueeEnd = { ...world };
    state.pointer.marqueeAdd = !!add;
  }

  function onWheel(e) {
    e.preventDefault();
    if (((state.mode === 'start' && !state.start) || state.mode === 'place') && !e.ctrlKey && !e.metaKey) {
      rotateCurrent(e.deltaY < 0 ? -45 : 45);
      return;
    }
    const rect = els.courseCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.1 : .9;
    state.view.scale = clamp(state.view.scale * factor, .08, 8);
    state.view.offsetX = sx - before.x * state.view.scale;
    state.view.offsetY = sy - before.y * state.view.scale;
    updateUI();
    render();
  }

  function onKeyDown(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (state.layoutMove.active) {
      const moveKey = e.key.toLowerCase();
      if (moveKey === 'escape') { e.preventDefault(); cancelManualLayoutMove(); return; }
      if (moveKey === 'enter') { e.preventDefault(); finalizeManualLayoutMove(); return; }
      const step = e.shiftKey ? 1 : state.field.gridCm;
      const delta = moveKey === 'arrowleft' ? [-step, 0]
        : moveKey === 'arrowright' ? [step, 0]
        : moveKey === 'arrowup' ? [0, -step]
        : moveKey === 'arrowdown' ? [0, step]
        : null;
      if (delta) {
        e.preventDefault();
        translateWholeLayout(delta[0], delta[1]);
        updateUI(); render();
      }
      return;
    }

    if (e.code === 'Space') {
      state.pointer.spaceDown = true;
      e.preventDefault();
    }
    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); return; }

    const numericPart = Object.entries(PARTS).find(([, p]) => p.key === e.key);
    if (numericPart) { e.preventDefault(); selectPartType(numericPart[0]); return; }

    if (key === 'r') { e.preventDefault(); rewindLastPart(); return; }
    if (key === 'q') { e.preventDefault(); setMode('move'); return; }
    if (key === 'w') { e.preventDefault(); setMode('delete'); return; }
    if (key === 'e') {
      e.preventDefault();
      if (state.mode === 'color' && state.selectedIds.length) cyclePartsColor(state.selectedIds);
      else setMode('color');
      return;
    }
    if (key === 'z') { e.preventDefault(); rotateCurrent(-45); return; }
    if (key === 'x') { e.preventDefault(); rotateCurrent(45); return; }
    if (key === 'f') {
      e.preventDefault();
      if (e.shiftKey) autoAlignLayoutTopLeft(); else beginManualLayoutMove();
      return;
    }
    if (key === 'g') { e.preventDefault(); toggleGrid(); return; }
    if (key === 'escape') {
      e.preventDefault();
      if (state.start) {
        state.mode = 'place';
        clearSelection(false);
      } else {
        state.mode = 'start';
        state.selectedType = 'start';
      }
      resetPointerInteraction();
      updateUI(); render();
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      if (state.selectedIds.length) { e.preventDefault(); deleteParts(state.selectedIds); }
      return;
    }
    if (key === 'enter') {
      e.preventDefault();
      if (state.mode === 'start') placeStartLane();
      else if (state.mode === 'place') placePartAtCursor();
      else if (state.mode === 'delete' && state.selectedIds.length) deleteParts(state.selectedIds);
      else if (state.mode === 'color' && state.selectedIds.length) cyclePartsColor(state.selectedIds);
      updateUI(); render();
      return;
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') state.pointer.spaceDown = false;
  }

  function placePartAtCursor() {
    if (!state.start) return toast('先にスタートレーンを配置してください');
    const proposal = getPlacementProposal();
    if (!proposal) return toast('配置位置を計算できませんでした');
    if (!proposal.snapped) return toast(proposal.reason || 'ゴーストを接続点へ近づけてください');
    if (!proposal.valid) return toast('この位置では作成範囲からはみ出します');
    snapshot();
    const id = makeId();
    let bankSectionId = proposal.bankSectionId;
    let endpointStates = proposal.endpointStates?.map(endpointState);
    if (proposal.type === 'bank20' && proposal.bankRole === 'entry') {
      bankSectionId = `bank-${id}`;
      endpointStates = endpointStates.map(value => value.bankAngle === 20 ? endpointState({ ...value, bankSectionId }) : value);
    }
    const part = {
      id,
      type: proposal.type,
      x: proposal.x,
      y: proposal.y,
      rotation: proposal.rotation,
      routeIndex: proposal.attachedIndex,
      colorKey: 'default',
      endpointStates,
      bankRole: proposal.bankRole || null,
      bankAngle: proposal.bankAngle || 0,
      bankSectionId: bankSectionId || null,
      zIndex: nextZIndex()
    };
    state.parts.push(part);
    const ends = partEndpoints(part);
    const newOpen = ends[proposal.otherIndex];
    setActiveConnection({ ...newOpen, sourceId: id });
    state.rotation = normalizeRotation(newOpen.heading);
    state.selectedIds = [];
    recalculateBankStates();
    toast(`${partDisplayName(part)}を${proposal.anchor?.sourceId === 'start' ? (proposal.anchor.endpointIndex === 0 ? 'スタート後方' : 'スタート前方') : '接続点'}へ配置しました`);
    persistLocal();
  }



  function recalculateBankStates() {
    state.bankWarnings = [];
    if (!state.start) return;
    const partsById = new Map(state.parts.map(part => [part.id, part]));
    state.parts.forEach(part => {
      part.endpointStates = [endpointState(), endpointState()];
      part.bankRole = null;
      part.bankAngle = 0;
      part.bankSectionId = null;
    });

    const raw = [];
    startEndpoints(state.start).forEach(ep => raw.push(ep));
    state.parts.forEach(part => {
      localEndpoints(part.type).forEach((ep, endpointIndex) => {
        const offset = rotatePoint(ep, part.rotation);
        raw.push({
          x: part.x + offset.x, y: part.y + offset.y,
          heading: normalizeRotation(ep.heading + part.rotation),
          sourceId: part.id, sourceType: part.type, endpointIndex
        });
      });
    });
    const pairMap = new Map();
    for (let i=0;i<raw.length;i++) {
      for (let j=i+1;j<raw.length;j++) {
        if (!endpointsConnect(raw[i], raw[j])) continue;
        pairMap.set(`${raw[i].sourceId}:${raw[i].endpointIndex}`, raw[j]);
        pairMap.set(`${raw[j].sourceId}:${raw[j].endpointIndex}`, raw[i]);
        break;
      }
    }

    const queue = startEndpoints(state.start).map(ep => ({ endpoint: ep, value: endpointState() }));
    const visited = new Set();
    while (queue.length) {
      const { endpoint, value } = queue.shift();
      const connected = pairMap.get(`${endpoint.sourceId}:${endpoint.endpointIndex}`);
      if (!connected || connected.sourceId === 'start') continue;
      const visitKey = `${connected.sourceId}:${connected.endpointIndex}:${value.bankAngle}:${value.bankSectionId || ''}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);
      const part = partsById.get(connected.sourceId);
      if (!part) continue;
      const attached = connected.endpointIndex;
      const other = attached === 0 ? 1 : 0;
      const bank = connectionStateForPlacement(part.type, value, attached, part.bankSectionId || `bank-${part.id}`);
      if (part.endpointStates[attached]?.bankAngle && part.endpointStates[attached].bankAngle !== bank.endpointStates[attached].bankAngle) {
        state.bankWarnings.push(`${partDisplayName(part)}のバンク状態が両側で一致しません`);
      }
      part.endpointStates = bank.endpointStates;
      part.bankRole = bank.bankRole;
      part.bankAngle = bank.bankAngle;
      part.bankSectionId = bank.bankRole === 'entry' ? `bank-${part.id}` : bank.bankSectionId;
      if (part.bankRole === 'entry') {
        part.endpointStates[other] = endpointState({ ...part.endpointStates[other], bankSectionId: part.bankSectionId });
      }
      const outgoingRaw = raw.find(item => item.sourceId === part.id && item.endpointIndex === other);
      if (outgoingRaw) queue.push({ endpoint: outgoingRaw, value: endpointState(part.endpointStates[other]) });
    }

    state.parts.forEach(part => {
      if (part.type === 'bank20' && !part.bankRole) state.bankWarnings.push('接続されていない20度バンクアプローチがあります');
    });
  }

  function rewindLastPart() {
    if (state.layoutMove.active) return;
    if (!state.parts.length) return toast('スタート位置まで戻っています');
    snapshot();
    const removed = state.parts.pop();
    state.selectedIds = state.selectedIds.filter(id => id !== removed.id);
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
    if (state.activeConnection) state.rotation = state.activeConnection.heading;
    state.mode = 'place';
    toast(`${PARTS[removed.type].name}を1つ戻しました`);
    persistLocal(); updateUI(); render();
  }

  function deleteParts(ids) {
    const unique = [...new Set(ids)].filter(id => state.parts.some(p => p.id === id));
    if (!unique.length) return toast('削除するパーツが選択されていません');
    snapshot();
    const count = unique.length;
    state.parts = state.parts.filter(p => !unique.includes(p.id));
    state.selectedIds = state.selectedIds.filter(id => !unique.includes(id));
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
    if (state.activeConnection) state.rotation = state.activeConnection.heading;
    toast(`${count}個のパーツを削除しました`);
    persistLocal(); updateUI(); render();
  }

  function cyclePartsColor(ids) {
    const unique = [...new Set(ids)].filter(id => state.parts.some(p => p.id === id));
    if (!unique.length) return toast('カラー変更するパーツを選択してください');
    snapshot();
    unique.forEach(id => {
      const p = state.parts.find(part => part.id === id);
      const currentIndex = Math.max(0, COLORS.findIndex(c => c.key === (p.colorKey || 'default')));
      p.colorKey = COLORS[(currentIndex + 1) % COLORS.length].key;
    });
    const first = state.parts.find(p => p.id === unique[0]);
    const color = COLORS.find(c => c.key === first?.colorKey)?.name || '標準（グレー）';
    toast(`${unique.length}個のカラーを「${color}」へ変更しました`);
    persistLocal(); updateUI(); render();
  }

  function rotateCurrent(delta) {
    if (state.mode === 'start' && !state.start) {
      state.rotation = normalizeRotation(state.rotation + delta);
      toast(`スタートレーンを${delta < 0 ? '左' : '右'}へ回転しました`);
      updateUI(); render();
      return;
    }

    if (state.mode === 'place') {
      state.rotation = normalizeRotation(state.rotation + delta);
      toast(`配置パーツを${delta < 0 ? '左' : '右'}へ回転しました`);
      updateUI(); render();
      return;
    }

    const parts = selectedParts();
    if (!parts.length) return toast('回転するパーツを選択してください');
    snapshot();
    parts.forEach(p => { p.rotation = normalizeRotation(p.rotation + delta); });
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
    toast(`${parts.length}個のパーツを${delta < 0 ? '左' : '右'}へ回転しました`);
    persistLocal(); updateUI(); render();
  }

  function isSelected(id) { return state.selectedIds.includes(id); }
  function selectedParts() { return state.parts.filter(p => isSelected(p.id)); }

  function setSelection(ids) {
    state.selectedIds = [...new Set(ids)].filter(id => state.parts.some(p => p.id === id));
  }

  function toggleSelection(id) {
    if (isSelected(id)) state.selectedIds = state.selectedIds.filter(x => x !== id);
    else state.selectedIds.push(id);
  }

  function clearSelection(refresh = true) {
    state.selectedIds = [];
    if (refresh) { updateUI(); render(); }
  }

  function resetPointerInteraction() {
    state.pointer.down = false;
    state.pointer.panning = false;
    state.pointer.draggingParts = false;
    state.pointer.dragStart = null;
    state.pointer.dragBase = null;
    state.pointer.dragSnapshotTaken = false;
    state.pointer.groupSnap = null;
    state.pointer.marquee = false;
    state.pointer.marqueeStart = null;
    state.pointer.marqueeEnd = null;
    state.pointer.marqueeAdd = false;
    state.hoveredPartId = null;
    els.courseCanvas?.classList.remove('is-panning', 'is-moving', 'is-hovering-part');
  }

  function toggleGrid() {
    state.showGrid = !state.showGrid;
    updateUI(); render();
  }

  function captureLayoutMoveBase() {
    return {
      historyState: JSON.stringify(serializeState()),
      parts: state.parts.map(p => ({ ...p })),
      start: state.start ? { ...state.start } : null,
      activeConnection: state.activeConnection ? { ...state.activeConnection } : null,
      cursor: { ...state.cursor },
      selectedIds: [...state.selectedIds]
    };
  }

  function beginManualLayoutMove() {
    if (!state.parts.length && !state.start) return toast('移動するレイアウトがありません');
    if (state.layoutMove.active) return;
    const box = layoutBounds();
    state.layoutMove = {
      active: true,
      anchor: null,
      base: captureLayoutMoveBase(),
      previousMode: state.mode,
      pointer: { x: box.minX, y: box.minY }
    };
    state.mode = 'layoutMove';
    clearSelection(false);
    updateUI(); render();
    toast('マウスでレイアウト全体を移動し、クリックで固定します');
  }

  function finalizeManualLayoutMove() {
    if (!state.layoutMove.active) return;
    if (!layoutIsInsideField()) return toast('レイアウト全体が作成範囲内に入ってから固定してください');
    const base = state.layoutMove.base;
    if (base?.historyState) {
      state.history.push(base.historyState);
      if (state.history.length > HISTORY_LIMIT) state.history.shift();
      state.future = [];
    }
    const move = state.layoutMove;
    state.mode = move.previousMode === 'start' && state.start ? 'place' : move.previousMode;
    state.layoutMove = { active: false, anchor: null, base: null, previousMode: state.mode, pointer: null };
    persistLocal(); updateUI(); render();
    toast('レイアウト全体の位置を固定しました');
  }

  function cancelManualLayoutMove() {
    if (!state.layoutMove.active) return;
    const base = state.layoutMove.base;
    const previousMode = state.layoutMove.previousMode;
    if (base) {
      state.parts = base.parts.map(p => ({ ...p }));
      state.start = base.start ? { ...base.start } : null;
      state.activeConnection = base.activeConnection ? { ...base.activeConnection } : null;
      state.cursor = { ...base.cursor };
      state.selectedIds = [...base.selectedIds];
    }
    state.mode = previousMode;
    state.layoutMove = { active: false, anchor: null, base: null, previousMode, pointer: null };
    updateUI(); render();
    toast('全体移動を取り消しました');
  }

  function autoAlignLayoutTopLeft() {
    if (state.layoutMove.active) cancelManualLayoutMove();
    if (!state.parts.length && !state.start) return toast('移動するレイアウトがありません');
    const box = layoutBounds();
    if (box.w > state.field.widthCm || box.h > state.field.heightCm) {
      toast('レイアウトが作成範囲より大きいため、全体を収められません');
      return;
    }
    const dx = -box.minX;
    const dy = -box.minY;
    if (Math.abs(dx) < .001 && Math.abs(dy) < .001) return toast('すでに左上へ揃っています');
    snapshot();
    translateWholeLayout(dx, dy);
    persistLocal(); updateUI(); render();
    toast('レイアウト外形の左上を作成範囲の左上へ揃えました');
  }

  function translateWholeLayout(dx, dy) {
    state.parts.forEach(p => { p.x += dx; p.y += dy; });
    if (state.start) { state.start.x += dx; state.start.y += dy; }
    if (state.activeConnection) { state.activeConnection.x += dx; state.activeConnection.y += dy; }
    state.cursor.x += dx;
    state.cursor.y += dy;
  }

  function layoutIsInsideField() {
    const box = layoutBounds();
    const epsilon = .001;
    return box.minX >= -epsilon && box.minY >= -epsilon && box.maxX <= state.field.widthCm + epsilon && box.maxY <= state.field.heightCm + epsilon;
  }

  function drawLayoutMoveOverlay(c) {
    const box = layoutBounds();
    const valid = layoutIsInsideField();
    c.save();
    c.fillStyle = valid ? 'rgba(34,166,127,.08)' : 'rgba(224,77,93,.10)';
    c.strokeStyle = valid ? '#22a67f' : '#e04d5d';
    c.lineWidth = 3 / state.view.scale;
    c.setLineDash([10 / state.view.scale, 6 / state.view.scale]);
    c.fillRect(box.minX, box.minY, box.w, box.h);
    c.strokeRect(box.minX, box.minY, box.w, box.h);
    c.setLineDash([]);
    c.fillStyle = valid ? '#14785d' : '#b32335';
    c.font = `${Math.max(11, 13 / state.view.scale)}px sans-serif`;
    c.textBaseline = 'bottom';
    c.fillText(valid ? 'クリックで固定' : '範囲内へ移動してください', box.minX, box.minY - 6 / state.view.scale);
    c.restore();
  }

  function layoutBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (state.start) {
      const b = startBounds(state.start);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    state.parts.forEach(p => {
      const b = partBounds(p);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    });
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function clampAllToField() {
    state.parts.forEach(p => {
      const b = partBounds(p);
      p.x += b.minX < 0 ? -b.minX : b.maxX > state.field.widthCm ? state.field.widthCm - b.maxX : 0;
      p.y += b.minY < 0 ? -b.minY : b.maxY > state.field.heightCm ? state.field.heightCm - b.maxY : 0;
    });
    if (state.start) {
      const b = startBounds(state.start);
      state.start.x = clamp(state.start.x, b.w / 2, state.field.widthCm - b.w / 2);
      state.start.y = clamp(state.start.y, b.h / 2, state.field.heightCm - b.h / 2);
    }
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
  }

  function pointInCorner45Local(x, y, tolerance = 0) {
    const def = PARTS.corner45;
    const g = corner45Geometry(def);
    const dx = x - g.center.x;
    const dy = y - g.center.y;
    const radius = Math.hypot(dx, dy);
    if (radius < g.ri - tolerance || radius > g.ro + tolerance) return false;
    let angle = Math.atan2(dy, dx);
    while (angle < g.startAngle - Math.PI) angle += Math.PI * 2;
    while (angle > g.endAngle + Math.PI) angle -= Math.PI * 2;
    return angle >= g.startAngle - .0001 && angle <= g.endAngle + .0001;
  }

  function pointInPartShape(x, y, part) {
    const local = toLocal(x, y, part);
    if (part.type === 'corner45') return pointInCorner45Local(local.x, local.y, 0.8 / Math.max(state.view.scale, .25));
    const b = localPartBounds(part.type);
    return local.x >= b.minX && local.x <= b.maxX && local.y >= b.minY && local.y <= b.maxY;
  }

  function corner45PolygonWorld(part, samples = 40) {
    const g = corner45Geometry(PARTS.corner45);
    const localPoints = [];
    for (let i = 0; i <= samples; i++) {
      const a = g.startAngle + (g.endAngle - g.startAngle) * i / samples;
      localPoints.push({ x: g.center.x + g.ro * Math.cos(a), y: g.center.y + g.ro * Math.sin(a) });
    }
    for (let i = samples; i >= 0; i--) {
      const a = g.startAngle + (g.endAngle - g.startAngle) * i / samples;
      localPoints.push({ x: g.center.x + g.ri * Math.cos(a), y: g.center.y + g.ri * Math.sin(a) });
    }
    return localPoints.map(point => {
      const rotated = rotatePoint(point, part.rotation);
      return { x: part.x + rotated.x, y: part.y + rotated.y };
    });
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-12) + a.x);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function orientation(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) < 1e-9) return 0;
    return value > 0 ? 1 : 2;
  }

  function onSegment(a, b, c) {
    return b.x <= Math.max(a.x, c.x) + 1e-9 && b.x >= Math.min(a.x, c.x) - 1e-9 &&
      b.y <= Math.max(a.y, c.y) + 1e-9 && b.y >= Math.min(a.y, c.y) - 1e-9;
  }

  function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    if (o4 === 0 && onSegment(c, b, d)) return true;
    return false;
  }

  function polygonIntersectsRect(polygon, rect) {
    const rectCorners = [
      { x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }
    ];
    if (polygon.some(point => point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY)) return true;
    if (rectCorners.some(point => pointInPolygon(point, polygon))) return true;
    const rectEdges = rectCorners.map((point, index) => [point, rectCorners[(index + 1) % rectCorners.length]]);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if (rectEdges.some(([c, d]) => segmentsIntersect(a, b, c, d))) return true;
    }
    return false;
  }

  function hitTest(x, y) {
    const ordered = partsByLayer();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const p = ordered[i];
      if (pointInPartShape(x, y, p)) return p;
    }
    return null;
  }


  function partsInRect(rect) {
    return state.parts.filter(p => {
      if (p.type === 'corner45') return polygonIntersectsRect(corner45PolygonWorld(p), rect);
      const b = partBounds(p);
      return b.maxX >= rect.minX && b.minX <= rect.maxX && b.maxY >= rect.minY && b.minY <= rect.maxY;
    });
  }

  function normalizedRect(a, b) {
    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x, b.x);
    const maxY = Math.max(a.y, b.y);
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function toLocal(x, y, p) {
    const a = -p.rotation * Math.PI / 180;
    const dx = x - p.x, dy = y - p.y;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }

  function rotatedRectBounds(cx, cy, width, height, rotation) {
    const angle = rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const w = width * cos + height * sin;
    const h = width * sin + height * cos;
    return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2, w, h };
  }

  function transformedBounds(localBounds, cx, cy, rotation) {
    const corners = [
      {x:localBounds.minX,y:localBounds.minY}, {x:localBounds.maxX,y:localBounds.minY},
      {x:localBounds.maxX,y:localBounds.maxY}, {x:localBounds.minX,y:localBounds.maxY}
    ].map(point => {
      const p = rotatePoint(point, rotation);
      return { x: cx + p.x, y: cy + p.y };
    });
    const minX=Math.min(...corners.map(p=>p.x)), maxX=Math.max(...corners.map(p=>p.x));
    const minY=Math.min(...corners.map(p=>p.y)), maxY=Math.max(...corners.map(p=>p.y));
    return { minX,maxX,minY,maxY,w:maxX-minX,h:maxY-minY };
  }

  function partBounds(p) {
    return transformedBounds(localPartBounds(p.type), p.x, p.y, p.rotation);
  }


  function snap(v) { return Math.round(v / state.field.gridCm) * state.field.gridCm; }
  function normalizeRotation(v) { return ((Math.round(v / 45) * 45) % 360 + 360) % 360; }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function screenToWorld(x, y) { return { x: (x - state.view.offsetX) / state.view.scale, y: (y - state.view.offsetY) / state.view.scale }; }
  function makeId() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

  function updateUI() {
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
    document.querySelectorAll('[data-part]').forEach(button => {
      const isStart = button.dataset.part === 'start';
      button.classList.toggle('active', button.dataset.part === state.selectedType || (state.mode === 'start' && isStart));
      button.disabled = isStart && !!state.start;
      button.title = isStart && state.start ? 'スタートレーンは配置済みです' : '';
    });

    const modeLabel = state.layoutMove.active
      ? 'レイアウト全体移動'
      : state.mode === 'start'
        ? 'スタート配置'
        : MODE_LABELS[state.mode];

    els.modeBadge.textContent = modeLabel;
    els.statusMode.textContent = modeLabel;
    const selectedProposal = state.mode === 'place' ? getPlacementProposal() : null;
    const dynamicPartName = state.selectedType === 'bank20' && selectedProposal?.bankRole
      ? (selectedProposal.bankRole === 'entry' ? '20度バンク入口' : '20度バンク出口')
      : PARTS[state.selectedType].name;
    els.statusPart.textContent = state.mode === 'start' ? START_DEF.name : dynamicPartName;
    const proposal = selectedProposal;
    els.statusRotation.textContent = `${proposal?.rotation ?? state.rotation}°`;
    els.statusCount.textContent = String(state.parts.length + (state.start ? 1 : 0));
    els.statusSelected.textContent = String(state.selectedIds.length);
    els.statusZoom.textContent = `${Math.round(state.view.scale * 100)}%`;
    if (els.statusAssets) els.statusAssets.textContent = `${state.assetsReady}/${partAssetCache.size || PART_MENU_ORDER.length}`;
    const openConnections = getOpenConnections();
    els.statusConnection.textContent = state.start ? `${openConnections.length}か所` : '未設定';
    els.fieldWidthText.textContent = `${(state.field.widthCm / 100).toFixed(2)} m`;
    els.fieldHeightText.textContent = `${(state.field.heightCm / 100).toFixed(2)} m`;
    els.gridText.textContent = `${state.field.gridCm} cm`;
    els.startText.textContent = state.start ? `${(state.start.x / 100).toFixed(2)} / ${(state.start.y / 100).toFixed(2)}m・${state.start.rotation}°` : '未設定';
    els.connectionText.textContent = state.start ? `${openConnections.length}か所（ゴーストに近い端へ吸着）` : '未設定';
    if (els.bankStateText) {
      const proposalBank = proposal?.anchor?.connectionState?.bankAngle || 0;
      els.bankStateText.textContent = state.bankWarnings.length ? `警告 ${state.bankWarnings.length}件` : (proposalBank === 20 ? '20度区間' : '通常');
    }

    const showInstruction = state.layoutMove.active || state.mode === 'start' || state.mode === 'place' || ['move','delete','color'].includes(state.mode);
    els.instruction.classList.toggle('hidden', !showInstruction);
    if (state.layoutMove.active) {
      els.instruction.innerHTML = '<strong>レイアウト全体を移動中</strong><span>マウスで移動 → クリックで固定・Esc／右クリックで取消</span>';
    } else if (state.mode === 'start') {
      els.instruction.innerHTML = '<strong>スタートレーンを配置</strong><span>マウスで位置移動・Z/Xまたはホイールで回転 → クリックで配置</span>';
    } else if (state.mode === 'place') {
      els.instruction.innerHTML = '<strong>前後どちら側にも配置できます</strong><span>ゴーストに最も近い空き接続点へ吸着・Z/X/ホイールで重心回転・クリックで配置</span>';
    } else if (state.mode === 'move') {
      els.instruction.innerHTML = '<strong>Q：パーツ移動</strong><span>クリックしてドラッグ・Shift+クリック／範囲ドラッグで複数選択・Escで配置へ</span>';
    } else if (state.mode === 'delete') {
      els.instruction.innerHTML = '<strong>W：パーツ削除</strong><span>クリックで1個削除・Shift+クリックで複数選択・範囲ドラッグでまとめて削除</span>';
    } else if (state.mode === 'color') {
      els.instruction.innerHTML = '<strong>E：カラー変更</strong><span>クリックで色を順送り・Shift+クリック／範囲ドラッグで複数変更</span>';
    }

    els.gridBtn.classList.toggle('active', state.showGrid);
    els.manualFitBtn.classList.toggle('active', state.layoutMove.active);
    els.undoBtn.disabled = !state.history.length;
    els.redoBtn.disabled = !state.future.length;
    els.deleteSelectionBtn.disabled = !state.selectedIds.length;
    els.colorSelectionBtn.disabled = !state.selectedIds.length;

    if (state.selectedIds.length) {
      const names = selectedParts().reduce((acc, p) => {
        const name = partDisplayName(p);
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});
      els.selectionInfo.className = 'selection-info';
      els.selectionInfo.innerHTML = `<strong>${state.selectedIds.length}個選択</strong><br>${Object.entries(names).map(([name, n]) => `${name} ${n}`).join(' / ')}`;
    } else {
      els.selectionInfo.className = 'selection-info empty-summary';
      els.selectionInfo.textContent = '選択なし';
    }

    els.courseCanvas.classList.toggle('mode-place', state.mode === 'place');
    els.courseCanvas.classList.toggle('mode-start-position', state.mode === 'start');
    els.courseCanvas.classList.toggle('mode-move', state.mode === 'move');
    els.courseCanvas.classList.toggle('mode-delete', state.mode === 'delete');
    els.courseCanvas.classList.toggle('mode-color', state.mode === 'color');
    updateStatusOnly();
    updateSummary();
  }

  function updateStatusOnly() {
    els.statusCursor.textContent = `${(state.cursor.x / 100).toFixed(2)}m / ${(state.cursor.y / 100).toFixed(2)}m`;
  }

  function updateSummary() {
    if (!state.parts.length && !state.start) {
      els.partsSummary.className = 'summary-list empty-summary';
      els.partsSummary.textContent = 'まだ部品がありません';
      return;
    }
    const counts = {};
    state.parts.forEach(p => { const name = partDisplayName(p); counts[name] = (counts[name] || 0) + 1; });
    const rows = [];
    if (state.start) rows.push('<div class="summary-row start-summary"><span>スタートレーン</span><strong>1</strong></div>');
    rows.push(...Object.entries(counts).map(([name, n]) => `<div class="summary-row"><span>${name}</span><strong>${n}</strong></div>`));
    els.partsSummary.className = 'summary-list';
    els.partsSummary.innerHTML = rows.join('');
  }

  function formatCm(cm) { return cm >= 100 ? `${(cm / 100).toFixed(2)}m` : `${cm}cm`; }

  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2300);
  }

  if (window.__COURSE_ENABLE_DEBUG__) {
    window.__mini4wdCourseDebug = {
      getState: () => JSON.parse(JSON.stringify(serializeState())),
      getRuntimeState: () => ({
        mode: state.mode,
        selectedIds: [...state.selectedIds],
        historyLength: state.history.length,
        futureLength: state.future.length,
        activeConnection: state.activeConnection ? { ...state.activeConnection } : null,
        proposal: state.mode === 'place' ? getPlacementProposal() : null,
        openConnections: getOpenConnections(),
        view: { ...state.view },
        cursor: { ...state.cursor },
        assetsReady: state.assetsReady,
        bankWarnings: [...state.bankWarnings],
        seamCount: PART_SEAMS.findConnectedSeams(getAllEndpoints(), endpointsConnect).length,
        layers: partsByLayer().map(part => ({ id: part.id, type: part.type, zIndex: part.zIndex }))
      }),
      loadState: data => applySerialized(data, false),
      setMode,
      rewindLastPart,
      rotateCurrent,
      autoAlignLayoutTopLeft,
      selectPartType,
      placePartAtCursor,
      getOpenConnections: () => JSON.parse(JSON.stringify(getOpenConnections())),
      getPlacementProposal: () => JSON.parse(JSON.stringify(getPlacementProposal())),
      setCursor: (x, y) => { state.cursor = { x:Number(x), y:Number(y) }; updateUI(); render(); },
      setRotation: value => { state.rotation = normalizeRotation(Number(value)); updateUI(); render(); },
      renderPartDataUrl: (type, bankRole = 'entry') => {
        const def = PARTS[type];
        if (!def?.visual) return null;
        const canvas = document.createElement('canvas');
        canvas.width = def.visual.canvasWidth;
        canvas.height = def.visual.canvasHeight;
        const c = canvas.getContext('2d');
        c.translate(def.visual.originX, def.visual.originY);
        if (type === 'start') drawStartLane(c, { x:0, y:0, rotation:0 }, true, true);
        else drawPart(c, { id:'qa', type, x:0, y:0, rotation:0, colorKey:'default', bankRole }, { exportMode:true });
        return canvas.toDataURL('image/png');
      }
    };
  }

  init();
})();
