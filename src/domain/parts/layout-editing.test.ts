import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../geometry'
import {
  deleteLayoutParts,
  EMPTY_COURSE_LAYOUT,
  getConnectedComponentPartIds,
  getLayoutConnectorPose,
  moveLayoutParts,
  placeLayoutPart,
  placeRegisteredPartAtConnector,
  type ConnectorReference,
  type CourseLayout,
} from '.'

const START_ENTRANCE: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'entrance',
}
const START_EXIT: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'exit',
}

function connectedLayout(straightCount = 3): CourseLayout {
  let layout = placeLayoutPart(EMPTY_COURSE_LAYOUT, {
    id: 'start-1',
    partKey: 'start',
    freePose: {
      position: point3D(200, 300, 0),
      heading: rotation45(0),
    },
  })
  let target = START_EXIT

  for (let index = 1; index <= straightCount; index += 1) {
    const id = `straight-${index}`
    layout = placeLayoutPart(layout, {
      id,
      partKey: 'straight',
      snapTarget: target,
    })
    target = { partId: id, connectorId: 'exit' }
  }

  return layout
}

describe('layout group editing', () => {
  it('expands a partial selection to the complete connected component', () => {
    const layout = connectedLayout()

    expect(getConnectedComponentPartIds(layout, ['straight-2'])).toEqual([
      'start-1',
      'straight-1',
      'straight-2',
      'straight-3',
    ])
  })

  it('moves connected Straights as one rigid group and puts them in front', () => {
    const layout = connectedLayout()
    const before = layout.parts.map((part) => ({ id: part.id, origin: part.origin }))
    const moved = moveLayoutParts(layout, ['straight-2'], {
      translation: point3D(125, -80, 0),
      snapDistance: 0,
    })

    expect(moved.parts.map((part) => part.id)).toEqual([
      'start-1',
      'straight-1',
      'straight-2',
      'straight-3',
    ])
    for (const part of moved.parts) {
      const original = before.find((candidate) => candidate.id === part.id)
      expect(part.origin.x - (original?.origin.x ?? 0)).toBeCloseTo(125)
      expect(part.origin.y - (original?.origin.y ?? 0)).toBeCloseTo(-80)
      expect(part.rotation).toBe(
        layout.parts.find((candidate) => candidate.id === part.id)?.rotation,
      )
    }
    expect(moved.connections).toEqual(layout.connections)
  })

  it('preserves relative connector poses and every existing connection after moving', () => {
    const layout = connectedLayout()
    const beforeStart = getLayoutConnectorPose(layout, START_ENTRANCE)
    const beforeEnd = getLayoutConnectorPose(layout, {
      partId: 'straight-3',
      connectorId: 'exit',
    })
    const moved = moveLayoutParts(layout, ['straight-1'], {
      translation: point3D(-40, 250, 0),
      snapDistance: 0,
    })
    const afterStart = getLayoutConnectorPose(moved, START_ENTRANCE)
    const afterEnd = getLayoutConnectorPose(moved, {
      partId: 'straight-3',
      connectorId: 'exit',
    })

    expect(afterEnd.position.x - afterStart.position.x).toBeCloseTo(
      beforeEnd.position.x - beforeStart.position.x,
    )
    expect(afterEnd.position.y - afterStart.position.y).toBeCloseTo(
      beforeEnd.position.y - beforeStart.position.y,
    )
    expect(moved.connections).toEqual(layout.connections)
  })

  it('does not snap to an occupied connector', () => {
    let layout = connectedLayout(1)
    layout = placeLayoutPart(layout, {
      id: 'straight-before',
      partKey: 'straight',
      snapTarget: START_ENTRANCE,
    })
    const isolated = {
      ...layout.parts.find((part) => part.id === 'straight-before')!,
      id: 'isolated',
      origin: point3D(-430, 300, 0),
    }
    layout = {
      parts: [...layout.parts, isolated],
      connections: layout.connections,
    }

    const moved = moveLayoutParts(layout, ['isolated'], {
      translation: point3D(100, 0, 0),
      snapDistance: 100,
    })

    expect(moved.parts.find((part) => part.id === 'isolated')?.origin.x).toBe(-330)
    expect(moved.connections).toHaveLength(2)
  })

  it('snaps only an open compatible connector and adds its connection', () => {
    const fixed = connectedLayout(0)
    const isolatedPlacement = placeRegisteredPartAtConnector('straight', {
      position: point3D(1000, 300, 0),
      heading: rotation45(0),
    })
    const layout: CourseLayout = {
      parts: [
        ...fixed.parts,
        { id: 'isolated', partKey: 'straight', ...isolatedPlacement },
      ],
      connections: [],
    }
    const moved = moveLayoutParts(layout, ['isolated'], {
      translation: point3D(-250, 0, 0),
      snapDistance: 100,
    })

    expect(moved.connections).toHaveLength(1)
    expect(
      getLayoutConnectorPose(moved, {
        partId: 'isolated',
        connectorId: 'entrance',
      }),
    ).toEqual(getLayoutConnectorPose(moved, START_EXIT))
    expect(moved.parts.at(-1)?.id).toBe('isolated')
  })

  it('deletes selected parts and every connection touching them without moving survivors', () => {
    const layout = connectedLayout()
    const survivingStart = layout.parts[0]
    const deleted = deleteLayoutParts(layout, ['straight-2'])

    expect(deleted.parts.map((part) => part.id)).toEqual([
      'start-1',
      'straight-1',
      'straight-3',
    ])
    expect(deleted.connections).toHaveLength(1)
    expect(deleted.parts[0]).toBe(survivingStart)
  })

  it('allows Start to be placed again after deleting the only Start', () => {
    const layout = connectedLayout(0)
    const empty = deleteLayoutParts(layout, ['start-1'])
    const replaced = placeLayoutPart(empty, {
      id: 'start-2',
      partKey: 'start',
      freePose: {
        position: point3D(800, 900, 0),
        heading: rotation45(45),
      },
    })

    expect(replaced.parts.map((part) => part.id)).toEqual(['start-2'])
  })
})
