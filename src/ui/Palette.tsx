import type { PaletteItem, PartKey } from './parts'

interface Props {
  readonly items: readonly PaletteItem[]
  readonly selected?: PartKey
  readonly onSelect: (key: PartKey) => void
}

export function Palette({ items, selected, onSelect }: Props) {
  return (
    <aside style={{ width: 200, padding: 12 }}>
      <h3>Parts</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((item, index) => (
          <li key={item.key} style={{ margin: '6px 0' }}>
            <button
              aria-keyshortcuts={String(index + 1)}
              aria-pressed={item.key === selected}
              data-part-key={item.key}
              data-placement-status={item.placement}
              onClick={() => onSelect(item.key)}
              title={item.placement === 'unavailable' ? item.reason : undefined}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: item.key === selected ? '#e6f2ff' : 'white',
                border: '1px solid #ccd6d9',
                borderRadius: 6,
                textAlign: 'left',
              }}
            >
              <span>{index + 1} {item.name}</span>
              {item.placement === 'unavailable' && (
                <small className="palette-unavailable">配置不可</small>
              )}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default Palette
