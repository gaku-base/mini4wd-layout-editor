import { describe, expect, it } from 'vitest'
import { mm, point3D, rotation45 } from '../geometry'
import {
  createUnknownStation,
  measuredSample,
  unknownSample,
  type CollisionProfileStation,
  type NormalContactExclusion,
  type NormalContactExclusionVolume,
  type SampledCollisionProfile,
} from '../collision-profile'
import {
  buildConservativeWorldAabb,
  containsPoint,
  diagnoseBroadPhasePairs,
  transformCollisionProfileToWorld,
  type FormalConnectorConnection,
  type PlacedCollisionPart,
} from '.'

const EVIDENCE = ['Synthetic collision-engine fixture; not a part dimension']
const LEFT_RIGHT_REQUIREMENTS = {
  requiredSideWalls: ['left', 'right'] as const,
}

// Every number in these helpers is synthetic test geometry, not a product dimension.
function sectionPolyline(points: readonly (readonly [number, number])[]) {
  return points.map(([y, z]) => ({ y: mm(y), z: mm(z) }))
}

function completeStation(
  id: string,
  ratio: number,
  centerX = ratio * 10,
): CollisionProfileStation {
  const base = createUnknownStation(id, ratio, 'standard')

  return {
    ...base,
    centerlinePositionMm: measuredSample(
      point3D(centerX, 0, 0),
      'provisional',
      'mm',
      EVIDENCE,
    ),
    tangentHeadingDeg: measuredSample(0, 'provisional', 'degree', EVIDENCE),
    crossSection: {
      runningSurface: measuredSample(
        sectionPolyline([
          [-2, 0],
          [2, 0],
        ]),
        'provisional',
        'mm',
        EVIDENCE,
      ),
      underside: measuredSample(
        sectionPolyline([
          [-2, -2],
          [2, -2],
        ]),
        'provisional',
        'mm',
        EVIDENCE,
      ),
      sideWalls: {
        ...base.crossSection.sideWalls,
        left: measuredSample(
          sectionPolyline([
            [-2, -2],
            [-2, 2],
          ]),
          'provisional',
          'mm',
          EVIDENCE,
        ),
        right: measuredSample(
          sectionPolyline([
            [2, -2],
            [2, 2],
          ]),
          'provisional',
          'mm',
          EVIDENCE,
        ),
      },
      effectiveHeightMm: measuredSample(
        mm(4),
        'provisional',
        'mm',
        EVIDENCE,
      ),
      effectiveWidthMm: measuredSample(
        mm(4),
        'provisional',
        'mm',
        EVIDENCE,
      ),
    },
  }
}

function knownExclusion(
  id: string,
  connectorId: string,
): NormalContactExclusion {
  const volume: NormalContactExclusionVolume = {
    kind: 'oriented-box',
    centerMm: point3D(0, 0, 0),
    sizeMm: point3D(1, 1, 1),
    rotationDeg: { x: 0, y: 0, z: 0 },
    verticesMm: null,
    faces: null,
  }

  return {
    id,
    connectorId,
    status: 'provisional',
    appliesOnlyWhenFormallyConnected: true,
    volume: measuredSample(volume, 'provisional', 'mm', EVIDENCE),
  }
}

function syntheticProfile(
  overrides: Partial<SampledCollisionProfile> = {},
): SampledCollisionProfile {
  return {
    profileId: 'synthetic-collision-profile',
    version: '1.0.0',
    schemaVersion: '1.0.0',
    partId: 'synthetic-part-definition',
    variantId: null,
    status: 'provisional',
    stations: Array.from({ length: 21 }, (_, index) => {
      const ratio = (index * 5) / 100
      return completeStation(`station-${String(index * 5).padStart(3, '0')}`, ratio)
    }),
    normalContactExclusions: null,
    variant: null,
    supersedes: null,
    ...overrides,
  }
}

function placedPart(
  partId: string,
  origin = point3D(0, 0, 0),
  profile: SampledCollisionProfile | null = syntheticProfile(),
): PlacedCollisionPart {
  return {
    partId,
    profile,
    pose: { origin, rotation: rotation45(0) },
    collisionRequirements: LEFT_RIGHT_REQUIREMENTS,
  }
}

function firstDiagnostic(
  parts: readonly PlacedCollisionPart[],
  connections: readonly FormalConnectorConnection[] = [],
) {
  const diagnostic = diagnoseBroadPhasePairs(parts, connections).diagnostics[0]
  if (diagnostic === undefined) throw new Error('Expected one pair diagnostic')
  return diagnostic
}

