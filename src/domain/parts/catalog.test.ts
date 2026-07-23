import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../geometry'
import {
  getPartPlacementAvailability,
  placeRegisteredPartAtConnector,
  START,
  STRAIGHT,
  type ConnectorPose,
} from '.'

const ORIGIN: ConnectorPose = {
  position: point3D(0, 0, 0),
  heading: rotation45(0),
}

describe('part placement catalog', () => {
  it('defines Start as a distinct variant that shares Straight physical data by reference', () => {
    expect(START.kind).toBe(STRAIGHT.kind)
    expect(START.variant).toBe('start')
    expect(START.variant).not.toBe(STRAIGHT.variant)
    expect(START.dimensions).toBe(STRAIGHT.dimensions)
    expect(START.connectors).toBe(STRAIGHT.connectors)
    expect(START.collisionGeometry).toBe(STRAIGHT.collisionGeometry)
  })

  it('places a registered part with verified connector geometry', () => {
    const placed = placeRegisteredPartAtConnector('straight', ORIGIN)

    expect(placed.definition.id).toBe('straight-540')
  })

  it('rejects an unregistered part instead of inventing placement geometry', () => {
    const availability = getPartPlacementAvailability('lane-change')

    expect(availability.placement).toBe('unavailable')
    expect(() => placeRegisteredPartAtConnector('lane-change', ORIGIN)).toThrow(
      'cannot be placed',
    )
  })

  it('keeps provisional Corner coordinates unknown and unavailable for placement', () => {
    const availability = getPartPlacementAvailability('corner45')

    expect(availability.placement).toBe('unavailable')
    if (availability.placement === 'available' || availability.definition === undefined) {
      throw new Error('Expected the registered provisional Corner definition')
    }

    const exit = availability.definition.connectors.find(
      (connector) => connector.kind === 'exit',
    )
    expect(exit?.offset.x.status).toBe('unknown')
    expect(exit?.offset.y.status).toBe('unknown')
    expect(exit?.offset.z.status).toBe('unknown')
  })
})
