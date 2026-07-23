import {
  getPartPlacementAvailability,
  type PartPlacementAvailability,
} from '../domain/parts'

export type PartKey =
  | 'straight'
  | 'corner45'
  | 'lane-change'
  | 'wave'
  | 'start'
  | 'slope'
  | 'bank20'
  | 'lc-jump'
  | 'burning-lc'

export type PaletteItem = {
  readonly key: PartKey
  readonly name: string
} & PartPlacementAvailability

function paletteItem(key: PartKey, name: string): PaletteItem {
  return { key, name, ...getPartPlacementAvailability(key) }
}

export const PALETTE: readonly PaletteItem[] = [
  paletteItem('straight', 'Straight'),
  paletteItem('corner45', 'Corner 45°'),
  paletteItem('lane-change', 'Lane Change'),
  paletteItem('wave', 'Wave'),
  paletteItem('start', 'Start'),
  paletteItem('slope', 'Slope'),
  paletteItem('bank20', '20° Bank'),
  paletteItem('lc-jump', 'LC Jump'),
  paletteItem('burning-lc', 'Burning Lane Change'),
]

export default PALETTE
