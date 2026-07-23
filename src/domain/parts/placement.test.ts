import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../geometry'
import {
  connectPart,
  CORNER_45,
  getWorldConnector,
  isKnownDimension,
  placePartAtConnector,
  resolveConnectorPose,
  resolveConnectedExitHeading,
  SLOPE,
  STRAIGHT,
  type ConnectorPose,
  type PlacedPart,
} from '.'

const ORIGIN: ConnectorPose = {
  position: point3D(0, 0, 0),
  heading: rotation45(0),
}

function exactExit(part: PlacedPart): ConnectorPose {
  const exit = resolveConnectorPose(getWorldConnector(part, 'exit'))
  expect(exit).not.toBeNull()

  if (exit === null) {
    throw new Error('Expected a fully resolved exit connector')
  }

  return exit
}

describe('part placement and connectors', () => {
  it('places three verified 540 mm straights at a total length of 1620 mm', () => {
    const first = placePartAtConnector(STRAIGHT, ORIGIN)
    const second = connectPart(first, STRAIGHT)
    const third = connectPart(second, STRAIGHT)

    expect(exactExit(third).position).toEqual(point3D(1620, 0, 0))
  })

  it('inherits the source position, heading, and height when connecting a part', () => {
    const sourceTarget: ConnectorPose = {
      position: point3D(40, -20, 300),
      heading: rotation45(135),
    }
    const placed = placePartAtConnector(STRAIGHT, sourceTarget)
    const entrance = resolveConnectorPose(getWorldConnector(placed, 'entrance'))

    expect(entrance).toEqual(sourceTarget)
  })

  it('raises the slope exit by the verified 115 mm without inventing its XY offset', () => {
    const slope = placePartAtConnector(SLOPE, ORIGIN)
    const exit = getWorldConnector(slope, 'exit')

    expect(exit.position.z.status).toBe('verified')
    expect(isKnownDimension(exit.position.z) && exit.position.z.value).toBe(115)
    expect(exit.position.x.status).toBe('unknown')
    expect(exit.position.y.status).toBe('unknown')
    expect(resolveConnectorPose(exit)).toBeNull()
  })

  it('inherits a nonzero entrance height when resolving the slope exit elevation', () => {
    const target: ConnectorPose = {
      position: point3D(0, 0, 300),
      heading: rotation45(0),
    }
    const slope = placePartAtConnector(SLOPE, target)
    const exit = getWorldConnector(slope, 'exit')

    expect(exit.position.z.status).toBe('verified')
    expect(isKnownDimension(exit.position.z) && exit.position.z.value).toBe(415)
    expect(exit.position.x.status).toBe('unknown')
    expect(exit.position.y.status).toBe('unknown')
    expect(resolveConnectorPose(exit)).toBeNull()
  })

  it('keeps entrance and exit coordinates correct after a 45-degree rotation', () => {
    const target: ConnectorPose = {
      position: point3D(100, 200, 30),
      heading: rotation45(45),
    }
    const straight = placePartAtConnector(STRAIGHT, target)
    const entrance = resolveConnectorPose(getWorldConnector(straight, 'entrance'))
    const exit = exactExit(straight)

    expect(entrance).toEqual(target)
    expect(exit.position.x).toBeCloseTo(100 + 540 / Math.sqrt(2), 10)
    expect(exit.position.y).toBeCloseTo(200 + 540 / Math.sqrt(2), 10)
    expect(exit.position.z).toBe(30)
    expect(exit.heading).toBe(45)
  })

  it('keeps accumulated error below 1e-9 mm across 100 connected parts', () => {
    const start: ConnectorPose = {
      position: point3D(0, 0, 0),
      heading: rotation45(45),
    }
    let current = placePartAtConnector(STRAIGHT, start)

    for (let index = 1; index < 100; index += 1) {
      current = connectPart(current, STRAIGHT)
    }

    const exit = exactExit(current)
    const expectedAxis = (540 * 100) / Math.sqrt(2)

    expect(Math.abs(exit.position.x - expectedAxis)).toBeLessThan(1e-9)
    expect(Math.abs(exit.position.y - expectedAxis)).toBeLessThan(1e-9)
    expect(exit.position.z).toBe(0)
  })

  it('closes the provisional Corner 45° heading after eight connected parts', () => {
    // Only the provisional 45° direction is tested; unknown Corner coordinates stay unresolved.
    let heading = rotation45(0)

    for (let index = 0; index < 8; index += 1) {
      heading = resolveConnectedExitHeading(CORNER_45, heading)
    }

    expect(heading).toBe(0)
  })
})
