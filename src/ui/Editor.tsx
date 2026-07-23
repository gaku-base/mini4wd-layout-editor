import { useEffect, useState } from 'react'
import Canvas from './Canvas'
import { paletteIndexFromKeyboardEvent } from './keyboard'
import { Palette } from './Palette'
import PALETTE, { type PartKey } from './parts'

export function Editor() {
  const [selected, setSelected] = useState<PartKey>(PALETTE[0].key)
  const selectedItem = PALETTE.find((item) => item.key === selected) ?? PALETTE[0]

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const paletteIndex = paletteIndexFromKeyboardEvent(event)
      if (paletteIndex === null) {
        return
      }

      const item = PALETTE[paletteIndex]
      if (item === undefined) {
        return
      }

      event.preventDefault()
      setSelected(item.key)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div data-selected-part={selected} style={{ display: 'flex', gap: 12 }}>
      <Palette items={PALETTE} selected={selected} onSelect={setSelected} />
      <div style={{ flex: 1 }}>
        <h2>Editor</h2>
        <p
          className={`editor-status editor-status--${selectedItem.placement}`}
          role="status"
        >
          {selectedItem.placement === 'unavailable'
            ? `${selectedItem.name}: 配置不可 — ${selectedItem.reason}`
            : selectedItem.key === 'start'
              ? 'Start: 空レイアウトへ1個だけ自由配置できます'
              : 'Straight: 緑色の空きコネクタを選択して配置します'}
        </p>
        <Canvas selectedKey={selected} />
      </div>
    </div>
  )
}

export default Editor