describe('sampled collision profile world transform and AABB', () => {
  it('applies station tangent, 45-degree part rotation, and XYZ translation', () => {
    const profile = syntheticProfile()
    const entrance = profile.stations?.[0]
    if (entrance === undefined) throw new Error('Expected an entrance station')

    const transformedEntrance: CollisionProfileStation = {
      ...entrance,
      centerlinePositionMm: measuredSample(
        point3D(10, 20, 30),
        'provisional',
        'mm',
        EVIDENCE,
      ),
      tangentHeadingDeg: measuredSample(
        90,
        'provisional',
        'degree',
        EVIDENCE,
      ),
      crossSection: {
        ...entrance.crossSection,
        runningSurface: measuredSample(
          sectionPolyline([[4, 5]]),
          'provisional',
          'mm',
          EVIDENCE,
        ),
      },
    }
    const part: PlacedCollisionPart = {
      ...placedPart('rotated', point3D(100, 200, 300), profile),
      profile: {
        ...profile,
        stations: [transformedEntrance, ...(profile.stations?.slice(1) ?? [])],
      },
      pose: { origin: point3D(100, 200, 300), rotation: rotation45(45) },
    }

    const result = transformCollisionProfileToWorld(part)
    const point = result?.points.find(
      (candidate) =>
        candidate.stationId === transformedEntrance.id &&
        candidate.component === 'runningSurface',
    )?.point

    expect(point?.x).toBeCloseTo(100 + (6 - 20) / Math.sqrt(2), 10)
    expect(point?.y).toBeCloseTo(200 + (6 + 20) / Math.sqrt(2), 10)
    expect(point?.z).toBe(335)
  })

  it('builds a conservative AABB containing every transformed known point', () => {
    const result = buildConservativeWorldAabb(
      placedPart('bounded', point3D(30, -40, 50)),
    )

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected a complete AABB')

    expect(result.worldProfile.points.length).toBeGreaterThan(0)
    expect(
      result.worldProfile.points.every(({ point }) => containsPoint(result.aabb, point)),
    ).toBe(true)
  })

  it('does not mutate the source profile or placement', () => {
    const profile = syntheticProfile()
    const part = placedPart('immutable', point3D(3, 4, 5), profile)
    const profileBefore = JSON.stringify(profile)
    const partBefore = JSON.stringify(part)

    transformCollisionProfileToWorld(part)
    buildConservativeWorldAabb(part)

    expect(JSON.stringify(profile)).toBe(profileBefore)
    expect(JSON.stringify(part)).toBe(partBefore)
  })
})

