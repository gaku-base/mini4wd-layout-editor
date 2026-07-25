from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'marker not found: {label}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'regex marker count {count}: {label}')
    return updated


# ---------- app.js ----------
path = 'app.js'
text = read(path)
text = replace_once(text, "const VERSION = '1.0.0-RC1';", "const VERSION = '1.1.0-RC2';", 'version')
text = replace_once(
    text,
    "  const BURNING_CHANGER_VISUAL = window.M4WD_BURNING_CHANGER_VISUAL;\n  if (!BURNING_CHANGER_VISUAL) throw new Error('burning-changer-visual.jsが読み込まれていません');",
    "  const BURNING_CHANGER_VISUAL = window.M4WD_BURNING_CHANGER_VISUAL;\n  if (!BURNING_CHANGER_VISUAL) throw new Error('burning-changer-visual.jsが読み込まれていません');\n  const FIELD_BOUNDARY = window.M4WD_FIELD_BOUNDARY;\n  if (!FIELD_BOUNDARY) throw new Error('field-boundary.jsが読み込まれていません');",
    'boundary dependency'
)
text = replace_once(
    text,
    "    field: { widthCm: 600, heightCm: 400, gridCm: 10 },",
    "    field: { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },",
    'default field origin'
)
text = replace_once(
    text,
    "      'rotateLeftBtn','rotateRightBtn','gridBtn','fitViewBtn','manualFitBtn','topLeftFitBtn','editFieldBtn',\n      'selectionInfo','clearSelectionBtn','deleteSelectionBtn','colorSelectionBtn','colorLegend','statusAssets','bankStateText'",
    "      'rotateLeftBtn','rotateRightBtn','gridBtn','fitViewBtn','manualFitBtn','topLeftFitBtn','autoFitFieldBtn','editFieldBtn',\n      'selectionInfo','clearSelectionBtn','deleteSelectionBtn','colorSelectionBtn','colorLegend','statusAssets','bankStateText',\n      'fieldOriginText','fieldOverflowText','fieldOverflowNotice','statusOverflow','exportRangeDialog','exportRangeText',\n      'exportRangeKeepBtn','exportRangeFitBtn','exportRangeCancelBtn'",
    'element ids'
)
text = replace_once(
    text,
    "    els.topLeftFitBtn.addEventListener('click', autoAlignLayoutTopLeft);\n    els.clearSelectionBtn.addEventListener('click', clearSelection);",
    "    els.topLeftFitBtn.addEventListener('click', autoAlignLayoutTopLeft);\n    els.autoFitFieldBtn.addEventListener('click', () => autoFitFieldToLayout());\n    els.exportRangeKeepBtn?.addEventListener('click', () => { els.exportRangeDialog.close(); performPngExport(); });\n    els.exportRangeFitBtn?.addEventListener('click', () => { els.exportRangeDialog.close(); if (autoFitFieldToLayout({ silent: true })) performPngExport(); });\n    els.exportRangeCancelBtn?.addEventListener('click', () => els.exportRangeDialog.close());\n    els.clearSelectionBtn.addEventListener('click', clearSelection);",
    'button handlers'
)
text = replace_once(
    text,
    "    state.field = { widthCm: widthM * 100, heightCm: heightM * 100, gridCm };",
    "    state.field = {\n      originX: reset ? 0 : Number(state.field.originX) || 0,\n      originY: reset ? 0 : Number(state.field.originY) || 0,\n      widthCm: widthM * 100,\n      heightCm: heightM * 100,\n      gridCm\n    };",
    'setup field'
)
text = replace_once(
    text,
    "    } else {\n      clampAllToField();\n    }\n    state.setupStarted = true;",
    "    }\n    state.setupStarted = true;",
    'remove resize clamping'
)
text = regex_once(
    text,
    r"    state\.field = \{\n      widthCm: Number\(data\.field\.widthCm\) \|\| 600,\n      heightCm: Number\(data\.field\.heightCm\) \|\| 400,\n      gridCm: Number\(data\.field\.gridCm\) \|\| 10\n    \};",
    "    state.field = FIELD_BOUNDARY.normalizeField(data.field);",
    'serialized field migration'
)
text = replace_once(
    text,
    "      : { x: snap(state.field.widthCm / 2), y: snap(state.field.heightCm / 2) };",
    "      : { x: snap(state.field.originX + state.field.widthCm / 2), y: snap(state.field.originY + state.field.heightCm / 2) };",
    'restored cursor center'
)
text = replace_once(
    text,
    "    c.scale(exportScale, exportScale);\n    drawExport(c);",
    "    c.scale(exportScale, exportScale);\n    c.translate(-state.field.originX, -state.field.originY);\n    drawExport(c);",
    'export origin translation'
)
text = regex_once(
    text,
    r"  function exportPng\(\) \{\n    const canvas = createExportCanvas\(\);\n    canvas\.toBlob\(blob => \{\n      if \(!blob\) return;\n      downloadBlob\(blob, `mini4wd-layout-\$\{dateStamp\(\)\}\.png`\);\n      toast\('PNGを書き出しました'\);\n    \}, 'image/png'\);\n  \}",
    """  function performPngExport() {
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
  }""",
    'png export dialog'
)
text = replace_once(
    text,
    "    c.fillStyle = '#ffffff';\n    c.fillRect(0, 0, state.field.widthCm, state.field.heightCm);\n    c.strokeStyle = '#2b3440';\n    c.lineWidth = 1.2;\n    c.strokeRect(0, 0, state.field.widthCm, state.field.heightCm);",
    "    const frame = FIELD_BOUNDARY.fieldBounds(state.field);\n    c.fillStyle = '#ffffff';\n    c.fillRect(frame.minX, frame.minY, frame.w, frame.h);\n    c.strokeStyle = '#2b3440';\n    c.lineWidth = 1.2;\n    c.strokeRect(frame.minX, frame.minY, frame.w, frame.h);",
    'export field origin'
)
text = regex_once(
    text,
    r"  function fitView\(\) \{.*?\n  \}\n\n  function render\(\)",
    """  function fitView() {
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

  function render()""",
    'fit view origin',
    re.S
)
text = regex_once(
    text,
    r"  function drawField\(c\) \{.*?\n  \}\n\n  function drawGrid\(c\) \{.*?\n  \}\n\n  function resolvePartDef",
    """  function drawField(c) {
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

  function resolvePartDef""",
    'field drawing origin',
    re.S
)
text = replace_once(
    text,
    "    drawConnectedPartSeams(c, options);\n  }",
    "    drawConnectedPartSeams(c, options);\n    if (!options.exportMode) drawOutOfBoundsWarnings(c);\n  }",
    'warning overlay call'
)
text = replace_once(
    text,
    "      best.snapped = true;\n      best.valid = isPartInsideField(best);\n      return best;",
    "      best.snapped = true;\n      best.valid = true;\n      best.outOfBounds = !isPartInsideField(best);\n      return best;",
    'allow snapped proposal outside'
)
text = regex_once(
    text,
    r"  function isPartInsideField\(part\) \{\n    const bounds = partBounds\(part\);\n    return bounds\.minX >= -\.01 && bounds\.minY >= -\.01 && bounds\.maxX <= state\.field\.widthCm \+ \.01 && bounds\.maxY <= state\.field\.heightCm \+ \.01;\n  \}",
    """  function isPartInsideField(part) {
    return FIELD_BOUNDARY.containsBounds(state.field, partBounds(part));
  }

  function isStartInsideField(start = state.start) {
    return !!start && FIELD_BOUNDARY.containsBounds(state.field, startBounds(start));
  }

  function outOfBoundsItems() {
    const items = [];
    if (state.start && !isStartInsideField(state.start)) items.push({ id: 'start', type: 'start', bounds: startBounds(state.start) });
    state.parts.forEach(part => {
      if (!isPartInsideField(part)) items.push({ id: part.id, type: part.type, bounds: partBounds(part) });
    });
    return items;
  }

  function drawOutOfBoundsMarker(c, bounds) {
    c.save();
    c.fillStyle = 'rgba(244,142,33,.12)';
    c.strokeStyle = '#f07818';
    c.lineWidth = 3 / state.view.scale;
    c.setLineDash([9 / state.view.scale, 5 / state.view.scale]);
    c.fillRect(bounds.minX, bounds.minY, bounds.w, bounds.h);
    c.strokeRect(bounds.minX, bounds.minY, bounds.w, bounds.h);
    c.setLineDash([]);
    c.fillStyle = '#9a3e00';
    c.font = `700 ${12 / state.view.scale}px sans-serif`;
    c.textBaseline = 'bottom';
    c.fillText('作成範囲外', bounds.minX, bounds.minY - 5 / state.view.scale);
    c.restore();
  }

  function drawOutOfBoundsWarnings(c) {
    outOfBoundsItems().forEach(item => drawOutOfBoundsMarker(c, item.bounds));
  }""",
    'inside and warning helpers'
)
text = replace_once(
    text,
    "    const color = proposal.valid ? '#249b74' : '#de4b5b';",
    "    const color = proposal.outOfBounds ? '#f07818' : (proposal.valid ? '#249b74' : '#de4b5b');",
    'connection warning color'
)
text = regex_once(
    text,
    r"    if \(state\.mode === 'start'\) \{\n      const candidate = \{ x: state\.cursor\.x, y: state\.cursor\.y, rotation: state\.rotation \};\n      const valid = startInsideField\(candidate\);\n      c\.save\(\);\n      c\.globalAlpha = valid \? \.76 : \.34;\n      drawStartLane\(c, candidate, false, true\);\n      c\.restore\(\);\n      const bounds = startBounds\(candidate\);\n      c\.save\(\);\n      c\.strokeStyle = valid \? '#249b74' : '#de4b5b';.*?drawPointerCrosshair\(c, state\.cursor\.x, state\.cursor\.y, valid \? '#249b74' : '#de4b5b'\);\n      return;\n    \}",
    """    if (state.mode === 'start') {
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
    }""",
    'start ghost outside warning',
    re.S
)
text = replace_once(
    text,
    "        c.globalAlpha = proposal.valid ? .72 : .34;",
    "        c.globalAlpha = proposal.snapped ? .72 : .34;",
    'part ghost opacity'
)
text = replace_once(
    text,
    "        if (proposal.anchor) drawConnectionPoint(c, proposal.anchor, proposal.valid ? '#1f9c71' : '#de4b5b');",
    "        if (proposal.anchor) drawConnectionPoint(c, proposal.anchor, proposal.outOfBounds ? '#f07818' : (proposal.valid ? '#1f9c71' : '#de4b5b'));",
    'part anchor warning color'
)
text = replace_once(
    text,
    "      drawPointerCrosshair(c, state.cursor.x, state.cursor.y, proposal?.valid ? '#249b74' : '#de4b5b');",
    "      drawPointerCrosshair(c, state.cursor.x, state.cursor.y, proposal?.outOfBounds ? '#f07818' : (proposal?.valid ? '#249b74' : '#de4b5b'));",
    'part pointer warning color'
)
text = regex_once(
    text,
    r"  function startInsideField\(start\) \{\n    const bounds = startBounds\(start\);\n    return bounds\.minX >= -\.01 && bounds\.minY >= -\.01 && bounds\.maxX <= state\.field\.widthCm \+ \.01 && bounds\.maxY <= state\.field\.heightCm \+ \.01;\n  \}",
    """  function startInsideField(start) {
    return FIELD_BOUNDARY.containsBounds(state.field, startBounds(start));
  }""",
    'start inside origin'
)
text = replace_once(
    text,
    "    if (!startInsideField(candidate)) return toast('スタートレーンが作成範囲からはみ出します');\n    snapshot();",
    "    const outside = !startInsideField(candidate);\n    snapshot();",
    'allow start outside'
)
text = replace_once(
    text,
    "    toast('スタートの前後どちら側からでも配置できます');",
    "    toast(outside ? 'スタートを作成範囲外へ配置しました（オレンジ枠で表示）' : 'スタートの前後どちら側からでも配置できます');",
    'start outside toast'
)
text = replace_once(
    text,
    "    if (!proposal.valid) return toast('この位置では作成範囲からはみ出します');\n    snapshot();",
    "    snapshot();",
    'allow part outside'
)
text = replace_once(
    text,
    "    toast(`${partDisplayName(part)}を${proposal.anchor?.sourceId === 'start' ? (proposal.anchor.endpointIndex === 0 ? 'スタート後方' : 'スタート前方') : '接続点'}へ配置しました`);",
    "    toast(`${partDisplayName(part)}を${proposal.anchor?.sourceId === 'start' ? (proposal.anchor.endpointIndex === 0 ? 'スタート後方' : 'スタート前方') : '接続点'}へ配置しました${proposal.outOfBounds ? '（作成範囲外）' : ''}`);",
    'part outside toast'
)
text = replace_once(
    text,
    "    if (!layoutIsInsideField()) return toast('レイアウト全体が作成範囲内に入ってから固定してください');\n    const base = state.layoutMove.base;",
    "    const overflowCount = outOfBoundsItems().length;\n    const base = state.layoutMove.base;",
    'manual move allow outside'
)
text = replace_once(
    text,
    "    toast('レイアウト全体の位置を固定しました');",
    "    toast(overflowCount ? `範囲外${overflowCount}パーツを含む位置で固定しました` : 'レイアウト全体の位置を固定しました');",
    'manual move toast'
)
text = replace_once(
    text,
    "    const dx = -box.minX;\n    const dy = -box.minY;",
    "    const frame = FIELD_BOUNDARY.fieldBounds(state.field);\n    const dx = frame.minX - box.minX;\n    const dy = frame.minY - box.minY;",
    'align to field origin'
)
text = replace_once(
    text,
    "  function translateWholeLayout(dx, dy) {",
    """  function autoFitFieldToLayout(options = {}) {
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

  function translateWholeLayout(dx, dy) {""",
    'auto fit field function'
)
text = regex_once(
    text,
    r"  function layoutIsInsideField\(\) \{\n    const box = layoutBounds\(\);\n    const epsilon = \.001;\n    return box\.minX >= -epsilon && box\.minY >= -epsilon && box\.maxX <= state\.field\.widthCm \+ epsilon && box\.maxY <= state\.field\.heightCm \+ epsilon;\n  \}",
    """  function layoutIsInsideField() {
    return FIELD_BOUNDARY.containsBounds(state.field, layoutBounds(), .001);
  }""",
    'layout inside origin'
)
text = replace_once(
    text,
    "    c.fillText(valid ? 'クリックで固定' : '範囲内へ移動してください', box.minX, box.minY - 6 / state.view.scale);",
    "    c.fillText(valid ? 'クリックで固定' : '範囲外のまま固定できます', box.minX, box.minY - 6 / state.view.scale);",
    'layout move warning label'
)
text = regex_once(
    text,
    r"  function clampAllToField\(\) \{.*?\n  \}\n\n  function pointInCorner45Local",
    """  function clampAllToField() {
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

  function pointInCorner45Local""",
    'origin aware clamp helper',
    re.S
)
text = replace_once(
    text,
    "    els.gridText.textContent = `${state.field.gridCm} cm`;",
    "    els.gridText.textContent = `${state.field.gridCm} cm`;\n    if (els.fieldOriginText) els.fieldOriginText.textContent = `${(state.field.originX / 100).toFixed(2)} / ${(state.field.originY / 100).toFixed(2)} m`;\n    const outside = outOfBoundsItems();\n    if (els.fieldOverflowText) els.fieldOverflowText.textContent = outside.length ? `作成範囲外：${outside.length}パーツ` : 'すべて作成範囲内';\n    if (els.fieldOverflowNotice) els.fieldOverflowNotice.classList.toggle('has-overflow', !!outside.length);\n    if (els.statusOverflow) els.statusOverflow.textContent = String(outside.length);",
    'overflow ui text'
)
text = replace_once(
    text,
    "      els.selectionInfo.innerHTML = `<strong>${state.selectedIds.length}個選択</strong><br>${Object.entries(names).map(([name, n]) => `${name} ${n}`).join(' / ')}`;",
    "      const selectedOutside = selectedParts().filter(part => !isPartInsideField(part)).length;\n      els.selectionInfo.innerHTML = `<strong>${state.selectedIds.length}個選択</strong><br>${Object.entries(names).map(([name, n]) => `${name} ${n}`).join(' / ')}${selectedOutside ? `<br><span class=\"selection-overflow\">作成範囲外 ${selectedOutside}個</span>` : ''}`;",
    'selection overflow ui'
)
text = replace_once(
    text,
    "      autoAlignLayoutTopLeft,\n      selectPartType,",
    "      autoAlignLayoutTopLeft,\n      autoFitFieldToLayout,\n      getOutOfBoundsItems: () => JSON.parse(JSON.stringify(outOfBoundsItems())),\n      getFieldBounds: () => FIELD_BOUNDARY.fieldBounds(state.field),\n      getLayoutBounds: () => ({ ...layoutBounds() }),\n      selectPartType,",
    'debug api additions'
)
write(path, text)


