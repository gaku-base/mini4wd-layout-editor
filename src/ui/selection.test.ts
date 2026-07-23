import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../domain/geometry'
import {
  EMPTY_COURSE_LAYOUT,
  placeLayoutPart,
  type CourseLayout,
} from '../domain/parts'
import {
  normalizeSelectionRect,
  partIdAtPoint,
  partIdsIntersectingRect,
  selectionAfterBlankClick,
  selectionAfterPartClick,
  selectionAfterRange,
} from './selection'

function layoutForSelection(): CourseLayout {
  let layout = placeLayoutPart(EMPTY_COURSE_LAYOUT, {
    id: 'start-1',
    partKey: 'start',
    freePose: {
      position: point3D(100, 100, 0),
      heading: rotation45(0),
    },
  })
  layout = placeLayoutPart(layout, {
    id: 'straight-1',
    partKey: 'straight',
    snapTarget: { partId: 'start-1', connectorId: 'exit' },
  })
  return layout
}

describe('part selection', () => {
  it('selects the clicked part using a centerline-shaped hit test', () => {
    const layout = layoutForSelection()
    const clicked = partIdAtPoint(layout, { x: 300, y: 112 }, 20)

    expect(clicked).toBe('start-1')
    expect(selectionAfterPartClick([], clicked!, false)).toEqual(['start-1'])
    expect(partIdAtPoint(layout, { x: 300, y: 180 }, 20)).toBeNull()
  })

  it('adds and removes only the Shift-clicked part', () => {
    const added = selectionAfterPartClick(['start-1'], 'straight-1', true)
    const removed = selectionAfterPartClick(added, 'start-1', true)

    expect(added).toEqual(['start-1', 'straight-1'])
    expect(removed).toEqual(['straight-1'])
  })

  it('selects every part intersecting a dragged range and Shift-adds it', () => {
    const layout = layoutForSelection()
    const rect = normalizeSelectionRect({ x: 700, y: 80 }, { x: 900, y: 120 })
    const intersecting = partIdsIntersectingRect(layout, rect)

    expect(intersecting).toEqual(['straight-1'])
    expect(selectionAfterRange(['start-1'], intersecting, true)).toEqual([
      'start-1',
      'straight-1',
    ])
  })

  it('clears selection on a normal blank click', () => {
    expect(selectionAfterBlankClick(['start-1', 'straight-1'], false)).toEqual([])
    expect(selectionAfterBlankClick(['start-1'], true)).toEqual(['start-1'])
  })
})
