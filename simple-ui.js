(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_SIMPLE_UI = api;
  if (root && root.document) api.install(root.document, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SECONDARY_STATUS_IDS = Object.freeze([
    ['statusConnection', 'NEXT'],
    ['statusCursor', 'CURSOR'],
    ['statusSelected', 'SELECT'],
    ['statusCount', 'COUNT'],
    ['statusAssets', 'ASSET'],
    ['statusOverflow', 'OUT'],
    ['statusZoom', 'ZOOM']
  ]);

  const SECONDARY_TOOLBAR_IDS = Object.freeze([
    'gridBtn',
    'manualFitBtn',
    'topLeftFitBtn',
    'autoFitFieldBtn'
  ]);

  function parseSelectionCount(value) {
    const count = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function normalizeContextIdentity(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function buildContextSignature({ selectionCount = 0, obstacleActive = false, selectionIdentity = '', obstacleIdentity = '' } = {}) {
    const count = parseSelectionCount(selectionCount);
    const obstacle = Boolean(obstacleActive);
    return [
      count,
      obstacle ? 1 : 0,
      normalizeContextIdentity(selectionIdentity),
      obstacle ? normalizeContextIdentity(obstacleIdentity) : ''
    ].join('|');
  }

  // The editor is keyboard/left-toolbar first. Selection context must never
  // steal horizontal space; the detail drawer is opened explicitly only.
  function computeDrawerState({ manualOpen = false } = {}) {
    const open = Boolean(manualOpen);
    return Object.freeze({ open, contextOnly: false });
  }

  function pointInsideElement(event, element) {
    if (!event || !element?.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  // app.js keeps its editing state private. For production we borrow the
  // existing QA bridge only long enough to wire course-part drag-to-trash,
  // then remove the public debug handle again. The bridge rolls an in-progress
  // move back before deleting so one Undo restores the exact pre-drag layout.
  function installCoursePartTrashBridge(documentRef, rootRef, courseCanvas, dragTrash) {
    if (!documentRef || !rootRef || !courseCanvas || !dragTrash || rootRef.__M4WD_COURSE_PART_TRASH_BRIDGE_INSTALLED__) return false;
    rootRef.__M4WD_COURSE_PART_TRASH_BRIDGE_INSTALLED__ = true;

    let attachAttempts = 0;
    const attach = () => {
      const debug = rootRef.__mini4wdCourseDebug;
      if (!debug || typeof debug.getState !== 'function' || typeof debug.getRuntimeState !== 'function'
        || typeof debug.setSelectedIds !== 'function' || typeof debug.deleteParts !== 'function') {
        attachAttempts += 1;
        if (attachAttempts < 50 && rootRef.setTimeout) rootRef.setTimeout(attach, 0);
        return;
      }

      const testPage = /test-index\.html$/.test(String(rootRef.location?.pathname || ''));
      if (!testPage) {
        try { delete rootRef.__mini4wdCourseDebug; } catch (_) {}
      }

      let pendingDrag = null;
      let activeDrag = null;

      const setTrashVisual = over => {
        dragTrash.classList.add('is-dragging');
        dragTrash.classList.toggle('is-delete-target', Boolean(over));
        const label = dragTrash.querySelector('#dragTrashLabel');
        if (label) label.textContent = over ? '離すと削除' : '削除';
      };

      const clearTrashVisual = () => {
        dragTrash.classList.remove('is-dragging', 'is-delete-target');
        const label = dragTrash.querySelector('#dragTrashLabel');
        if (label) label.textContent = '削除';
      };

      const cancelBridgeDrag = () => {
        pendingDrag = null;
        activeDrag = null;
        clearTrashVisual();
      };

      documentRef.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.shiftKey || event.target !== courseCanvas) return;
        let runtime;
        let layout;
        try {
          runtime = debug.getRuntimeState();
          layout = debug.getState();
        } catch (_) { return; }
        if (runtime?.mode !== 'move') return;
        pendingDrag = {
          pointerId: event.pointerId,
          historyLength: Number(runtime.historyLength) || 0,
          layout
        };
        if (!rootRef.setTimeout) return;
        rootRef.setTimeout(() => {
          if (!pendingDrag || pendingDrag.pointerId !== event.pointerId) return;
          let after;
          try { after = debug.getRuntimeState(); } catch (_) { pendingDrag = null; return; }
          const ids = Array.isArray(after?.selectedIds) ? [...after.selectedIds] : [];
          if (after?.mode !== 'move' || !ids.length) {
            pendingDrag = null;
            return;
          }
          activeDrag = { ...pendingDrag, ids };
          pendingDrag = null;
          setTrashVisual(false);
        }, 0);
      }, true);

      documentRef.addEventListener('pointermove', event => {
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
        setTrashVisual(pointInsideElement(event, dragTrash));
      }, true);

      documentRef.addEventListener('pointerup', event => {
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
        const drag = activeDrag;
        const overTrash = pointInsideElement(event, dragTrash);
        if (!overTrash) {
          cancelBridgeDrag();
          return;
        }

        // Stop app.js from committing the same pointerup as a normal move.
        event.preventDefault();
        event.stopImmediatePropagation();
        activeDrag = null;
        pendingDrag = null;

        try {
          const runtime = debug.getRuntimeState();
          if ((Number(runtime?.historyLength) || 0) > drag.historyLength && rootRef.KeyboardEvent) {
            documentRef.dispatchEvent(new rootRef.KeyboardEvent('keydown', {
              key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true
            }));
          }
          debug.setSelectedIds(drag.ids);
          debug.deleteParts(drag.ids);
        } finally {
          clearTrashVisual();
          try {
            const cancelEvent = rootRef.PointerEvent
              ? new rootRef.PointerEvent('pointercancel', { bubbles: true, pointerId: event.pointerId })
              : new rootRef.Event('pointercancel', { bubbles: true });
            courseCanvas.dispatchEvent(cancelEvent);
          } catch (_) {}
        }
      }, true);

      documentRef.addEventListener('pointercancel', event => {
        if (activeDrag?.pointerId === event.pointerId || pendingDrag?.pointerId === event.pointerId) cancelBridgeDrag();
      }, true);
      courseCanvas.addEventListener('lostpointercapture', cancelBridgeDrag);
    };

    if (rootRef.setTimeout) rootRef.setTimeout(attach, 0);
    else attach();
    return true;
  }

  function install(documentRef, rootRef) {
    if (!documentRef || documentRef.documentElement?.dataset.simpleUiInstalled === '1') return false;
    const body = documentRef.body;
    const workspace = documentRef.querySelector('.workspace-shell');
    const drawer = documentRef.querySelector('.right-sidebar');
    const canvasToolbar = documentRef.getElementById('canvasToolbar');
    const courseCanvas = documentRef.getElementById('courseCanvas');
    const dragTrash = documentRef.getElementById('dragTrash');
    const statusBar = documentRef.getElementById('statusBar');
    const selectionInfo = documentRef.getElementById('selectionInfo');
    const selectionPanel = documentRef.querySelector('.selection-panel');
    const obstaclePanel = documentRef.getElementById('obstacleEditorPanel');
    const obstacleNameInput = documentRef.getElementById('obstacleNameInput');
    const statusSelected = documentRef.getElementById('statusSelected');
    if (!body || !workspace || !drawer || !canvasToolbar || !statusBar || !statusSelected) return false;

    documentRef.documentElement.dataset.simpleUiInstalled = '1';
    body.classList.add('simple-ui-enabled');

    let selectionIdentityMarker = documentRef.getElementById('simpleUiSelectionIdentity');
    if (!selectionIdentityMarker) {
      selectionIdentityMarker = documentRef.createElement('span');
      selectionIdentityMarker.id = 'simpleUiSelectionIdentity';
      selectionIdentityMarker.hidden = true;
      selectionIdentityMarker.setAttribute('aria-hidden', 'true');
      selectionIdentityMarker.dataset.simpleUiSelectionIdentity = '1';
      selectionIdentityMarker.dataset.selectedIds = '[]';
      body.appendChild(selectionIdentityMarker);
    }

    const style = documentRef.createElement('style');
    style.id = 'simpleUiStyles';
    style.textContent = `
      body.simple-ui-enabled .workspace-shell {
        grid-template-columns: 228px minmax(0, 1fr) !important;
        position: relative;
      }
      body.simple-ui-enabled .canvas-area { position: relative; }
      body.simple-ui-enabled .right-sidebar {
        display: block !important;
        position: absolute !important;
        z-index: 30;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(320px, calc(100vw - 56px));
        border-left: 1px solid var(--line);
        box-shadow: -18px 0 42px rgba(0,0,0,.34);
        transform: translateX(calc(100% + 18px));
        transition: transform .18s ease, visibility .18s ease;
        visibility: hidden;
        pointer-events: none;
      }
      body.simple-ui-enabled .right-sidebar.simple-drawer-open {
        transform: translateX(0);
        visibility: visible;
        pointer-events: auto;
      }
      body.simple-ui-enabled .right-sidebar.simple-context-only > :not(.simple-drawer-header):not(.selection-panel):not(.obstacle-panel) {
        display: none !important;
      }
      body.simple-ui-enabled .simple-drawer-header {
        position: sticky;
        top: -14px;
        z-index: 4;
        margin: -14px -14px 12px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-bottom: 1px solid var(--line);
        background: rgba(14,20,28,.98);
      }
      body.simple-ui-enabled .simple-drawer-header strong { font-size: 12px; }
      body.simple-ui-enabled .simple-drawer-close {
        width: 30px;
        height: 30px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel);
        color: var(--text);
        cursor: pointer;
      }
      body.simple-ui-enabled .left-sidebar > .compact-panel { display: none !important; }
      body.simple-ui-enabled .statusbar {
        display: grid !important;
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
      body.simple-ui-enabled .statusbar > .simple-status-secondary { display: none !important; }
      body.simple-ui-enabled .simple-toolbar-more-trigger {
        height: 32px;
        min-width: 34px;
        padding: 0 10px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel);
        color: var(--text);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      body.simple-ui-enabled .simple-toolbar-more-trigger[aria-expanded="true"] {
        border-color: var(--accent);
        background: #1b2a36;
      }
      body.simple-ui-enabled .simple-toolbar-more-menu {
        position: fixed;
        z-index: 60;
        width: 210px;
        padding: 8px;
        display: grid;
        gap: 6px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #111922;
        box-shadow: var(--shadow);
      }
      body.simple-ui-enabled .simple-toolbar-more-menu[hidden] { display: none !important; }
      body.simple-ui-enabled .simple-toolbar-more-menu .toolbar-button {
        width: 100%;
        height: 34px;
        text-align: left;
      }
      body.simple-ui-enabled #detailsToggleBtn[aria-expanded="true"] {
        border-color: var(--accent);
        background: #1b2a36;
      }
      body.simple-ui-enabled .drag-trash {
        position: static !important;
        z-index: auto;
        width: 38px;
        height: 32px;
        min-height: 32px !important;
        max-height: 32px;
        flex: 0 0 38px;
        margin: 0 !important;
        padding: 0;
        border: 1px solid var(--line) !important;
        border-radius: 7px;
        background: var(--panel);
        color: var(--muted);
        opacity: 1;
        overflow: hidden;
        pointer-events: auto;
      }
      body.simple-ui-enabled .drag-trash .drag-trash-icon { font-size: 15px; }
      body.simple-ui-enabled .drag-trash #dragTrashLabel {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      body.simple-ui-enabled .drag-trash.is-dragging {
        border-color: #d1a32c !important;
        background: #2a2411;
        color: #ffe4a0;
      }
      body.simple-ui-enabled .drag-trash.is-delete-target {
        border-color: #ff6072 !important;
        background: #481823;
        color: #fff1f3;
      }
      body.simple-ui-enabled .simple-detail-status-list {
        display: grid;
        gap: 7px;
        margin: 0;
      }
      body.simple-ui-enabled .simple-detail-status-list > div {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 10px;
      }
      body.simple-ui-enabled .simple-detail-status-list dt,
      body.simple-ui-enabled .simple-detail-status-list dd { margin: 0; }
      body.simple-ui-enabled .simple-detail-status-list dd { color: var(--text); font-weight: 800; }
      @media (max-width: 860px) {
        body.simple-ui-enabled .workspace-shell { grid-template-columns: 190px minmax(0, 1fr) !important; }
        body.simple-ui-enabled .right-sidebar { width: min(300px, calc(100vw - 24px)); }
        body.simple-ui-enabled .statusbar { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
    `;
    documentRef.head.appendChild(style);

    const drawerHeader = documentRef.createElement('div');
    drawerHeader.className = 'simple-drawer-header';
    drawerHeader.innerHTML = '<strong>選択・詳細</strong><button class="simple-drawer-close" type="button" aria-label="詳細パネルを閉じる">×</button>';
    drawer.prepend(drawerHeader);

    if (selectionPanel) drawer.insertBefore(selectionPanel, drawerHeader.nextSibling);
    if (obstaclePanel) drawer.insertBefore(obstaclePanel, selectionPanel ? selectionPanel.nextSibling : drawerHeader.nextSibling);

    const detailStatusPanel = documentRef.createElement('section');
    detailStatusPanel.className = 'panel simple-detail-status-panel';
    detailStatusPanel.innerHTML = '<div class="panel-heading"><h2>詳細ステータス</h2></div><dl class="simple-detail-status-list"></dl>';
    const detailList = detailStatusPanel.querySelector('.simple-detail-status-list');
    const mirrors = new Map();
    for (const [id, label] of SECONDARY_STATUS_IDS) {
      const source = documentRef.getElementById(id);
      if (!source) continue;
      source.parentElement?.classList.add('simple-status-secondary');
      const row = documentRef.createElement('div');
      const dt = documentRef.createElement('dt');
      const dd = documentRef.createElement('dd');
      dt.textContent = label;
      dd.textContent = source.textContent || '';
      row.append(dt, dd);
      detailList.appendChild(row);
      mirrors.set(id, dd);
    }
    drawer.appendChild(detailStatusPanel);

    const toolbarGroups = canvasToolbar.querySelectorAll('.toolbar-group');
    const rightToolbarGroup = toolbarGroups[toolbarGroups.length - 1] || canvasToolbar;
    const detailsToggleBtn = documentRef.createElement('button');
    detailsToggleBtn.id = 'detailsToggleBtn';
    detailsToggleBtn.className = 'toolbar-button';
    detailsToggleBtn.type = 'button';
    detailsToggleBtn.textContent = '詳細';
    detailsToggleBtn.setAttribute('aria-controls', 'simpleEditorDrawer');
    detailsToggleBtn.setAttribute('aria-expanded', 'false');
    drawer.id = drawer.id || 'simpleEditorDrawer';

    const toolbarMoreTrigger = documentRef.createElement('button');
    toolbarMoreTrigger.id = 'simpleToolbarMoreBtn';
    toolbarMoreTrigger.className = 'simple-toolbar-more-trigger';
    toolbarMoreTrigger.type = 'button';
    toolbarMoreTrigger.setAttribute('aria-label', 'その他の表示操作');
    toolbarMoreTrigger.setAttribute('aria-controls', 'simpleToolbarMoreMenu');
    toolbarMoreTrigger.setAttribute('aria-expanded', 'false');
    toolbarMoreTrigger.textContent = '⋯';

    const toolbarMoreMenu = documentRef.createElement('div');
    toolbarMoreMenu.id = 'simpleToolbarMoreMenu';
    toolbarMoreMenu.className = 'simple-toolbar-more-menu';
    toolbarMoreMenu.hidden = true;
    toolbarMoreMenu.setAttribute('role', 'group');
    toolbarMoreMenu.setAttribute('aria-label', 'その他の表示操作');
    for (const id of SECONDARY_TOOLBAR_IDS) {
      const button = documentRef.getElementById(id);
      if (button) toolbarMoreMenu.appendChild(button);
    }
    if (dragTrash) {
      dragTrash.title = 'パーツをドラッグして削除';
      dragTrash.setAttribute('aria-label', 'パーツをドラッグして削除');
      rightToolbarGroup.append(dragTrash);
    }
    rightToolbarGroup.append(detailsToggleBtn, toolbarMoreTrigger);
    documentRef.body.appendChild(toolbarMoreMenu);

    let manualOpen = false;
    let lastContextSignature = '';

    function contextSnapshot() {
      const selectionCount = parseSelectionCount(statusSelected.textContent);
      const obstacleActive = Boolean(obstaclePanel && !obstaclePanel.hidden);
      const markerIdentity = normalizeContextIdentity(selectionIdentityMarker?.dataset?.selectedIds || '');
      const presentationFallback = normalizeContextIdentity(selectionInfo?.textContent || '');
      const selectionIdentity = selectionCount > 0 && markerIdentity && markerIdentity !== '[]'
        ? markerIdentity
        : presentationFallback;
      const obstacleIdentity = obstacleActive ? normalizeContextIdentity(obstacleNameInput?.value || '') : '';
      return {
        selectionCount,
        obstacleActive,
        active: selectionCount > 0 || obstacleActive,
        signature: buildContextSignature({ selectionCount, obstacleActive, selectionIdentity, obstacleIdentity })
      };
    }

    function refreshStatusMirrors() {
      for (const [id, target] of mirrors.entries()) {
        const source = documentRef.getElementById(id);
        if (source) target.textContent = source.textContent || '';
      }
    }

    function renderDrawer() {
      const context = contextSnapshot();
      lastContextSignature = context.signature;
      const state = computeDrawerState({ manualOpen });
      drawer.classList.toggle('simple-drawer-open', state.open);
      drawer.classList.remove('simple-context-only');
      detailsToggleBtn.setAttribute('aria-expanded', String(state.open));
      detailsToggleBtn.textContent = state.open ? '詳細を閉じる' : '詳細';
      return state;
    }

    function positionToolbarMoreMenu() {
      if (toolbarMoreMenu.hidden || !rootRef) return;
      const rect = toolbarMoreTrigger.getBoundingClientRect();
      const viewportWidth = Number(rootRef.innerWidth) || documentRef.documentElement.clientWidth || 0;
      const viewportHeight = Number(rootRef.innerHeight) || documentRef.documentElement.clientHeight || 0;
      const menuWidth = toolbarMoreMenu.offsetWidth || 210;
      const menuHeight = toolbarMoreMenu.offsetHeight || 160;
      const left = Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8));
      const preferredTop = rect.bottom + 7;
      const top = preferredTop + menuHeight <= viewportHeight - 8
        ? preferredTop
        : Math.max(8, rect.top - menuHeight - 7);
      toolbarMoreMenu.style.left = `${left}px`;
      toolbarMoreMenu.style.top = `${top}px`;
    }

    function setToolbarMoreOpen(open) {
      const nextOpen = Boolean(open);
      toolbarMoreMenu.hidden = !nextOpen;
      toolbarMoreTrigger.setAttribute('aria-expanded', String(nextOpen));
      if (nextOpen) positionToolbarMoreMenu();
    }

    detailsToggleBtn.addEventListener('click', () => {
      manualOpen = !manualOpen;
      renderDrawer();
    });

    drawerHeader.querySelector('.simple-drawer-close')?.addEventListener('click', () => {
      manualOpen = false;
      renderDrawer();
    });

    toolbarMoreTrigger.addEventListener('click', event => {
      event.stopPropagation();
      setToolbarMoreOpen(toolbarMoreMenu.hidden);
    });
    toolbarMoreMenu.addEventListener('click', event => {
      if (event.target?.closest?.('button')) setToolbarMoreOpen(false);
    });
    documentRef.addEventListener('click', event => {
      if (!toolbarMoreMenu.hidden && !toolbarMoreMenu.contains(event.target) && event.target !== toolbarMoreTrigger) {
        setToolbarMoreOpen(false);
      }
    });
    documentRef.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !toolbarMoreMenu.hidden) setToolbarMoreOpen(false);
    });
    canvasToolbar.addEventListener('scroll', () => setToolbarMoreOpen(false), { passive: true });
    rootRef?.addEventListener?.('resize', () => {
      if (!toolbarMoreMenu.hidden) positionToolbarMoreMenu();
    });

    const contextObserver = new MutationObserver(() => renderDrawer());
    contextObserver.observe(statusSelected, { childList: true, subtree: true, characterData: true });
    if (selectionInfo) contextObserver.observe(selectionInfo, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    contextObserver.observe(selectionIdentityMarker, { attributes: true, attributeFilter: ['data-selected-ids'] });
    if (obstaclePanel) contextObserver.observe(obstaclePanel, { attributes: true, attributeFilter: ['hidden'] });

    const scheduleContextRefresh = () => {
      if (rootRef?.setTimeout) rootRef.setTimeout(() => renderDrawer(), 0);
      else renderDrawer();
    };
    courseCanvas?.addEventListener?.('pointerup', scheduleContextRefresh);
    documentRef.addEventListener('click', scheduleContextRefresh);

    const statusObserver = new MutationObserver(refreshStatusMirrors);
    statusObserver.observe(statusBar, { childList: true, subtree: true, characterData: true });

    lastContextSignature = contextSnapshot().signature;
    refreshStatusMirrors();
    renderDrawer();
    installCoursePartTrashBridge(documentRef, rootRef, courseCanvas, dragTrash);

    const notifyLayoutChange = () => {
      if (!rootRef || typeof rootRef.dispatchEvent !== 'function' || typeof rootRef.Event !== 'function') return;
      rootRef.dispatchEvent(new rootRef.Event('resize'));
    };
    if (rootRef?.setTimeout) rootRef.setTimeout(notifyLayoutChange, 0);

    return true;
  }

  return Object.freeze({
    SECONDARY_STATUS_IDS,
    SECONDARY_TOOLBAR_IDS,
    parseSelectionCount,
    normalizeContextIdentity,
    buildContextSignature,
    computeDrawerState,
    pointInsideElement,
    install
  });
});