# ---------- index.html and test-index.html ----------
def patch_html(path, production):
    html = read(path)
    if production:
        html = regex_once(html, r'<span class="version">v1\.0 RC1</span>', '<span class="version">v1.1 RC2</span>', f'{path} version')
    html = replace_once(
        html,
        '<button id="topLeftFitBtn" class="toolbar-button" type="button"><kbd>Shift+F</kbd> 左上へ自動整列</button>',
        '<button id="topLeftFitBtn" class="toolbar-button" type="button"><kbd>Shift+F</kbd> 左上へ自動整列</button>\n            <button id="autoFitFieldBtn" class="toolbar-button field-fit" type="button">作成範囲を自動フィット</button>',
        f'{path} fit button'
    )
    html = replace_once(
        html,
        '<div><span class="status-label">ASSET</span><strong id="statusAssets">0/9</strong></div>',
        '<div><span class="status-label">ASSET</span><strong id="statusAssets">0/9</strong></div>\n          <div class="overflow-status"><span class="status-label">OUT</span><strong id="statusOverflow">0</strong></div>',
        f'{path} status overflow'
    )
    html = replace_once(
        html,
        '<div><dt>グリッド</dt><dd id="gridText">10 cm</dd></div>',
        '<div><dt>グリッド</dt><dd id="gridText">10 cm</dd></div>\n            <div><dt>範囲原点</dt><dd id="fieldOriginText">0.00 / 0.00 m</dd></div>',
        f'{path} field origin metric'
    )
    html = replace_once(
        html,
        '          </dl>\n        </section>',
        '          </dl>\n          <div id="fieldOverflowNotice" class="field-overflow-notice"><strong id="fieldOverflowText">すべて作成範囲内</strong><span>範囲外でも配置・移動できます。オレンジ枠を確認し、必要な時に自動フィットしてください。</span></div>\n        </section>',
        f'{path} overflow notice'
    )
    html = replace_once(
        html,
        '  <script src="burning-changer-visual.js"></script>\n  <script src="app.js"></script>',
        '  <script src="burning-changer-visual.js"></script>\n  <script src="field-boundary.js"></script>\n  <script src="app.js"></script>',
        f'{path} boundary script'
    ) if production else replace_once(
        html,
        '  <script src="burning-changer-visual.js"></script>\n  <script>',
        '  <script src="burning-changer-visual.js"></script>\n  <script src="field-boundary.js"></script>\n  <script>',
        f'{path} boundary script'
    )
    dialog = '''\n  <dialog id="exportRangeDialog" class="export-range-dialog">\n    <form method="dialog">\n      <h2>作成範囲外のパーツがあります</h2>\n      <p id="exportRangeText">作成範囲外のパーツがあります。</p>\n      <div class="export-range-actions">\n        <button id="exportRangeKeepBtn" class="button ghost" type="button">このまま出力</button>\n        <button id="exportRangeFitBtn" class="button primary" type="button">自動フィットして出力</button>\n        <button id="exportRangeCancelBtn" class="button ghost" type="button">キャンセル</button>\n      </div>\n    </form>\n  </dialog>\n'''
    html = replace_once(html, '\n  <script src="part-catalog.js"></script>', dialog + '\n  <script src="part-catalog.js"></script>', f'{path} export dialog')
    write(path, html)


