(() => {
  'use strict';

  const VERSION = '1.1.0-RC2';
  const CATALOG = window.M4WD_PART_CATALOG;
  if (!CATALOG) throw new Error('part-catalog.jsが読み込まれていません');
  const PERSISTENCE = window.M4WD_LAYOUT_PERSISTENCE;
  if (!PERSISTENCE) throw new Error('persistence.jsが読み込まれていません');
  const PART_SEAMS = window.M4WD_PART_SEAMS;
  if (!PART_SEAMS) throw new Error('part-seams.jsが読み込まれていません');
  const LANE_CHANGE_VISUAL = window.M4WD_LANE_CHANGE_VISUAL;
  if (!LANE_CHANGE_VISUAL) throw new Error('lane-change-visual.jsが読み込まれていません');
  const BURNING_CHANGER_VISUAL = window.M4WD_BURNING_CHANGER_VISUAL;
  if (!BURNING_CHANGER_VISUAL) throw new Error('burning-changer-visual.jsが読み込まれていません');
  const FIELD_BOUNDARY = window.M4WD_FIELD_BOUNDARY;
  if (!FIELD_BOUNDARY) throw new Error('field-boundary.jsが読み込まれていません');
  const LAYOUT_GRAPH = window.M4WD_LAYOUT_GRAPH;
  if (!LAYOUT_GRAPH) throw new Error('layout-graph.jsが読み込まれていません');
  const PART_RENDER_POSE = window.M4WD_PART_RENDER_POSE;
  if (!PART_RENDER_POSE) throw new Error('part-render-pose.jsが読み込まれていません');
  const PLACEMENT_PROPOSAL = window.M4WD_PLACEMENT_PROPOSAL;
  if (!PLACEMENT_PROPOSAL) throw new Error('placement-proposal.js must be loaded before app.js');
  const CORNER_VARIANT = window.M4WD_CORNER_VARIANT;
  if (!CORNER_VARIANT) throw new Error('corner-variant.js must be loaded before app.js');
  const FAST_PATH = window.M4WD_FAST_PATH_PLACEMENT;
  if (!FAST_PATH) throw new Error('fast-path-placement.js must be loaded before app.js');
  const SNAP_TOGGLE = window.M4WD_SNAP_TOGGLE;
  if (!SNAP_TOGGLE) throw new Error('snap-toggle.jsが読み込まれていません');
  const TRACK_WIDTH_CM = CATALOG.TRACK_WIDTH_CM;
  const STRAIGHT_CM = CATALOG.STRAIGHT_CM;
  const PARTS = CATALOG.PARTS;
  const PART_MENU_ORDER = CATALOG.MENU_ORDER;
  const START_DEF = PARTS.start;
  const HISTORY_LIMIT = 20;
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
    field: { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    parts: [],
    start: null,
    startPhase: 'position',
    mode: 'start',
    selectedType: 'start',
    selectedIds: [],
    hoveredPartId: null,
    rotation: 0,
    activeConnection: null,
    connections: [],
    activeCornerVariant: 'right',
    fastPath: {
      phase: FAST_PATH.FREE,
      activePlacementAnchor: null,
      lastPlacedPartType: null,
      physicalPointerOrigin: null,
      physicalPointerCurrent: null,
      releasePointerOrigin: null,
      selectionPointerOrigin: null,
      selectionPointerCurrent: null,
      selectionFrameHeading: null,
      lateralPx: 0,
      forwardPx: 0,
      distancePx: 0,
      zone: 'manual',
      guideVisible: false
    },
    snapEnabled: SNAP_TOGGLE.initialState().enabled,
    // Only a height/target choice may be remembered while the pointer is still.
    // Corner entry A/B is always recomputed from the current ghost position.
    snapTargetChoiceKey: null,
    snapTargetChoiceConfirmed: false,
    placementHeightMode: 'auto',
    placementHeightMm: 0,
    lastPlacementHeightMm: 0,
    cursor: { x: 300, y: 200 },
    view: { scale: 1, offsetX: 40, offsetY: 40 },
    showGrid: true,
    pointer: {
      x: 0, y: 0, down: false, panning: false, spaceDown: false,
      lastX: 0, lastY: 0, draggingParts: false, dragStart: null,
      dragBase: null, dragSnapshotTaken: false,
      marquee: false, marqueeStart: null, marqueeEnd: null, marqueeAdd: false,
      groupSnap: null, pendingPlacement: false, pendingPlacementProposal: null
    },
    layoutMove: { active: false, anchor: null, base: null, previousMode: 'place', pointer: null },
    history: [],
    future: [],
    setupStarted: false,
    dirty: false,
    bankWarnings: [],
    layoutWarnings: [],
    assetsReady: 0,
    ghostProposal: null,
    ghostProposalKey: null,
    placementProposalSequence: 0,
    placementCommitCount: 0,
    cornerDiagnostics: []
  };

  let ctx;
  let dpr = 1;
  let raf = 0;
  let toastTimer = 0;
  let layoutStore;

  function migrateLayoutCornerTypes(layout) {
    if (!layout || typeof layout !== 'object') return layout;
    return {
      ...layout,
      selectedType: migratedPartType({ type: layout.selectedType }),
      parts: Array.isArray(layout.parts)
        ? layout.parts.map(part => {
          const type = migratedPartType(part || {});
          const { cornerMirror, handedness, cornerHandedness, selectedHandedness, appliedHandedness, ...persistentPart } = part || {};
          return { ...persistentPart, type };
        })
        : layout.parts
    };
  }

  function cacheElements() {
    const ids = [
      'courseCanvas','canvasWrap','setupDialog','setupForm','fieldWidthInput','fieldHeightInput','gridInput',
      'newBtn','saveBtn','loadInput','exportBtn','cancelSetupBtn','instruction','toast','partsList','partsSummary',
      'modeBadge','statusMode','statusPart','statusRotation','statusCursor','statusCount','statusZoom','statusConnection','statusSelected',
      'fieldWidthText','fieldHeightText','gridText','startText','connectionText','undoBtn','redoBtn','rewindBtn',
      'rotateLeftBtn','rotateRightBtn','gridBtn','fitViewBtn','manualFitBtn','topLeftFitBtn','autoFitFieldBtn','editFieldBtn',
      'selectionInfo','clearSelectionBtn','deleteSelectionBtn','colorSelectionBtn','colorLegend','statusAssets','bankStateText',
      'fieldOriginText','fieldOverflowText','fieldOverflowNotice','statusOverflow','exportRangeDialog','exportRangeText',
      'exportRangeKeepBtn','exportRangeFitBtn','exportRangeCancelBtn','snapToggleBtn','cornerDirectionControl','cornerDirectionToggleBtn','placementHeightSelect','convertStartBtn','canvasContextMenu',
      'placementHeightCustom','snapCandidatePanel','layoutWarningSummary','statusWarnings','fastPathNextPart','fastPathGuide'
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
      colorKeys: COLORS.map(color => color.key),
      connectorIdsByType: Object.fromEntries(Object.entries(PARTS).map(([type, definition]) => [type, LAYOUT_GRAPH.connectorsForDefinition(definition).map(connector => connector.id)])),
      migrateLayout: migrateLayoutCornerTypes
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
    if (PARTS[part.type]?.bank20) {
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
    els.autoFitFieldBtn.addEventListener('click', () => autoFitFieldToLayout());
    els.exportRangeKeepBtn?.addEventListener('click', () => { els.exportRangeDialog.close(); performPngExport(); });
    els.exportRangeFitBtn?.addEventListener('click', () => { els.exportRangeDialog.close(); if (autoFitFieldToLayout({ silent: true })) performPngExport(); });
    els.exportRangeCancelBtn?.addEventListener('click', () => els.exportRangeDialog.close());
    els.clearSelectionBtn.addEventListener('click', clearSelection);
    els.deleteSelectionBtn.addEventListener('click', () => deleteParts(state.selectedIds));
    els.colorSelectionBtn.addEventListener('click', () => cyclePartsColor(state.selectedIds));
    els.convertStartBtn?.addEventListener('click', () => convertStraightToStart(state.selectedIds[0]));
    els.cornerDirectionToggleBtn?.addEventListener('click', toggleCornerVariant);
    document.addEventListener('click', e => {
      const target = e.target instanceof Element
        ? e.target.closest('#snapToggleBtn,[data-action="toggle-snap"]')
        : null;
      if (!target) return;
      e.preventDefault();
      state.snapEnabled = SNAP_TOGGLE.toggle({ enabled: state.snapEnabled }).enabled;
      clearSnapTargetChoice();
      updateUI(); render();
    });
    els.placementHeightSelect?.addEventListener('change', () => {
      state.placementHeightMode = els.placementHeightSelect.value;
      els.placementHeightCustom.hidden = state.placementHeightMode !== 'custom';
      if (state.placementHeightMode !== 'auto' && state.placementHeightMode !== 'custom') state.placementHeightMm = Number(state.placementHeightMode);
      clearSnapTargetChoice();
      updateUI(); render();
    });
    els.placementHeightCustom?.addEventListener('input', () => {
      state.placementHeightMm = Number(els.placementHeightCustom.value) || 0;
      clearSnapTargetChoice();
      updateUI(); render();
    });

    const canvas = els.courseCanvas;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCanvasContextMenu);
    document.addEventListener('pointerdown', event => {
      if (!els.canvasContextMenu?.contains(event.target)) closeCanvasContextMenu();
    });
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
    state.field = {
      originX: reset ? 0 : Number(state.field.originX) || 0,
      originY: reset ? 0 : Number(state.field.originY) || 0,
      widthCm: widthM * 100,
      heightCm: heightM * 100,
      gridCm
    };
    if (reset) {
      state.parts = [];
      state.start = null;
      state.connections = [];
      state.startPhase = 'position';
      state.activeConnection = null;
      state.selectedIds = [];
      state.selectedType = 'start';
      state.rotation = 0;
      state.mode = 'start';
      resetCornerVariantSession();
      resetFastPathSession();
      state.cursor = { x: snap(state.field.widthCm / 2), y: snap(state.field.heightCm / 2) };
      state.history = [];
      state.future = [];
      resetPointerInteraction();
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
    resetFastPathSession();
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
    if (isCornerType(type)) state.activeCornerVariant = CORNER_VARIANT.variantForType(type);
    state.selectedType = isCornerType(type) ? activeCornerType() : type;
    state.mode = 'place';
    prepareCornerGhostForSelection();
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
      activeConnection: state.activeConnection ? { ...state.activeConnection } : null,
      connections: LAYOUT_GRAPH.dedupeEdges(state.connections)
    };
  }

  function migratedPartType(part) {
    const migrated = CORNER_VARIANT.migrateLegacyType(part);
    if (PARTS[migrated] && migrated !== 'start') return migrated;
    return ({ half: 'straight' }[migrated] || 'straight');
  }

  function applySerialized(data, resetHistory = true, options = {}) {
    if (!data || !data.field || !Array.isArray(data.parts)) throw new Error('不正なレイアウトデータです');
    state.field = FIELD_BOUNDARY.normalizeField(data.field);
    state.parts = data.parts.map((p, index) => {
      const type = migratedPartType(p);
      const routeIndex = Number.isInteger(Number(p.routeIndex)) ? clamp(Number(p.routeIndex), 0, 1) : 0;
      const connectors = LAYOUT_GRAPH.connectorsForDefinition(PARTS[type]);
      const entryConnectorId = connectors.some(connector => connector.id === p.entryConnectorId)
        ? p.entryConnectorId
        : connectors[routeIndex]?.id || 'a';
      const part = {
        id: String(p.id || makeId()),
        type,
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        rotation: normalizeRotation(Number(p.rotation) || 0),
        routeIndex,
        entryConnectorId,
        colorKey: COLORS.some(c => c.key === p.colorKey) ? p.colorKey : 'default',
        zMm: Number.isFinite(Number(p.zMm)) ? Number(p.zMm) : 0,
        pitchDeg: Number.isFinite(Number(p.pitchDeg ?? p.pitch)) ? Number(p.pitchDeg ?? p.pitch) : 0,
        bankAngleDeg: Number.isFinite(Number(p.bankAngleDeg ?? p.bankAngle)) ? Number(p.bankAngleDeg ?? p.bankAngle) : 0,
        zOrder: Number.isFinite(Number(p.zOrder ?? p.zIndex)) ? Number(p.zOrder ?? p.zIndex) : index + 1,
        zIndex: Number.isFinite(Number(p.zOrder ?? p.zIndex)) ? Number(p.zOrder ?? p.zIndex) : index + 1
      };
      return part;
    });

    const loadedRotation = normalizeRotation(Number(data.start?.rotation) || 0);
    if (data.start) {
      const loadedStart = { id: 'start', type: 'start', x: Number(data.start.x) || 0, y: Number(data.start.y) || 0, rotation: loadedRotation,
        zMm: Number(data.start.zMm) || 0, pitchDeg: Number(data.start.pitchDeg) || 0,
        bankAngleDeg: Number(data.start.bankAngleDeg) || 0, zOrder: Number.isFinite(Number(data.start.zOrder ?? data.start.zIndex)) ? Number(data.start.zOrder ?? data.start.zIndex) : 0 };
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

    const loadedEdges = Array.isArray(data.connections) ? data.connections
      : Array.isArray(data.connectionEdges) ? data.connectionEdges
        : data.connection && typeof data.connection === 'object' ? [data.connection] : [];
    state.connections = LAYOUT_GRAPH.dedupeEdges(loadedEdges);

    state.startPhase = 'position';
    const restoredSelectedType = migratedPartType({ type: data.selectedType });
    state.selectedType = PARTS[restoredSelectedType]
      ? restoredSelectedType
      : (state.start || state.parts.length ? 'straight' : 'start');
    if (isCornerType(state.selectedType)) state.activeCornerVariant = CORNER_VARIANT.variantForType(state.selectedType);
    state.rotation = normalizeRotation(Number(data.rotation) || 0);
    state.selectedIds = [];
    state.mode = state.start || state.parts.length ? 'place' : 'start';
    state.layoutMove = { active: false, anchor: null, base: null, previousMode: 'place', pointer: null };
    resetFastPathSession();
    resetPointerInteraction();
    if (!state.connections.length) state.connections = inferLegacyConnections();
    recalculateBankStates();
    recalculateLayoutWarnings();
    rebuildActiveConnectionFromTail();
    state.cursor = state.activeConnection
      ? { x: state.activeConnection.x, y: state.activeConnection.y }
      : { x: snap(state.field.originX + state.field.widthCm / 2), y: snap(state.field.originY + state.field.heightCm / 2) };
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
      toast(restored.versionStatus === 'supportedLegacy'
        ? '旧RC1レイアウトを復元しました。次の保存からRC2形式になります'
        : '保存済みレイアウトを復元しました');
      return true;
    }
    if (restored.status === 'unsupported-version') {
      toast(`新しい保存形式（${restored.version}）を保持しています。この版では上書きしません`);
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
      const parsed = migrateLayoutCornerTypes(JSON.parse(text));
      const validationOptions = { app: 'mini4wd-course-layout-mouse-flow', version: VERSION, partTypes: Object.keys(PARTS).filter(type => type !== 'start'), colorKeys: COLORS.map(color => color.key), connectorIdsByType: Object.fromEntries(Object.entries(PARTS).map(([type, definition]) => [type, LAYOUT_GRAPH.connectorsForDefinition(definition).map(connector => connector.id)])) };
      const versionStatus = PERSISTENCE.classifyLayoutVersion(parsed?.version, validationOptions);
      if (!PERSISTENCE.validateLayout(parsed, validationOptions)) throw new Error('未対応または不正な保存形式です');
      applySerialized(PERSISTENCE.migrateSupportedLegacyLayout(parsed, versionStatus), true);
      toast('レイアウトを読み込みました');
    } catch (err) {
      console.error(err);
      toast('JSONを読み込めませんでした');
    }
  }

  function createExportCanvas(requestedScale) {
    const padding = 30;
    const automaticScale = Math.min(2.2, Math.max(0.5, 1800 / Math.max(state.field.widthCm, state.field.heightCm)));
    const exportScale = Number.isFinite(requestedScale)
      ? Math.min(4, Math.max(.5, requestedScale))
      : automaticScale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(state.field.widthCm * exportScale + padding * 2);
    canvas.height = Math.ceil(state.field.heightCm * exportScale + padding * 2 + 54);
    const c = canvas.getContext('2d');
    c.fillStyle = '#f6f8fb';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(padding, padding + 34);
    c.scale(exportScale, exportScale);
    c.translate(-state.field.originX, -state.field.originY);
    drawExport(c);
    c.restore();
    c.fillStyle = '#111821';
    c.font = '700 18px sans-serif';
    c.fillText('MINI 4WD COURSE LAYOUT', padding, 24);
    c.fillStyle = '#556171';
    c.font = '12px sans-serif';
    c.fillText(`${(state.field.widthCm/100).toFixed(2)}m × ${(state.field.heightCm/100).toFixed(2)}m  /  ${state.parts.length + (state.start ? 1 : 0)} parts`, padding, canvas.height - 15);
    return canvas;
  }

  function performPngExport() {
    const canvas = createExportCanvas();
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, `mini4wd-layout-${dateStamp()}.png`);
      toast('PNGを書き出しました');
    }, 'image/png');
  }

  function exportPng() {
    const outside = outOfBoundsItems();
    if (!outside.length) return performPngExport();
    if (!els.exportRangeDialog?.showModal) {
      if (window.confirm(`作成範囲外に${outside.length}パーツあります。作成範囲を自動フィットして出力しますか？`)) {
        if (autoFitFieldToLayout({ silent: true })) performPngExport();
      }
      return;
    }
    els.exportRangeText.textContent = `作成範囲外に${outside.length}パーツあります。このまま出力すると範囲外部分はPNGに含まれません。`;
    els.exportRangeDialog.showModal();
  }

  function layerValue(part, fallbackIndex = 0) {
    const value = Number(part?.zOrder ?? part?.zIndex);
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
    moving.forEach(part => { part.zOrder = z; part.zIndex = z++; });
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
    const currentIsCorner = isCornerType(part.type);
    for (const earlier of earlierParts) {
      const earlierIsCorner = isCornerType(earlier.type);
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
      drawOwnedConnectionSeams(c, part, options);
      earlier.push(part);
    }
    if (!options.exportMode) drawOutOfBoundsWarnings(c);
    if (!options.exportMode) drawLayoutWarnings(c);
  }

  function drawOwnedConnectionSeams(c, owner, options = {}) {
    const connectors = getAllEndpoints().map(endpoint => ({ ...endpoint, partId: endpoint.sourceId, directionDeg: endpoint.heading }));
    const seams = LAYOUT_GRAPH.seamsByOwner(allLayoutParts(), state.connections, connectors).get(owner.id) || [];
    for (const seam of seams) {
      const style = PART_SEAMS.resolveStyle({ enabled: RENDER_FEATURES.partSeams, selected: !!options.selected && isSelected(owner.id), exportMode: !!options.exportMode });
      if (!style) continue;
      const halfWidth = TRACK_WIDTH_CM / 2 - style.edgeInset;
      c.save(); c.translate(seam.point.x, seam.point.y); c.rotate(seam.heading * Math.PI / 180);
      c.strokeStyle = style.color; c.lineWidth = style.lineWidth; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(0, -halfWidth); c.lineTo(0, halfWidth); c.stroke(); c.restore();
    }
  }

  function drawExport(c) {
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    c.fillStyle = '#ffffff';
    c.fillRect(frame.minX, frame.minY, frame.w, frame.h);
    c.strokeStyle = '#2b3440';
    c.lineWidth = 1.2;
    c.strokeRect(frame.minX, frame.minY, frame.w, frame.h);
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
    state.view.offsetX = (rect.width - state.field.widthCm * state.view.scale) / 2 - state.field.originX * state.view.scale;
    state.view.offsetY = (rect.height - state.field.heightCm * state.view.scale) / 2 - state.field.originY * state.view.scale;
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
      drawMissingStartWarning(ctx);
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
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    c.save();
    c.shadowColor = 'rgba(0,0,0,.5)';
    c.shadowBlur = 24 / state.view.scale;
    c.fillStyle = '#f7f6f2';
    c.fillRect(frame.minX, frame.minY, frame.w, frame.h);
    c.shadowBlur = 0;
    if (state.showGrid) drawGrid(c);
    c.strokeStyle = '#6e716d';
    c.lineWidth = 1.6 / state.view.scale;
    c.setLineDash([8 / state.view.scale, 5 / state.view.scale]);
    c.strokeRect(frame.minX, frame.minY, frame.w, frame.h);
    c.setLineDash([]);
    const m = 100;
    c.strokeStyle = '#555953';
    c.lineWidth = 2 / state.view.scale;
    c.beginPath();
    c.moveTo(frame.minX + 10, frame.maxY - 18);
    c.lineTo(frame.minX + 10 + m, frame.maxY - 18);
    c.stroke();
    c.fillStyle = '#555953';
    c.font = `${11 / state.view.scale}px sans-serif`;
    c.fillText('1m', frame.minX + 10 + m / 2 - 7 / state.view.scale, frame.maxY - 24);
    c.restore();
  }

  function drawGrid(c) {
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    const step = state.field.gridCm;
    const majorEvery = Math.max(1, Math.round(100 / step));
    c.lineWidth = 1 / state.view.scale;
    for (let x = frame.minX, i = 0; x <= frame.maxX + .001; x += step, i++) {
      c.strokeStyle = i % majorEvery === 0 ? '#ccc9c0' : '#e9e6df';
      c.beginPath(); c.moveTo(x, frame.minY); c.lineTo(x, frame.maxY); c.stroke();
    }
    for (let y = frame.minY, i = 0; y <= frame.maxY + .001; y += step, i++) {
      c.strokeStyle = i % majorEvery === 0 ? '#ccc9c0' : '#e9e6df';
      c.beginPath(); c.moveTo(frame.minX, y); c.lineTo(frame.maxX, y); c.stroke();
    }
  }

  function resolvePartDef(part) {
    const original = PARTS[part.type];
    const palette = COLORS.find(c => c.key === part.colorKey) || COLORS[0];
    if (!palette.base) return original;
    return { ...original, base: palette.base, lane: palette.lane, edge: palette.edge };
  }

  function resolvePartPose(part = {}) {
    return PART_RENDER_POSE.resolvePartPose(part);
  }

  function placementProposalKey() {
    return JSON.stringify([
      state.selectedType, state.cursor.x, state.cursor.y, state.rotation,
      state.snapEnabled, state.placementHeightMode, state.placementHeightMm,
      state.snapTargetChoiceKey, state.snapTargetChoiceConfirmed,
      state.activeCornerVariant, state.view.scale, state.connections.length, state.parts.length,
      state.fastPath.phase, state.fastPath.activePlacementAnchor
    ]);
  }

  function cacheGhostProposal(proposal) {
    state.ghostProposal = PLACEMENT_PROPOSAL.snapshotVisibleProposal(
      proposal,
      `proposal-${++state.placementProposalSequence}`
    );
    state.ghostProposalKey = placementProposalKey();
    return state.ghostProposal;
  }

  // This is the one proposal that the user can see.  It is immutable and may
  // be replaced only when ghost state changes; confirmation never evaluates a
  // new snap candidate.
  function currentGhostProposal() {
    return state.ghostProposalKey === placementProposalKey()
      ? state.ghostProposal
      : cacheGhostProposal(getPlacementProposal());
  }

  function isFastPathType(type = state.selectedType) {
    return FAST_PATH.isFastPathType(type);
  }

  function worldToScreen(x, y) {
    return { x: x * state.view.scale + state.view.offsetX, y: y * state.view.scale + state.view.offsetY };
  }

  function resetFastPathSession() {
    state.fastPath = {
      phase: FAST_PATH.FREE,
      activePlacementAnchor: null,
      lastPlacedPartType: null,
      physicalPointerOrigin: null,
      physicalPointerCurrent: null,
      releasePointerOrigin: null,
      selectionPointerOrigin: null,
      selectionPointerCurrent: null,
      selectionFrameHeading: null,
      lateralPx: 0,
      forwardPx: 0,
      distancePx: 0,
      zone: 'manual',
      guideVisible: false
    };
  }

  function setFastPathType(type) {
    if (!isFastPathType(type) || state.selectedType === type) return false;
    state.selectedType = type;
    if (isCornerType(type)) state.activeCornerVariant = CORNER_VARIANT.variantForType(type);
    clearSnapTargetChoice();
    state.ghostProposal = null;
    state.ghostProposalKey = null;
    return true;
  }

  function fastPathTypeLabel(type) {
    return type === FAST_PATH.RIGHT ? '右コーナー' : type === FAST_PATH.LEFT ? '左コーナー' : 'ストレート';
  }

  function activateFastPathPlacement(anchor, type, physicalPointerPosition) {
    if (!isFastPathType(type)) return;
    const pointer = physicalPointerPosition || worldToScreen(state.cursor.x, state.cursor.y);
    state.fastPath.phase = FAST_PATH.REPEAT;
    state.fastPath.activePlacementAnchor = { ...anchor };
    state.fastPath.lastPlacedPartType = type;
    state.fastPath.physicalPointerOrigin = { ...pointer };
    state.fastPath.physicalPointerCurrent = { ...pointer };
    state.fastPath.releasePointerOrigin = { ...pointer };
    state.fastPath.selectionPointerOrigin = null;
    state.fastPath.selectionPointerCurrent = null;
    state.fastPath.selectionFrameHeading = normalizeRotation(anchor.heading);
    state.fastPath.lateralPx = 0;
    state.fastPath.forwardPx = 0;
    state.fastPath.distancePx = 0;
    state.fastPath.zone = 'repeat';
    state.fastPath.guideVisible = true;
    state.cursor = { x: anchor.x, y: anchor.y };
    setFastPathType(type);
    state.rotation = normalizeRotation(anchor.heading);
    state.ghostProposal = null;
    state.ghostProposalKey = null;
    // Every activation (including snapped free placement) owns a newly
    // generated ghost exit.  Do not carry a selection origin over from the
    // previous part.
    refreshFastPathGhostProposal();
    rebaseFastPathSelectionPointer();
  }

  function fastPathGhostExitScreen() {
    const proposal = currentGhostProposal();
    const exit = proposal?.exit;
    if (!exit) return null;
    return { ...worldToScreen(exit.x, exit.y), heading: exit.heading };
  }

  function refreshFastPathGhostProposal() {
    const proposal = getPlacementProposal();
    if (!proposal) {
      state.ghostProposal = null;
      state.ghostProposalKey = null;
      return null;
    }
    return cacheGhostProposal(proposal);
  }

  // The displayed ghost exit is the virtual selection origin. The OS pointer
  // remains untouched; only its movement since the last confirmed placement
  // is applied to this origin.
  function rebaseFastPathSelectionPointer() {
    const fast = state.fastPath;
    const exit = fastPathGhostExitScreen();
    fast.selectionPointerOrigin = exit ? { x: exit.x, y: exit.y } : null;
    fast.selectionPointerCurrent = exit ? { x: exit.x, y: exit.y } : null;
  }

  function selectionPointerForPhysicalPointer(pointerScreen) {
    return FAST_PATH.selectionPointerFromPhysicalDelta({
      physicalPointerOrigin: state.fastPath.physicalPointerOrigin,
      selectionPointerOrigin: state.fastPath.selectionPointerOrigin,
      physicalPointerCurrent: pointerScreen
    }) || { ...pointerScreen };
  }

  function applyFastPathSelectionResult(result) {
    const fast = state.fastPath;
    fast.forwardPx = result.forwardPx;
    fast.lateralPx = result.lateralPx;
    fast.zone = result.zone;
    const changed = setFastPathType(result.type);
    if (changed) {
      refreshFastPathGhostProposal();
    }
    return changed;
  }

  function updateFastPathTypeForPointer(pointerScreen) {
    const fast = state.fastPath;
    if (!fast.activePlacementAnchor || fast.phase !== FAST_PATH.SELECT || !isFastPathType(fast.lastPlacedPartType)) return false;
    const selectionPointerScreen = selectionPointerForPhysicalPointer(pointerScreen);
    fast.selectionPointerCurrent = { ...selectionPointerScreen };
    const result = FAST_PATH.runtimeTransitionForPointer({
      fastPath: fast,
      physicalPointerScreen: pointerScreen,
      selectionPointerScreen,
      ghostExitScreen: fastPathGhostExitScreen(),
      currentType: state.selectedType,
      fallbackType: fast.lastPlacedPartType
    });
    return applyFastPathSelectionResult(result);
  }

  // repeat and select both keep the proposal anchored. Only free placement
  // releases the anchor and lets the real cursor position drive the ghost.
  function updateFastPathPointer(pointerScreen) {
    const fast = state.fastPath;
    if (!fast.activePlacementAnchor || !fast.physicalPointerOrigin) return { phase: FAST_PATH.FREE };
    const selectionPointerScreen = selectionPointerForPhysicalPointer(pointerScreen);
    fast.selectionPointerCurrent = { ...selectionPointerScreen };
    const result = FAST_PATH.runtimeTransitionForPointer({
      fastPath: fast,
      physicalPointerScreen: pointerScreen,
      selectionPointerScreen,
      ghostExitScreen: fastPathGhostExitScreen(),
      currentType: state.selectedType,
      fallbackType: fast.lastPlacedPartType
    });
    fast.physicalPointerCurrent = result.physicalPointerCurrent;
    fast.phase = result.phase;
    fast.distancePx = result.distancePx;
    fast.activePlacementAnchor = result.activePlacementAnchor;
    if (result.phase === FAST_PATH.FREE) {
      fast.lastPlacedPartType = null;
      fast.physicalPointerOrigin = null;
      fast.releasePointerOrigin = null;
      fast.selectionPointerOrigin = null;
      fast.selectionPointerCurrent = null;
      fast.selectionFrameHeading = null;
      fast.lateralPx = 0;
      fast.forwardPx = 0;
      fast.distancePx = 0;
      fast.zone = 'free';
      fast.guideVisible = false;
      return result;
    }
    fast.guideVisible = true;
    if (result.phase === FAST_PATH.SELECT) applyFastPathSelectionResult(result);
    else {
      fast.lateralPx = 0;
      fast.forwardPx = 0;
      fast.zone = 'repeat';
    }
    return result;
  }

  function tryReactivateFastPathFromSnappedProposal(proposal, physicalPointerScreen) {
    if (state.fastPath.phase !== FAST_PATH.FREE || !proposal?.snapped || !isFastPathType(state.selectedType)) return false;
    const anchor = proposal.anchor;
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
    activateFastPathPlacement(anchor, state.selectedType, physicalPointerScreen);
    refreshFastPathGhostProposal();
    rebaseFastPathSelectionPointer();
    state.fastPath.guideVisible = true;
    return true;
  }

  function captureVisiblePlacementProposal(reason) {
    const visible = currentGhostProposal();
    if (!visible) return null;
    const captured = PLACEMENT_PROPOSAL.cloneForCommit(visible);
    recordCornerDiagnostic('ghost-before-click', renderPartFromProposal(visible), {
      placementId: visible.placementId,
      captureReason: reason,
      activeProposalId: visible.placementId,
      pathHash: traceHash(partRenderTrace(renderPartFromProposal(visible))),
      commitReevaluated: false
    });
    return captured;
  }

  function traceHash(trace) {
    const rounded = value => Math.round(Number(value) * 1e6) / 1e6;
    return JSON.stringify({
      pose: trace?.pose || null,
      path: (trace?.path || []).map(point => [rounded(point.x), rounded(point.y)]),
      connectors: (trace?.connectors || []).map(connector => [connector.id, rounded(connector.x), rounded(connector.y), rounded(connector.heading)])
    });
  }

  function recordCornerDiagnostic(stage, part, extra = {}) {
    if (!isCornerType(part?.type)) return;
    if (!window.__COURSE_ENABLE_DEBUG__ && !/test-index\.html$/.test(window.location.pathname)) return;
    const pose = resolvePartPose(part);
    const entrypoints = partEndpoints(part).map(endpoint => ({
      id: endpoint.connectorId,
      x: endpoint.x,
      y: endpoint.y,
      heading: endpoint.heading
    }));
    const trace = partRenderTrace(part);
    const record = {
      stage,
      pose,
      type: part.type,
      definitionId: part.type,
      shapeVariant: PARTS[part.type]?.renderKind || part.type,
      path: trace.path,
      connectors: entrypoints,
      pathHash: traceHash(trace),
      ...extra
    };
    state.cornerDiagnostics = [...state.cornerDiagnostics.slice(-59), JSON.parse(JSON.stringify(record))];
    if (window.__COURSE_ENABLE_DEBUG__) console.log(`[corner-render:${stage}]`, record);
  }

  function renderPartFromProposal(proposal, id = 'ghost') {
    return {
      id,
      type: proposal.type,
      x: proposal.x,
      y: proposal.y,
      rotation: proposal.rotation,
      routeIndex: proposal.routeIndex,
      entryConnectorId: proposal.entryConnectorId,
      colorKey: 'default'
    };
  }

  function partShapePathPoints(part, samples = 48) {
    return PART_RENDER_POSE.tracePartPath(PARTS[part.type], part, samples);
  }

  function partRenderTrace(part) {
    return PART_RENDER_POSE.tracePart(PARTS[part.type], part);
  }

  function drawPart(c, part, opts = {}) {
    const def = resolvePartDef(part);
    if (!def) return;
    const pose = resolvePartPose(part);
    const exportMode = !!opts.exportMode;
    const selected = !!opts.selected;
    c.save();
    c.translate(part.x, part.y);
    c.rotate(pose.rotation * Math.PI / 180);
    recordCornerDiagnostic('resolved-pose', part, { poseSource: 'resolvePartPose' });
    const usedAsset = drawPartAsset(c, def, part.colorKey || 'default', part);
    if (!usedAsset) {
      if (def.corner45) drawCorner45(c, def, exportMode);
      else if (def.wave) drawWave(c, def, exportMode);
      else if (def.burning) drawBurningGraphic(c, def);
      else drawStraightLike(c, def, exportMode, part);
    }
    recordCornerDiagnostic('drawn', part, { poseSource: 'resolvePartPose', usedAsset });
    if (selected) drawPartSelectionEffect(c, part.type, '#46bfff', 'rgba(70,191,255,.10)', true, def);
    if (opts.hovered) drawPartHoverEffect(c, part.type, def);
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

    if (!def.lanechange) {
      c.strokeStyle = def.lane;
      c.lineWidth = .8;
      for (let i = 1; i < 3; i++) {
        const y = vy + (TRACK_WIDTH_CM / 3) * i;
        c.beginPath(); c.moveTo(vx, y); c.lineTo(vx + def.w, y); c.stroke();
      }
    }

    if (def.lanechange) drawLaneChangeGraphic(c, def);
    if (def.slope) drawSlopeGraphic(c, def);
    if (def.bank20) drawBankGraphic(c, def, part);
  }



  function drawLaneChangeGraphic(c, def) {
    const geometry = LANE_CHANGE_VISUAL.createGeometry(def.w, def.geometry?.height || TRACK_WIDTH_CM);
    c.save();
    c.lineCap = 'butt';
    c.lineJoin = 'round';

    // 3レーン境界は通常Straightの水平線と重ねず、切替形状として一度だけ描く。
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (const guide of geometry.guides) {
      c.beginPath();
      c.moveTo(guide.start.x, guide.start.y);
      c.lineTo(guide.transitionStart.x, guide.transitionStart.y);
      c.bezierCurveTo(
        guide.control1.x, guide.control1.y,
        guide.control2.x, guide.control2.y,
        guide.transitionEnd.x, guide.transitionEnd.y
      );
      c.lineTo(guide.end.x, guide.end.y);
      c.stroke();
    }

    // RC1系の中央支持部。接続面まで延ばさず、外周内へ収める。
    c.beginPath();
    geometry.support.forEach((point, index) => {
      if (index === 0) c.moveTo(point.x, point.y);
      else c.lineTo(point.x, point.y);
    });
    c.closePath();
    c.fillStyle = shadeColor(def.base, -.16);
    c.fill();
    c.strokeStyle = def.edge;
    c.lineWidth = .9;
    c.stroke();

    const bridge = geometry.bridge;
    const traceBridge = () => {
      c.beginPath();
      c.moveTo(bridge.start.x, bridge.start.y);
      c.bezierCurveTo(
        bridge.control1.x, bridge.control1.y,
        bridge.control2.x, bridge.control2.y,
        bridge.end.x, bridge.end.y
      );
    };

    // 橋状レーンの縁と天面を分け、3レーン構造と切替方向を明瞭にする。
    traceBridge();
    c.strokeStyle = def.edge;
    c.lineWidth = bridge.edgeWidth;
    c.stroke();

    const bridgeGradient = c.createLinearGradient(
      bridge.start.x, bridge.start.y, bridge.end.x, bridge.end.y
    );
    bridgeGradient.addColorStop(0, shadeColor(def.base, -.18));
    bridgeGradient.addColorStop(.48, shadeColor(def.base, .05));
    bridgeGradient.addColorStop(1, shadeColor(def.base, -.12));
    traceBridge();
    c.strokeStyle = bridgeGradient;
    c.lineWidth = bridge.width;
    c.stroke();

    traceBridge();
    c.strokeStyle = 'rgba(255,255,255,.34)';
    c.lineWidth = .5;
    c.stroke();

    // 天面両端は接続面ではなく、1枚内の構造線として細く示す。
    c.strokeStyle = def.lane;
    c.lineWidth = .52;
    for (const cap of bridge.caps) {
      c.beginPath();
      c.moveTo(cap.start.x, cap.start.y);
      c.lineTo(cap.end.x, cap.end.y);
      c.stroke();
    }
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

  function traceBurningBridgePath(c, bridge) {
    c.beginPath();
    c.moveTo(bridge.start.x, bridge.start.y);
    c.lineTo(bridge.approachStart.x, bridge.approachStart.y);
    c.bezierCurveTo(
      bridge.curve.control1.x, bridge.curve.control1.y,
      bridge.curve.control2.x, bridge.curve.control2.y,
      bridge.curve.end.x, bridge.curve.end.y
    );
    c.lineTo(bridge.end.x, bridge.end.y);
  }

  function drawBurningBridgeGraphic(c, def, bridge, seamStyle) {
    traceBurningBridgePath(c, bridge);
    c.strokeStyle = 'rgba(32,36,38,.24)';
    c.lineWidth = bridge.edgeWidth + 2.2;
    c.stroke();
    traceBurningBridgePath(c, bridge);
    c.strokeStyle = def.edge;
    c.lineWidth = bridge.edgeWidth;
    c.stroke();

    const bridgeGradient = c.createLinearGradient(
      bridge.approachStart.x, bridge.approachStart.y,
      bridge.approachEnd.x, bridge.approachEnd.y
    );
    bridgeGradient.addColorStop(0, shadeColor(def.base, -.20));
    bridgeGradient.addColorStop(.5, shadeColor(def.base, -.08));
    bridgeGradient.addColorStop(1, shadeColor(def.base, .04));
    traceBurningBridgePath(c, bridge);
    c.strokeStyle = bridgeGradient;
    c.lineWidth = bridge.width;
    c.stroke();

    traceBurningBridgePath(c, bridge);
    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.lineWidth = .45;
    c.stroke();

    if (seamStyle) {
      c.strokeStyle = seamStyle.color;
      c.lineWidth = seamStyle.lineWidth;
      for (const seam of bridge.seams) {
        c.beginPath();
        c.moveTo(seam.start.x, seam.start.y);
        c.lineTo(seam.end.x, seam.end.y);
        c.stroke();
      }
    }
  }

  function drawBurningGraphic(c, def) {
    const g = burningGeometry(def);
    c.save();
    c.lineCap = 'butt';
    c.lineJoin = 'round';

    // 3レーンのU字本体。接続面から半円部まで同じ中心線で連続させる。
    c.strokeStyle = def.base;
    c.lineWidth = g.trackWidth;
    c.beginPath();
    c.moveTo(g.leftX, g.topY);
    c.lineTo(g.arcCenterX, g.topY);
    c.arc(g.arcCenterX, 0, g.centerlineRadius, -Math.PI / 2, Math.PI / 2, false);
    c.lineTo(g.leftX, g.bottomY);
    c.stroke();

    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    for (const radius of [g.innerRadius, g.outerRadius]) {
      const isOuter = radius === g.outerRadius;
      c.beginPath();
      c.moveTo(g.leftX, isOuter ? -g.outerRadius : -g.innerRadius);
      c.lineTo(g.arcCenterX, isOuter ? -g.outerRadius : -g.innerRadius);
      c.arc(g.arcCenterX, 0, radius, -Math.PI / 2, Math.PI / 2, false);
      c.lineTo(g.leftX, isOuter ? g.outerRadius : g.innerRadius);
      c.stroke();
    }

    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (const laneOffset of g.laneOffsets) {
      c.beginPath();
      c.moveTo(g.leftX, g.topY + laneOffset);
      c.lineTo(g.arcCenterX, g.topY + laneOffset);
      c.arc(g.arcCenterX, 0, g.centerlineRadius - laneOffset, -Math.PI / 2, Math.PI / 2, false);
      c.lineTo(g.leftX, g.bottomY - laneOffset);
      c.stroke();
    }

    const seamStyle = PART_SEAMS.resolveStyle({ enabled: RENDER_FEATURES.partSeams });
    if (seamStyle) {
      c.strokeStyle = seamStyle.color;
      c.lineWidth = seamStyle.lineWidth;
      for (const seam of g.baseSeams) {
        c.beginPath();
        c.moveTo(seam.start.x, seam.start.y);
        c.lineTo(seam.end.x, seam.end.y);
        c.stroke();
      }
    }

    // 下層レーンを先に描いた後、輪郭と陰影を持つ1レーン幅の上層経路を重ねる。
    drawBurningBridgeGraphic(c, def, g.bridge, seamStyle);
    c.restore();
  }


  function corner45Geometry(def) {
    return PART_RENDER_POSE.cornerGeometry(def);
  }



  function drawCorner45(c, def, exportMode) {
    const g = corner45Geometry(def);
    c.save();
    if (def.geometry?.pathOrientation === 'left') c.scale(1, -1);
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
      c.save();
      if (def.geometry?.pathOrientation === 'left') c.scale(1, -1);
      c.beginPath();
      c.moveTo(g.center.x + g.ro * Math.cos(g.startAngle), g.center.y + g.ro * Math.sin(g.startAngle));
      c.arc(g.center.x, g.center.y, g.ro, g.startAngle, g.endAngle, false);
      c.lineTo(g.center.x + g.ri * Math.cos(g.endAngle), g.center.y + g.ri * Math.sin(g.endAngle));
      c.arc(g.center.x, g.center.y, g.ri, g.endAngle, g.startAngle, true);
      c.closePath();
      c.restore();
      return true;
    }
    if (def.burning) {
      const g = burningGeometry(def);
      c.beginPath();
      c.moveTo(g.leftX, -g.outerRadius);
      c.lineTo(g.arcCenterX, -g.outerRadius);
      c.arc(g.arcCenterX, 0, g.outerRadius, -Math.PI / 2, Math.PI / 2, false);
      c.lineTo(g.leftX, g.outerRadius);
      c.lineTo(g.leftX, g.innerRadius);
      c.lineTo(g.arcCenterX, g.innerRadius);
      c.arc(g.arcCenterX, 0, g.innerRadius, Math.PI / 2, -Math.PI / 2, true);
      c.lineTo(g.leftX, -g.innerRadius);
      c.closePath();
      return true;
    }
    if (def.wave) return traceWaveOuterPath(c, def);
    const b = localPartBounds(type);
    c.beginPath();
    c.rect(b.minX, b.minY, b.w, b.h);
    c.closePath();
    return true;
  }

  function drawPartSelectionEffect(c, type, stroke, fill, dashed = false, resolvedDef = PARTS[type]) {
    c.save();
    if (!tracePartShapePath(c, type)) { c.restore(); return; }
    c.fillStyle = fill;
    c.strokeStyle = stroke;
    c.lineWidth = 2.5 / Math.max(state.view.scale, .15);
    if (dashed) c.setLineDash([6 / Math.max(state.view.scale, .15), 4 / Math.max(state.view.scale, .15)]);
    c.fill();
    c.stroke();
    if (PARTS[type]?.burning) {
      const bridge = burningGeometry(PARTS[type]).bridge;
      c.setLineDash([]);
      traceBurningBridgePath(c, bridge);
      c.strokeStyle = stroke;
      c.lineWidth = bridge.edgeWidth + 5 / Math.max(state.view.scale, .15);
      c.stroke();
      drawBurningBridgeGraphic(
        c,
        resolvedDef,
        bridge,
        PART_SEAMS.resolveStyle({ enabled: RENDER_FEATURES.partSeams })
      );
    }
    c.restore();
  }

  function hoverStyleForMode() {
    if (state.mode === 'delete') return { stroke: '#ff5268', fill: 'rgba(255,82,104,.22)' };
    if (state.mode === 'color') return { stroke: '#c888ff', fill: 'rgba(200,136,255,.20)' };
    return { stroke: '#55d7ff', fill: 'rgba(85,215,255,.18)' };
  }

  function drawPartHoverEffect(c, type, resolvedDef = PARTS[type]) {
    const style = hoverStyleForMode();
    c.save();
    c.shadowColor = style.stroke;
    c.shadowBlur = 12 / Math.max(state.view.scale, .15);
    drawPartSelectionEffect(c, type, style.stroke, style.fill, false, resolvedDef);
    c.restore();
  }


  function drawWave(c, def, exportMode) {
    const trackWidth = def.geometry?.trackWidth || TRACK_WIDTH_CM;
    const waveY = waveCenterline(def);
    c.save();
    c.fillStyle = def.base;
    c.strokeStyle = def.edge;
    c.lineWidth = 1.05;
    traceWaveOuterPath(c, def); c.fill(); c.stroke();
    c.strokeStyle = def.lane;
    c.lineWidth = .8;
    for (let laneIndex = 1; laneIndex < 3; laneIndex++) {
      const base = -trackWidth / 2 + trackWidth * laneIndex / 3;
      c.beginPath();
      for (let i = 0; i <= WAVE_PATH_SAMPLES; i++) {
        const x = -def.w / 2 + def.w * i / WAVE_PATH_SAMPLES;
        const y = base + waveY(x);
        if (!i) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.stroke();
    }
    c.restore();
  }

  function isCornerType(type = state.selectedType) {
    return CORNER_VARIANT.isCornerType(type);
  }

  function activeCornerType() {
    return CORNER_VARIANT.typeForVariant(state.activeCornerVariant);
  }

  function resetCornerVariantSession() {
    state.activeCornerVariant = 'right';
  }

  function prepareCornerGhostForSelection() {
    if (state.activeConnection) state.rotation = normalizeRotation(state.activeConnection.heading);
  }

  function setActiveCornerVariant(variant) {
    const next = variant === 'left' ? 'left' : 'right';
    if (!isCornerType()) return;
    state.activeCornerVariant = next;
    state.selectedType = activeCornerType();
    if (state.activeConnection) state.rotation = normalizeRotation(state.activeConnection.heading);
    clearSnapTargetChoice();
    updateUI();
    render();
  }

  function toggleCornerVariant() {
    setActiveCornerVariant(state.activeCornerVariant === 'left' ? 'right' : 'left');
  }

  const WAVE_PATH_SAMPLES = 72;

  function waveCenterline(def) {
    const amp = def.geometry?.amplitude || def.amplitude || 4;
    const connectorY = def.geometry?.connectors?.[0]?.y || 0;
    return x => {
      const t = (x + def.w / 2) / def.w;
      return connectorY - amp * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t));
    };
  }

  function traceWaveOuterPath(c, def) {
    const trackWidth = def.geometry?.trackWidth || TRACK_WIDTH_CM;
    const waveY = waveCenterline(def);
    c.beginPath();
    for (let i = 0; i <= WAVE_PATH_SAMPLES; i++) {
      const x = -def.w / 2 + def.w * i / WAVE_PATH_SAMPLES;
      const y = -trackWidth / 2 + waveY(x);
      if (!i) c.moveTo(x, y); else c.lineTo(x, y);
    }
    for (let i = WAVE_PATH_SAMPLES; i >= 0; i--) {
      const x = -def.w / 2 + def.w * i / WAVE_PATH_SAMPLES;
      c.lineTo(x, trackWidth / 2 + waveY(x));
    }
    c.closePath();
    return true;
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
    return BURNING_CHANGER_VISUAL.createGeometry(def.geometry || {});
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
    return isPartInsideField({ ...start, id: 'start', type: 'start' });
  }

  function placeStartLane(placementMeta = {}) {
    const candidate = { id: 'start', type: 'start', x: state.cursor.x, y: state.cursor.y, zMm: selectedFreeHeightMm(), rotation: state.rotation, pitchDeg: 0, bankAngleDeg: 0, zOrder: 0 };
    const outside = !startInsideField(candidate);
    snapshot();
    state.start = candidate;
    state.startPhase = 'position';
    state.selectedType = 'straight';
    state.mode = 'place';
    const ends = startEndpoints(state.start);
    const forwardExit = ends.find(endpoint => endpoint.connectorRole === 'exit');
    if (!forwardExit) throw new Error('スタートの前方出口コネクタが定義されていません');
    setActiveConnection({ ...forwardExit, sourceId: 'start', endpointIndex: forwardExit.endpointIndex });
    activateFastPathPlacement(
      forwardExit,
      FAST_PATH.STRAIGHT,
      placementMeta.physicalPointerPosition || worldToScreen(state.cursor.x, state.cursor.y)
    );
    state.rotation = state.start.rotation;
    toast(outside ? 'スタートを作成範囲外へ配置しました（オレンジ枠で表示）' : 'スタートの前後どちら側からでも配置できます');
    persistLocal();
  }


  function localEndpoints(type) {
    const def = PARTS[type];
    if (!def) return [];
    return LAYOUT_GRAPH.connectorsForDefinition(def).map(connector => ({
      ...connector,
      x: connector.localX,
      y: connector.localY,
      heading: connector.directionDeg
    }));
  }

  function rotatePoint(point, rotation) {
    const a = rotation * Math.PI / 180;
    return {
      x: point.x * Math.cos(a) - point.y * Math.sin(a),
      y: point.x * Math.sin(a) + point.y * Math.cos(a)
    };
  }

  function startEndpoints(start) {
    const local = localEndpoints('start');
    return local.map((ep, endpointIndex) => {
      const offset = rotatePoint(ep, start.rotation);
      return {
        x: start.x + offset.x,
        y: start.y + offset.y,
        heading: normalizeRotation(ep.heading + start.rotation),
        zMm: (Number(start.zMm) || 0) + (Number(ep.localZMm) || 0), pitchDeg: Number(ep.pitchDeg) || 0,
        bankAngleDeg: Number(ep.bankAngleDeg) || 0, shape: ep.shape, laneCount: ep.laneCount,
        connectorId: ep.id, connectorRole: ep.connectorRole || null, sourceId: 'start', partId: 'start', sourceType: 'start', endpointIndex, label: ep.label,
        connectionState: endpointState()
      };
    });
  }


  function partEndpoints(part) {
    return localEndpoints(part.type).map((ep, endpointIndex) => {
      const world = LAYOUT_GRAPH.worldConnector(part, ep, endpointIndex);
      const storedState = part.endpointStates?.[endpointIndex] || { bankAngle: part.bankAngle || 0, bankSectionId: part.bankSectionId || null };
      return {
        x: world.x,
        y: world.y,
        heading: world.directionDeg,
        zMm: world.zMm, pitchDeg: world.pitchDeg,
        bankAngleDeg: world.bankAngleDeg, shape: ep.shape, laneCount: ep.laneCount,
        connectorId: ep.id, connectorRole: ep.connectorRole || null, sourceId: part.id, partId: part.id,
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

  function allLayoutParts() {
    return [...(state.start ? [{ ...state.start, id: 'start', type: 'start' }] : []), ...state.parts];
  }

  function findLayoutPartById(id) {
    return id === 'start' ? state.start : state.parts.find(part => part.id === id);
  }

  function endpointsForLayoutPart(part) {
    return part?.id === 'start' ? startEndpoints(part) : partEndpoints(part);
  }

  function inferLegacyConnections() {
    const endpoints = getAllEndpoints();
    const edges = [];
    for (let i = 0; i < endpoints.length; i += 1) {
      for (let j = i + 1; j < endpoints.length; j += 1) {
        const a = endpoints[i]; const b = endpoints[j];
        if (a.sourceId === b.sourceId) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 1.75) continue;
        if (angularDistance(a.heading, normalizeRotation(b.heading + 180)) > .1) continue;
        edges.push({ partAId: a.sourceId, connectorAId: a.connectorId, partBId: b.sourceId, connectorBId: b.connectorId, createdOrder: edges.length + 1 });
      }
    }
    return LAYOUT_GRAPH.dedupeEdges(edges);
  }

  function selectedFreeHeightMm() {
    if (state.placementHeightMode === 'auto') return Number(state.lastPlacementHeightMm) || 0;
    if (state.placementHeightMode === 'custom') return Number(state.placementHeightMm) || 0;
    return Number(state.placementHeightMode) || 0;
  }

  function recalculateLayoutWarnings() {
    const parts = allLayoutParts();
    const connectors = getAllEndpoints().map(endpoint => ({ ...endpoint, partId: endpoint.sourceId, directionDeg: endpoint.heading }));
    const duplicate = LAYOUT_GRAPH.duplicateConnectorWarnings(state.connections, connectors);
    const edgeWarnings = LAYOUT_GRAPH.validateEdges(parts, PARTS, state.connections);
    const interference = LAYOUT_GRAPH.interferenceWarnings(parts, PARTS, part => part.id === 'start' ? startBounds(part) : partBounds(part), { edges: state.connections });
    const negative = parts.filter(part => Number(part.zMm) < 0).map(part => ({ type: 'negative-height', partIds: [part.id] }));
    const missingStart = state.start ? [] : [{ type: 'missing-start' }];
    state.layoutWarnings = [...missingStart, ...duplicate, ...edgeWarnings, ...interference, ...negative];
    return state.layoutWarnings;
  }

  function endpointsConnect(a, b) {
    if (!a || !b || a.sourceId === b.sourceId) return false;
    const close = Math.hypot(a.x - b.x, a.y - b.y) <= 1.75;
    const faceToFace = angularDistance(a.heading, normalizeRotation(b.heading + 180)) <= .1;
    const sameHeight = Math.abs((Number(a.zMm) || 0) - (Number(b.zMm) || 0)) <= LAYOUT_GRAPH.Z_EPSILON_MM;
    return close && faceToFace && sameHeight;
  }

  function getOpenConnections() {
    return getAllEndpoints();
  }

  function groupMoveSnapProposal(movingParts, movingIds) {
    if (!state.snapEnabled) return null;
    const movingSet = new Set(movingIds);
    const movingOpen = movingParts.flatMap(part => endpointsForLayoutPart(part));
    const stationaryEndpoints = [];
    if (state.start && !movingSet.has('start')) stationaryEndpoints.push(...startEndpoints(state.start));
    state.parts.forEach(part => {
      if (!movingSet.has(part.id)) stationaryEndpoints.push(...partEndpoints(part));
    });
    const stationaryOpen = stationaryEndpoints;

    let best = null;
    for (const movingEndpoint of movingOpen) {
      for (const stationaryEndpoint of stationaryOpen) {
        const movingPart = movingParts.find(part => part.id === movingEndpoint.sourceId);
        const inheritsBank = movingPart && LAYOUT_GRAPH.connectorsInheritBank(PARTS[movingPart.type]);
        const compatible = LAYOUT_GRAPH.connectorCompatible(
          { ...movingEndpoint, partId: movingEndpoint.sourceId, directionDeg: movingEndpoint.heading, bankAngleDeg: inheritsBank ? (stationaryEndpoint.bankAngleDeg || 0) : (movingEndpoint.bankAngleDeg || 0) },
          { ...stationaryEndpoint, partId: stationaryEndpoint.sourceId, directionDeg: stationaryEndpoint.heading, bankAngleDeg: stationaryEndpoint.bankAngleDeg || 0 }
        );
        if (!compatible || Math.abs((movingEndpoint.zMm || 0) - (stationaryEndpoint.zMm || 0)) > LAYOUT_GRAPH.Z_EPSILON_MM) continue;
        const distance = Math.hypot(
          movingEndpoint.x - stationaryEndpoint.x,
          movingEndpoint.y - stationaryEndpoint.y
        );
        if (!best || distance < best.distance) {
          best = {
            movingEndpoint,
            stationaryEndpoint,
            distance,
            bankAdjustmentDeg: movingPart
              ? LAYOUT_GRAPH.bankAdjustmentForDefinition(PARTS[movingPart.type], movingEndpoint, stationaryEndpoint)
              : 0
          };
        }
      }
    }

    if (!best || best.distance * state.view.scale > LAYOUT_GRAPH.SNAP_RADIUS_PX) return null;
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
    const transitionConnectors = localEndpoints(type).filter(endpoint => endpoint.bankTransitionToDeg != null);
    if (transitionConnectors.length) {
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
    const entryIndex = 0;
    const proposal = {
      type, id: 'ghost', x, y, zMm: selectedFreeHeightMm(), rotation: state.rotation,
      pitchDeg: 0, bankAngleDeg: 0, zOrder: nextZIndex(), routeIndex: entryIndex,
      entryConnectorId: LAYOUT_GRAPH.connectorsForDefinition(PARTS[type])[entryIndex]?.id || 'a'
    };
    proposal.attachedIndex = entryIndex;
    proposal.otherIndex = entryIndex === 0 ? 1 : 0;
    proposal.endpoints = partEndpoints(proposal);
    proposal.entry = proposal.endpoints[proposal.attachedIndex];
    proposal.exit = proposal.endpoints[proposal.otherIndex];
    return proposal;
  }

  function fastPathExitTurnDegrees(type) {
    if (type === FAST_PATH.RIGHT) return 45;
    if (type === FAST_PATH.LEFT) return -45;
    return 0;
  }

  // Build the repeat/select ghost from the active connection only. The real
  // pointer selects its type; it never supplies this proposal's world pose.
  function buildAnchoredFastPathProposal({ anchor, type }) {
    if (!anchor || !PARTS[type]) return null;
    const target = {
      ...anchor,
      partId: anchor.partId || anchor.sourceId,
      connectorId: anchor.connectorId,
      directionDeg: anchor.heading,
      bankAngleDeg: Number(anchor.bankAngleDeg ?? anchor.connectionState?.bankAngle) || 0
    };
    const free = freePlacement(type, anchor.x, anchor.y);
    const rawCandidates = LAYOUT_GRAPH.snapCandidates(free, PARTS, [target], {
      scale: 1,
      radiusPx: Infinity,
      snapEnabled: true,
      edges: state.connections,
      // Measure the solved pose rather than a free ghost so both reversible
      // entries are evaluated at the fixed anchor.
      partForSnapDistanceCandidate: (local, _index, snapTarget, part) => LAYOUT_GRAPH.solveSnapPose(part, local, snapTarget)
    });
    if (!rawCandidates.length) return null;
    const expectedExitHeading = normalizeRotation(anchor.heading + fastPathExitTurnDegrees(type));
    const selected = [...rawCandidates].sort((left, right) => {
      const leftExit = partEndpoints({ ...left.pose, type })[left.localConnectorIndex === 0 ? 1 : 0];
      const rightExit = partEndpoints({ ...right.pose, type })[right.localConnectorIndex === 0 ? 1 : 0];
      return angularDistance(leftExit.heading, expectedExitHeading) - angularDistance(rightExit.heading, expectedExitHeading)
        || left.localConnectorIndex - right.localConnectorIndex;
    })[0];
    const attachedIndex = selected.localConnectorIndex;
    const otherIndex = attachedIndex === 0 ? 1 : 0;
    const bank = connectionStateForPlacement(type, target.connectionState, attachedIndex);
    const candidate = {
      ...free,
      ...selected.pose,
      ...bank,
      routeIndex: attachedIndex,
      entryConnectorId: selected.entryConnectorId
    };
    const endpoints = partEndpoints(candidate);
    return {
      ...candidate,
      endpoints,
      entry: { ...target },
      exit: { ...endpoints[otherIndex] },
      anchor: { ...target },
      attachedIndex,
      otherIndex,
      endpointDistance: 0,
      distancePx: 0,
      snapped: true,
      valid: true,
      requiresHeightChoice: false,
      candidates: [],
      rawCandidates: [],
      selectedTargetKey: LAYOUT_GRAPH.snapTargetKey(selected),
      used: selected.used,
      outOfBounds: !isPartInsideField(candidate),
      edge: { partAId: target.partId, connectorAId: target.connectorId, partBId: 'pending', connectorBId: selected.localConnector.id }
    };
  }

  function getPlacementProposal() {
    if (!PARTS[state.selectedType] || state.selectedType === 'start') return null;
    if (state.fastPath.phase !== FAST_PATH.FREE && state.fastPath.activePlacementAnchor) {
      return buildAnchoredFastPathProposal({
        anchor: state.fastPath.activePlacementAnchor,
        type: state.selectedType
      });
    }
    const free = freePlacement(state.selectedType, state.cursor.x, state.cursor.y);
    const targets = getAllEndpoints().map(endpoint => ({
      ...endpoint, partId: endpoint.sourceId, directionDeg: endpoint.heading,
      bankAngleDeg: Number(endpoint.bankAngleDeg ?? endpoint.connectionState?.bankAngle) || 0
    }));
    const placement = LAYOUT_GRAPH.choosePlacement(free, PARTS, targets, {
      scale: state.view.scale,
      radiusPx: LAYOUT_GRAPH.SNAP_RADIUS_PX,
      snapEnabled: state.snapEnabled,
      freeHeightMm: selectedFreeHeightMm(),
      selectedTargetKey: state.snapTargetChoiceKey,
      partForSnapDistanceCandidate: () => free,
      edges: state.connections
    });
    if (placement.kind === 'free') {
      return { ...free, ...placement.part, snapped: false, valid: true, outOfBounds: !isPartInsideField(placement.part), candidates: [] };
    }
    const chosen = placement.selected;
    const attachedIndex = chosen.localConnectorIndex;
    const otherIndex = attachedIndex === 0 ? 1 : 0;
    const bank = connectionStateForPlacement(state.selectedType, chosen.target.connectionState, attachedIndex);
    const candidate = {
      ...free,
      ...chosen.pose,
      ...bank,
      routeIndex: attachedIndex,
      entryConnectorId: chosen.entryConnectorId
    };
    const endpoints = partEndpoints(candidate);
    return {
      ...candidate,
      endpoints,
      entry: { ...chosen.target }, exit: { ...endpoints[otherIndex] }, anchor: { ...chosen.target },
      attachedIndex, otherIndex, endpointDistance: chosen.distanceWorld, distancePx: chosen.distancePx,
      snapped: true, valid: !placement.requiresHeightChoice || state.snapTargetChoiceConfirmed,
      requiresHeightChoice: placement.requiresHeightChoice, candidates: placement.candidates,
      rawCandidates: placement.rawCandidates, selectedTargetKey: placement.selectedTargetKey,
      used: chosen.used, outOfBounds: !isPartInsideField(candidate),
      edge: { partAId: chosen.target.partId, connectorAId: chosen.target.connectorId, partBId: 'pending', connectorBId: chosen.localConnector.id }
    };
  }


  function partOccupancyPolygon(part) {
    return LAYOUT_GRAPH.occupancyPolygon(part, PARTS[part.type]);
  }

  function partPreciseBounds(part) {
    return LAYOUT_GRAPH.polygonBounds(partOccupancyPolygon(part));
  }

  function isPartInsideField(part) {
    const polygon = partOccupancyPolygon(part);
    const totalArea = LAYOUT_GRAPH.polygonArea(polygon);
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    const fieldPolygon = [
      { x: frame.minX, y: frame.minY }, { x: frame.maxX, y: frame.minY },
      { x: frame.maxX, y: frame.maxY }, { x: frame.minX, y: frame.maxY }
    ];
    const insideArea = LAYOUT_GRAPH.polygonIntersectionArea(polygon, fieldPolygon, LAYOUT_GRAPH.OCCUPANCY_EPSILON_CM);
    return totalArea - insideArea <= LAYOUT_GRAPH.OCCUPANCY_AREA_EPSILON_CM2;
  }

  function isStartInsideField(start = state.start) {
    return !!start && isPartInsideField({ ...start, id: 'start', type: 'start' });
  }

  function outOfBoundsItems() {
    const items = [];
    if (state.start && !isStartInsideField(state.start)) items.push({ id: 'start', type: 'start', polygon: partOccupancyPolygon(state.start), bounds: partPreciseBounds(state.start) });
    state.parts.forEach(part => {
      if (!isPartInsideField(part)) items.push({ id: part.id, type: part.type, polygon: partOccupancyPolygon(part), bounds: partPreciseBounds(part) });
    });
    return items;
  }

  function drawOutOfBoundsMarker(c, item) {
    const polygon = item.polygon || [];
    if (polygon.length < 3) return;
    c.save();
    c.fillStyle = 'rgba(244,142,33,.12)';
    c.strokeStyle = '#f07818';
    c.lineWidth = 3 / state.view.scale;
    c.setLineDash([9 / state.view.scale, 5 / state.view.scale]);
    c.beginPath();
    c.moveTo(polygon[0].x, polygon[0].y);
    polygon.slice(1).forEach(point => c.lineTo(point.x, point.y));
    c.closePath(); c.fill(); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#9a3e00';
    c.font = `700 ${12 / state.view.scale}px sans-serif`;
    c.textBaseline = 'bottom';
    c.fillText('作成範囲外', item.bounds.minX, item.bounds.minY - 5 / state.view.scale);
    c.restore();
  }

  function drawOutOfBoundsWarnings(c) {
    outOfBoundsItems().forEach(item => drawOutOfBoundsMarker(c, item));
  }

  function drawLayoutWarnings(c) {
    const interferedIds = new Set(state.layoutWarnings
      .filter(warning => warning.type === 'interference')
      .flatMap(warning => warning.partIds || []));
    interferedIds.forEach(id => {
      const part = id === 'start' ? state.start : state.parts.find(item => item.id === id);
      if (!part) return;
      drawInterferenceOutline(c, { ...part, type: id === 'start' ? 'start' : part.type });
    });
  }

  function drawInterferenceOutline(c, part) {
    c.save();
    c.translate(part.x, part.y);
    c.rotate(part.rotation * Math.PI / 180);
    if (tracePartShapePath(c, part.type)) {
      c.strokeStyle = '#d52f4d';
      c.lineWidth = 3 / Math.max(state.view.scale, .15);
      c.lineJoin = 'round';
      c.stroke();
    }
    c.restore();
  }

  function normalizeConnection(connection) {
    return {
      x: Number(connection.x) || 0,
      y: Number(connection.y) || 0,
      heading: normalizeRotation(Number(connection.heading) || 0),
      sourceId: String(connection.sourceId || 'manual'),
      sourceType: connection.sourceType || '',
      partId: String(connection.partId || connection.sourceId || 'manual'),
      connectorId: connection.connectorId || null,
      endpointIndex: Number.isFinite(Number(connection.endpointIndex)) ? Number(connection.endpointIndex) : 0,
      connectorRole: connection.connectorRole || null,
      label: connection.label || '',
      zMm: Number(connection.zMm) || 0,
      pitchDeg: Number(connection.pitchDeg) || 0,
      bankAngleDeg: Number(connection.bankAngleDeg) || 0,
      shape: connection.shape || null,
      laneCount: Number(connection.laneCount) || 3,
      connectionState: endpointState(connection.connectionState)
    };
  }

  function setActiveConnection(connection) {
    state.activeConnection = connection ? normalizeConnection(connection) : null;
  }

  function rebuildActiveConnectionFromTail() {
    if (!state.start) {
      setActiveConnection(null);
      return;
    }
    const opens = getOpenConnections();
    const tail = state.parts[state.parts.length - 1];
    const preferred = tail
      ? opens.find(ep => ep.sourceId === tail.id)
      : opens.find(ep => ep.sourceId === 'start' && ep.connectorRole === 'exit');
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
    const color = proposal.outOfBounds ? '#f07818' : (proposal.valid ? '#249b74' : '#de4b5b');
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
      const outside = !startInsideField(candidate);
      c.save();
      c.globalAlpha = .76;
      drawStartLane(c, candidate, false, true);
      c.restore();
      const bounds = startBounds(candidate);
      c.save();
      c.strokeStyle = outside ? '#f07818' : '#249b74';
      c.lineWidth = 2 / state.view.scale;
      c.setLineDash([6 / state.view.scale, 4 / state.view.scale]);
      c.strokeRect(bounds.minX, bounds.minY, bounds.w, bounds.h);
      c.setLineDash([]);
      c.restore();
      drawPointerCrosshair(c, state.cursor.x, state.cursor.y, outside ? '#f07818' : '#249b74');
      return;
    }

    if (state.mode === 'place') {
      const opens = getOpenConnections();
      opens.forEach(ep => drawConnectionPoint(c, ep, '#62b99c'));
      const proposal = currentGhostProposal();
      if (proposal) {
        c.save();
        c.globalAlpha = proposal.snapped ? .72 : .34;
        const ghostPart = renderPartFromProposal(proposal);
        recordCornerDiagnostic('proposal', ghostPart, {
          placementId: proposal.placementId,
          activeProposalId: proposal.placementId,
          proposal: PLACEMENT_PROPOSAL.cloneForCommit(proposal)
        });
        drawPart(c, ghostPart);
        c.restore();
        drawConnectionGuide(c, proposal);
        if (proposal.anchor) drawConnectionPoint(c, proposal.anchor, proposal.outOfBounds ? '#f07818' : (proposal.valid ? '#1f9c71' : '#de4b5b'));
      }
      drawPointerCrosshair(c, state.cursor.x, state.cursor.y, proposal?.outOfBounds ? '#f07818' : (proposal?.valid ? '#249b74' : '#de4b5b'));
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
    const physicalPointer = { x: sx, y: sy };

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
    const fastPathResult = state.mode === 'place'
      ? updateFastPathPointer(physicalPointer)
      : { phase: FAST_PATH.FREE };
    if (fastPathResult.phase === FAST_PATH.FREE) state.cursor = snappedWorld;

    if (state.mode === 'start') {
      state.pointer.pendingPlacement = true;
      updateUI();
      render();
      return;
    }

    if (state.mode === 'place') {
      // repeat/select confirm the proposal currently anchored at the active
      // exit. Free placement alone evaluates the real pointer position.
      const visibleProposal = fastPathResult.phase === FAST_PATH.FREE
        ? cacheGhostProposal(getPlacementProposal())
        : currentGhostProposal();
      updateSnapCandidatePanel(visibleProposal);
      updatePlacementInstruction(visibleProposal);
      state.pointer.pendingPlacement = true;
      state.pointer.pendingPlacementProposal = captureVisiblePlacementProposal('pointerdown');
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
          state.pointer.dragBase = selectedParts().map(p => ({
            id: p.id, x: p.x, y: p.y,
            zMm: Number(p.zMm) || 0,
            pitchDeg: Number(p.pitchDeg) || 0,
            bankAngleDeg: Number(p.bankAngleDeg) || 0
          }));
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

    const physicalPointer = { x: sx, y: sy };
    if (state.mode === 'place') {
      if (state.pointer.pendingPlacement && state.fastPath.phase !== FAST_PATH.FREE) {
        // A click captures the rendered anchored proposal. Do not let a small
        // drag before pointerup replace that captured proposal.
        updateStatusOnly();
        render();
        return;
      }
      const fastPathResult = updateFastPathPointer(physicalPointer);
      if (fastPathResult.phase !== FAST_PATH.FREE) {
        // The anchor remains the placement basis during both repeat and
        // select. Rebuild only when selection changed the part type.
        // Re-cache on every anchored pointermove so the state consumed by the
        // panel and renderer is the same proposal produced by this event.
        const anchoredProposal = refreshFastPathGhostProposal();
        updateSnapCandidatePanel(anchoredProposal);
        updatePlacementInstruction(anchoredProposal);
        updateUI();
        updateStatusOnly();
        render();
        return;
      }
    }

    // A directional fast-path release continues through the ordinary free
    // placement branch below. Hide the presentation-only guide before that
    // branch updates the ghost so it cannot remain visible for one event.
    updateFastPathGuide();
    const nextCursor = { x: snap(world.x), y: snap(world.y) };
    if (nextCursor.x !== state.cursor.x || nextCursor.y !== state.cursor.y) clearSnapTargetChoice();
    state.cursor = nextCursor;
    if (state.mode === 'place') {
      const freeProposal = getPlacementProposal();
      if (tryReactivateFastPathFromSnappedProposal(freeProposal, physicalPointer)) {
        const anchoredProposal = refreshFastPathGhostProposal();
        updateSnapCandidatePanel(anchoredProposal);
        updatePlacementInstruction(anchoredProposal);
        updateUI();
        updateStatusOnly();
        render();
        return;
      }
      updateFastPathTypeForPointer(physicalPointer);
    }

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
        const movingSet = new Set(state.pointer.dragBase.map(base => base.id));
        state.connections = state.connections.filter(edge => {
          const aMoving = movingSet.has(edge.partAId); const bMoving = movingSet.has(edge.partBId);
          return aMoving === bMoving;
        });
      }
      if (state.pointer.dragSnapshotTaken) {
        const movingIds = state.pointer.dragBase.map(base => base.id);
        const proposedParts = state.pointer.dragBase.map(base => {
          const original = findLayoutPartById(base.id);
          return original ? {
            ...original,
            x: base.x + dx,
            y: base.y + dy,
            zMm: base.zMm,
            pitchDeg: base.pitchDeg,
            bankAngleDeg: base.bankAngleDeg
          } : null;
        }).filter(Boolean);
        const snapInfo = groupMoveSnapProposal(proposedParts, movingIds);
        const correctionX = snapInfo?.correctionX || 0;
        const correctionY = snapInfo?.correctionY || 0;
        const bankAdjustmentDeg = snapInfo?.bankAdjustmentDeg || 0;
        state.pointer.groupSnap = snapInfo;

        state.pointer.dragBase.forEach(base => {
          const p = findLayoutPartById(base.id);
          if (!p) return;
          p.x = base.x + dx + correctionX;
          p.y = base.y + dy + correctionY;
          p.zMm = base.zMm;
          p.pitchDeg = base.pitchDeg;
          p.bankAngleDeg = base.bankAngleDeg + bankAdjustmentDeg;
        });
        recalculateBankStates();
        recalculateLayoutWarnings();
        rebuildActiveConnectionFromTail();
      }
    }

    if (state.pointer.marquee && state.pointer.down) state.pointer.marqueeEnd = { ...world };
    if (state.mode === 'place') {
      const liveProposal = getPlacementProposal();
      cacheGhostProposal(liveProposal);
      if (state.pointer.pendingPlacement) state.pointer.pendingPlacementProposal = captureVisiblePlacementProposal('pointermove');
      updateSnapCandidatePanel(liveProposal);
      updatePlacementInstruction(liveProposal);
    }
    updateStatusOnly();
    render();
  }

  function onPointerUp(e) {
    const pendingPlacementProposal = state.pointer.pendingPlacementProposal;
    const pendingPlacement = state.pointer.pendingPlacement;
    // Consume the event before any placement code. Duplicate pointerup/click
    // notifications cannot create a second part.
    state.pointer.pendingPlacement = false;
    state.pointer.pendingPlacementProposal = null;
    if (pendingPlacement) {
      if (state.mode === 'start') {
        const pointerRect = els.courseCanvas.getBoundingClientRect();
        placeStartLane({ physicalPointerPosition: { x: e.clientX - pointerRect.left, y: e.clientY - pointerRect.top } });
      }
      else if (state.mode === 'place') {
        const pointerRect = els.courseCanvas.getBoundingClientRect();
        const physicalPointerPosition = { x: e.clientX - pointerRect.left, y: e.clientY - pointerRect.top };
        placePartAtCursor(pendingPlacementProposal, { source: 'pointerup', reevaluated: false, physicalPointerPosition });
      }
    }
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
      if (state.pointer.groupSnap) {
        const snapInfo = state.pointer.groupSnap;
        state.connections = LAYOUT_GRAPH.addEdge(state.connections, {
          partAId: snapInfo.movingEndpoint.sourceId, connectorAId: snapInfo.movingEndpoint.connectorId,
          partBId: snapInfo.stationaryEndpoint.sourceId, connectorBId: snapInfo.stationaryEndpoint.connectorId,
          createdOrder: state.connections.length + 1
        });
        recalculateBankStates();
      }
      promotePartsToFront(movedIds);
      recalculateLayoutWarnings();
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
    state.pointer.pendingPlacement = false;
    state.pointer.pendingPlacementProposal = null;
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
    state.fastPath.guideVisible = false;
    els.courseCanvas.classList.remove('is-hovering-part');
    updateFastPathGuide();
    render();
  }

  function drawMissingStartWarning(c) {
    if (state.start) return;
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    const unit = Math.max(state.view.scale, .15);
    c.save();
    c.translate(frame.minX + 14 / unit, frame.minY + 16 / unit);
    c.fillStyle = 'rgba(108,29,35,.94)';
    c.strokeStyle = '#ff6f78';
    c.lineWidth = 1.5 / unit;
    c.beginPath(); c.roundRect(0, 0, 285 / unit, 54 / unit, 7 / unit); c.fill(); c.stroke();
    c.fillStyle = '#fff0f1'; c.font = `800 ${13 / unit}px sans-serif`; c.fillText('スタート位置不明！', 12 / unit, 21 / unit);
    c.font = `600 ${10 / unit}px sans-serif`; c.fillText('ストレートを選択し「スタートに変更」で復旧できます。', 12 / unit, 40 / unit);
    c.restore();
  }

  function onPointerCancel(e) {
    // Cancellation is not a click.  Discard its captured proposal so touch
    // cancellation cannot later become a second placement.
    state.pointer.down = false;
    state.pointer.panning = false;
    state.pointer.pendingPlacement = false;
    state.pointer.pendingPlacementProposal = null;
    state.pointer.draggingParts = false;
    state.pointer.dragStart = null;
    state.pointer.dragBase = null;
    state.pointer.dragSnapshotTaken = false;
    state.pointer.groupSnap = null;
    state.pointer.marquee = false;
    state.pointer.marqueeStart = null;
    state.pointer.marqueeEnd = null;
    state.pointer.marqueeAdd = false;
    els.courseCanvas.classList.remove('is-panning', 'is-moving');
    try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    updateUI();
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
      const proposal = state.mode === 'place' ? getPlacementProposal() : null;
      if (proposal?.requiresHeightChoice && proposal.candidates.length > 1) {
        cycleSnapTargetChoice(e.deltaY < 0 ? -1 : 1);
        return;
      }
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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target?.isContentEditable) return;

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

    if ((key === '[' || key === ']') && state.mode === 'place') {
      const proposal = getPlacementProposal();
      if (proposal?.requiresHeightChoice && proposal.candidates.length > 1) {
        e.preventDefault(); cycleSnapTargetChoice(key === '[' ? -1 : 1); return;
      }
    }

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

  function clearSnapTargetChoice() {
    state.snapTargetChoiceKey = null;
    state.snapTargetChoiceConfirmed = false;
  }

  function cycleSnapTargetChoice(delta) {
    const proposal = getPlacementProposal();
    const count = proposal?.candidates?.length || 0;
    if (!count || !proposal.requiresHeightChoice) return;
    const current = proposal.candidates.findIndex(candidate => LAYOUT_GRAPH.snapTargetKey(candidate) === state.snapTargetChoiceKey);
    const next = (Math.max(0, current) + delta + count) % count;
    state.snapTargetChoiceKey = LAYOUT_GRAPH.snapTargetKey(proposal.candidates[next]);
    state.snapTargetChoiceConfirmed = true;
    updateUI(); render();
  }

  function placePartAtCursor(proposalOverride = null, placementMeta = {}) {
    // The pointer path supplies a deep clone of the exact proposal that was
    // rendered. Keyboard/debug placement may capture the currently visible
    // proposal, but confirmation never recomputes snapping here.
    const visibleProposal = proposalOverride || currentGhostProposal();
    const proposal = visibleProposal ? PLACEMENT_PROPOSAL.cloneForCommit(visibleProposal) : null;
    if (!proposal) return toast('配置位置を計算できませんでした');
    if (proposal.requiresHeightChoice && !proposal.valid) return toast('同じ位置に高さ違いの候補があります。右側で高さを選択してください');
    recordCornerDiagnostic('placement-begin', renderPartFromProposal(proposal), {
      placementId: proposal.placementId || null,
      source: placementMeta.source || 'programmatic',
      commitReevaluated: Boolean(placementMeta.reevaluated),
      activeProposalId: state.ghostProposal?.placementId || null,
      pathHash: traceHash(partRenderTrace(renderPartFromProposal(proposal)))
    });
    snapshot();
    const id = makeId();
    let bankSectionId = proposal.bankSectionId;
    let endpointStates = proposal.endpointStates?.map(endpointState);
    if (PARTS[proposal.type]?.bank20 && proposal.bankRole === 'entry') {
      bankSectionId = `bank-${id}`;
      endpointStates = endpointStates.map(value => value.bankAngle === 20 ? endpointState({ ...value, bankSectionId }) : value);
    }
    const part = {
      ...renderPartFromProposal(proposal, id),
      routeIndex: Number.isInteger(proposal.routeIndex) ? proposal.routeIndex : (Number.isInteger(proposal.attachedIndex) ? proposal.attachedIndex : 0),
      entryConnectorId: proposal.entryConnectorId || LAYOUT_GRAPH.connectorsForDefinition(PARTS[proposal.type])[proposal.attachedIndex || 0]?.id || 'a',
      endpointStates,
      bankRole: proposal.bankRole || null,
      zMm: Number(proposal.zMm) || 0,
      pitchDeg: Number(proposal.pitchDeg) || 0,
      bankAngleDeg: Number(proposal.bankAngleDeg ?? proposal.bankAngle) || 0,
      bankAngle: proposal.bankAngle || 0,
      bankSectionId: bankSectionId || null,
      zOrder: nextZIndex(),
      zIndex: nextZIndex()
    };
    if (isCornerType(part.type)) {
      recordCornerDiagnostic('placed', part, {
        placementId: proposal.placementId || null,
        partId: id,
        proposal: PLACEMENT_PROPOSAL.cloneForCommit(proposal),
        pathHash: traceHash(partRenderTrace(part))
      });
    }
    state.parts.push(part);
    state.placementCommitCount += 1;
    if (proposal.snapped && proposal.edge) {
      state.connections = LAYOUT_GRAPH.addEdge(state.connections, { ...proposal.edge, partBId: id, createdOrder: state.connections.length + 1 });
    }
    const ends = partEndpoints(part);
    const entryConnectorId = proposal.entryConnectorId;
    const connectedEntry = ends.find(endpoint => endpoint.connectorId === entryConnectorId)
      || ends[Number.isInteger(proposal.attachedIndex) ? proposal.attachedIndex : 0];
    // Connector IDs, not array order or the pre-placement rotation, identify
    // the next anchor.  This preserves the actual outward heading of either
    // concrete corner type after every confirmed placement.
    const newOpen = ends.find(endpoint => endpoint.connectorId !== connectedEntry?.connectorId)
      || ends[Number.isInteger(proposal.otherIndex) ? proposal.otherIndex : 1]
      || ends[0];
    setActiveConnection({ ...newOpen, sourceId: id });
    if (isCornerType(part.type)) state.activeCornerVariant = CORNER_VARIANT.variantForType(part.type);
    if (isFastPathType(part.type)) {
      // Advance only the in-app placement basis. The operating system pointer
      // is never moved; an untouched repeat click commits this visible ghost.
      activateFastPathPlacement(newOpen, part.type, placementMeta.physicalPointerPosition || state.fastPath.physicalPointerCurrent);
    } else {
      resetFastPathSession();
    }
    state.rotation = normalizeRotation(newOpen.heading);
    state.selectedIds = [];
    state.lastPlacementHeightMm = part.zMm;
    clearSnapTargetChoice();
    recalculateBankStates();
    recalculateLayoutWarnings();
    // The next ghost must be a fresh proposal. It cannot share objects with
    // the part just committed from the captured proposal above.
    refreshFastPathGhostProposal();
    rebaseFastPathSelectionPointer();
    toast(proposal.snapped
      ? `${partDisplayName(part)}を${proposal.used ? '使用済み' : ''}接続点へ配置しました${proposal.outOfBounds ? '（作成範囲外）' : ''}`
      : `${partDisplayName(part)}を自由配置しました${proposal.outOfBounds ? '（作成範囲外）' : ''}`);
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
      partEndpoints(part).forEach(endpoint => {
        raw.push({
          x: endpoint.x, y: endpoint.y, heading: endpoint.heading,
          sourceId: part.id, sourceType: part.type, endpointIndex: endpoint.endpointIndex
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
      if (PARTS[part.type]?.bank20 && !part.bankRole) state.bankWarnings.push('接続されていない20度バンクアプローチがあります');
    });
  }

  function rewindLastPart() {
    if (state.layoutMove.active) return;
    if (!state.parts.length) return toast('スタート位置まで戻っています');
    snapshot();
    const removed = state.parts.pop();
    const removedEntryConnectorId = removed.entryConnectorId
      || LAYOUT_GRAPH.connectorsForDefinition(PARTS[removed.type])[Number(removed.routeIndex) || 0]?.id
      || null;
    // A part can have more than one edge.  R must return to the edge through
    // which the removed part was entered, not whichever edge happens to be
    // first in the array.
    const removedEdge = state.connections.find(edge => (
      edge.partAId === removed.id && edge.connectorAId === removedEntryConnectorId
    ) || (
      edge.partBId === removed.id && edge.connectorBId === removedEntryConnectorId
    )) || state.connections.find(edge => edge.partAId === removed.id || edge.partBId === removed.id) || null;
    state.connections = LAYOUT_GRAPH.removeEdgesForParts(state.connections, [removed.id]);
    state.selectedIds = state.selectedIds.filter(id => id !== removed.id);
    recalculateBankStates();
    recalculateLayoutWarnings();
    const predecessor = removedEdge
      ? getAllEndpoints().find(endpoint => endpoint.sourceId === (removedEdge.partAId === removed.id ? removedEdge.partBId : removedEdge.partAId)
        && endpoint.connectorId === (removedEdge.partAId === removed.id ? removedEdge.connectorBId : removedEdge.connectorAId))
      : null;
    if (predecessor) setActiveConnection(predecessor);
    else rebuildActiveConnectionFromTail();
    if (state.activeConnection) {
      state.cursor = { x: state.activeConnection.x, y: state.activeConnection.y };
      state.rotation = state.activeConnection.heading;
    }
    state.mode = 'place';
    if (isFastPathType(removed.type) && state.activeConnection) {
      state.selectedType = removed.type;
      if (isCornerType(removed.type)) state.activeCornerVariant = CORNER_VARIANT.variantForType(removed.type);
      const pointerScreen = state.fastPath.physicalPointerCurrent
        || worldToScreen(state.pointer.x, state.pointer.y);
      activateFastPathPlacement(state.activeConnection, removed.type, pointerScreen);
    } else {
      resetFastPathSession();
      state.selectedType = removed.type;
    }
    // R must create a new visible proposal synchronously; waiting for a
    // pointermove here leaves the restored fast-path ghost invisible.
    refreshFastPathGhostProposal();
    rebaseFastPathSelectionPointer();
    toast(`${PARTS[removed.type].name}を1つ戻しました`);
    persistLocal(); updateUI(); render();
  }

  function deleteParts(ids) {
    const unique = [...new Set(ids)].filter(id => id === 'start' ? !!state.start : state.parts.some(p => p.id === id));
    if (!unique.length) return toast('削除するパーツが選択されていません');
    snapshot();
    const count = unique.length;
    const deletesStart = unique.includes('start');
    state.parts = state.parts.filter(p => !unique.includes(p.id));
    if (deletesStart) state.start = null;
    state.connections = LAYOUT_GRAPH.removeEdgesForParts(state.connections, unique);
    state.selectedIds = state.selectedIds.filter(id => !unique.includes(id));
    recalculateBankStates();
    recalculateLayoutWarnings();
    rebuildActiveConnectionFromTail();
    if (state.activeConnection) state.rotation = state.activeConnection.heading;
    if (deletesStart) {
      resetFastPathSession();
      state.mode = 'place';
      state.selectedType = 'straight';
      toast('スタートパーツを削除しました。開始位置が未設定です');
    } else toast(`${count}個のパーツを削除しました`);
    persistLocal(); updateUI(); render();
  }

  function cyclePartsColor(ids) {
    const unique = [...new Set(ids)].filter(id => id === 'start' ? !!state.start : state.parts.some(p => p.id === id));
    if (!unique.length) return toast('カラー変更するパーツを選択してください');
    snapshot();
    unique.forEach(id => {
      const p = findLayoutPartById(id);
      const currentIndex = Math.max(0, COLORS.findIndex(c => c.key === (p.colorKey || 'default')));
      p.colorKey = COLORS[(currentIndex + 1) % COLORS.length].key;
    });
    const first = findLayoutPartById(unique[0]);
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
    state.connections = LAYOUT_GRAPH.removeEdgesForParts(state.connections, parts.map(part => part.id));
    recalculateBankStates();
    recalculateLayoutWarnings();
    rebuildActiveConnectionFromTail();
    toast(`${parts.length}個のパーツを${delta < 0 ? '左' : '右'}へ回転しました`);
    persistLocal(); updateUI(); render();
  }

  function isSelected(id) { return state.selectedIds.includes(id); }
  function selectedParts() { return state.selectedIds.map(findLayoutPartById).filter(Boolean); }

  function setSelection(ids) {
    state.selectedIds = [...new Set(ids)].filter(id => id === 'start' ? !!state.start : state.parts.some(p => p.id === id));
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
    state.pointer.pendingPlacement = false;
    state.pointer.pendingPlacementProposal = null;
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
      connections: state.connections.map(edge => ({ ...edge })),
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
    const overflowCount = outOfBoundsItems().length;
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
    toast(overflowCount ? `範囲外${overflowCount}パーツを含む位置で固定しました` : 'レイアウト全体の位置を固定しました');
  }

  function cancelManualLayoutMove() {
    if (!state.layoutMove.active) return;
    const base = state.layoutMove.base;
    const previousMode = state.layoutMove.previousMode;
    if (base) {
      state.parts = base.parts.map(p => ({ ...p }));
      state.start = base.start ? { ...base.start } : null;
      state.connections = (base.connections || []).map(edge => ({ ...edge }));
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
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    const dx = frame.minX - box.minX;
    const dy = frame.minY - box.minY;
    if (Math.abs(dx) < .001 && Math.abs(dy) < .001) return toast('すでに左上へ揃っています');
    snapshot();
    translateWholeLayout(dx, dy);
    persistLocal(); updateUI(); render();
    toast('レイアウト外形の左上を作成範囲の左上へ揃えました');
  }

  function autoFitFieldToLayout(options = {}) {
    if (!state.parts.length && !state.start) {
      if (!options.silent) toast('自動フィットするレイアウトがありません');
      return false;
    }
    const box = layoutBounds();
    const nextField = FIELD_BOUNDARY.fitFieldToBounds(state.field, box, {
      marginCm: Math.max(state.field.gridCm, 10),
      minSizeCm: 100
    });
    if (FIELD_BOUNDARY.sameField(state.field, nextField)) {
      if (!options.silent) toast('作成範囲はすでにレイアウトへフィットしています');
      return true;
    }
    snapshot();
    state.field = nextField;
    persistLocal();
    fitView();
    updateUI();
    render();
    if (!options.silent) toast('パーツを動かさず、作成範囲を自動フィットしました');
    return true;
  }

  function translateWholeLayout(dx, dy) {
    state.parts.forEach(p => { p.x += dx; p.y += dy; });
    if (state.start) { state.start.x += dx; state.start.y += dy; }
    if (state.activeConnection) { state.activeConnection.x += dx; state.activeConnection.y += dy; }
    state.cursor.x += dx;
    state.cursor.y += dy;
  }

  function layoutIsInsideField() {
    return FIELD_BOUNDARY.containsBounds(state.field, layoutBounds(), .001);
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
    c.fillText(valid ? 'クリックで固定' : '範囲外のまま固定できます', box.minX, box.minY - 6 / state.view.scale);
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
    const frame = FIELD_BOUNDARY.fieldBounds(state.field);
    state.parts.forEach(p => {
      const b = partBounds(p);
      p.x += b.minX < frame.minX ? frame.minX - b.minX : b.maxX > frame.maxX ? frame.maxX - b.maxX : 0;
      p.y += b.minY < frame.minY ? frame.minY - b.minY : b.maxY > frame.maxY ? frame.maxY - b.maxY : 0;
    });
    if (state.start) {
      const b = startBounds(state.start);
      state.start.x += b.minX < frame.minX ? frame.minX - b.minX : b.maxX > frame.maxX ? frame.maxX - b.maxX : 0;
      state.start.y += b.minY < frame.minY ? frame.minY - b.minY : b.maxY > frame.maxY ? frame.maxY - b.maxY : 0;
    }
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
  }

  function pointInCorner45Local(x, y, type, tolerance = 0) {
    const def = PARTS[type];
    if (def?.geometry?.pathOrientation === 'left') y = -y;
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
    if (isCornerType(part.type)) return pointInCorner45Local(local.x, local.y, part.type, 0.8 / Math.max(state.view.scale, .25));
    if (part.type === 'burning') {
      const geometry = burningGeometry(PARTS.burning);
      return BURNING_CHANGER_VISUAL.containsPoint(
        local,
        geometry,
        0.8 / Math.max(state.view.scale, .25)
      );
    }
    const b = localPartBounds(part.type);
    return local.x >= b.minX && local.x <= b.maxX && local.y >= b.minY && local.y <= b.maxY;
  }

  function corner45PolygonWorld(part, samples = 40) {
    return PART_RENDER_POSE.tracePartPath(PARTS[part.type], part, samples);
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
    if (state.start && pointInPartShape(x, y, state.start)) return state.start;
    return null;
  }


  function partsInRect(rect) {
    const matches = state.parts.filter(p => {
      if (isCornerType(p.type)) return polygonIntersectsRect(corner45PolygonWorld(p), rect);
      const b = partBounds(p);
      return b.maxX >= rect.minX && b.minX <= rect.maxX && b.maxY >= rect.minY && b.minY <= rect.maxY;
    });
    if (state.start && polygonIntersectsRect(LAYOUT_GRAPH.occupancyPolygon(state.start, PARTS.start), rect)) matches.push(state.start);
    return matches;
  }

  function canConvertStraightToStart(part) {
    return !state.start && !!part && part.id !== 'start' && part.type === 'straight';
  }

  function closeCanvasContextMenu() {
    if (!els.canvasContextMenu) return;
    els.canvasContextMenu.hidden = true;
    els.canvasContextMenu.dataset.partId = '';
  }

  function convertStraightToStart(partId) {
    const straight = state.parts.find(part => part.id === partId);
    if (!canConvertStraightToStart(straight)) return toast(state.start ? 'スタートパーツはすでに設定されています' : 'ストレートだけをスタートに変更できます');
    snapshot();
    state.parts = state.parts.filter(part => part.id !== straight.id);
    state.start = { ...straight, id: 'start', type: 'start', zOrder: 0, zIndex: 0 };
    state.connections = state.connections.map(edge => ({
      ...edge,
      partAId: edge.partAId === straight.id ? 'start' : edge.partAId,
      partBId: edge.partBId === straight.id ? 'start' : edge.partBId
    }));
    state.selectedIds = ['start'];
    state.mode = 'place';
    recalculateBankStates();
    rebuildActiveConnectionFromTail();
    if (!state.activeConnection) {
      const forwardExit = startEndpoints(state.start).find(endpoint => endpoint.connectorRole === 'exit');
      if (forwardExit) setActiveConnection(forwardExit);
    }
    state.ghostProposal = null;
    state.ghostProposalKey = null;
    closeCanvasContextMenu();
    recalculateLayoutWarnings();
    toast('ストレートをスタートに変更しました');
    persistLocal(); updateUI(); render();
  }

  function onCanvasContextMenu(event) {
    const rect = els.courseCanvas.getBoundingClientRect();
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const target = hitTest(world.x, world.y);
    if (!canConvertStraightToStart(target)) {
      closeCanvasContextMenu();
      return;
    }
    event.preventDefault();
    state.pointer.panning = false;
    els.courseCanvas.classList.remove('is-panning');
    els.canvasContextMenu.style.left = `${event.clientX}px`;
    els.canvasContextMenu.style.top = `${event.clientY}px`;
    els.canvasContextMenu.dataset.partId = target.id;
    els.canvasContextMenu.hidden = false;
    const convert = els.canvasContextMenu.querySelector('[data-action="convert-start"]');
    const cancel = els.canvasContextMenu.querySelector('[data-action="cancel-context"]');
    convert.onclick = () => convertStraightToStart(target.id);
    cancel.onclick = closeCanvasContextMenu;
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
    const local = { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
    return local;
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
      button.classList.toggle('active', button.dataset.part === state.selectedType || (isCornerType(button.dataset.part) && isCornerType(state.selectedType)) || (state.mode === 'start' && isStart));
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
    const dynamicPartName = PARTS[state.selectedType]?.bank20 && selectedProposal?.bankRole
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
    els.statusConnection.textContent = state.start ? `${openConnections.length}口 / ${state.connections.length}接続` : '未設定';
    els.fieldWidthText.textContent = `${(state.field.widthCm / 100).toFixed(2)} m`;
    els.fieldHeightText.textContent = `${(state.field.heightCm / 100).toFixed(2)} m`;
    els.gridText.textContent = `${state.field.gridCm} cm`;
    if (els.fieldOriginText) els.fieldOriginText.textContent = `${(state.field.originX / 100).toFixed(2)} / ${(state.field.originY / 100).toFixed(2)} m`;
    const outside = outOfBoundsItems();
    if (els.fieldOverflowText) els.fieldOverflowText.textContent = outside.length ? `作成範囲外：${outside.length}パーツ` : 'すべて作成範囲内';
    if (els.fieldOverflowNotice) els.fieldOverflowNotice.classList.toggle('has-overflow', !!outside.length);
    if (els.statusOverflow) els.statusOverflow.textContent = String(outside.length);
    els.startText.textContent = state.start ? `${(state.start.x / 100).toFixed(2)} / ${(state.start.y / 100).toFixed(2)}m・${state.start.rotation}°` : '未設定';
    els.connectionText.textContent = state.start ? `${openConnections.length}口（使用済みも追加吸着可）` : '未設定';
    if (els.bankStateText) {
      const proposalBank = proposal?.anchor?.connectionState?.bankAngle || 0;
      els.bankStateText.textContent = state.bankWarnings.length ? `警告 ${state.bankWarnings.length}件` : (proposalBank === 20 ? '20度区間' : '通常');
    }

    recalculateLayoutWarnings();
    if (els.statusWarnings) els.statusWarnings.textContent = String(state.layoutWarnings.length);
    if (els.layoutWarningSummary) {
      const counts = state.layoutWarnings.reduce((result, warning) => { result[warning.type] = (result[warning.type] || 0) + 1; return result; }, {});
      const labels = { interference: '干渉の可能性', 'duplicate-connector': '接続口重複', 'height-mismatch': '高さが閉合していません', 'disconnected-edge': '接続ずれ', 'negative-height': '負の高さ', 'missing-connector': '不正接続', 'missing-start': 'スタート位置不明' };
      els.layoutWarningSummary.classList.toggle('has-warning', !!state.layoutWarnings.length);
      els.layoutWarningSummary.textContent = state.layoutWarnings.length
        ? Object.entries(counts).map(([type, count]) => `${labels[type] || type} ${count}件`).join(' / ')
        : '警告なし';
    }
    if (els.snapToggleBtn) {
      const view = SNAP_TOGGLE.view({ enabled: state.snapEnabled });
      els.snapToggleBtn.textContent = view.label;
      els.snapToggleBtn.classList.toggle('active', view.active);
      els.snapToggleBtn.setAttribute('aria-pressed', String(state.snapEnabled));
    }
    if (els.cornerDirectionControl && els.cornerDirectionToggleBtn) {
      const visible = state.mode === 'place' && isCornerType();
      els.cornerDirectionControl.hidden = !visible;
      if (visible) {
        const isLeft = state.activeCornerVariant === 'left';
        els.cornerDirectionToggleBtn.textContent = `コーナー方向: ${isLeft ? '左' : '右'}`;
        els.cornerDirectionToggleBtn.setAttribute('aria-pressed', String(isLeft));
      }
    }
    if (els.fastPathNextPart) {
      const visible = state.mode === 'place' && isFastPathType();
      els.fastPathNextPart.hidden = !visible;
      if (visible) els.fastPathNextPart.textContent = `次のパーツ: ${fastPathTypeLabel(state.selectedType)}`;
    }
    if (els.placementHeightSelect) els.placementHeightSelect.value = state.placementHeightMode;
    if (els.placementHeightCustom) {
      els.placementHeightCustom.hidden = state.placementHeightMode !== 'custom';
      if (document.activeElement !== els.placementHeightCustom) els.placementHeightCustom.value = String(state.placementHeightMm);
    }
    updateFastPathGuide();
    updateSnapCandidatePanel(proposal);

    const showInstruction = state.layoutMove.active || state.mode === 'start' || state.mode === 'place' || ['move','delete','color'].includes(state.mode);
    els.instruction.classList.toggle('hidden', !showInstruction);
    if (state.layoutMove.active) {
      els.instruction.innerHTML = '<strong>レイアウト全体を移動中</strong><span>マウスで移動 → クリックで固定・Esc／右クリックで取消</span>';
    } else if (state.mode === 'start') {
      els.instruction.innerHTML = '<strong>スタートレーンを配置</strong><span>マウスで位置移動・Z/Xまたはホイールで回転 → クリックで配置</span>';
    } else if (state.mode === 'place') {
      updatePlacementInstruction(proposal);
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
      const selectedOutside = selectedParts().filter(part => !isPartInsideField(part)).length;
      const firstSelected = selectedParts()[0];
      const endpointHeights = firstSelected ? endpointsForLayoutPart(firstSelected).map(endpoint => `${endpoint.label}:${endpoint.zMm}mm`).join(' / ') : '';
      els.selectionInfo.innerHTML = `<strong>${state.selectedIds.length}個選択</strong><br>${Object.entries(names).map(([name, n]) => `${name} ${n}`).join(' / ')}${firstSelected ? `<br>基準高さ ${firstSelected.zMm || 0}mm（${((firstSelected.zMm || 0) / 115).toFixed(2)}段）<br>${endpointHeights}<br>pitch ${firstSelected.pitchDeg || 0}° / bank ${firstSelected.bankAngleDeg || 0}° / zOrder ${firstSelected.zOrder ?? firstSelected.zIndex}` : ''}${selectedOutside ? `<br><span class="selection-overflow">作成範囲外 ${selectedOutside}個</span>` : ''}`;
    } else {
      els.selectionInfo.className = 'selection-info empty-summary';
      els.selectionInfo.textContent = '選択なし';
    }
    if (els.convertStartBtn) {
      const target = state.selectedIds.length === 1 ? findLayoutPartById(state.selectedIds[0]) : null;
      els.convertStartBtn.hidden = !canConvertStraightToStart(target);
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

  function updateFastPathGuide() {
    const guide = els.fastPathGuide;
    if (!guide) return;
    const fast = state.fastPath;
    const anchor = fast.activePlacementAnchor;
    const visible = state.mode === 'place'
      && fast.phase !== FAST_PATH.FREE
      && !!anchor
      && !!fast.guideVisible
      && isFastPathType(state.selectedType);
    guide.hidden = !visible;
    if (!visible) return;
    const point = worldToScreen(anchor.x, anchor.y);
    const heading = normalizeRotation(Number.isFinite(fast.selectionFrameHeading)
      ? fast.selectionFrameHeading
      : anchor.heading || 0);
    guide.style.transform = `translate(${point.x}px, ${point.y}px) rotate(${heading}deg)`;
    guide.dataset.type = state.selectedType;
    const label = state.selectedType === FAST_PATH.RIGHT ? 'RIGHT'
      : state.selectedType === FAST_PATH.LEFT ? 'LEFT' : 'STRAIGHT';
    guide.querySelector('[data-fast-path-guide-label]').textContent = label;
  }

  function updateSnapCandidatePanel(proposal) {
    if (!els.snapCandidatePanel) return;
    const candidates = proposal?.candidates || [];
    // This panel is reserved for explicit height choices.  A corner's A/B
    // entrance is deliberately absent: its nearest compatible end is selected
    // automatically by the placement proposal on every cursor update.
    const showHeightChoices = Boolean(proposal?.requiresHeightChoice) && candidates.length > 1;
    els.snapCandidatePanel.hidden = !showHeightChoices;
    els.snapCandidatePanel.innerHTML = !showHeightChoices ? '' : candidates.map(candidate => {
      const level = candidate.target.zMm / LAYOUT_GRAPH.LEVEL_HEIGHT_MM;
      const name = candidate.target.partId === 'start' ? START_DEF.name : partDisplayName(state.parts.find(part => part.id === candidate.target.partId));
      const targetKey = LAYOUT_GRAPH.snapTargetKey(candidate);
      const active = targetKey === proposal.selectedTargetKey;
      return `<button class="snap-candidate-button${active ? ' active' : ''}" type="button" data-snap-target-key="${targetKey}">${Number.isInteger(level) ? `${level}段` : `${level.toFixed(2)}段`}（${candidate.target.zMm}mm） ${name}／${candidate.target.label || candidate.target.connectorId}${candidate.used ? '・使用済み' : '・空き'}</button>`;
    }).join('');
    els.snapCandidatePanel.querySelectorAll('[data-snap-target-key]').forEach(button => button.addEventListener('click', () => {
      state.snapTargetChoiceKey = button.dataset.snapTargetKey || null;
      state.snapTargetChoiceConfirmed = true;
      updateUI(); render();
    }));
  }

  function updatePlacementInstruction(proposal) {
    els.instruction.innerHTML = `<strong>${proposal?.snapped ? (proposal.used ? '使用済み接続口へ追加吸着' : '接続口へ吸着') : '自由配置'}</strong><span>24px以内で吸着・離れた場所は自由配置・Z/Xで45°回転${proposal ? `・高さ ${proposal.zMm || 0}mm` : ''}</span>`;
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

  if (window.__COURSE_ENABLE_DEBUG__ || /test-index\.html$/.test(window.location.pathname)) {
    window.__mini4wdCourseDebug = {
      getState: () => JSON.parse(JSON.stringify(serializeState())),
      getRuntimeState: () => {
        const proposal = state.mode === 'place' ? currentGhostProposal() : null;
        return {
        mode: state.mode,
        selectedIds: [...state.selectedIds],
        historyLength: state.history.length,
        futureLength: state.future.length,
        activeConnection: state.activeConnection ? { ...state.activeConnection } : null,
        proposal,
        openConnections: getOpenConnections(),
        view: { ...state.view },
        cursor: { ...state.cursor },
        assetsReady: state.assetsReady,
        bankWarnings: [...state.bankWarnings],
        layoutWarnings: JSON.parse(JSON.stringify(state.layoutWarnings)),
        connections: JSON.parse(JSON.stringify(state.connections)),
        snapEnabled: state.snapEnabled,
        activeCornerVariant: state.activeCornerVariant,
        fastPath: JSON.parse(JSON.stringify(state.fastPath)),
        ghostPartType: proposal?.type || null,
        entryConnectorId: proposal?.entryConnectorId || null,
        targetTangent: proposal?.targetTangent ?? null,
        candidateRotation: proposal?.candidateRotation ?? null,
        appliedRotation: proposal?.rotation ?? null,
        renderedPartDefinitionId: proposal?.type || null,
        activePlacementProposalId: proposal?.placementId || null,
        pendingPlacementProposalId: state.pointer.pendingPlacementProposal?.placementId || null,
        placementCommitCount: state.placementCommitCount,
        placementHeightMode: state.placementHeightMode,
        placementHeightMm: state.placementHeightMm,
        cornerDiagnostics: JSON.parse(JSON.stringify(state.cornerDiagnostics)),
        ghostTrace: state.ghostProposal ? partRenderTrace(renderPartFromProposal(state.ghostProposal)) : null,
        seamCount: PART_SEAMS.findConnectedSeams(getAllEndpoints(), endpointsConnect).length,
        layers: partsByLayer().map(part => ({ id: part.id, type: part.type, zIndex: part.zIndex }))
        };
      },
      loadState: data => applySerialized(data, false),
      setMode,
      rewindLastPart,
      deleteParts,
      convertStraightToStart,
      rotateCurrent,
      autoAlignLayoutTopLeft,
      autoFitFieldToLayout,
      getOutOfBoundsItems: () => JSON.parse(JSON.stringify(outOfBoundsItems())),
      getFieldBounds: () => FIELD_BOUNDARY.fieldBounds(state.field),
      getLayoutBounds: () => ({ ...layoutBounds() }),
      selectPartType,
      placePartAtCursor,
      getOpenConnections: () => JSON.parse(JSON.stringify(getOpenConnections())),
      getPlacementProposal: () => JSON.parse(JSON.stringify(getPlacementProposal())),
      setCursor: (x, y) => { state.cursor = { x:Number(x), y:Number(y) }; updateUI(); render(); },
      getFastPathState: () => JSON.parse(JSON.stringify(state.fastPath)),
      setSnapEnabled: value => { state.snapEnabled = !!value; updateUI(); render(); },
      setCornerVariant: value => setActiveCornerVariant(value),
      getCornerVariantSession: () => ({ activeCornerVariant: state.activeCornerVariant, selectedType: state.selectedType }),
      setPlacementHeight: value => { state.placementHeightMode = 'custom'; state.placementHeightMm = Number(value) || 0; updateUI(); render(); },
      selectSnapCandidate: index => {
        const proposal = getPlacementProposal();
        const candidate = proposal?.candidates?.[Math.max(0, Number(index) || 0)];
        if (candidate && proposal?.requiresHeightChoice) {
          state.snapTargetChoiceKey = LAYOUT_GRAPH.snapTargetKey(candidate);
          state.snapTargetChoiceConfirmed = true;
        }
        updateUI(); render();
      },
      getLayoutWarnings: () => JSON.parse(JSON.stringify(recalculateLayoutWarnings())),
      setRotation: value => { state.rotation = normalizeRotation(Number(value)); updateUI(); render(); },
      setSelectedIds: ids => {
        const available = new Set(state.parts.map(part => part.id));
        if (state.start) available.add('start');
        state.selectedIds = Array.isArray(ids) ? ids.filter(id => available.has(id)) : [];
        updateUI();
        render();
      },
      renderExportDataUrl: scale => createExportCanvas(Number(scale)).toDataURL('image/png'),
      resolvePartPose,
      tracePartGeometry: part => JSON.parse(JSON.stringify(partRenderTrace(part))),
      renderPartDataUrl: (type, bankRole = 'entry', scale = 1) => {
        const def = PARTS[type];
        if (!def?.visual) return null;
        const renderScale = Math.max(1, Math.min(8, Math.round(Number(scale) || 1)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(def.visual.canvasWidth * renderScale);
        canvas.height = Math.round(def.visual.canvasHeight * renderScale);
        const c = canvas.getContext('2d');
        c.scale(renderScale, renderScale);
        c.translate(def.visual.originX, def.visual.originY);
        if (type === 'start') drawStartLane(c, { x:0, y:0, rotation:0 }, true, true);
        else drawPart(c, { id:'qa', type, x:0, y:0, rotation:0, colorKey:'default', bankRole }, { exportMode:true });
        return canvas.toDataURL('image/png');
      }
    };
  }

  init();
})();
