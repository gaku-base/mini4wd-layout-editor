import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../geometry'
import {
  EMPTY_COURSE_LAYOUT,
  getLayoutConnectorPose,
  getOpenLayoutConnectors,
  placeLayoutPart,
  placePartAtConnector,
  resolveConnectorPose,
  getWorldConnector,
  STRAIGHT,
  type ConnectorPose,
  type ConnectorReference,
  type CourseLayout,
} from '.'

const FREE_START_POSE: ConnectorPose = {
  position: point3D(320, 480, 0),
  heading: rotation45(0),
}

const START_ENTRANCE: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'entrance',
}
const START_EXIT: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'exit',
}

function layoutWithStart(pose = FREE_START_POSE): CourseLayout {
  return placeLayoutPart(EMPTY_COURSE_LAYOUT, {
    id: 'start-1',
    partKey: 'start',
    freePose: pose,
  })
}

describe('Start and Straight layout editing', () => {
  it('freely places Start at an arbitrary pose in an empty layout', () => {
    const layout = layoutWithStart()

    expect(layout.parts).toHaveLength(1)
    expect(layout.parts[0].partKey).toBe('start')
    expect(getLayoutConnectorPose(layout, START_ENTRANCE)).toEqual(FREE_START_POSE)
    expect(getOpenLayoutConnectors(layout)).toHaveLength(2)
  })

  it('rejects a second Start', () => {
    const layout = layoutWithStart()

    expect(() =>
      placeLayoutPart(layout, {
        id: 'start-2',
        partKey: 'start',
        freePose: { position: point3D(900, 400, 0), heading: rotation45(0) },
      }),
    ).toThrow('Only one Start')
  })

  it('connects Straight to both Start endpoints', () => {
    let layout = layoutWithStart()
    layout = placeLayoutPart(layout, {
      id: 'straight-before',
      partKey: 'straight',
      snapTarget: START_ENTRANCE,
    })
    layout = placeLayoutPart(layout, {
      id: 'straight-after',
      partKey: 'straight',
      snapTarget: START_EXIT,
    })

    expect(layout.parts).toHaveLength(3)
    expect(layout.connections).toHaveLength(2)
    expect(getOpenLayoutConnectors(layout)).toHaveLength(2)
    expect(
      getLayoutConnectorPose(layout, {
        partId: 'straight-before',
        connectorId: 'exit',
      }),
    ).toEqual(getLayoutConnectorPose(layout, START_ENTRANCE))
    expect(
      getLayoutConnectorPose(layout, {
        partId: 'straight-after',
        connectorId: 'entrance',
      }),
    ).toEqual(getLayoutConnectorPose(layout, START_EXIT))
  })

  it('rejects another connection after both Start endpoints are used', () => {
    let layout = layoutWithStart()
    layout = placeLayoutPart(layout, {
      id: 'straight-before',
      partKey: 'straight',
      snapTarget: START_ENTRANCE,
    })
    layout = placeLayoutPart(layout, {
      id: 'straight-after',
      partKey: 'straight',
      snapTarget: START_EXIT,
    })

    expect(() =>
      placeLayoutPart(layout, {
        id: 'straight-duplicate',
        partKey: 'straight',
        snapTarget: START_EXIT,
      }),
    ).toThrow('already connected')
  })

  it('connects at least three consecutive Straights from Start', () => {
    let layout = layoutWithStart()
    let target = START_EXIT

    for (let index = 1; index <= 3; index += 1) {
      const id = `straight-${index}`
      layout = placeLayoutPart(layout, {
        id,
        partKey: 'straight',
        snapTarget: target,
      })
      target = { partId: id, connectorId: 'exit' }
    }

    expect(layout.parts).toHaveLength(4)
    expect(layout.connections).toHaveLength(3)
    expect(getOpenLayoutConnectors(layout)).toHaveLength(2)
  })

  it('does not freely place Straight when no snap target is supplied', () => {
    expect(() =>
      placeLayoutPart(EMPTY_COURSE_LAYOUT, {
        id: 'straight-free',
        partKey: 'straight',
        freePose: FREE_START_POSE,
      }),
    ).toThrow('requires an open connector')
  })

  it('preserves both world connector poses when Start is rotated by 45 degrees', () => {
    const pose: ConnectorPose = {
      position: point3D(700, 800, 15),
      heading: rotation45(45),
    }
    const layout = layoutWithStart(pose)
    const straightAtSamePose = placePartAtConnector(STRAIGHT, pose)
    const expectedEntrance = resolveConnectorPose(
      getWorldConnector(straightAtSamePose, 'entrance'),
    )
    const expectedExit = resolveConnectorPose(getWorldConnector(straightAtSamePose, 'exit'))

    expect(getLayoutConnectorPose(layout, START_ENTRANCE)).toEqual(expectedEntrance)
    expect(getLayoutConnectorPose(layout, START_EXIT)).toEqual(expectedExit)
  })
})
