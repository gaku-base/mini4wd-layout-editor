import { describe, expect, it } from 'vitest'
import { mm } from '../geometry'
import {
  assessCollisionProfileReadiness,
  generateStandardStations,
  ingestSparseMeasurements,
  ProfileNotReadyError,
  provisionalSparseMeasurement,
  selectActiveCollisionProfileForPurpose,
  unknownSparseMeasurement,
  type CollisionProfileCatalog,
  type CollisionProfileStation,
  type SampledCollisionProfile,
  type SparseMeasurementSessionInput,
  type SparseMeasurementStationInput,
} from '.'

const LEFT_RIGHT_REQUIREMENTS = {
  requiredSideWalls: ['left', 'right'] as const,
}

// These synthetic provisional fixtures exercise readiness only; they are not part dimensions.
const syntheticPolyline = (z: number) => [{ y: mm(0), z: mm(z) }]

function runningSurfaceStation(
  id: string,
  ratio: number,
): SparseMeasurementStationInput {
  return {
    id,
    ratio,
    runningSurface: provisionalSparseMeasurement(
      syntheticPolyline(ratio),
      'mm',
      ['Synthetic sparse measurement fixture; not a part dimension'],
    ),
  }
}

function completeStation(
  id: string,
  ratio: number,
): SparseMeasurementStationInput {
  const evidence = ['Synthetic collision-readiness fixture; not a part dimension']

  return {
    id,
    ratio,
    runningSurface: provisionalSparseMeasurement(
      syntheticPolyline(ratio),
      'mm',
      evidence,
    ),
    underside: provisionalSparseMeasurement(
      syntheticPolyline(ratio - 1),
      'mm',
      evidence,
    ),
    sideWalls: {
      left: provisionalSparseMeasurement(syntheticPolyline(1), 'mm', evidence),
      right: provisionalSparseMeasurement(syntheticPolyline(1), 'mm', evidence),
    },
    effectiveHeightMm: provisionalSparseMeasurement(mm(10), 'mm', evidence),
    effectiveWidthMm: provisionalSparseMeasurement(mm(20), 'mm', evidence),
  }
}

function sparseInput(
  stations: readonly SparseMeasurementStationInput[],
  version = '1.0.0',
): SparseMeasurementSessionInput {
  return {
    sessionId: 'synthetic-session',
    partId: 'synthetic-part',
    variantId: null,
    profileId: 'synthetic-profile',
    version,
    measuredAt: '2026-07-13',
    measuredBy: 'synthetic-tester',
    evidenceRefs: ['Synthetic test session; no external data'],
    stations,
  }
}

function profileWithStations(
  stations: readonly CollisionProfileStation[],
): SampledCollisionProfile {
  return {
    profileId: 'synthetic-profile',
    version: '0.9.0',
    schemaVersion: '1.0.0',
    partId: 'synthetic-part',
    variantId: null,
    status: 'provisional',
    stations,
    normalContactExclusions: null,
    variant: null,
    supersedes: null,
  }
}

describe('sparse measurement ingestion', () => {
  it('creates 21 stations from five sparse measurements and keeps 16 unknown', () => {
    const ratios = [0, 0.25, 0.5, 0.75, 1]
    const input = sparseInput(
      ratios.map((ratio, index) => runningSurfaceStation(`measured-${index}`, ratio)),
    )

    const profile = ingestSparseMeasurements(input)
    const stations = profile.stations ?? []

    expect(stations).toHaveLength(21)
    expect(
      stations.filter(
        (station) => station.crossSection.runningSurface.sampleKind === 'unknown',
      ),
    ).toHaveLength(16)
    expect(profile.status).toBe('provisional')

    const entrance = stations.find((station) => station.position.ratio === 0)
    expect(entrance?.crossSection.runningSurface).toMatchObject({
      sampleKind: 'measured',
      status: 'provisional',
      metadata: {
        provenance: {
          sessionId: 'synthetic-session',
          measuredAt: '2026-07-13',
          measuredBy: 'synthetic-tester',
        },
        tolerance: { status: 'unknown', plus: null, minus: null },
        uncertainty: { status: 'unknown', value: null },
      },
    })
  })

  it('integrates a shape-change station outside the standard grid', () => {
    const profile = ingestSparseMeasurements(
      sparseInput([runningSurfaceStation('shape-change', 0.375)]),
    )
    const stations = profile.stations ?? []

    expect(stations).toHaveLength(22)
    expect(stations.find((station) => station.id === 'shape-change')).toMatchObject({
      origin: 'additional',
      position: { ratio: 0.375 },
    })
  })

  it('normalizes a tiny floating-point ratio difference onto one standard station', () => {
    const profile = ingestSparseMeasurements(
      sparseInput([runningSurfaceStation('measured-30', 0.30000000000000004)]),
    )
    const stations = profile.stations ?? []

    expect(stations).toHaveLength(21)
    expect(stations.filter((station) => station.position.ratio === 0.3)).toHaveLength(1)
    expect(stations.find((station) => station.position.ratio === 0.3)?.id).toBe(
      'measured-30',
    )
  })

  it('does not mutate the input, supplied standard stations, or existing profile', () => {
    const standardStations = generateStandardStations()
    const existingProfile = profileWithStations(standardStations)
    const input = sparseInput([runningSurfaceStation('measured-center', 0.5)], '1.0.0')
    const inputBefore = JSON.stringify(input)
    const standardsBefore = JSON.stringify(standardStations)
    const existingBefore = JSON.stringify(existingProfile)

    const result = ingestSparseMeasurements(input, {
      standardStations,
      existingProfile,
    })

    expect(JSON.stringify(input)).toBe(inputBefore)
    expect(JSON.stringify(standardStations)).toBe(standardsBefore)
    expect(JSON.stringify(existingProfile)).toBe(existingBefore)
    expect(result).not.toBe(existingProfile)
    expect(result.stations).not.toBe(existingProfile.stations)
  })

  it('preserves an explicitly unknown value and reason without interpolation', () => {
    const profile = ingestSparseMeasurements(
      sparseInput([
        {
          id: 'unknown-center',
          ratio: 0.5,
          runningSurface: unknownSparseMeasurement(
            'Center running surface was not measured',
            'mm',
          ),
        },
      ]),
    )
    const center = profile.stations?.find((station) => station.position.ratio === 0.5)

    expect(center?.crossSection.runningSurface).toMatchObject({
      sampleKind: 'unknown',
      value: null,
      reason: 'Center running surface was not measured',
    })
  })
})