describe('collision broad phase diagnostics', () => {
  it('marks parts separated in XY as clear', () => {
    const diagnostic = firstDiagnostic([
      placedPart('a'),
      placedPart('b', point3D(100, 0, 0)),
    ])

    expect(diagnostic.status).toBe('clear')
    expect(diagnostic.reasonCodes).toEqual(['aabb-separated-xy'])
  })

  it('marks parts separated in Z as clear', () => {
    const diagnostic = firstDiagnostic([
      placedPart('a'),
      placedPart('b', point3D(0, 0, 100)),
    ])

    expect(diagnostic.status).toBe('clear')
    expect(diagnostic.reasonCodes).toEqual(['aabb-separated-z'])
  })

  it('returns candidate for AABB overlap without declaring a collision', () => {
    const result = diagnoseBroadPhasePairs([
      placedPart('a'),
      placedPart('b', point3D(5, 0, 0)),
    ])
    const diagnostic = result.diagnostics[0]

    expect(diagnostic?.status).toBe('candidate')
    expect(diagnostic?.reasonCodes).toEqual([
      'aabb-overlap-needs-narrow-phase',
    ])
    expect(diagnostic?.candidateRange).not.toBeNull()
    expect(result.candidates).toHaveLength(1)
  })

  it('keeps boundary contact in the candidate set', () => {
    const diagnostic = firstDiagnostic([
      placedPart('a'),
      placedPart('b', point3D(10, 0, 0)),
    ])

    expect(diagnostic.status).toBe('candidate')
    expect(diagnostic.candidateRange).not.toBeNull()
  })

  it('keeps an incomplete profile indeterminate and reports missing station fields', () => {
    const complete = syntheticProfile()
    const stations = complete.stations ?? []
    const center = stations[10]
    const incompleteCenter: CollisionProfileStation = {
      ...center,
      crossSection: {
        ...center.crossSection,
        underside: unknownSample('Synthetic missing underside', 'mm'),
      },
    }
    const incomplete = {
      ...complete,
      stations: [...stations.slice(0, 10), incompleteCenter, ...stations.slice(11)],
    }
    const diagnostic = firstDiagnostic([
      placedPart('a', point3D(0, 0, 0), incomplete),
      placedPart('b', point3D(1000, 0, 0)),
    ])

    expect(diagnostic.status).toBe('indeterminate')
    expect(diagnostic.worldAabbs[0]).toBeNull()
    expect(diagnostic.missingStations).toContainEqual({
      partId: 'a',
      stationId: center.id,
    })
    expect(diagnostic.missingItems).toContainEqual({
      partId: 'a',
      stationId: center.id,
      item: 'underside',
    })
  })

  it('does not create a self-pair for one placed part', () => {
    const result = diagnoseBroadPhasePairs([placedPart('only')])

    expect(result.diagnostics).toEqual([])
  })

  it('keeps a missing placement indeterminate', () => {
    const withoutPose: PlacedCollisionPart = {
      ...placedPart('a'),
      pose: null,
    }
    const diagnostic = firstDiagnostic([withoutPose, placedPart('b')])

    expect(diagnostic.status).toBe('indeterminate')
    expect(diagnostic.reasonCodes).toContain('collision-placement-incomplete')
    expect(diagnostic.missingItems).toContainEqual({
      partId: 'a',
      stationId: null,
      item: 'placement.pose',
    })
  })

  it('returns stable pair order independent of input order', () => {
    const a = placedPart('a')
    const b = placedPart('b', point3D(5, 0, 0))
    const c = placedPart('c', point3D(100, 0, 0))
    const summarize = (parts: readonly PlacedCollisionPart[]) =>
      diagnoseBroadPhasePairs(parts).diagnostics.map(({ partIds, status }) => ({
        partIds,
        status,
      }))

    expect(summarize([c, a, b])).toEqual(summarize([b, c, a]))
    expect(summarize([c, a, b]).map((pair) => pair.partIds)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ])
  })

  it('never applies normal-contact exclusion to parts that are not formally connected', () => {
    const profile = syntheticProfile({
      normalContactExclusions: [
        knownExclusion('entrance-contact', 'entrance'),
        knownExclusion('exit-contact', 'exit'),
      ],
    })
    const parts = [
      placedPart('a', point3D(0, 0, 0), profile),
      placedPart('b', point3D(5, 0, 0), profile),
    ]
    const unconnected = firstDiagnostic(parts)
    const connections: readonly FormalConnectorConnection[] = [
      {
        connectionId: 'a-exit--b-entrance',
        endpoints: [
          { partId: 'a', connectorId: 'exit' },
          { partId: 'b', connectorId: 'entrance' },
        ],
      },
    ]
    const formallyConnectedResult = diagnoseBroadPhasePairs(parts, connections)
    const formallyConnected = formallyConnectedResult.diagnostics[0]

    expect(unconnected.status).toBe('candidate')
    expect(unconnected.formalConnectionId).toBeNull()
    expect(formallyConnected?.status).toBe('excluded-normal-contact')
    expect(formallyConnected?.formalConnectionId).toBe(
      'a-exit--b-entrance',
    )
    expect(formallyConnectedResult.pairsRequiringNarrowPhase).toEqual([
      formallyConnected,
    ])
  })

  it('does not exclude a formal connection when its exclusion volume is unknown', () => {
    const unknownExclusion = (
      id: string,
      connectorId: string,
    ): NormalContactExclusion => ({
      id,
      connectorId,
      status: 'unknown',
      appliesOnlyWhenFormallyConnected: true,
      volume: unknownSample('Synthetic unknown exclusion volume', 'mm'),
    })
    const profile = syntheticProfile({
      normalContactExclusions: [
        unknownExclusion('entrance-contact', 'entrance'),
        unknownExclusion('exit-contact', 'exit'),
      ],
    })
    const connection: FormalConnectorConnection = {
      connectionId: 'formal-but-unknown',
      endpoints: [
        { partId: 'a', connectorId: 'exit' },
        { partId: 'b', connectorId: 'entrance' },
      ],
    }
    const diagnostic = firstDiagnostic(
      [
        placedPart('a', point3D(0, 0, 0), profile),
        placedPart('b', point3D(5, 0, 0), profile),
      ],
      [connection],
    )

    expect(diagnostic.status).toBe('candidate')
    expect(diagnostic.formalConnectionId).toBeNull()
  })
})
