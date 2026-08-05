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
  const ROOM_BOUNDARY = window.M4WD_ROOM_BOUNDARY;
  if (!ROOM_BOUNDARY) throw new Error('room-boundary.jsが読み込まれていません');
  const RENDER_SCHEDULER = window.M4WD_RENDER_SCHEDULER;
  if (!RENDER_SCHEDULER) throw new Error('render-scheduler.jsが読み込まれていません');
  const WHEEL_ROTATION = window.M4WD_WHEEL_ROTATION;
  if (!WHEEL_ROTATION) throw new Error('wheel-rotation.jsが読み込まれていません');
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
  const NEW_LAYOUT_TABS = window.M4WD_NEW_LAYOUT_TABS;
  if (!NEW_LAYOUT_TABS) throw new Error('new-layout-tabs.jsが読み込まれていません');
  const INITIAL_LAYOUT_FLOW = window.M4WD_INITIAL_LAYOUT_FLOW;
  if (!INITIAL_LAYOUT_FLOW) throw new Error('initial-layout-flow.jsが読み込まれていません');
  const OBSTACLE_GEOMETRY = window.M4WD_OBSTACLE_GEOMETRY;
  if (!OBSTACLE_GEOMETRY) throw new Error('obstacle-geometry.jsが読み込まれていません');
  const OBSTACLE_COURSE_WARNINGS = window.M4WD_OBSTACLE_COURSE_WARNINGS;
  if (!OBSTACLE_COURSE_WARNINGS) throw new Error('obstacle-course-warnings.jsが読み込まれていません');
  const INTERFERENCE_OBSTACLES = window.M4WD_INTERFERENCE_OBSTACLES;
  if (!INTERFERENCE_OBSTACLES) throw new Error('interference-obstacles.jsが読み込まれていません');
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
    start: 'スタート', place: 'パーツ配置', move: 'パーツ移動', delete: 'パーツ削除', color: 'カラー変更', boundary: '設置範囲設定', cutout: '部屋形状作成', layoutMove: '全体移動'
  };

  const els = {};
  const state = {
    field: { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    siteBoundary: ROOM_BOUNDARY.defaultSiteBoundary({ originX: 0, originY: 0, widthCm: 600, heightCm: 400 }),
    roomCutouts: [],
    obstacles: [],
    selectedObstacleId: null,
    obstaclePlacement: null,
    obstacleDrag: null,
    dragTrash: { active: false, over: false, kind: null },
    subEditMode: null,
    cad: { selectedCutoutId: null, tool: 'create', dragStartMm: null, dragCurrentMm: null, drag: null, snap: null },
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
      x: 0, y: 0, down: false,
      draggingParts: false, dragStart: null,
      dragBase: null, dragSnapshotTaken: false,
      marquee: false, marqueeStart: null, marqueeEnd: null, marqueeAdd: false,
      groupSnap: null, pendingPlacement: false, pendingPlacementProposal: null, pendingObstaclePlacement: false
    },
    layoutMove: { active: false, anchor: null, base: null, previousMode: 'place', pointer: null },
    wizard: { active: false, step: 'layout-space', isNew: false, baseline: null, adjustRoomShape: false, configureObstacles: false },
    history: [],
    future: [],
    setupStarted: false,
    newLayoutModalTab: NEW_LAYOUT_TABS.DEFAULT_TAB,
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
  let renderScheduler;
  let wheelRotation;
  let toastTimer = 0;
  let layoutStore;
  const roomCornerCache = new Map();

  function migrateLayoutCornerTypes(layout) {
    if (!layout || typeof layout !== 'object') return layout;
    const migrated = {
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
    return {
      ...migrated,
      siteBoundary: ROOM_BOUNDARY.normalizeSiteBoundary(migrated.siteBoundary || ROOM_BOUNDARY.defaultSiteBoundary(migrated.field || {})),
      roomCutouts: ROOM_BOUNDARY.normalizeRoomCutouts(migrated.roomCutouts || [])
    };
  }

  function cacheElements() {
    const ids = [
      'courseCanvas','canvasWrap','setupDialog','setupForm','fieldWidthInput','fieldHeightInput','gridInput',
      'newBtn','saveBtn','loadInput','exportBtn','cancelSetupBtn','instruction','toast','partsList','partsSummary',
      'layoutSpacePanel','spaceAdjustmentPanel','interferencePanel','spaceAdjustmentGuide','backToLayoutSpaceBtn','startSpaceAdjustmentBtn','configureObstaclesInput','adjustRoomShapeInput',
      'newObstacleNameInput','newObstacleWidthInput','newObstacleDepthInput','newObstacleRotationInput','newObstacleGuide','newObstacleError','startObstaclePlacementBtn','finishObstacleSetupBtn','obstacleList',
      'obstacleEditorPanel','clearObstacleSelectionBtn','obstacleCollisionWarning','obstacleNameInput','obstacleXInput','obstacleYInput','obstacleWidthInput','obstacleDepthInput','obstacleRotationInput','obstacleVisibleInput','obstacleLockedInput','obstacleEditorError','rotateObstacleLeftBtn','rotateObstacleRightBtn','duplicateObstacleBtn','deleteObstacleBtn',
      'modeBadge','statusBar','statusMode','statusPart','statusRotation','statusCursor','statusCount','statusZoom','statusConnection','statusSelected',
      'fieldWidthText','fieldHeightText','gridText','startText','connectionText','undoBtn','redoBtn','rewindBtn',
      'rotateLeftBtn','rotateRightBtn','gridBtn','fitViewBtn','manualFitBtn','topLeftFitBtn','autoFitFieldBtn','editFieldBtn',
      'selectionInfo','clearSelectionBtn','deleteSelectionBtn','colorSelectionBtn','colorLegend','statusAssets','bankStateText',
      'fieldOriginText','fieldOverflowText','fieldOverflowNotice','statusOverflow','exportRangeDialog','exportRangeText',
      'exportRangeKeepBtn','exportRangeFitBtn','exportRangeCancelBtn','snapToggleBtn','cornerDirectionControl','cornerDirectionToggleBtn','placementHeightSelect','convertStartBtn','canvasContextMenu',
      'placementHeightCustom','snapCandidatePanel','layoutWarningSummary','statusWarnings','fastPathNextPart','fastPathGuide',
      'siteBoundaryPanel','roomCutoutPanel','siteBoundaryName','siteBoundaryX','siteBoundaryY','siteBoundaryWidth','siteBoundaryHeight','siteBoundaryVisible','applySiteBoundaryBtn',
      'newCutoutBtn','roomCutoutEmpty','roomCutoutEditor','cutoutName','cutoutX','cutoutY','cutoutWidth','cutoutHeight','cutoutRotation','cutoutVisible','cutoutLocked','applyCutoutBtn','rotateCutoutLeftBtn','rotateCutoutRightBtn','clearCutoutSelectionBtn','cutoutRotationNote','duplicateCutoutBtn','deleteCutoutBtn','cutoutDistances','cutoutDimensionOverlay',
      'subEditModeBar','subEditModeTitle','subEditObstacleCount','repeatObstaclePlacementBtn','addObstacleFromBarBtn','returnToSetupBtn','finishSubEditBtn','dragTrash','dragTrashLabel',
      'wizardProgress','wizardStageLabel','setupConfirmPanel','wizardConfirmSummary','wizardBackConfirmBtn','wizardCreateBtn'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
  }

  function init() {
    cacheElements();
    ctx = els.courseCanvas.getContext('2d');
    renderScheduler = RENDER_SCHEDULER.createRenderScheduler(callback => requestAnimationFrame(callback));
    wheelRotation = WHEEL_ROTATION.createWheelRotationAccumulator(30);
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

    els.setupForm.addEventListener('submit', e => { e.preventDefault(); advanceWizardFromLayoutSpace(); });
    els.cancelSetupBtn.addEventListener('click', cancelInitialSetup);
    document.querySelectorAll('[data-setup-tab]').forEach(tab => {
      tab.addEventListener('click', () => { if (!state.wizard.active) setNewLayoutModalTab(tab.dataset.setupTab); });
      tab.addEventListener('keydown', event => {
        if (state.wizard.active) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextTab = event.key === 'Home'
          ? NEW_LAYOUT_TABS.DEFAULT_TAB
          : event.key === 'End'
            ? NEW_LAYOUT_TABS.TABS.at(-1).id
            : NEW_LAYOUT_TABS.moveTab(tab.dataset.setupTab, event.key === 'ArrowLeft' ? -1 : 1);
        setNewLayoutModalTab(nextTab, { focus: true });
      });
    });
    els.backToLayoutSpaceBtn.addEventListener('click', () => setNewLayoutModalTab('layout-space', { focus: true }));
    els.startSpaceAdjustmentBtn.addEventListener('click', beginWizardSpaceAdjustment);
    els.startObstaclePlacementBtn?.addEventListener('click', startObstaclePlacement);
    els.finishObstacleSetupBtn?.addEventListener('click', () => continueInitialSetupAfter('interference'));
    els.repeatObstaclePlacementBtn?.addEventListener('click', repeatObstaclePlacement);
    els.addObstacleFromBarBtn?.addEventListener('click', () => openWizardObstacleCreator({ resetForm: true }));
    els.clearObstacleSelectionBtn?.addEventListener('click', () => clearObstacleSelection());
    els.rotateObstacleLeftBtn?.addEventListener('click', () => rotateSelectedObstacle(-45));
    els.rotateObstacleRightBtn?.addEventListener('click', () => rotateSelectedObstacle(45));
    els.duplicateObstacleBtn?.addEventListener('click', duplicateSelectedObstacle);
    els.deleteObstacleBtn?.addEventListener('click', deleteSelectedObstacle);
    ['change', 'blur'].forEach(eventName => {
      ['obstacleNameInput','obstacleXInput','obstacleYInput','obstacleWidthInput','obstacleDepthInput','obstacleRotationInput','obstacleVisibleInput','obstacleLockedInput']
        .forEach(id => on(els[id], eventName, applyObstacleEditorInputs));
    });
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
    els.applySiteBoundaryBtn?.addEventListener('click', applySiteBoundaryFromInputs);
    ['change', 'blur'].forEach(eventName => {
      ['siteBoundaryName','siteBoundaryX','siteBoundaryY','siteBoundaryWidth','siteBoundaryHeight','siteBoundaryVisible'].forEach(id => on(els[id], eventName, previewSiteBoundaryInputs));
    });
    els.newCutoutBtn?.addEventListener('click', () => { state.cad.tool = 'create'; state.cad.selectedCutoutId = null; updateUI(); render(); els.courseCanvas.focus(); });
    els.applyCutoutBtn?.addEventListener('click', applyCutoutFromInputs);
    els.rotateCutoutLeftBtn?.addEventListener('click', () => rotateSelectedCutout(-90));
    els.rotateCutoutRightBtn?.addEventListener('click', () => rotateSelectedCutout(90));
    els.clearCutoutSelectionBtn?.addEventListener('click', clearCutoutSelection);
    els.duplicateCutoutBtn?.addEventListener('click', duplicateSelectedCutout);
    els.deleteCutoutBtn?.addEventListener('click', deleteSelectedCutout);
    ['change', 'blur'].forEach(eventName => {
      ['cutoutName','cutoutX','cutoutY','cutoutWidth','cutoutHeight','cutoutRotation','cutoutVisible','cutoutLocked'].forEach(id => on(els[id], eventName, previewCutoutInputs));
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
    els.returnToSetupBtn?.addEventListener('click', () => exitSubEditMode({ returnToSetup: true }));
    els.finishSubEditBtn?.addEventListener('click', () => exitSubEditMode({ returnToSetup: false }));
    els.wizardBackConfirmBtn?.addEventListener('click', () => setNewLayoutModalTab(NEW_LAYOUT_TABS.DEFAULT_TAB, { focus: true }));
    els.wizardCreateBtn?.addEventListener('click', finalizeInitialSetup);
  }

  function openSetup(reset) {
    const adjustRoomShape = !reset && state.roomCutouts.length > 0;
    const configureObstacles = !reset && state.obstacles.length > 0;
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
    state.wizard = {
      active: true,
      step: 'layout-space',
      isNew: !!reset,
      baseline: JSON.stringify(serializeState()),
      adjustRoomShape,
      configureObstacles
    };
    if (reset) prepareNewInitialSetupDraft();
    if (els.adjustRoomShapeInput) els.adjustRoomShapeInput.checked = adjustRoomShape;
    if (els.configureObstaclesInput) els.configureObstaclesInput.checked = configureObstacles;
    prepareObstacleCreateForm();
    els.setupDialog.dataset.reset = reset ? 'true' : 'false';
    setNewLayoutModalTab(NEW_LAYOUT_TABS.DEFAULT_TAB);
    ensureSetupDialogOpen();
    setTimeout(() => els.fieldWidthInput.focus(), 50);
  }

  // Wizard transitions sometimes revisit the dialog from a canvas sub-editor.
  // Guarding its state avoids releasing and recreating the modal backdrop when
  // the requested visibility is already active.
  function ensureSetupDialogOpen() {
    if (els.setupDialog.open) return false;
    els.setupDialog.showModal();
    return true;
  }

  function ensureSetupDialogClosed() {
    if (!els.setupDialog.open) return false;
    els.setupDialog.close();
    return true;
  }

  function setNewLayoutModalTab(tabId, { focus = false } = {}) {
    const selected = tabId === 'confirm' ? 'confirm' : NEW_LAYOUT_TABS.normalizeTab(tabId);
    const view = NEW_LAYOUT_TABS.panelView(selected === 'confirm' ? NEW_LAYOUT_TABS.DEFAULT_TAB : selected, state);
    state.newLayoutModalTab = selected;
    view.tabs.forEach(tab => {
      const tabButton = document.querySelector(`[data-setup-tab="${tab.id}"]`);
      const panel = document.getElementById(tab.panelId);
      if (tabButton) {
        tabButton.setAttribute('aria-selected', String(tab.id === selected));
        tabButton.tabIndex = tab.id === selected ? 0 : -1;
        tabButton.disabled = state.wizard.active && tab.id !== selected;
        if (focus && tab.id === selected) tabButton.focus();
      }
      if (panel) panel.hidden = tab.id !== selected;
    });
    if (els.setupConfirmPanel) els.setupConfirmPanel.hidden = selected !== 'confirm';
    const configured = state.wizard.active;
    els.startSpaceAdjustmentBtn.disabled = !configured;
    els.spaceAdjustmentGuide.hidden = configured;
    if (els.startObstaclePlacementBtn) els.startObstaclePlacementBtn.disabled = !configured;
    if (els.newObstacleGuide) els.newObstacleGuide.hidden = configured;
    if (els.wizardProgress) els.wizardProgress.textContent = selected === 'confirm' ? '確認' : (NEW_LAYOUT_TABS.TABS.find(tab => tab.id === selected)?.label || '四角形スペース');
    if (els.wizardStageLabel) els.wizardStageLabel.textContent = state.wizard.isNew ? '初期設定ウィザード' : '初期設定を編集';
    if (selected === 'confirm' && els.wizardConfirmSummary) els.wizardConfirmSummary.textContent = `四角形スペース: ${(state.field.widthCm / 100).toFixed(1)}m × ${(state.field.heightCm / 100).toFixed(1)}m / グリッド ${state.field.gridCm}cm\n部屋形状調整: ${state.wizard.adjustRoomShape ? `あり（修正範囲 ${state.roomCutouts.length}件）` : 'なし'}\n干渉物: ${state.obstacles.length}件${state.obstacles.length ? `（${state.obstacles.map(item => item.name).join('、')}）` : ''}`;
    updateObstacleList();
    if (els.spaceAdjustmentGuide && view.selected === 'space-adjustment' && view.canAdjustSpace) {
      els.spaceAdjustmentGuide.hidden = false;
      els.spaceAdjustmentGuide.textContent = `設定済みの修正範囲: ${state.roomCutouts.length}件`;
    }
  }

  function exitSubEditMode({ returnToSetup }) {
    const tab = state.subEditMode || NEW_LAYOUT_TABS.DEFAULT_TAB;
    if (state.wizard.active) {
      endInitialSetupSubEditor();
      if (returnToSetup) {
        setNewLayoutModalTab(NEW_LAYOUT_TABS.DEFAULT_TAB);
        ensureSetupDialogOpen();
        updateUI(); render();
        return;
      }
      continueInitialSetupAfter(tab);
      return;
    } else {
      cleanupEditorModeState();
      state.subEditMode = null;
      state.mode = 'move';
    }
    if (returnToSetup) {
      setNewLayoutModalTab(tab);
      ensureSetupDialogOpen();
    }
    updateUI();
    render();
    if (!returnToSetup) els.courseCanvas.focus();
  }

  // A new layout starts from a fresh setup draft. The prior layout remains in
  // the wizard baseline so cancelling can restore it without sharing arrays.
  function prepareNewInitialSetupDraft() {
    cleanupEditorModeState();
    state.roomCutouts = [];
    state.obstacles = [];
    state.selectedObstacleId = null;
    state.obstaclePlacement = null;
    state.obstacleDrag = null;
    state.cad = { selectedCutoutId: null, tool: 'create', dragStartMm: null, dragCurrentMm: null, drag: null, snap: null };
    clearDragTrashState();
  }

  function endInitialSetupSubEditor() {
    cleanupEditorModeState();
    state.subEditMode = null;
    state.mode = 'move';
    if (els.subEditModeBar) els.subEditModeBar.hidden = true;
  }

  function advanceWizardFromLayoutSpace() {
    const widthM = Number(els.fieldWidthInput.value);
    const heightM = Number(els.fieldHeightInput.value);
    const gridCm = Number(els.gridInput.value);
    if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM < 1 || heightM < 1) return toast('1m以上のサイズを入力してください');
    state.field = {
      originX: state.wizard.isNew ? 0 : Number(state.field.originX) || 0,
      originY: state.wizard.isNew ? 0 : Number(state.field.originY) || 0,
      widthCm: widthM * 100,
      heightCm: heightM * 100,
      gridCm
    };
    state.siteBoundary = ROOM_BOUNDARY.defaultSiteBoundary(state.field);
    state.wizard.adjustRoomShape = els.adjustRoomShapeInput?.checked === true;
    state.wizard.configureObstacles = els.configureObstaclesInput?.checked === true;
    if (state.wizard.isNew) fitView();
    continueInitialSetupAfter('layout-space');
  }

  function continueInitialSetupAfter(completedStep) {
    if (!state.wizard.active) return;
    const nextStep = INITIAL_LAYOUT_FLOW.nextStep(completedStep, state.wizard);
    if (nextStep === INITIAL_LAYOUT_FLOW.STEPS.SPACE_ADJUSTMENT) {
      beginWizardSpaceAdjustment();
      return;
    }
    if (nextStep === INITIAL_LAYOUT_FLOW.STEPS.INTERFERENCE) {
      openWizardObstacleCreator({ resetForm: state.obstacles.length === 0 });
      return;
    }
    if (nextStep === INITIAL_LAYOUT_FLOW.STEPS.CONFIRM) {
      openWizardConfirmation();
      return;
    }
    finalizeInitialSetup();
  }

  function beginWizardSpaceAdjustment() {
    if (!state.wizard.active) return;
    state.wizard.step = 'space-adjustment';
    ensureSetupDialogClosed();
    enterSubEditMode('space-adjustment', 'cutout');
    updateUI();
    // A new draft must never inherit the previous layout's pan or zoom while
    // its room boundary is being edited.
    if (state.wizard.isNew) fitView();
    toast('部屋形状調整を開始しました');
    render(); els.courseCanvas.focus();
  }

  function openWizardObstacleCreator({ resetForm = false } = {}) {
    if (!state.wizard.active) return;
    endInitialSetupSubEditor();
    state.selectedObstacleId = null;
    state.wizard.step = 'interference';
    if (resetForm) prepareObstacleCreateForm();
    setNewLayoutModalTab('interference');
    ensureSetupDialogOpen();
    updateUI(); render();
  }

  function openWizardConfirmation() {
    if (!state.wizard.active) return;
    endInitialSetupSubEditor();
    state.wizard.step = 'confirm';
    setNewLayoutModalTab('confirm');
    ensureSetupDialogOpen();
    updateUI(); render();
  }

  function finalizeInitialSetup() {
    const wizard = state.wizard;
    if (!wizard.active) return;
    endInitialSetupSubEditor();
    if (wizard.isNew) {
      state.parts = [];
      state.start = null;
      state.connections = [];
      state.startPhase = 'position';
      state.activeConnection = null;
      state.history = [];
      state.future = [];
      state.setupStarted = true;
    } else if (wizard.baseline) {
      snapshotSerialized(wizard.baseline);
    }
    state.wizard = { active: false, step: 'layout-space', isNew: false, baseline: null, adjustRoomShape: false, configureObstacles: false };
    ensureSetupDialogClosed();
    recalculateLayoutWarnings();
    persistLocal();
    if (wizard.isNew) beginStartPlacement();
    else state.mode = 'move';
    updateUI();
    // The wizard path used to skip the normal applySetup() fitView() call,
    // retaining the prior layout's view transform despite new field values.
    if (wizard.isNew) fitView();
    render(); els.courseCanvas.focus();
  }

  function cancelInitialSetup() {
    const wizard = state.wizard;
    if (!wizard.active) return;
    cleanupEditorModeState();
    if (wizard.baseline) applySerialized(JSON.parse(wizard.baseline), false, { persist: false });
    state.wizard = { active: false, step: 'layout-space', isNew: false, baseline: null, adjustRoomShape: false, configureObstacles: false };
    state.mode = 'move';
    ensureSetupDialogClosed();
    updateUI(); render(); els.courseCanvas.focus();
  }

  // Mode changes must not leave a placement ghost or a sub-editor interaction
  // alive. This intentionally changes only ephemeral editor state: it never
  // snapshots, persists, or mutates a placed course part, cutout, or obstacle.
  function cleanupEditorModeState() {
    if (state.layoutMove.active) cancelManualLayoutMove();
    cancelCadDrag();
    state.obstaclePlacement = null;
    cancelObstacleDrag();
    state.cad.selectedCutoutId = null;
    clearSelection(false);
    resetFastPathSession();
    clearSnapTargetChoice();
    state.ghostProposal = null;
    state.ghostProposalKey = null;
    resetPointerInteraction();
    clearDragTrashState();
  }

  function enterSubEditMode(subEditMode, mode) {
    cleanupEditorModeState();
    state.subEditMode = subEditMode;
    state.mode = mode;
  }

  function leaveSubEditModeForPlacement() {
    if (!state.subEditMode && state.mode !== 'obstacle-edit') return;
    cleanupEditorModeState();
    state.subEditMode = null;
  }

  // Both automatic (new-layout confirmation) and manual Start placement must
  // leave every other editor mode before the Start ghost becomes visible.
  function beginStartPlacement() {
    cleanupEditorModeState();
    state.subEditMode = null;
    state.obstaclePlacement = null;
    state.selectedObstacleId = null;
    state.obstacleDrag = null;
    state.cad.selectedCutoutId = null;
    clearCadDrag();
    state.pointer.pendingObstaclePlacement = false;
    state.pointer.pendingPlacement = false;
    state.pointer.pendingPlacementProposal = null;
    state.selectedType = 'start';
    state.mode = 'start';
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
    state.siteBoundary = ROOM_BOUNDARY.defaultSiteBoundary(state.field);
    if (reset) {
      beginStartPlacement();
      state.parts = [];
      state.start = null;
      state.connections = [];
      state.startPhase = 'position';
      state.activeConnection = null;
      state.rotation = 0;
      state.roomCutouts = [];
      state.obstacles = [];
      state.selectedObstacleId = null;
      state.obstaclePlacement = null;
      state.obstacleDrag = null;
      state.cad = { selectedCutoutId: null, tool: 'create', dragStartMm: null, dragCurrentMm: null, drag: null, snap: null };
      resetCornerVariantSession();
      resetFastPathSession();
      state.cursor = { x: snap(state.field.widthCm / 2), y: snap(state.field.heightCm / 2) };
      state.history = [];
      state.future = [];
      resetPointerInteraction();
    }
    state.setupStarted = true;
    ensureSetupDialogClosed();
    fitView();
    updateUI();
    render();
    els.courseCanvas.focus();
    persistLocal();
  }

  function setMode(mode) {
    if (state.wizard.active) return;
    if (state.layoutMove.active) cancelManualLayoutMove();
    if (!['place','move','delete','color','boundary','cutout'].includes(mode)) return;
    leaveSubEditModeForPlacement();
    state.mode = state.mode === mode && mode !== 'place' ? 'place' : mode;
    state.hoveredPartId = null;
    resetFastPathSession();
    clearSnapTargetChoice();
    resetPointerInteraction();
    if (state.mode === 'place') clearSelection(false);
    updateUI();
    render();
    els.courseCanvas.focus();
  }

  function selectPartType(type) {
    if (state.wizard.active) return;
    if (!PARTS[type]) return;
    if (state.layoutMove.active) cancelManualLayoutMove();
    if (type === 'start') {
      if (state.start) {
        toast('スタートレーンはすでに配置されています');
        return;
      }
      beginStartPlacement();
      updateUI();
      render();
      els.courseCanvas.focus();
      return;
    }
    leaveSubEditModeForPlacement();
    resetFastPathSession();
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

  function snapshotSerialized(serialized) {
    state.history.push(serialized);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.future = [];
    state.dirty = true;
  }

  function snapshot() { snapshotSerialized(JSON.stringify(serializeState())); }

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
      siteBoundary: { ...state.siteBoundary },
      roomCutouts: state.roomCutouts.map(cutout => ({ ...cutout })),
      obstacles: state.obstacles.map(obstacle => ({ ...obstacle })),
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
    state.siteBoundary = ROOM_BOUNDARY.normalizeSiteBoundary(data.siteBoundary || ROOM_BOUNDARY.defaultSiteBoundary(state.field));
    state.field = FIELD_BOUNDARY.normalizeField(ROOM_BOUNDARY.fieldFromSiteBoundary(state.siteBoundary, state.field));
    state.roomCutouts = ROOM_BOUNDARY.normalizeRoomCutouts(data.roomCutouts || []);
    state.obstacles = INTERFERENCE_OBSTACLES.normalizeObstacles(data.obstacles || []);
    state.selectedObstacleId = null;
    state.obstaclePlacement = null;
    state.obstacleDrag = null;
    state.subEditMode = null;
    state.cad = { selectedCutoutId: null, tool: 'create', dragStartMm: null, dragCurrentMm: null, drag: null, snap: null };
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
    if (state.wizard.active) return { status: 'deferred-wizard' };
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
        hovered: options.selected && state.hoveredPartId === part.id,
        connectedConnectorIds: connectedConnectorIdsForPart(part.id)
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
      const halfWidth = (Number(seam.connectionWidthMm) || CATALOG.STRAIGHT_CONNECTION_WIDTH_MM) / 20 - style.edgeInset;
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
    // The exported frame already includes the legacy field border, so retain
    // the visible room cutouts as part of that same room-boundary output.
    // CAD-only dimensions, handles, previews, and selection frames are drawn
    // separately and never reach this export path.
    drawRoomShape(c);
    drawObstacles(c, { exportMode: true });
    if (state.start) drawStartLane(c, state.start, true, false, { connectedConnectorIds: connectedConnectorIdsForPart('start') });
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

  function measureCanvasFrame() {
    const rect = els.canvasWrap.getBoundingClientRect();
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    return {
      dpr: nextDpr,
      width: Math.max(1, Math.floor(rect.width * nextDpr)),
      height: Math.max(1, Math.floor(rect.height * nextDpr)),
      styleWidth: `${rect.width}px`,
      styleHeight: `${rect.height}px`
    };
  }

  function canvasFrameNeedsResize(frame) {
    return Math.abs(dpr - frame.dpr) > .001
      || els.courseCanvas.width !== frame.width
      || els.courseCanvas.height !== frame.height
      || els.courseCanvas.style.width !== frame.styleWidth
      || els.courseCanvas.style.height !== frame.styleHeight;
  }

  function resizeCanvas() {
    if (!canvasFrameNeedsResize(measureCanvasFrame())) return false;
    // Do not assign canvas.width/height here: either assignment clears the
    // bitmap. The scheduled frame resizes and fully repaints synchronously.
    render();
    return true;
  }

  function syncCanvasSizeForFrame() {
    const frame = measureCanvasFrame();
    if (!canvasFrameNeedsResize(frame)) return false;
    dpr = frame.dpr;
    if (els.courseCanvas.width !== frame.width) els.courseCanvas.width = frame.width;
    if (els.courseCanvas.height !== frame.height) els.courseCanvas.height = frame.height;
    if (els.courseCanvas.style.width !== frame.styleWidth) els.courseCanvas.style.width = frame.styleWidth;
    if (els.courseCanvas.style.height !== frame.styleHeight) els.courseCanvas.style.height = frame.styleHeight;
    return true;
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
    renderScheduler.request(drawFrame);
  }

  function drawFrame() {
    // Resizing clears the backing bitmap, so resize and replacement drawing
    // must happen in this one animation-frame callback without an exposed gap.
    syncCanvasSizeForFrame();
    const canvas = els.courseCanvas;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    drawBackground(w, h);
    ctx.save();
    ctx.translate(state.view.offsetX, state.view.offsetY);
    ctx.scale(state.view.scale, state.view.scale);
    drawField(ctx);
    drawRoomShape(ctx);
    drawObstacles(ctx);
    if (state.start) drawStartLane(ctx, state.start, false, false, { connectedConnectorIds: connectedConnectorIdsForPart('start'), selected: isSelected('start') });
    drawPartsInLayerOrder(ctx, { selected: true });
    drawMissingStartWarning(ctx);
    if (state.layoutMove.active) drawLayoutMoveOverlay(ctx);
    drawCursorAndGhost(ctx);
    drawCourseGhostObstacleWarning(ctx);
    drawObstaclePlacementGhost(ctx);
    drawMarquee(ctx);
    drawCadInteraction(ctx);
    ctx.restore();
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
    if (state.siteBoundary.visible) {
      c.strokeStyle = '#6e716d';
      c.lineWidth = 1.6 / state.view.scale;
      c.setLineDash([8 / state.view.scale, 5 / state.view.scale]);
      c.strokeRect(frame.minX, frame.minY, frame.w, frame.h);
      c.setLineDash([]);
    }
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

  function cadWorldToMm(world) { return { x: ROOM_BOUNDARY.round10mm(world.x * 10), y: ROOM_BOUNDARY.round10mm(world.y * 10) }; }
  function cadMmToWorld(point) { return { x: point.x / 10, y: point.y / 10 }; }
  function selectedCutout() { return state.roomCutouts.find(cutout => cutout.id === state.cad.selectedCutoutId) || null; }
  function cutoutBoundsWorld(cutout) {
    const bounds = ROOM_BOUNDARY.rotatedBounds(cutout);
    return { x: bounds.left / 10, y: bounds.top / 10, w: (bounds.right - bounds.left) / 10, h: (bounds.bottom - bounds.top) / 10 };
  }

  function drawRoomShape(c) {
    if (!state.siteBoundary.visible) return;
    const boxes = ROOM_BOUNDARY.visibleCutoutIntersections(state.siteBoundary, state.roomCutouts)
      .map(rect => ({ x: rect.left / 10, y: rect.top / 10, w: (rect.right - rect.left) / 10, h: (rect.bottom - rect.top) / 10 }));
    if (!boxes.length) return;

    c.save();
    c.globalCompositeOperation = 'source-over';
    // Add each rectangle as its own closed subpath.  rect() never connects
    // separate cutouts, unlike a reused moveTo/lineTo path can.
    c.beginPath();
    boxes.forEach(box => { c.rect(box.x, box.y, box.w, box.h); c.closePath(); });
    c.fillStyle = 'rgba(27, 48, 60, .38)';
    c.fill('nonzero');
    // The hatch has a separate path and is clipped to the union mask, so a
    // diagonal can neither join cutouts nor escape a partial intersection.
    c.clip('nonzero');
    c.strokeStyle = 'rgba(39, 121, 133, .9)';
    c.lineWidth = 1.4 / state.view.scale;
    c.setLineDash([]);
    const minX = Math.min(...boxes.map(box => box.x));
    const minY = Math.min(...boxes.map(box => box.y));
    const maxX = Math.max(...boxes.map(box => box.x + box.w));
    const maxY = Math.max(...boxes.map(box => box.y + box.h));
    const span = Math.max(maxX - minX, maxY - minY);
    c.beginPath();
    for (let x = minX - span; x <= maxX; x += 16 / state.view.scale) {
      c.moveTo(x, minY);
      c.lineTo(x + span, maxY);
    }
    c.stroke();
    c.restore();

    // Keep borders separate from the fill/hatch path.  This also ensures the
    // active composite mode is restored before subsequent course rendering.
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(39, 121, 133, .9)';
    c.lineWidth = 1.4 / state.view.scale;
    c.setLineDash([8 / state.view.scale, 5 / state.view.scale]);
    boxes.forEach(box => {
      c.beginPath();
      c.rect(box.x, box.y, box.w, box.h);
      c.closePath();
      c.stroke();
    });
    c.restore();
  }

  function obstacleSpaceBoundary() {
    return {
      left: state.siteBoundary.x / 10,
      top: state.siteBoundary.y / 10,
      right: (state.siteBoundary.x + state.siteBoundary.width) / 10,
      bottom: (state.siteBoundary.y + state.siteBoundary.height) / 10
    };
  }

  function obstacleCutoutBounds() {
    return ROOM_BOUNDARY.visibleCutoutIntersections(state.siteBoundary, state.roomCutouts)
      .map(bounds => ({ left: bounds.left / 10, top: bounds.top / 10, right: bounds.right / 10, bottom: bounds.bottom / 10 }));
  }

  function obstaclePlacementValidity(obstacle) {
    return OBSTACLE_GEOMETRY.placementValidity(obstacle, obstacleSpaceBoundary(), obstacleCutoutBounds());
  }

  function obstacleOverlapsCourse(obstacle) {
    if (!obstacle.visible) return false;
    const polygon = OBSTACLE_GEOMETRY.corners(obstacle);
    return allLayoutParts().some(part => OBSTACLE_GEOMETRY.polygonsIntersect(
      polygon, LAYOUT_GRAPH.occupancyPolygon(part, PARTS[part.type])
    ));
  }

  function courseObstacleWarnings(parts = allLayoutParts()) {
    return OBSTACLE_COURSE_WARNINGS.collect(
      state.obstacles,
      parts,
      obstacle => OBSTACLE_GEOMETRY.corners(obstacle),
      part => LAYOUT_GRAPH.occupancyPolygon(part, PARTS[part.type]),
      OBSTACLE_GEOMETRY.polygonsIntersect
    );
  }

  function courseCutoutWarnings(parts = allLayoutParts()) {
    return state.roomCutouts.filter(cutout => cutout.visible).flatMap(cutout => {
      const bounds = ROOM_BOUNDARY.rotatedBounds(cutout);
      const obstacleShape = {
        id: cutout.id,
        visible: true,
        x: (bounds.left + bounds.right) / 20,
        y: (bounds.top + bounds.bottom) / 20,
        widthCm: (bounds.right - bounds.left) / 10,
        depthCm: (bounds.bottom - bounds.top) / 10,
        rotation: 0
      };
      return OBSTACLE_COURSE_WARNINGS.collect([obstacleShape], parts, OBSTACLE_GEOMETRY.corners, partOccupancyPolygon, OBSTACLE_GEOMETRY.polygonsIntersect)
        .map(warning => ({ type: 'cutout-interference', cutoutId: cutout.id, partIds: warning.partIds }));
    });
  }

  function obstacleWarningCountForPart(partId) {
    return state.layoutWarnings.filter(warning => warning.type === 'obstacle-interference' && warning.partIds.includes(partId)).length;
  }

  function drawObstacleShape(c, obstacle, options = {}) {
    const selected = !options.exportMode && obstacle.id === state.selectedObstacleId;
    const overlap = !options.exportMode && obstacleOverlapsCourse(obstacle);
    const unit = Math.max(state.view.scale, .15);
    c.save();
    c.translate(obstacle.x, obstacle.y);
    c.rotate(obstacle.rotation * Math.PI / 180);
    c.fillStyle = options.ghost ? (options.valid ? 'rgba(244, 180, 43, .28)' : 'rgba(236, 82, 93, .30)') : 'rgba(226, 118, 89, .30)';
    c.strokeStyle = options.ghost ? (options.valid ? '#f7c657' : '#ff6f78') : overlap ? '#ff6f78' : '#e27659';
    c.lineWidth = (selected ? 2.8 : 1.7) / unit;
    c.setLineDash(options.ghost ? [7 / unit, 4 / unit] : []);
    c.fillRect(-obstacle.widthCm / 2, -obstacle.depthCm / 2, obstacle.widthCm, obstacle.depthCm);
    c.strokeRect(-obstacle.widthCm / 2, -obstacle.depthCm / 2, obstacle.widthCm, obstacle.depthCm);
    c.setLineDash([]);
    if (selected) {
      c.strokeStyle = '#ffd15c';
      c.lineWidth = 1.2 / unit;
      c.strokeRect(-obstacle.widthCm / 2 - 3 / unit, -obstacle.depthCm / 2 - 3 / unit, obstacle.widthCm + 6 / unit, obstacle.depthCm + 6 / unit);
    }
    if (!options.exportMode && obstacle.locked) {
      c.fillStyle = '#fff2c8'; c.font = `700 ${12 / unit}px sans-serif`; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText('🔒', obstacle.widthCm / 2 - 3 / unit, -obstacle.depthCm / 2 + 3 / unit);
    }
    if (obstacle.widthCm >= 28 / unit && obstacle.depthCm >= 16 / unit) {
      c.fillStyle = '#fff3e8'; c.font = `700 ${10 / unit}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(obstacle.name, 0, 0, Math.max(0, obstacle.widthCm - 8 / unit));
    }
    c.restore();
  }

  function drawObstacles(c, options = {}) {
    state.obstacles.filter(obstacle => obstacle.visible).forEach(obstacle => drawObstacleShape(c, obstacle, options));
  }

  function drawObstaclePlacementGhost(c) {
    if (state.mode !== 'obstacle-edit' || !state.obstaclePlacement) return;
    const ghost = { ...state.obstaclePlacement, x: state.cursor.x, y: state.cursor.y };
    drawObstacleShape(c, ghost, { ghost: true, valid: obstaclePlacementValidity(ghost).valid });
  }

  function drawCadInteraction(c) {
    if (state.mode !== 'cutout') return;
    const selected = selectedCutout();
    const preview = state.cad.dragStartMm && state.cad.dragCurrentMm
      ? ROOM_BOUNDARY.cutoutFromDrag(state.cad.dragStartMm, state.cad.dragCurrentMm, { id: 'preview' })
      : null;
    [selected, preview].filter(Boolean).forEach((cutout, index) => {
      const box = cutoutBoundsWorld(cutout);
      c.save();
      c.strokeStyle = index === 1 ? '#f7c657' : '#56d7c5';
      c.fillStyle = index === 1 ? 'rgba(247,198,87,.16)' : 'rgba(86,215,197,.12)';
      c.lineWidth = 2.4 / state.view.scale;
      c.setLineDash(index === 1 ? [6 / state.view.scale, 4 / state.view.scale] : []);
      c.fillRect(box.x, box.y, box.w, box.h);
      c.strokeRect(box.x, box.y, box.w, box.h);
      c.setLineDash([]);
      c.restore();
    });
    const dimensionTarget = preview || selected;
    if (dimensionTarget) drawCadDimensions(c, dimensionTarget);
    drawCadCornerSnapMarker(c);
  }

  function drawCadCornerSnapMarker(c) {
    const snap = state.cad.snap;
    if (!snap) return;
    const point = { x: snap.x / 10, y: snap.y / 10 };
    const unit = Math.max(state.view.scale, .15);
    c.save();
    c.strokeStyle = '#ffd15c'; c.fillStyle = 'rgba(20, 29, 36, .94)'; c.lineWidth = 1.8 / unit;
    if (snap.type === 'line' && snap.segment) {
      c.strokeStyle = '#ffbd6b';
      c.beginPath(); c.moveTo(snap.segment.x1 / 10, snap.segment.y1 / 10); c.lineTo(snap.segment.x2 / 10, snap.segment.y2 / 10); c.stroke();
      c.fillRect(point.x - 4 / unit, point.y - 4 / unit, 8 / unit, 8 / unit);
      c.fillStyle = '#ffe2b8'; c.font = `700 ${9 / unit}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText('壁', point.x, point.y - 8 / unit);
      c.restore();
      return;
    }
    c.beginPath(); c.arc(point.x, point.y, 7 / unit, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(point.x - 11 / unit, point.y); c.lineTo(point.x + 11 / unit, point.y);
    c.moveTo(point.x, point.y - 11 / unit); c.lineTo(point.x, point.y + 11 / unit);
    c.stroke();
    c.fillStyle = '#ffe9a7'; c.font = `700 ${9 / unit}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText('角', point.x, point.y - 10 / unit);
    c.restore();
  }

  function drawCadDimensions(c, cutout) {
    const scale = state.view.scale;
    c.save();
    c.strokeStyle = '#68e7d5'; c.lineWidth = 1 / scale;
    // These endpoints are also converted to CSS pixels for the HTML labels.
    // Keeping one geometry source prevents the two layers drifting apart.
    cadDimensionLines(cutout).forEach(line => {
      c.beginPath(); c.moveTo(line.start.x, line.start.y); c.lineTo(line.end.x, line.end.y); c.stroke();
    });
    c.restore();
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

  function worldToScreen(x, y) { return ROOM_BOUNDARY.worldToScreen({ x, y }, state.view); }

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
    drawPartConnectionFaces(c, part, opts);
  }

  // Connection positions and headings come from the same world connectors as
  // snapping, never from raster image bounds or transparent padding.
  function drawPartConnectionFaces(c, part, options = {}) {
    const hidden = new Set(options.connectedConnectorIds || []);
    const style = PART_SEAMS.resolveStyle({
      enabled: RENDER_FEATURES.partSeams,
      selected: !!options.selected,
      exportMode: !!options.exportMode
    });
    if (!style) return;
    for (const endpoint of partEndpoints(part)) {
      if (hidden.has(endpoint.connectorId)) continue;
      const face = PART_SEAMS.connectorFace(endpoint, { edgeInsetCm: style.edgeInset });
      c.save();
      c.strokeStyle = style.color;
      c.lineWidth = style.lineWidth;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(face.start.x, face.start.y);
      c.lineTo(face.end.x, face.end.y);
      c.stroke();
      c.restore();
    }
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


  function drawStartLane(c, start, exportMode, ghost = false, options = {}) {
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
    drawPartConnectionFaces(c, { ...start, id: 'start', type: 'start' }, { ...options, exportMode });
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
        bankAngleDeg: Number(ep.bankAngleDeg) || 0, connectionWidthMm: ep.connectionWidthMm, shape: ep.shape, laneCount: ep.laneCount,
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
        bankAngleDeg: world.bankAngleDeg, connectionWidthMm: ep.connectionWidthMm, shape: ep.shape, laneCount: ep.laneCount,
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

  function connectedConnectorIdsForPart(partId) {
    const ids = new Set();
    for (const edge of LAYOUT_GRAPH.dedupeEdges(state.connections)) {
      if (edge.partAId === partId) ids.add(edge.connectorAId);
      if (edge.partBId === partId) ids.add(edge.connectorBId);
    }
    return [...ids];
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
    const obstacleInterference = courseObstacleWarnings(parts);
    const cutoutInterference = courseCutoutWarnings(parts);
    const overflow = outOfBoundsItems().map(item => ({ type: 'field-overflow', partIds: [item.id] }));
    const negative = parts.filter(part => Number(part.zMm) < 0).map(part => ({ type: 'negative-height', partIds: [part.id] }));
    const missingStart = state.start ? [] : [{ type: 'missing-start' }];
    state.layoutWarnings = [...missingStart, ...duplicate, ...edgeWarnings, ...interference, ...obstacleInterference, ...cutoutInterference, ...overflow, ...negative];
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
    const heightInterferedIds = new Set(state.layoutWarnings
      .filter(warning => warning.type === 'interference')
      .flatMap(warning => warning.partIds || []));
    const obstacleInterferedIds = new Set(state.layoutWarnings
      .filter(warning => warning.type === 'obstacle-interference' || warning.type === 'cutout-interference' || warning.type === 'field-overflow')
      .flatMap(warning => warning.partIds || []));
    const interferedIds = new Set([...heightInterferedIds, ...obstacleInterferedIds]);
    interferedIds.forEach(id => {
      const part = id === 'start' ? state.start : state.parts.find(item => item.id === id);
      if (!part) return;
      drawInterferenceOutline(c, { ...part, type: id === 'start' ? 'start' : part.type });
    });
    const obstacleIds = new Set(state.layoutWarnings
      .filter(warning => warning.type === 'obstacle-interference')
      .map(warning => warning.obstacleId));
    obstacleIds.forEach(id => {
      const obstacle = state.obstacles.find(item => item.id === id && item.visible);
      if (obstacle) drawObstacleWarningOutline(c, obstacle);
    });
    const cutoutIds = new Set(state.layoutWarnings.filter(warning => warning.type === 'cutout-interference').map(warning => warning.cutoutId));
    cutoutIds.forEach(id => {
      const cutout = state.roomCutouts.find(item => item.id === id && item.visible);
      if (cutout) drawObstacleWarningOutline(c, { ...cutoutBoundsWorld(cutout), x: cutoutBoundsWorld(cutout).x + cutoutBoundsWorld(cutout).w / 2, y: cutoutBoundsWorld(cutout).y + cutoutBoundsWorld(cutout).h / 2, widthCm: cutoutBoundsWorld(cutout).w, depthCm: cutoutBoundsWorld(cutout).h, rotation: 0 });
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

  function drawObstacleWarningOutline(c, obstacle) {
    c.save();
    c.translate(obstacle.x, obstacle.y);
    c.rotate(obstacle.rotation * Math.PI / 180);
    c.strokeStyle = '#ff6f78';
    c.lineWidth = 3 / Math.max(state.view.scale, .15);
    c.strokeRect(-obstacle.widthCm / 2, -obstacle.depthCm / 2, obstacle.widthCm, obstacle.depthCm);
    c.restore();
  }

  function drawCourseGhostObstacleWarning(c) {
    let ghost = null;
    if (state.mode === 'place') {
      const proposal = getPlacementProposal();
      if (proposal) ghost = renderPartFromProposal(proposal, 'ghost-course');
    } else if (state.mode === 'start') {
      ghost = { id: 'ghost-course', type: 'start', x: state.cursor.x, y: state.cursor.y, rotation: state.rotation, zMm: 0 };
    }
    if (!ghost || !courseObstacleWarnings([ghost]).length) return;
    drawInterferenceOutline(c, ghost);
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

  function cutoutHitTest(world) {
    const point = cadWorldToMm(world);
    return [...state.roomCutouts].reverse().find(cutout => {
      if (!cutout.visible) return false;
      const bounds = ROOM_BOUNDARY.rotatedBounds(cutout);
      return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    }) || null;
  }

  function clearCadDrag() {
    state.cad.dragStartMm = null;
    state.cad.dragCurrentMm = null;
    state.cad.drag = null;
    state.cad.snap = null;
  }

  // The delete target lives outside the canvas, so hit testing deliberately
  // uses viewport coordinates instead of the zoomed course coordinate system.
  function pointerIsOverDragTrash(e) {
    const rect = els.dragTrash?.getBoundingClientRect();
    return !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  }

  function updateDragTrashState(e, kind) {
    const over = pointerIsOverDragTrash(e);
    state.dragTrash = { active: true, over, kind };
    if (els.dragTrash) {
      els.dragTrash.classList.add('is-dragging');
      els.dragTrash.classList.toggle('is-delete-target', over);
    }
    if (els.dragTrashLabel) els.dragTrashLabel.textContent = over ? '離すと削除' : 'ここに移動して削除';
    return over;
  }

  function clearDragTrashState() {
    state.dragTrash = { active: false, over: false, kind: null };
    if (els.dragTrash) els.dragTrash.classList.remove('is-dragging', 'is-delete-target');
    if (els.dragTrashLabel) els.dragTrashLabel.textContent = '削除';
  }

  function cancelCadDrag() {
    const drag = state.cad.drag;
    if (drag?.kind === 'move') {
      const selected = state.roomCutouts.find(cutout => cutout.id === drag.cutoutId);
      if (selected) replaceCutout({ ...selected, x: drag.startCutoutX, y: drag.startCutoutY }, false);
    }
    clearCadDrag();
  }

  function onCadPointerDown(e, world) {
    const point = cadWorldToMm(world);
    if (state.mode === 'boundary') return;
    cancelCadDrag();
    clearDragTrashState();
    const hit = cutoutHitTest(world);
    if (hit) {
      state.cad.selectedCutoutId = hit.id;
      state.cad.tool = 'select';
      if (!hit.locked) {
        state.cad.drag = { ...ROOM_BOUNDARY.beginCutoutDrag(hit, point, e.pointerId), historyState: JSON.stringify(serializeState()), moved: false };
      }
    } else {
      state.cad.selectedCutoutId = null;
      state.cad.tool = 'create';
      const snapped = snapCadPointToRoomCorner(point);
      state.cad.dragStartMm = snapped.point;
      state.cad.dragCurrentMm = snapped.point;
      state.cad.snap = snapped.snap;
      state.cad.drag = { kind: 'create', pointerId: e.pointerId };
    }
    updateUI(); render();
  }

  function onCadPointerMove(e, world) {
    if (state.mode !== 'cutout' || !state.pointer.down) return;
    const point = cadWorldToMm(world);
    const drag = state.cad.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'create' && state.cad.dragStartMm) {
      const snapped = snapCadPointToRoomCorner(point, null, state.cad.snap);
      state.cad.dragCurrentMm = snapped.point;
      state.cad.snap = snapped.snap;
    }
    const selected = drag.kind === 'move' ? state.roomCutouts.find(cutout => cutout.id === drag.cutoutId) : null;
    const deleting = selected && !selected.locked && updateDragTrashState(e, 'cutout');
    if (selected && !selected.locked && !deleting) {
      const position = ROOM_BOUNDARY.cutoutPositionForDrag(drag, point);
      const snapped = snapMovedCutoutToRoomCorner(selected, position, selected.id, state.cad.snap);
      state.cad.snap = snapped.snap;
      if (snapped.position.x !== selected.x || snapped.position.y !== selected.y) {
        drag.moved = true;
        replaceCutout({ ...selected, ...snapped.position }, false);
      }
    }
    // Pointer moves only change the CAD preview and canvas. Rebuilding the
    // full sidebar here caused repeated innerHTML/layout work while dragging.
    updateCutoutDimensionOverlay();
    render();
  }

  function onCadPointerUp(e) {
    if (state.mode !== 'cutout') return;
    const drag = state.cad.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'create' && state.cad.dragStartMm && state.cad.dragCurrentMm) {
      snapshot();
      const cutout = ROOM_BOUNDARY.cutoutFromDrag(state.cad.dragStartMm, state.cad.dragCurrentMm, { id: ROOM_BOUNDARY.nextCutoutId(state.roomCutouts) });
      state.roomCutouts.push(cutout);
      state.cad.selectedCutoutId = cutout.id;
      toast('部屋形状用切り抜きを作成しました');
    }
    const deleteCutout = drag.kind === 'move' && pointerIsOverDragTrash(e);
    if (deleteCutout) {
      state.roomCutouts = state.roomCutouts.filter(cutout => cutout.id !== drag.cutoutId);
      state.cad.selectedCutoutId = null;
      snapshotSerialized(drag.historyState);
      toast('スペース修正範囲を削除しました');
    } else if (drag.kind === 'move' && drag.moved) {
      snapshotSerialized(drag.historyState);
    }
    clearCadDrag();
    clearDragTrashState();
    persistLocal(); updateUI(); render();
  }

  function replaceCutout(next, sync = true) {
    state.roomCutouts = state.roomCutouts.map(cutout => cutout.id === next.id ? ROOM_BOUNDARY.normalizeCutout(next, { id: next.id }) : cutout);
    if (sync) { persistLocal(); updateUI(); render(); }
  }

  function applySiteBoundaryFromInputs() {
    const candidate = boundaryFromInputs();
    if (!candidate) return toast('幅と奥行は10mm以上の数値を入力してください');
    snapshot();
    state.siteBoundary = candidate;
    state.field = FIELD_BOUNDARY.normalizeField(ROOM_BOUNDARY.fieldFromSiteBoundary(candidate, state.field));
    fitView(); persistLocal(); updateUI(); render();
  }

  function boundaryFromInputs() {
    const values = ['siteBoundaryX','siteBoundaryY','siteBoundaryWidth','siteBoundaryHeight'].map(id => els[id]?.value);
    if (values.some(value => value === '' || !Number.isFinite(Number(value)))) return null;
    const candidate = ROOM_BOUNDARY.normalizeSiteBoundary({ name: els.siteBoundaryName.value, x: values[0], y: values[1], width: values[2], height: values[3], visible: els.siteBoundaryVisible.checked }, state.siteBoundary);
    if (Number(values[2]) <= 0 || Number(values[3]) <= 0) return null;
    return candidate;
  }

  function previewSiteBoundaryInputs() {
    // Values remain provisional until the explicit apply action. This avoids
    // corrupting a valid boundary while an input is temporarily empty.
    if (state.mode === 'boundary') render();
  }

  function applyCutoutFromInputs() {
    const selected = selectedCutout();
    if (!selected) return;
    const candidate = cutoutFromInputs(selected);
    if (!candidate) return toast('幅と高さは10mm以上の数値を入力してください');
    snapshot(); replaceCutout(candidate);
  }

  function cutoutFromInputs(selected) {
    const ids = ['cutoutX','cutoutY','cutoutWidth','cutoutHeight'];
    if (ids.some(id => els[id]?.value === '' || !Number.isFinite(Number(els[id].value)))) return null;
    if (Number(els.cutoutWidth.value) <= 0 || Number(els.cutoutHeight.value) <= 0) return null;
    return ROOM_BOUNDARY.normalizeCutout({ ...selected, name: els.cutoutName.value, x: els.cutoutX.value, y: els.cutoutY.value, width: els.cutoutWidth.value, height: els.cutoutHeight.value, rotation: els.cutoutRotation.value, visible: els.cutoutVisible.checked, locked: els.cutoutLocked.checked }, { id: selected.id });
  }

  function previewCutoutInputs() {
    // The form itself is the live preview; commit keeps Undo/Redo to one entry.
    if (state.mode === 'cutout') render();
  }

  function deleteSelectedCutout() {
    const selected = selectedCutout();
    if (!selected) return;
    if (selected.locked) return toast('ロック中の切り抜きは削除できません');
    snapshot(); state.roomCutouts = state.roomCutouts.filter(cutout => cutout.id !== selected.id); state.cad.selectedCutoutId = null;
    persistLocal(); updateUI(); render();
  }

  function duplicateSelectedCutout() {
    const selected = selectedCutout();
    if (!selected) return;
    snapshot(); const copy = ROOM_BOUNDARY.duplicateCutout(selected, state.roomCutouts); state.roomCutouts.push(copy); state.cad.selectedCutoutId = copy.id;
    persistLocal(); updateUI(); render();
  }

  function clearCutoutSelection() {
    state.cad.selectedCutoutId = null;
    clearCadDrag();
    updateUI();
    render();
  }

  function rotateSelectedCutout(delta) {
    const selected = selectedCutout();
    if (!selected) return;
    if (selected.locked) return toast('ロック中のスペース修正範囲は回転できません');
    snapshot();
    replaceCutout({ ...selected, rotation: normalizeRotation(selected.rotation + delta) });
  }

  function onPointerDown(e) {
    if (e.button !== 0 && !state.layoutMove.active) return;
    els.courseCanvas.setPointerCapture(e.pointerId);
    els.courseCanvas.focus();
    const { x: sx, y: sy } = canvasScreenPoint(e);
    const world = screenToWorld(sx, sy);
    const snappedWorld = { x: snap(world.x), y: snap(world.y) };
    const physicalPointer = { x: sx, y: sy };

    state.pointer.down = true;
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

    if (e.button !== 0) return;
    if (state.mode === 'boundary' || state.mode === 'cutout') {
      onCadPointerDown(e, world);
      return;
    }
    if (state.mode === 'obstacle-edit') {
      state.pointer.pendingObstaclePlacement = true;
      updateUI(); render();
      return;
    }
    if (state.wizard.active && state.subEditMode === 'interference') {
      const obstacle = obstacleHitTest(world.x, world.y);
      if (obstacle) {
        selectObstacle(obstacle.id, { mode: false });
        if (!beginObstacleDrag(obstacle, e, world)) {
          state.pointer.down = false;
          try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      } else {
        state.pointer.down = false;
        try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      updateUI(); render();
      return;
    }
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
        const obstacle = obstacleHitTest(world.x, world.y);
        if (obstacle) {
          selectObstacle(obstacle.id, { mode: false });
          beginObstacleDrag(obstacle, e, world);
        } else beginMarquee(world, e.shiftKey);
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
    const { x: sx, y: sy } = canvasScreenPoint(e);
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

    if (state.mode === 'boundary' || state.mode === 'cutout') {
      onCadPointerMove(e, world);
      return;
    }

    if (state.obstacleDrag?.pointerId === e.pointerId && state.pointer.down) {
      const obstacle = selectedObstacle();
      if (!obstacle || obstacle.locked) return;
      if (updateDragTrashState(e, 'obstacle')) {
        state.obstacleDrag.invalid = false;
        updateUI(); render();
        return;
      }
      const next = INTERFERENCE_OBSTACLES.updateObstacle(obstacle, {
        x: snap(world.x - state.obstacleDrag.offsetX),
        y: snap(world.y - state.obstacleDrag.offsetY)
      });
      const validity = next && obstaclePlacementValidity(next);
      state.obstacleDrag.invalid = !validity?.valid;
      if (validity?.valid) {
        state.obstacleDrag.moved = state.obstacleDrag.moved || next.x !== state.obstacleDrag.original.x || next.y !== state.obstacleDrag.original.y;
        replaceObstacle(next, false);
      }
      updateUI(); render();
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
    if (state.mode === 'boundary' || state.mode === 'cutout') {
      onCadPointerUp(e);
      state.pointer.down = false;
      try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (state.mode === 'obstacle-edit') {
      const pendingObstaclePlacement = state.pointer.pendingObstaclePlacement;
      state.pointer.pendingObstaclePlacement = false;
      if (pendingObstaclePlacement) placeObstacleAtCursor();
      state.pointer.down = false;
      try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (state.obstacleDrag?.pointerId === e.pointerId) {
      const drag = state.obstacleDrag;
      const deleteObstacle = pointerIsOverDragTrash(e);
      if (deleteObstacle) {
        state.obstacles = state.obstacles.filter(obstacle => obstacle.id !== drag.id);
        state.selectedObstacleId = null;
        snapshotSerialized(drag.historyState);
        toast('干渉物を削除しました');
      } else if (drag.invalid) {
        replaceObstacle(drag.original, false);
      } else if (drag.moved) {
        snapshotSerialized(drag.historyState);
      }
      state.obstacleDrag = null;
      clearDragTrashState();
      state.pointer.down = false;
      try { els.courseCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      persistLocal(); updateUI(); render();
      return;
    }
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
    els.courseCanvas.classList.remove('is-moving');
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
    if (state.mode === 'cutout') cancelCadDrag();
    cancelObstacleDrag();
    clearDragTrashState();
    state.pointer.pendingObstaclePlacement = false;
    state.pointer.down = false;
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
    els.courseCanvas.classList.remove('is-moving');
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
    // Ctrl owns zoom, even with a selected part. It never falls through to rotation.
    if (e.ctrlKey) {
      e.preventDefault();
      wheelRotation.reset();
      if (state.pointer.down) return;
      const { x: sx, y: sy } = canvasScreenPoint(e);
      const before = screenToWorld(sx, sy);
      const factor = e.deltaY < 0 ? 1.1 : .9;
      state.view.scale = clamp(state.view.scale * factor, .08, 8);
      state.view.offsetX = sx - before.x * state.view.scale;
      state.view.offsetY = sy - before.y * state.view.scale;
      updateUI();
      render();
      return;
    }
    // Shift-wheel is reserved for the browser/OS, as are room-CAD and empty
    // course canvas scrolling. The listener is attached to the canvas only,
    // so sidebars and form controls never reach this handler.
    if (e.shiftKey || e.metaKey || !hasWheelRotatableTarget()) { wheelRotation.reset(); return; }
    e.preventDefault();
    const direction = wheelRotation.push(e);
    if (!direction) return;
    if (state.mode === 'place') {
      const proposal = getPlacementProposal();
      if (proposal?.requiresHeightChoice && proposal.candidates.length > 1) {
        cycleSnapTargetChoice(direction);
        return;
      }
    }
    rotateCurrent(direction < 0 ? -45 : 45);
  }

  function hasWheelRotatableTarget() {
    if (state.pointer.down || state.layoutMove.active) return false;
    if (state.mode === 'cutout' || state.mode === 'boundary') return false;
    if (state.mode === 'place') return true; // placement ghost
    if (state.mode === 'start') return !state.start; // start ghost
    return selectedParts().length > 0;
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

    const key = e.key.toLowerCase();

    if (key === 'escape' && (state.cad.drag || state.obstacleDrag)) {
      e.preventDefault();
      cancelCadDrag();
      cancelObstacleDrag();
      resetPointerInteraction();
      updateUI(); render();
      return;
    }

    if (state.mode === 'obstacle-edit' && key === 'escape') {
      e.preventDefault();
      cancelObstaclePlacement();
      return;
    }

    if (selectedObstacle() && key === 'escape') {
      e.preventDefault();
      clearObstacleSelection();
      return;
    }

    if (state.mode === 'cutout') {
      const selected = selectedCutout();
      const deltaMm = e.shiftKey ? 100 : 10;
      const delta = key === 'arrowleft' ? { x: -deltaMm, y: 0 }
        : key === 'arrowright' ? { x: deltaMm, y: 0 }
        : key === 'arrowup' ? { x: 0, y: -deltaMm }
        : key === 'arrowdown' ? { x: 0, y: deltaMm }
        : null;
      if (delta && selected) {
        e.preventDefault();
        if (selected.locked) return toast('ロック中の切り抜きは移動できません');
        snapshot(); replaceCutout(ROOM_BOUNDARY.moveCutout(selected, delta));
        return;
      }
      if ((key === 'delete' || key === 'backspace') && selected) { e.preventDefault(); deleteSelectedCutout(); return; }
    }

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
    if (key === 'b') { e.preventDefault(); setMode('boundary'); return; }
    if (key === 'h') { e.preventDefault(); setMode('cutout'); return; }
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
        beginStartPlacement();
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
    if (state.wizard.active) return;
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
    if (state.selectedIds.length) state.selectedObstacleId = null;
  }

  function toggleSelection(id) {
    if (isSelected(id)) state.selectedIds = state.selectedIds.filter(x => x !== id);
    else state.selectedIds.push(id);
  }

  function clearSelection(refresh = true) {
    state.selectedIds = [];
    state.selectedObstacleId = null;
    if (refresh) { updateUI(); render(); }
  }

  function selectedObstacle() {
    return state.obstacles.find(obstacle => obstacle.id === state.selectedObstacleId) || null;
  }

  function beginObstacleDrag(obstacle, e, world) {
    clearDragTrashState();
    if (obstacle.locked) {
      toast('ロック中の干渉物は移動・ゴミ箱削除できません。先にロックを解除してください');
      return false;
    }
    state.obstacleDrag = {
      pointerId: e.pointerId, id: obstacle.id,
      offsetX: world.x - obstacle.x, offsetY: world.y - obstacle.y,
      original: { ...obstacle }, historyState: JSON.stringify(serializeState()), moved: false, invalid: false
    };
    return true;
  }

  function cancelObstacleDrag() {
    if (state.obstacleDrag) replaceObstacle(state.obstacleDrag.original, false);
    state.obstacleDrag = null;
    clearDragTrashState();
  }

  function clearObstacleSelection(refresh = true) {
    state.selectedObstacleId = null;
    cancelObstacleDrag();
    if (refresh) { updateUI(); render(); }
  }

  function selectObstacle(id, options = {}) {
    const obstacle = state.obstacles.find(item => item.id === id);
    if (!obstacle) return false;
    state.selectedObstacleId = obstacle.id;
    state.selectedIds = [];
    state.hoveredPartId = null;
    if (options.closeSetup) ensureSetupDialogClosed();
    if (options.mode !== false) state.mode = state.subEditMode === 'interference' ? 'move' : (state.start ? 'place' : 'start');
    updateUI(); render();
    return true;
  }

  function obstacleFromCreateInputs() {
    const widthCm = Number(els.newObstacleWidthInput?.value) * 100;
    const depthCm = Number(els.newObstacleDepthInput?.value) * 100;
    const rotation = Number(els.newObstacleRotationInput?.value) || 0;
    const name = String(els.newObstacleNameInput?.value || '').trim();
    const candidate = INTERFERENCE_OBSTACLES.createObstacle({ name, x: state.cursor.x, y: state.cursor.y, widthCm, depthCm, rotation }, makeId, state.obstacles.length);
    return candidate;
  }

  function prepareObstacleCreateForm(source = null) {
    if (els.newObstacleNameInput) els.newObstacleNameInput.value = INITIAL_LAYOUT_FLOW.nextObstacleName(state.obstacles);
    if (els.newObstacleWidthInput) els.newObstacleWidthInput.value = source ? (source.widthCm / 100).toFixed(2) : '0.40';
    if (els.newObstacleDepthInput) els.newObstacleDepthInput.value = source ? (source.depthCm / 100).toFixed(2) : '0.40';
    if (els.newObstacleRotationInput) els.newObstacleRotationInput.value = String(source?.rotation || 0);
    setNewObstacleError('');
  }

  function setNewObstacleError(message = '') {
    if (!els.newObstacleError) return;
    els.newObstacleError.hidden = !message;
    els.newObstacleError.textContent = message;
  }

  function startObstaclePlacement() {
    if (!state.wizard.active) return;
    const candidate = obstacleFromCreateInputs();
    if (!candidate) {
      setNewObstacleError('名前、横幅、奥行を確認してください。横幅と奥行は0より大きく、50m以下にします。');
      return;
    }
    setNewObstacleError('');
    state.wizard.step = 'interference';
    enterSubEditMode('interference', 'obstacle-edit');
    state.obstaclePlacement = { ...candidate, id: 'ghost', visible: true, locked: false };
    ensureSetupDialogClosed();
    toast('干渉物を配置する位置をクリックしてください。Escでキャンセルできます');
    updateUI();
    if (state.wizard.isNew) fitView();
    render();
    els.courseCanvas.focus();
  }

  function repeatObstaclePlacement() {
    if (!state.wizard.active || state.subEditMode !== 'interference') return;
    const source = selectedObstacle() || state.obstacles.at(-1);
    if (!source) {
      openWizardObstacleCreator({ resetForm: true });
      return;
    }
    enterSubEditMode('interference', 'obstacle-edit');
    state.selectedObstacleId = null;
    state.obstaclePlacement = {
      ...source,
      id: 'ghost',
      name: INITIAL_LAYOUT_FLOW.nextObstacleName(state.obstacles),
      x: state.cursor.x,
      y: state.cursor.y,
      visible: true,
      locked: false
    };
    toast('同じサイズの干渉物を配置する位置をクリックしてください');
    updateUI(); render(); els.courseCanvas.focus();
  }

  function cancelObstaclePlacement() {
    if (!state.obstaclePlacement) return;
    state.obstaclePlacement = null;
    state.mode = state.subEditMode === 'interference' ? 'move' : (state.start ? 'place' : 'start');
    toast('干渉物の配置をキャンセルしました');
    updateUI(); render();
  }

  function placeObstacleAtCursor() {
    const ghost = state.obstaclePlacement;
    if (!ghost) return;
    const obstacle = INTERFERENCE_OBSTACLES.updateObstacle(ghost, { id: makeId(), x: state.cursor.x, y: state.cursor.y });
    const validity = obstacle && obstaclePlacementValidity(obstacle);
    if (!obstacle || !validity?.valid) {
      toast(validity?.reason === 'room-cutout' ? '切り抜き領域には干渉物を配置できません' : 'レイアウトスペース内へ配置してください');
      return;
    }
    snapshot();
    state.obstacles.push(obstacle);
    state.obstaclePlacement = null;
    state.mode = state.subEditMode === 'interference' ? 'move' : (state.start ? 'place' : 'start');
    selectObstacle(obstacle.id, { mode: false });
    if (obstacleOverlapsCourse(obstacle)) toast('干渉物を配置しました。コースパーツと重なっています');
    else toast('干渉物を配置しました');
    persistLocal(); updateUI(); render();
  }

  function obstacleHitTest(x, y) {
    return [...state.obstacles].reverse().find(obstacle => obstacle.visible && OBSTACLE_GEOMETRY.pointInPolygon({ x, y }, OBSTACLE_GEOMETRY.corners(obstacle))) || null;
  }

  function replaceObstacle(next, sync = true) {
    state.obstacles = state.obstacles.map(obstacle => obstacle.id === next.id ? next : obstacle);
    if (sync) { persistLocal(); updateUI(); render(); }
  }

  function setObstacleEditorError(message = '') {
    if (!els.obstacleEditorError) return;
    els.obstacleEditorError.hidden = !message;
    els.obstacleEditorError.textContent = message;
  }

  function applyObstacleEditorInputs() {
    const obstacle = selectedObstacle();
    if (!obstacle) return;
    const next = INTERFERENCE_OBSTACLES.updateObstacle(obstacle, {
      name: els.obstacleNameInput.value,
      x: Number(els.obstacleXInput.value) * 100,
      y: Number(els.obstacleYInput.value) * 100,
      widthCm: Number(els.obstacleWidthInput.value) * 100,
      depthCm: Number(els.obstacleDepthInput.value) * 100,
      rotation: Number(els.obstacleRotationInput.value),
      visible: els.obstacleVisibleInput.checked,
      locked: els.obstacleLockedInput.checked
    });
    if (!next) return setObstacleEditorError('数値を確認してください。横幅と奥行は0より大きく、50m以下にします。');
    const geometryChanged = next.x !== obstacle.x || next.y !== obstacle.y
      || next.widthCm !== obstacle.widthCm || next.depthCm !== obstacle.depthCm || next.rotation !== obstacle.rotation;
    if (obstacle.locked && geometryChanged) return setObstacleEditorError('ロック中の干渉物は位置・寸法・回転を変更できません。ロックを解除してから編集してください。');
    if (!obstaclePlacementValidity(next).valid) return setObstacleEditorError('レイアウトスペースまたは切り抜き領域との関係で、この変更は保存できません。');
    if (next.name === obstacle.name && next.x === obstacle.x && next.y === obstacle.y
      && next.widthCm === obstacle.widthCm && next.depthCm === obstacle.depthCm && next.rotation === obstacle.rotation
      && next.visible === obstacle.visible && next.locked === obstacle.locked) return setObstacleEditorError('');
    snapshot();
    replaceObstacle(next);
    setObstacleEditorError('');
  }

  function duplicateSelectedObstacle() {
    const obstacle = selectedObstacle();
    if (!obstacle) return;
    const copy = INTERFERENCE_OBSTACLES.duplicateObstacle(obstacle, makeId, candidate => obstaclePlacementValidity(candidate).valid);
    if (!copy) return toast('複製できる位置がありません');
    snapshot();
    state.obstacles.push(copy);
    selectObstacle(copy.id);
    persistLocal(); updateUI(); render();
  }

  function rotateSelectedObstacle(delta) {
    const obstacle = selectedObstacle();
    if (!obstacle) return;
    if (obstacle.locked) return setObstacleEditorError('ロック中のため編集できません。');
    const next = INTERFERENCE_OBSTACLES.updateObstacle(obstacle, { rotation: obstacle.rotation + delta });
    if (!next || !obstaclePlacementValidity(next).valid) {
      return setObstacleEditorError('回転後にスペース外または切り抜き領域へ重なるため、変更できません。');
    }
    snapshot();
    replaceObstacle(next);
    setObstacleEditorError('');
  }

  function deleteSelectedObstacle() {
    const obstacle = selectedObstacle();
    if (!obstacle) return;
    if (obstacle.locked) return toast('ロック中の干渉物は削除できません');
    snapshot();
    state.obstacles = state.obstacles.filter(item => item.id !== obstacle.id);
    state.selectedObstacleId = null;
    persistLocal(); updateUI(); render();
  }

  function resetPointerInteraction() {
    cancelCadDrag();
    cancelObstacleDrag();
    clearDragTrashState();
    state.pointer.down = false;
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
    state.pointer.pendingObstaclePlacement = false;
    state.hoveredPartId = null;
    els.courseCanvas?.classList.remove('is-moving', 'is-hovering-part');
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
    if (state.wizard.active) return;
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
    state.siteBoundary = ROOM_BOUNDARY.normalizeSiteBoundary({
      ...state.siteBoundary,
      x: nextField.originX * 10,
      y: nextField.originY * 10,
      width: nextField.widthCm * 10,
      height: nextField.heightCm * 10
    }, state.siteBoundary);
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
  function screenToWorld(x, y) { return ROOM_BOUNDARY.screenToWorld({ x, y }, state.view); }
  function canvasScreenPoint(event) {
    const rect = els.courseCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function roomCornerCacheKey(excludeCutoutId = null) {
    const cutouts = state.roomCutouts
      .filter(cutout => cutout.id !== excludeCutoutId)
      .map(cutout => [cutout.id, cutout.x, cutout.y, cutout.width, cutout.height, cutout.rotation, cutout.visible]);
    return JSON.stringify([state.siteBoundary.x, state.siteBoundary.y, state.siteBoundary.width, state.siteBoundary.height, state.siteBoundary.visible, excludeCutoutId, cutouts]);
  }

  function roomBoundaryGeometry(excludeCutoutId = null) {
    const key = roomCornerCacheKey(excludeCutoutId);
    if (!roomCornerCache.has(key)) {
      roomCornerCache.clear();
      roomCornerCache.set(key, {
        corners: ROOM_BOUNDARY.effectiveRoomCornerCandidates(state.siteBoundary, state.roomCutouts, { excludeCutoutId }),
        segments: ROOM_BOUNDARY.effectiveRoomBoundarySegments(state.siteBoundary, state.roomCutouts, { excludeCutoutId })
      });
    }
    return roomCornerCache.get(key);
  }

  function roomBoundaryCorners(excludeCutoutId = null) { return roomBoundaryGeometry(excludeCutoutId).corners; }
  function roomBoundarySegments(excludeCutoutId = null) { return roomBoundaryGeometry(excludeCutoutId).segments; }

  function screenCornerCandidates(excludeCutoutId = null) {
    return roomBoundaryCorners(excludeCutoutId).map(corner => {
      const screen = worldToScreen(corner.x / 10, corner.y / 10);
      return { ...corner, screenX: screen.x, screenY: screen.y };
    });
  }

  function screenBoundarySegments(excludeCutoutId = null) {
    return roomBoundarySegments(excludeCutoutId).map(segment => ({
      ...segment,
      start: worldToScreen(segment.x1 / 10, segment.y1 / 10),
      end: worldToScreen(segment.x2 / 10, segment.y2 / 10)
    }));
  }

  function snapCadPointToRoomCorner(pointMm, excludeCutoutId = null, activeKey = null) {
    const pointerScreen = worldToScreen(pointMm.x / 10, pointMm.y / 10);
    const candidates = screenCornerCandidates(excludeCutoutId).map(corner => ({ ...corner, x: corner.screenX, y: corner.screenY }));
    const cornerSnap = ROOM_BOUNDARY.selectScreenCornerSnap(pointerScreen, candidates, { activeKey: activeKey?.type === 'corner' ? activeKey.key : null, enterPx: 12, exitPx: 18 });
    if (cornerSnap) return { point: { x: cornerSnap.candidate.x, y: cornerSnap.candidate.y }, snap: { type: 'corner', key: cornerSnap.candidate.key, x: cornerSnap.candidate.x, y: cornerSnap.candidate.y } };
    const lineCandidates = screenBoundarySegments(excludeCutoutId).map(segment => {
      const projection = ROOM_BOUNDARY.closestPointOnBoundarySegment(pointMm, segment);
      const screen = worldToScreen(projection.x / 10, projection.y / 10);
      return { key: segment.id, x: screen.x, y: screen.y, projection, segment };
    });
    const lineSnap = ROOM_BOUNDARY.selectScreenCornerSnap(pointerScreen, lineCandidates, { activeKey: activeKey?.type === 'line' ? activeKey.key : null, enterPx: 8, exitPx: 14 });
    if (!lineSnap) return { point: pointMm, snap: null };
    const { projection, segment } = lineSnap.candidate;
    return { point: projection, snap: { type: 'line', key: segment.id, x: projection.x, y: projection.y, segment } };
  }

  function snapMovedCutoutToRoomCorner(cutout, position, excludeCutoutId, activeSnap = null) {
    const moved = ROOM_BOUNDARY.normalizeCutout({ ...cutout, ...position }, { id: cutout.id });
    const corners = ROOM_BOUNDARY.cutoutCornerPoints(moved);
    const targets = screenCornerCandidates(excludeCutoutId);
    const pairs = corners.flatMap((corner, index) => {
      const screen = worldToScreen(corner.x / 10, corner.y / 10);
      return targets.map(target => ({
        key: `${index}:${target.key}`,
        x: screen.x,
        y: screen.y,
        corner,
        target
      }));
    });
    const selection = ROOM_BOUNDARY.selectScreenCornerSnap({ x: 0, y: 0 }, pairs.map(pair => ({
      key: pair.key,
      x: Math.hypot(pair.x - pair.target.screenX, pair.y - pair.target.screenY),
      y: 0,
      pair
    })), { activeKey: activeSnap?.type === 'corner' ? activeSnap.key : null, enterPx: 12, exitPx: 18 });
    if (selection) {
      const pair = selection.candidate.pair;
      return {
        position: {
          x: ROOM_BOUNDARY.round10mm(position.x + pair.target.x - pair.corner.x),
          y: ROOM_BOUNDARY.round10mm(position.y + pair.target.y - pair.corner.y)
        },
        snap: { type: 'corner', key: pair.key, x: pair.target.x, y: pair.target.y }
      };
    }
    const bounds = ROOM_BOUNDARY.rotatedBounds(moved);
    const linePairs = [];
    roomBoundarySegments(excludeCutoutId).forEach(segment => {
      if (segment.orientation === 'vertical') {
        ['left', 'right'].forEach(edge => {
          const edgeX = edge === 'left' ? bounds.left : bounds.right;
          const overlapTop = Math.max(bounds.top, Math.min(segment.y1, segment.y2));
          const overlapBottom = Math.min(bounds.bottom, Math.max(segment.y1, segment.y2));
          if (overlapTop > overlapBottom) return;
          const source = { x: edgeX, y: (overlapTop + overlapBottom) / 2 };
          const target = { x: segment.x1, y: source.y };
          const sourceScreen = worldToScreen(source.x / 10, source.y / 10);
          const targetScreen = worldToScreen(target.x / 10, target.y / 10);
          linePairs.push({ key: `${edge}:${segment.id}`, x: Math.abs(sourceScreen.x - targetScreen.x), y: 0, edge, segment, source, target });
        });
      } else {
        ['top', 'bottom'].forEach(edge => {
          const edgeY = edge === 'top' ? bounds.top : bounds.bottom;
          const overlapLeft = Math.max(bounds.left, Math.min(segment.x1, segment.x2));
          const overlapRight = Math.min(bounds.right, Math.max(segment.x1, segment.x2));
          if (overlapLeft > overlapRight) return;
          const source = { x: (overlapLeft + overlapRight) / 2, y: edgeY };
          const target = { x: source.x, y: segment.y1 };
          const sourceScreen = worldToScreen(source.x / 10, source.y / 10);
          const targetScreen = worldToScreen(target.x / 10, target.y / 10);
          linePairs.push({ key: `${edge}:${segment.id}`, x: 0, y: Math.abs(sourceScreen.y - targetScreen.y), edge, segment, source, target });
        });
      }
    });
    const lineSelection = ROOM_BOUNDARY.selectScreenCornerSnap({ x: 0, y: 0 }, linePairs, { activeKey: activeSnap?.type === 'line' ? activeSnap.key : null, enterPx: 8, exitPx: 14 });
    if (!lineSelection) return { position, snap: null };
    const line = lineSelection.candidate;
    return {
      position: {
        x: ROOM_BOUNDARY.round10mm(position.x + line.target.x - line.source.x),
        y: ROOM_BOUNDARY.round10mm(position.y + line.target.y - line.source.y)
      },
      snap: { type: 'line', key: line.key, x: line.target.x, y: line.target.y, segment: line.segment }
    };
  }

  function offsetDimensionLabel(point, side, lineLength, width, height, occupied = []) {
    const offset = 15;
    const next = { ...point };
    const horizontal = side === 'left' || side === 'right';
    if (lineLength < 30) {
      if (horizontal) next.y += side === 'left' ? -offset : offset;
      else next.x += side === 'top' ? -offset : offset;
    }
    if (horizontal && (next.y < 14 || next.y > height - 14)) next.y += next.y < 14 ? offset : -offset;
    if (!horizontal && (next.x < 30 || next.x > width - 30)) next.x += next.x < 30 ? offset : -offset;
    const collides = lineLength < 30 && occupied.some(other => Math.abs(other.x - next.x) < 54 && Math.abs(other.y - next.y) < 18);
    if (collides) {
      if (horizontal) next.y += side === 'left' ? -offset : offset;
      else next.x += side === 'top' ? -offset : offset;
    }
    return next;
  }

  function cadDimensionLines(cutout) {
    const { boundary, bounds, distances } = ROOM_BOUNDARY.wallDimensionGeometry(state.siteBoundary, cutout);
    const world = (x, y) => ({ x: x / 10, y: y / 10 });
    return [
      { side: 'left', value: distances.left, start: world(boundary.left, bounds.top), end: world(bounds.left, bounds.top) },
      { side: 'right', value: distances.right, start: world(bounds.right, bounds.bottom), end: world(boundary.right, bounds.bottom) },
      { side: 'top', value: distances.top, start: world(bounds.left, boundary.top), end: world(bounds.left, bounds.top) },
      { side: 'bottom', value: distances.bottom, start: world(bounds.right, bounds.bottom), end: world(bounds.right, boundary.bottom) }
    ];
  }

  function updateCutoutDimensionOverlay() {
    const overlay = els.cutoutDimensionOverlay;
    const preview = state.cad.dragStartMm && state.cad.dragCurrentMm
      ? ROOM_BOUNDARY.cutoutFromDrag(state.cad.dragStartMm, state.cad.dragCurrentMm, { id: 'preview' })
      : null;
    const cutout = state.mode === 'cutout' ? (preview || selectedCutout()) : null;
    if (!overlay || !cutout) { if (overlay && !overlay.hidden) overlay.hidden = true; return; }
    const width = Math.max(1, els.canvasWrap.clientWidth);
    const height = Math.max(1, els.canvasWrap.clientHeight);
    const labels = cadDimensionLines(cutout).map(line => ({
      ...line,
      from: worldToScreen(line.start.x, line.start.y),
      to: worldToScreen(line.end.x, line.end.y)
    }));
    const occupied = [];
    labels.forEach(value => {
      const { side } = value;
      const element = overlay.querySelector(`[data-cutout-dimension="${side}"]`);
      if (!element) return;
      const midpoint = side === 'left' || side === 'right'
        ? ROOM_BOUNDARY.horizontalDimensionLabelPoint(value.from, value.to)
        : ROOM_BOUNDARY.verticalDimensionLabelPoint(value.from, value.to);
      const lineLength = Math.hypot(value.to.x - value.from.x, value.to.y - value.from.y);
      const labelPoint = offsetDimensionLabel(midpoint, side, lineLength, width, height, occupied);
      occupied.push(labelPoint);
      const text = `${side === 'left' ? '左' : side === 'right' ? '右' : side === 'top' ? '上' : '下'} ${value.value}mm`;
      if (element.textContent !== text) element.textContent = text;
      const left = `${labelPoint.x}px`; const top = `${labelPoint.y}px`;
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      element.classList.toggle('is-negative', value.value < 0);
    });
    if (overlay.hidden) overlay.hidden = false;
  }
  function makeId() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

  function updateObstacleList() {
    if (!els.obstacleList) return;
    els.obstacleList.replaceChildren();
    if (!state.obstacles.length) {
      els.obstacleList.textContent = '設定済みの干渉物はありません。';
      els.obstacleList.className = 'obstacle-list empty-summary';
      return;
    }
    els.obstacleList.className = 'obstacle-list';
    state.obstacles.forEach(obstacle => {
      const button = document.createElement('button');
      button.type = 'button';
      const label = document.createElement('strong'); label.textContent = obstacle.name;
      const status = document.createElement('small'); status.textContent = `${obstacle.visible ? '表示' : '非表示'}${obstacle.locked ? ' / ロック' : ''}`;
      button.append(label, status);
      button.addEventListener('click', () => {
        enterSubEditMode('interference', 'move');
        selectObstacle(obstacle.id, { closeSetup: true });
      });
      els.obstacleList.append(button);
    });
  }

  function updateObstacleEditor() {
    const obstacle = selectedObstacle();
    if (els.obstacleEditorPanel) els.obstacleEditorPanel.hidden = !obstacle;
    if (!obstacle) return;
    const values = {
      obstacleNameInput: obstacle.name,
      obstacleXInput: (obstacle.x / 100).toFixed(2),
      obstacleYInput: (obstacle.y / 100).toFixed(2),
      obstacleWidthInput: (obstacle.widthCm / 100).toFixed(2),
      obstacleDepthInput: (obstacle.depthCm / 100).toFixed(2),
      obstacleRotationInput: String(obstacle.rotation)
    };
    Object.entries(values).forEach(([id, value]) => {
      if (els[id] && document.activeElement !== els[id]) els[id].value = value;
    });
    els.obstacleVisibleInput.checked = obstacle.visible;
    els.obstacleLockedInput.checked = obstacle.locked;
    ['obstacleNameInput','obstacleXInput','obstacleYInput','obstacleWidthInput','obstacleDepthInput','obstacleRotationInput'].forEach(id => { if (els[id]) els[id].disabled = obstacle.locked; });
    if (els.deleteObstacleBtn) els.deleteObstacleBtn.disabled = obstacle.locked;
    if (els.duplicateObstacleBtn) els.duplicateObstacleBtn.disabled = false;
    if (els.rotateObstacleLeftBtn) els.rotateObstacleLeftBtn.disabled = obstacle.locked;
    if (els.rotateObstacleRightBtn) els.rotateObstacleRightBtn.disabled = obstacle.locked;
    if (els.obstacleCollisionWarning) els.obstacleCollisionWarning.hidden = !obstacleOverlapsCourse(obstacle);
  }

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
      : state.mode === 'obstacle-edit'
        ? '干渉物配置'
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
      labels['obstacle-interference'] = '干渉物との重なり';
      labels['cutout-interference'] = 'スペース修正範囲との重なり';
      labels['field-overflow'] = 'レイアウトスペース外';
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
    const boundaryMode = state.mode === 'boundary';
    const cutoutMode = state.mode === 'cutout';
    const subEditorActive = Boolean(state.subEditMode);
    if (els.subEditModeBar) els.subEditModeBar.hidden = !subEditorActive;
    if (els.statusBar) {
      const statusVisibilityChanged = els.statusBar.hidden !== subEditorActive;
      els.statusBar.hidden = subEditorActive;
      // Hiding the footer changes canvasWrap's flex height; resize its backing
      // store immediately so a sub-editor cannot leave a stale canvas edge.
      if (statusVisibilityChanged) resizeCanvas();
    }
    if (state.subEditMode === 'space-adjustment' && els.subEditModeTitle) els.subEditModeTitle.textContent = '部屋形状調整中';
    if (state.subEditMode === 'interference' && els.subEditModeTitle) els.subEditModeTitle.textContent = '干渉物設定中';
    const wizardInterference = state.wizard.active && state.subEditMode === 'interference';
    if (els.subEditObstacleCount) {
      els.subEditObstacleCount.hidden = !wizardInterference;
      els.subEditObstacleCount.textContent = `配置済み ${state.obstacles.length}件`;
    }
    if (els.repeatObstaclePlacementBtn) els.repeatObstaclePlacementBtn.hidden = !wizardInterference || state.obstacles.length === 0 || !!state.obstaclePlacement;
    if (els.addObstacleFromBarBtn) {
      els.addObstacleFromBarBtn.hidden = !wizardInterference;
      els.addObstacleFromBarBtn.textContent = state.obstacles.length ? '別の干渉物を追加' : '＋干渉物を追加';
    }
    if (els.returnToSetupBtn) els.returnToSetupBtn.hidden = wizardInterference;
    if (state.wizard.active && state.subEditMode === 'space-adjustment') {
      if (els.returnToSetupBtn) els.returnToSetupBtn.textContent = '初期設定へ戻る';
      if (els.finishSubEditBtn) els.finishSubEditBtn.textContent = '次へ';
    } else if (state.wizard.active && state.subEditMode === 'interference') {
      if (els.finishSubEditBtn) els.finishSubEditBtn.textContent = '次へ';
    } else {
      if (els.returnToSetupBtn) els.returnToSetupBtn.textContent = '初期設定へ戻る';
      if (els.finishSubEditBtn) els.finishSubEditBtn.textContent = '編集を完了';
    }
    if (els.siteBoundaryPanel) els.siteBoundaryPanel.hidden = !boundaryMode;
    if (els.roomCutoutPanel) els.roomCutoutPanel.hidden = !cutoutMode;
    if (boundaryMode) {
      const boundary = state.siteBoundary;
      const values = { siteBoundaryName: boundary.name, siteBoundaryX: boundary.x, siteBoundaryY: boundary.y, siteBoundaryWidth: boundary.width, siteBoundaryHeight: boundary.height };
      Object.entries(values).forEach(([id, value]) => { if (els[id] && document.activeElement !== els[id]) els[id].value = String(value); });
      if (els.siteBoundaryVisible) els.siteBoundaryVisible.checked = boundary.visible;
    }
    if (cutoutMode) {
      const cutout = selectedCutout();
      if (els.roomCutoutEmpty) els.roomCutoutEmpty.hidden = !!cutout;
      if (els.roomCutoutEditor) els.roomCutoutEditor.hidden = !cutout;
      if (cutout) {
        const values = { cutoutName: cutout.name, cutoutX: cutout.x, cutoutY: cutout.y, cutoutWidth: cutout.width, cutoutHeight: cutout.height, cutoutRotation: cutout.rotation };
        Object.entries(values).forEach(([id, value]) => { if (els[id] && document.activeElement !== els[id]) els[id].value = String(value); });
        els.cutoutVisible.checked = cutout.visible;
        els.cutoutLocked.checked = cutout.locked;
        const distances = ROOM_BOUNDARY.distancesToBoundary(state.siteBoundary, cutout);
        els.cutoutDistances.innerHTML = `<span>左: ${distances.left}mm</span><span>右: ${distances.right}mm</span><span>上: ${distances.top}mm</span><span>下: ${distances.bottom}mm</span>`;
        els.deleteCutoutBtn.disabled = cutout.locked;
        if (els.rotateCutoutLeftBtn) els.rotateCutoutLeftBtn.disabled = cutout.locked;
        if (els.rotateCutoutRightBtn) els.rotateCutoutRightBtn.disabled = cutout.locked;
        if (els.clearCutoutSelectionBtn) els.clearCutoutSelectionBtn.disabled = false;
        if (els.duplicateCutoutBtn) els.duplicateCutoutBtn.textContent = '修正範囲を複製';
        if (els.deleteCutoutBtn) els.deleteCutoutBtn.textContent = '修正範囲を削除';
      }
    }
    const canStartObstaclePlacement = NEW_LAYOUT_TABS.canStartSpaceAdjustment(state);
    if (els.startObstaclePlacementBtn) els.startObstaclePlacementBtn.disabled = !canStartObstaclePlacement;
    if (els.newObstacleGuide) els.newObstacleGuide.hidden = canStartObstaclePlacement;
    updateObstacleList();
    updateObstacleEditor();
    updateCutoutDimensionOverlay();
    updateFastPathGuide();
    updateSnapCandidatePanel(proposal);

    const showInstruction = state.layoutMove.active || state.mode === 'start' || state.mode === 'place' || ['move','delete','color','boundary','cutout','obstacle-edit'].includes(state.mode);
    els.instruction.classList.toggle('hidden', !showInstruction);
    if (state.layoutMove.active) {
      els.instruction.innerHTML = '<strong>レイアウト全体を移動中</strong><span>マウスで移動 → クリックで固定・Esc／右クリックで取消</span>';
    } else if (state.mode === 'start') {
      els.instruction.innerHTML = '<strong>スタートレーンを配置</strong><span>マウスで位置移動・Z/Xで回転 → クリックで配置</span>';
    } else if (state.mode === 'place') {
      updatePlacementInstruction(proposal);
    } else if (state.mode === 'move') {
      els.instruction.innerHTML = '<strong>Q：パーツ移動</strong><span>クリックしてドラッグ・Shift+クリック／範囲ドラッグで複数選択・Escで配置へ</span>';
    } else if (state.mode === 'delete') {
      els.instruction.innerHTML = '<strong>W：パーツ削除</strong><span>クリックで1個削除・Shift+クリックで複数選択・範囲ドラッグでまとめて削除</span>';
    } else if (state.mode === 'color') {
      els.instruction.innerHTML = '<strong>E：カラー変更</strong><span>クリックで色を順送り・Shift+クリック／範囲ドラッグで複数変更</span>';
    } else if (state.mode === 'boundary') {
      els.instruction.innerHTML = '<strong>設置範囲設定</strong><span>左パネルのmm入力で設置範囲を変更。既存コースは移動しません。</span>';
    } else if (state.mode === 'cutout') {
      els.instruction.innerHTML = '<strong>部屋形状作成</strong><span>ドラッグで切り抜きを作成。選択後はドラッグ移動・矢印10mm・Shift+矢印100mm。</span>';
    } else if (state.mode === 'obstacle-edit') {
      els.instruction.innerHTML = '<strong>干渉物を配置</strong><span>カーソル位置をクリックして配置・Escでキャンセル</span>';
    }

    els.gridBtn.classList.toggle('active', state.showGrid);
    els.manualFitBtn.classList.toggle('active', state.layoutMove.active);
    els.undoBtn.disabled = !state.history.length;
    els.redoBtn.disabled = !state.future.length;
    els.deleteSelectionBtn.disabled = !state.selectedIds.length;
    els.colorSelectionBtn.disabled = !state.selectedIds.length;

    if (selectedObstacle()) {
      const obstacle = selectedObstacle();
      els.selectionInfo.className = 'selection-info';
      els.selectionInfo.innerHTML = `<strong>干渉物：${obstacle.name}</strong><br>${(obstacle.widthCm / 100).toFixed(2)}m × ${(obstacle.depthCm / 100).toFixed(2)}m / ${obstacle.rotation}°${obstacle.locked ? '<br>ロック中' : ''}`;
    } else if (state.selectedIds.length) {
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
    if (selectedObstacle() && obstacleOverlapsCourse(selectedObstacle())) {
      els.selectionInfo.append(document.createElement('br'), 'コースパーツと重なっています');
    } else if (state.selectedIds.length) {
      const obstacleWarningCount = state.selectedIds.reduce((count, id) => count + obstacleWarningCountForPart(id), 0);
      if (obstacleWarningCount) els.selectionInfo.append(document.createElement('br'), `干渉物と重なっています（${obstacleWarningCount}件）`);
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
    els.courseCanvas.classList.toggle('mode-cad', boundaryMode || cutoutMode);
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