patch_html('index.html', True)
patch_html('test-index.html', False)


# ---------- styles.css ----------
path = 'styles.css'
styles = read(path)
addition = r'''

/* v1.1 RC2: creation-area overflow and auto fit */
.toolbar-button.field-fit {
  border-color: #f39a38;
  background: linear-gradient(180deg, #fff4e6, #ffe5c5);
  color: #7f3900;
  font-weight: 800;
}

.field-overflow-notice {
  margin-top: 12px;
  padding: 10px 11px;
  border: 1px solid #9fcdbb;
  border-radius: 10px;
  background: #edf9f4;
  color: #245c49;
  display: grid;
  gap: 4px;
  font-size: 12px;
  line-height: 1.45;
}

.field-overflow-notice.has-overflow {
  border-color: #ef9a43;
  background: #fff2e4;
  color: #8d3b00;
  box-shadow: inset 4px 0 0 #f07818;
}

.overflow-status strong { color: #f6b35b; }
.selection-overflow { color: #d35c00; font-weight: 800; }

.export-range-dialog {
  width: min(560px, calc(100vw - 32px));
  border: 0;
  border-radius: 16px;
  padding: 0;
  box-shadow: 0 24px 70px rgba(0,0,0,.42);
}

.export-range-dialog::backdrop { background: rgba(8,16,24,.68); }
.export-range-dialog form { padding: 24px; }
.export-range-dialog h2 { margin: 0 0 10px; font-size: 21px; }
.export-range-dialog p { margin: 0; color: #596473; line-height: 1.7; }
.export-range-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 22px; }
'''
if 'v1.1 RC2: creation-area overflow and auto fit' not in styles:
    styles += addition
write(path, styles)

print('field overflow/autofit patch applied')
