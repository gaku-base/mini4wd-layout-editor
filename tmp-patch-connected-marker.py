from pathlib import Path

runtime = Path('connector-target-lock-runtime.js')
text = runtime.read_text(encoding='utf-8')

old_base = """      #${OVERLAY_ID} .connector-target-point.is-connected-target {
        width: 15px;
        height: 15px;
        border-color: #ffd45c;
        background: rgba(111, 79, 8, .92);
        box-shadow: 0 0 0 2px rgba(20, 15, 4, .54), 0 0 10px rgba(255, 212, 92, .72);
      }
      #${OVERLAY_ID} .connector-target-point.is-connected-target:hover {
        width: 19px;
        height: 19px;
        border-color: #ffe79c;
        box-shadow: 0 0 0 3px rgba(20, 15, 4, .58), 0 0 14px rgba(255, 221, 112, .95);
      }
"""
new_base = """      #${OVERLAY_ID} .connector-target-point.is-connected-target {
        width: 15px;
        height: 15px;
        border-color: #ffd45c;
        background: rgba(111, 79, 8, .92);
        box-shadow: 0 0 0 2px rgba(20, 15, 4, .54), 0 0 10px rgba(255, 212, 92, .72);
        opacity: 0;
      }
      #${OVERLAY_ID} .connector-target-point.is-connected-target:hover {
        opacity: 1;
      }
      #${OVERLAY_ID} .connector-target-point.is-connected-target.is-locked {
        opacity: 1;
      }
"""
if text.count(old_base) != 1:
    raise SystemExit(f'expected one connected marker CSS block, got {text.count(old_base)}')
text = text.replace(old_base, new_base)
runtime.write_text(text, encoding='utf-8')

unit = Path('connector-connected-target-nearby.test.js')
tests = unit.read_text(encoding='utf-8')
old_tail = """  assert.match(source, /CONNECTED_MARKER_OFFSET_PX/);
});"""
new_tail = """  assert.match(source, /CONNECTED_MARKER_OFFSET_PX/);
  assert.match(source, /\.connector-target-point\.is-connected-target \{[\s\S]*?opacity: 0;/);
  assert.match(source, /\.connector-target-point\.is-connected-target:hover \{\s*opacity: 1;\s*\}/);
  const yellowHoverBlock = source.match(/\.connector-target-point\.is-connected-target:hover \{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(yellowHoverBlock, /width:|height:/);
});"""
if tests.count(old_tail) != 1:
    raise SystemExit(f'expected one browser wiring tail, got {tests.count(old_tail)}')
tests = tests.replace(old_tail, new_tail)
unit.write_text(tests, encoding='utf-8')

browser = Path('browser-connector-target-lock-smoke.js')
smoke = browser.read_text(encoding='utf-8')
anchor = """    await page.mouse.move(markerX, markerY);
    await page.waitForFunction(() => document.querySelectorAll('#connectorTargetLockOverlay .connector-target-point.is-connected-target').length >= 1, { timeout: TIMEOUT });
    assert.ok(await connectedMarkers.count() >= 1, 'yellow connected marker must appear when the pointer is directly beside the connected seam');

    await page.mouse.move(markerX + 32, markerY);"""
replacement = """    await page.mouse.move(markerX, markerY);
    await page.waitForFunction(() => {
      const marker = document.querySelector('#connectorTargetLockOverlay .connector-target-point.is-connected-target');
      if (!marker) return false;
      const style = getComputedStyle(marker);
      return style.opacity === '1' && style.cursor === 'pointer';
    }, { timeout: TIMEOUT });
    assert.ok(await connectedMarkers.count() >= 1, 'yellow connected marker must become visible only when the pointer reaches its selectable hit area');
    const yellowHoverStyle = await connectedMarkers.first().evaluate(element => {
      const style = getComputedStyle(element);
      return { width: style.width, height: style.height, opacity: style.opacity, cursor: style.cursor };
    });
    assert.deepEqual(yellowHoverStyle, { width: '15px', height: '15px', opacity: '1', cursor: 'pointer' },
      'yellow connected marker must stay 15px while the hand cursor indicates it is selectable');

    await page.mouse.move(markerX + 32, markerY);"""
if smoke.count(anchor) != 1:
    raise SystemExit(f'expected one browser marker anchor, got {smoke.count(anchor)}')
smoke = smoke.replace(anchor, replacement)
smoke = smoke.replace(
    "console.log('✓ connected yellow marker stays hidden far away, appears near the seam, and hides again beyond 20px');",
    "console.log('✓ connected yellow marker appears exactly at its selectable hand-cursor hit area without growing on hover');"
)
browser.write_text(smoke, encoding='utf-8')

Path('.github/ui-smoke.trigger').write_text('connected-yellow-marker-hand-cursor\n', encoding='utf-8')