describe('collision profile readiness', () => {
  it('distinguishes structural and height-chain readiness from collision readiness', () => {
    const ratios = [0, 0.25, 0.5, 0.75, 1]
    const profile = ingestSparseMeasurements(
      sparseInput(
        ratios.map((ratio, index) => completeStation(`measured-${index}`, ratio)),
      ),
    )

    const readiness = assessCollisionProfileReadiness(
      profile,
      LEFT_RIGHT_REQUIREMENTS,
    )

    expect(readiness.structural.status).toBe('structurally-valid')
    expect(readiness.heightChain.status).toBe('height-chain-ready')
    expect(readiness.collision.status).toBe('not-ready')
    expect(readiness.highestReadyState).toBe('height-chain-ready')
  })

  it('reports missing stations and fields for a partial profile', () => {
    const profile = ingestSparseMeasurements(
      sparseInput([completeStation('entrance', 0), completeStation('exit', 1)]),
    )
    const readiness = assessCollisionProfileReadiness(
      profile,
      LEFT_RIGHT_REQUIREMENTS,
    )

    expect(readiness.missingStations).toContain('station-005')
    expect(readiness.collision.missingItems).toContainEqual({
      stationId: 'station-005',
      item: 'runningSurface',
    })
    expect(readiness.collision.missingItems).toContainEqual({
      stationId: 'station-005',
      item: 'underside',
    })
  })

  it('does not activate a partial provisional profile for collision use', () => {
    const profile = ingestSparseMeasurements(
      sparseInput([completeStation('entrance', 0), completeStation('exit', 1)]),
    )
    const catalog: CollisionProfileCatalog = { profiles: [profile], active: null }

    expect(() =>
      selectActiveCollisionProfileForPurpose(
        catalog,
        {
          profileId: profile.profileId,
          version: profile.version,
          variantId: profile.variantId,
        },
        {
          purpose: 'collision-ready',
          collisionRequirements: LEFT_RIGHT_REQUIREMENTS,
        },
      ),
    ).toThrow(ProfileNotReadyError)
    expect(catalog.active).toBeNull()
  })

  it('activates a complete synthetic provisional profile for collision use', () => {
    const input = sparseInput(
      Array.from({ length: 21 }, (_, index) => {
        const ratio = (index * 5) / 100
        return completeStation(`complete-${String(index).padStart(2, '0')}`, ratio)
      }),
    )
    const profile = ingestSparseMeasurements(input)
    const reference = {
      profileId: profile.profileId,
      version: profile.version,
      variantId: profile.variantId,
    }
    const catalog: CollisionProfileCatalog = { profiles: [profile], active: null }

    const readiness = assessCollisionProfileReadiness(
      profile,
      LEFT_RIGHT_REQUIREMENTS,
    )
    const selected = selectActiveCollisionProfileForPurpose(catalog, reference, {
      purpose: 'collision-ready',
      collisionRequirements: LEFT_RIGHT_REQUIREMENTS,
    })

    expect(profile.status).toBe('provisional')
    expect(readiness.collision.status).toBe('collision-ready')
    expect(selected.active).toEqual(reference)
    expect(catalog.active).toBeNull()
  })

  it('never promotes ingested measurements to verified or writes interpolation samples', () => {
    const profile = ingestSparseMeasurements(
      sparseInput([runningSurfaceStation('entrance', 0)]),
    )
    const stations = profile.stations ?? []
    const runningSurfaces = stations.map(
      (station) => station.crossSection.runningSurface,
    )

    expect(profile.status).toBe('provisional')
    expect(
      runningSurfaces.every(
        (sample) =>
          sample.sampleKind === 'unknown' || sample.status === 'provisional',
      ),
    ).toBe(true)
    expect(
      runningSurfaces.some(
        (sample) => (sample as { sampleKind: string }).sampleKind === 'interpolated',
      ),
    ).toBe(false)
  })
})
