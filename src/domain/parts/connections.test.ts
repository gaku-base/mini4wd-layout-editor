import { describe, expect, it } from 'vitest'
import {
  connectCourseParts,
  isConnectorUsed,
  START,
  STRAIGHT,
  type ConnectorReference,
  type CourseConnection,
  type CoursePartInstance,
} from '.'

const START_BEFORE: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'entrance',
}
const START_AFTER: ConnectorReference = {
  partId: 'start-1',
  connectorId: 'exit',
}

const PARTS: readonly CoursePartInstance[] = [
  { id: 'start-1', definition: START },
  { id: 'straight-before', definition: STRAIGHT },
  { id: 'straight-after', definition: STRAIGHT },
  { id: 'straight-extra', definition: STRAIGHT },
]

describe('course connector occupancy', () => {
  it('connects Straight to both opposite Start endpoints', () => {
    let connections: readonly CourseConnection[] = []

    connections = connectCourseParts(
      PARTS,
      connections,
      { partId: 'straight-before', connectorId: 'exit' },
      START_BEFORE,
    )
    connections = connectCourseParts(
      PARTS,
      connections,
      START_AFTER,
      { partId: 'straight-after', connectorId: 'entrance' },
    )

    expect(connections).toHaveLength(2)
    expect(isConnectorUsed(connections, START_BEFORE)).toBe(true)
    expect(isConnectorUsed(connections, START_AFTER)).toBe(true)
  })

  it('rejects a second connection to an already-used connector', () => {
    const connections = connectCourseParts(
      PARTS,
      [],
      { partId: 'straight-before', connectorId: 'exit' },
      START_BEFORE,
    )

    expect(() =>
      connectCourseParts(
        PARTS,
        connections,
        { partId: 'straight-extra', connectorId: 'exit' },
        START_BEFORE,
      ),
    ).toThrow('already connected')
  })
})
