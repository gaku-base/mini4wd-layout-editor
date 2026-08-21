(function attachUiControlsCleanup(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_UI_CONTROLS_CLEANUP = api;
  if (root && root.document) api.install(root.document, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TOP_ACTION_LABELS = Object.freeze({
    newBtn: '＋ 新規作成',
    saveBtn: '💾 レイアウト保存',
    loadInput: '📂 レイアウト読込',
    presentationBtn: '▣ 発表・出力'
  });

  const EDITOR_ACTION_LABELS = Object.freeze({
    undoBtn: '↶ 元に戻す',
    redoBtn: '↷ やり直す',
    rewindBtn: '↩ 1パーツ戻る',
    rotateLeftBtn: '↺ 左回転',
    rotateRightBtn: '↻ 右回転'
  });

  const OVERFLOW_ACTIONS = Object.freeze([
    ['gridBtn', '▦ グリッド表示'],
    ['fitViewBtn', '⊙ コース全体を表示'],
    ['manualFitBtn', '✥ コース全体を移動'],
    ['topLeftFitBtn', '↖ コースを左上へ整列'],
    ['autoFitFieldBtn', '⤢ 作成範囲をコースに合わせる']
  ]);

  const PRESENTATION_ACTION_LABELS = Object.freeze({
    presentationPngBtn: 'PNG画像を保存',
    presentationPrintBtn: 'A4で印刷',
    courseOnly: 'コース図のみ保存'
  });

  function setText(element, text) {
    if (!element || element.textContent === text) return false;
    element.textContent = text;
    return true;
  }

  function setFileLabel(documentRef) {
    const input = documentRef.getElementById('loadInput');
    const label = input?.closest?.('label');
    if (!input || !label) return false;
    let text = label.querySelector('[data-ui-file-label="1"]');
    if (!text) {
      for (const node of Array.from(label.childNodes || [])) {
        if (node.nodeType === 3 && String(node.textContent || '').trim()) node.textContent = '';
      }
      text = documentRef.createElement('span');
      text.dataset.uiFileLabel = '1';
      label.insertBefore(text, input);
    }
    return setText(text, TOP_ACTION_LABELS.loadInput);
  }

  function ensureStyles(documentRef) {
    if (documentRef.getElementById('uiControlsCleanupStyles')) return false;
    const style = documentRef.createElement('style');
    style.id = 'uiControlsCleanupStyles';
    style.textContent = `
      #exportBtn.ui-legacy-export-source {
        display: none !important;
      }
      html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .simple-toolbar-more-trigger.ui-display-placement-trigger {
        min-width: 104px;
        width: auto;
        padding: 0 12px;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }
      html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .simple-toolbar-more-menu {
        width: min(282px, calc(100vw - 16px));
      }
      html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .simple-toolbar-more-menu .toolbar-button {
        height: auto;
        min-height: 36px;
        white-space: normal;
        line-height: 1.25;
      }
      html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .drag-trash.ui-labeled-trash {
        width: 76px !important;
        flex: 0 0 76px !important;
        display: flex !important;
        align-items: center;
        justify-content: center;
        gap: 5px;
      }
      html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .drag-trash.ui-labeled-trash #dragTrashLabel {
        position: static !important;
        width: auto !important;
        height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: visible !important;
        clip: auto !important;
        white-space: nowrap !important;
        border: 0 !important;
        font-size: 11px;
        font-weight: 800;
      }
      html[data-ui-controls-cleanup-installed="1"] .toolbar-group[data-ui-toolbar-group] {
        min-width: max-content;
      }
      html[data-ui-controls-cleanup-installed="1"] .simple-course-only-export {
        white-space: nowrap;
      }
      @media (max-width: 860px) {
        html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .drag-trash.ui-labeled-trash {
          width: 38px !important;
          flex-basis: 38px !important;
          gap: 0;
        }
        html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .drag-trash.ui-labeled-trash #dragTrashLabel {
          position: absolute !important;
          width: 1px !important;
          height: 1px !important;
          margin: -1px !important;
          overflow: hidden !important;
          clip: rect(0, 0, 0, 0) !important;
        }
        html[data-ui-controls-cleanup-installed="1"] body.simple-ui-enabled .simple-toolbar-more-trigger.ui-display-placement-trigger {
          min-width: 72px;
          padding-inline: 8px;
        }
      }
    `;
    documentRef.head.appendChild(style);
    return true;
  }

  function applyTopActions(documentRef) {
    const newButton = documentRef.getElementById('newBtn');
    const saveButton = documentRef.getElementById('saveBtn');
    setText(newButton, TOP_ACTION_LABELS.newBtn);
    setText(saveButton, TOP_ACTION_LABELS.saveBtn);
    setFileLabel(documentRef);

    const exportButton = documentRef.getElementById('exportBtn');
    if (exportButton) {
      exportButton.hidden = true;
      exportButton.classList.add('ui-legacy-export-source');
      exportButton.setAttribute('aria-hidden', 'true');
      exportButton.tabIndex = -1;
    }

    const presentationButton = documentRef.getElementById('presentationBtn');
    if (presentationButton) {
      setText(presentationButton, TOP_ACTION_LABELS.presentationBtn);
      presentationButton.title = '発表用画像・PNG保存・A4印刷を開く';
      presentationButton.classList.add('button', 'primary');
      presentationButton.classList.remove('secondary');
    }
  }

  function applyEditorActionLabels(documentRef) {
    for (const [id, label] of Object.entries(EDITOR_ACTION_LABELS)) {
      const button = documentRef.getElementById(id);
      if (!button) continue;
      setText(button, label);
      button.classList.add('toolbar-button');
      if (id === 'undoBtn' || id === 'redoBtn') button.classList.remove('icon-button');
    }
    const shortcutTitles = {
      undoBtn: '元に戻す（Ctrl+Z）',
      redoBtn: 'やり直す（Ctrl+Y）',
      rewindBtn: '最後の1パーツを戻す（R）',
      rotateLeftBtn: '左へ45°回転（Z）',
      rotateRightBtn: '右へ45°回転（X）'
    };
    for (const [id, title] of Object.entries(shortcutTitles)) {
      const button = documentRef.getElementById(id);
      if (button) button.title = title;
    }
  }

  function sameOrder(menu, ids) {
    const current = Array.from(menu.children || [])
      .map(child => child.id)
      .filter(id => ids.includes(id));
    return current.length === ids.length && current.every((id, index) => id === ids[index]);
  }

  function applyToolbarStructure(documentRef) {
    const canvasToolbar = documentRef.getElementById('canvasToolbar');
    const moreButton = documentRef.getElementById('simpleToolbarMoreBtn');
    const moreMenu = documentRef.getElementById('simpleToolbarMoreMenu');
    const detailsButton = documentRef.getElementById('detailsToggleBtn');
    const dragTrash = documentRef.getElementById('dragTrash');
    if (!canvasToolbar || !moreButton || !moreMenu || !detailsButton) return false;

    applyEditorActionLabels(documentRef);

    const undo = documentRef.getElementById('undoBtn');
    const redo = documentRef.getElementById('redoBtn');
    const rewind = documentRef.getElementById('rewindBtn');
    const rotateLeft = documentRef.getElementById('rotateLeftBtn');
    const rotateRight = documentRef.getElementById('rotateRightBtn');
    const rightGroup = moreButton.closest?.('.toolbar-group') || canvasToolbar.querySelector('.toolbar-group:last-of-type');
    const historyGroup = undo?.closest?.('.toolbar-group');

    if (historyGroup) {
      historyGroup.dataset.uiToolbarGroup = 'history';
      historyGroup.setAttribute('aria-label', '履歴');
      for (const button of [undo, redo, rewind]) {
        if (button && button.parentElement !== historyGroup) historyGroup.appendChild(button);
      }
    }

    let rotateGroup = documentRef.getElementById('simpleRotateToolbarGroup');
    if (!rotateGroup && rightGroup) {
      rotateGroup = documentRef.createElement('div');
      rotateGroup.id = 'simpleRotateToolbarGroup';
      rotateGroup.className = 'toolbar-group';
      rotateGroup.dataset.uiToolbarGroup = 'placement';
      rotateGroup.setAttribute('aria-label', '配置');
      canvasToolbar.insertBefore(rotateGroup, rightGroup);
    }
    if (rotateGroup) {
      for (const button of [rotateLeft, rotateRight]) {
        if (button && button.parentElement !== rotateGroup) rotateGroup.appendChild(button);
      }
    }

    if (rightGroup) {
      rightGroup.dataset.uiToolbarGroup = 'actions';
      rightGroup.setAttribute('aria-label', '操作');
    }

    const overflowIds = OVERFLOW_ACTIONS.map(([id]) => id);
    if (!sameOrder(moreMenu, overflowIds)) {
      for (const id of overflowIds) {
        const button = documentRef.getElementById(id);
        if (button) moreMenu.appendChild(button);
      }
    }
    for (const [id, label] of OVERFLOW_ACTIONS) {
      const button = documentRef.getElementById(id);
      if (button) setText(button, label);
    }

    setText(moreButton, '⋯ 表示・配置');
    moreButton.classList.add('ui-display-placement-trigger');
    moreButton.setAttribute('aria-label', '表示・配置メニュー');

    const expanded = detailsButton.getAttribute('aria-expanded') === 'true';
    setText(detailsButton, expanded ? 'ⓘ 詳細を閉じる' : 'ⓘ 詳細');
    detailsButton.title = expanded ? '詳細パネルを閉じる' : '選択・詳細パネルを開く';

    if (dragTrash) {
      dragTrash.classList.add('ui-labeled-trash');
      dragTrash.title = '選択したパーツをドラッグして削除';
    }
    return true;
  }

  function ensureCourseOnlyExport(documentRef) {
    const toolbar = documentRef.querySelector?.('.presentation-toolbar');
    const legacy = documentRef.getElementById('exportBtn');
    if (!toolbar || !legacy) return false;
    let button = documentRef.getElementById('presentationCourseOnlyPngBtn');
    if (!button) {
      button = documentRef.createElement('button');
      button.id = 'presentationCourseOnlyPngBtn';
      button.type = 'button';
      button.className = 'presentation-choice simple-course-only-export';
      button.title = '大会名などを付けず、コース図だけをPNG保存';
      button.addEventListener('click', () => legacy.click());
      const status = documentRef.getElementById('presentationStatus');
      toolbar.insertBefore(button, status || null);
    }
    setText(button, PRESENTATION_ACTION_LABELS.courseOnly);
    return true;
  }

  function applyPresentationActions(documentRef) {
    const png = documentRef.getElementById('presentationPngBtn');
    const print = documentRef.getElementById('presentationPrintBtn');
    setText(png, PRESENTATION_ACTION_LABELS.presentationPngBtn);
    setText(print, PRESENTATION_ACTION_LABELS.presentationPrintBtn);
    ensureCourseOnlyExport(documentRef);
  }

  function syncAll(documentRef) {
    applyTopActions(documentRef);
    applyToolbarStructure(documentRef);
    applyPresentationActions(documentRef);
  }

  function install(documentRef, rootRef) {
    if (!documentRef?.documentElement || documentRef.documentElement.dataset.uiControlsCleanupInstalled === '1') return false;
    documentRef.documentElement.dataset.uiControlsCleanupInstalled = '1';
    ensureStyles(documentRef);

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        syncAll(documentRef);
      };
      if (rootRef?.requestAnimationFrame) rootRef.requestAnimationFrame(run);
      else if (rootRef?.setTimeout) rootRef.setTimeout(run, 0);
      else run();
    };

    const start = () => {
      syncAll(documentRef);
      if (typeof MutationObserver === 'function' && documentRef.body) {
        const observer = new MutationObserver(schedule);
        observer.observe(documentRef.body, { childList: true, subtree: true });
      }
    };

    if (documentRef.body) start();
    else documentRef.addEventListener('DOMContentLoaded', start, { once: true });
    return true;
  }

  return Object.freeze({
    TOP_ACTION_LABELS,
    EDITOR_ACTION_LABELS,
    OVERFLOW_ACTIONS,
    PRESENTATION_ACTION_LABELS,
    setText,
    install
  });
});
