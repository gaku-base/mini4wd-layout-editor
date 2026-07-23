import { useEffect, useReducer, useState } from 'react'
import Canvas from './Canvas'
import {
  createEditorState,
  editorReducer,
} from './editor-state'
import {
  editorShortcutFromKeyboardEvent,
  paletteIndexFromKeyboardEvent,
  type EditorKeyboardShortcut,
} from './keyboard'
import { Palette } from './Palette'
import PALETTE, { type PartKey } from './parts'

export function Editor() {
  const [selected, setSelected] = useState<PartKey>(PALETTE[0].key)
  const [state, dispatch] = useReducer(editorReducer, undefined, createEditorState)
  const selectedItem = PALETTE.find((item) => item.key === selected) ?? PALETTE[0]

  function activatePart(key: PartKey) {
    setSelected(key)
    dispatch({ type: 'set-mode', mode: 'place' })
  }

  useEffect(() => {
    function applyShortcut(shortcut: EditorKeyboardShortcut) {
      switch (shortcut) {
        case 'move-mode':
          dispatch({ type: 'set-mode', mode: 'move' })
          break
        case 'delete-selection':
          dispatch({ type: 'delete-selection' })
          break
        case 'remove-last-placement':
          dispatch({ type: 'remove-last-placement' })
          break
        case 'undo':
          dispatch({ type: 'undo' })
          break
        case 'redo':
          dispatch({ type: 'redo' })
          break
        case 'rotate-left':
          dispatch({ type: 'rotate', delta: -45 })
          break
        case 'rotate-right':
          dispatch({ type: 'rotate', delta: 45 })
          break
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      const paletteIndex = paletteIndexFromKeyboardEvent(event)
      if (paletteIndex !== null) {
        const item = PALETTE[paletteIndex]
        if (item !== undefined) {
          event.preventDefault()
          setSelected(item.key)
          dispatch({ type: 'set-mode', mode: 'place' })
        }
        return
      }

      const shortcut = editorShortcutFromKeyboardEvent(event)
      if (shortcut === null) {
        return
      }

      event.preventDefault()
      applyShortcut(shortcut)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const placementUnavailable =
    state.mode === 'place' && selectedItem.placement === 'unavailable'
  const status = placementUnavailable
    ? `${selectedItem.name}: 配置不可 — ${selectedItem.reason}`
    : state.message

  return (
    <div data-selected-part={selected} className="editor-layout">
      <Palette items={PALETTE} selected={selected} onSelect={activatePart} />
      <div className="editor-workspace">
        <div className="editor-heading">
          <h2>Editor</h2>
          <div className="editor-toolbar" aria-label="Editor modes and history">
            <button
              type="button"
              aria-pressed={state.mode === 'select'}
              onClick={() => dispatch({ type: 'set-mode', mode: 'select' })}
            >
              選択
            </button>
            <button
              type="button"
              aria-keyshortcuts="Q"
              aria-pressed={state.mode === 'move'}
              onClick={() => dispatch({ type: 'set-mode', mode: 'move' })}
            >
              移動 (Q)
            </button>
            <button
              type="button"
              aria-keyshortcuts="Control+Z"
              disabled={state.history.past.length === 0}
              onClick={() => dispatch({ type: 'undo' })}
            >
              Undo
            </button>
            <button
              type="button"
              aria-keyshortcuts="Control+Y"
              disabled={state.history.future.length === 0}
              onClick={() => dispatch({ type: 'redo' })}
            >
              Redo
            </button>
          </div>
        </div>
        <p
          className={`editor-status${placementUnavailable ? ' editor-status--unavailable' : ''}`}
          data-editor-mode={state.mode}
          role="status"
        >
          {status} / 選択 {state.selectedPartIds.length}個
        </p>
        <Canvas selectedKey={selected} state={state} dispatch={dispatch} />
        <p className="editor-help">
          数字: パーツ / Q: 移動 / W: 削除 / R: 最終配置を削除 / Ctrl+Z: Undo /
          Ctrl+Y・Ctrl+Shift+Z: Redo
        </p>
      </div>
    </div>
  )
}

export default Editor
