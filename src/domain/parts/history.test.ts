import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../geometry'
import {
  createLayoutHistory,
  deletePartsWithHistory,
  movePartsWithHistory,
  placePartWithHistory,
  redoLayoutHistory,
  removeLastPlacementWithHistory,
  undoLayoutHistory,
  type ConnectorReference,
  type LayoutHistory,
} from '.'

const START_EXIT: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'exit',
}

function placeStart(history = createLayoutHistory()): LayoutHistory {
  return placePartWithHistory(history, {
    id: 'start-1',
    partKey: 'start',
    freePose: {
      position: point3D(100, 200, 0),
      heading: rotation45(0),
    },
  })
}

function placeStraight(history: LayoutHistory, id = 'straight-1'): LayoutHistory {
  return placePartWithHistory(history, {
    id,
    partKey: 'straight',
    snapTarget: START_EXIT,
  })
}

describe('immutable layout history', () => {
  it('undoes a placement and redoes it with connections restored', () => {
    const placed = placeStraight(placeStart())
    const undone = undoLayoutHistory(placed)
    const redone = redoLayoutHistory(undone)

    expect(undone.present.layout.parts.map((part) => part.id)).toEqual(['start-1'])
    expect(undone.present.layout.connections).toHaveLength(0)
    expect(redone.present.layout.parts.map((part) => part.id)).toEqual([
      'start-1',
      'straight-1',
    ])
    expect(redone.present.layout.connections).toHaveLength(1)
    expect(redone.present.layout).not.toBe(placed.present.layout)
  })

  it('undoes and redoes a rigid group move', () => {
    const placed = placeStraight(placeStart())
    const before = placed.present.layout.parts.map((part) => part.origin)
    const moved = movePartsWithHistory(placed, ['straight-1'], {
      translation: point3D(50, 70, 0),
      snapDistance: 0,
    })
    const undone = undoLayoutHistory(moved)
    const redone = redoLayoutHistory(undone)

    expect(undone.present.layout.parts.map((part) => part.origin)).toEqual(before)
    expect(redone.present.layout.parts.map((part) => part.origin)).toEqual(
      moved.present.layout.parts.map((part) => part.origin),
    )
    expect(redone.present.layout.connections).toHaveLength(1)
  })

  it('undoes and redoes deletion with connection occupancy intact', () => {
    const placed = placeStraight(placeStart())
    const deleted = deletePartsWithHistory(placed, ['straight-1'])
    const undone = undoLayoutHistory(deleted)
    const redone = redoLayoutHistory(undone)

    expect(deleted.present.layout.connections).toHaveLength(0)
    expect(undone.present.layout.connections).toHaveLength(1)
    expect(redone.present.layout.parts.map((part) => part.id)).toEqual(['start-1'])
  })

  it('discards redo history after a new operation', () => {
    const placed = placeStraight(placeStart())
    const undone = undoLayoutHistory(placed)
    const moved = movePartsWithHistory(undone, ['start-1'], {
      translation: point3D(25, 0, 0),
      snapDistance: 0,
    })

    expect(undone.future).toHaveLength(1)
    expect(moved.future).toHaveLength(0)
    expect(redoLayoutHistory(moved)).toBe(moved)
  })

  it('R removes only the last successfully placed part and participates in Undo', () => {
    const placed = placeStraight(placeStart())
    const removed = removeLastPlacementWithHistory(placed)
    const undone = undoLayoutHistory(removed)

    expect(removed.present.layout.parts.map((part) => part.id)).toEqual(['start-1'])
    expect(removed.present.lastPlacedPartId).toBe('straight-1')
    expect(undone.present.layout.parts.map((part) => part.id)).toEqual([
      'start-1',
      'straight-1',
    ])
  })

  it('R safely does nothing when the last placed part was already deleted', () => {
    const placed = placeStraight(placeStart())
    const deleted = deletePartsWithHistory(placed, ['straight-1'])

    expect(removeLastPlacementWithHistory(deleted)).toBe(deleted)
  })
})
