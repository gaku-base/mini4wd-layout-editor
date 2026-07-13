import { describe, expect, it } from 'vitest'
import { mm } from '../geometry'
import {
  addCollisionProfileVersion,
  collisionProfileReference,
  createUnknownStation,
  generateStandardStations,
  interpolateNumericSamples,
  measuredSample,
  mergeAndNormalizeStations,
  selectActiveCollisionProfile,
  unknownSample,
  validateCollisionProfile,
  type CollisionProfileCatalog,
  type CollisionProfileStation,
  type ProfileTransform,
  type SampledCollisionProfile,
} from '.'

function profileWithStations(
  stations: readonly CollisionProfileStation[] | null,
  overrides: Partial<SampledCollisionProfile> = {},
): SampledCollisionProfile {
  return {
    profileId: 'test-profile',
    version: '1.0.0',
    schemaVersion: '1.0.0',
    partId: 'test-part',
    variantId: null,
    status: 'unknown',
    stations,
    normalContactExclusions: null,
    variant: null,
    supersedes: null,
    ...overrides,
  }
}

describe('sampled collision profile stations', () => {
  it('generates 21 stations from 0% through 100% in 5% increments', () => {
    const stations = generateStandardStations()

    expect(stations).toHaveLength(21)
    expect(stations.map((station) => station.position.ratio)).toEqual(
      Array.from({ length: 21 }, (_, index) => (index * 5) / 100),
    )
    expect(stations[0].role).toBe('entrance')
    expect(stations[10].role).toBe('center')
    expect(stations[20].role).toBe('exit')
  })

  it('merges additional stations, replaces duplicate ratios, and sorts without mutation', () => {
    const standard = generateStandardStations()
    const shapeChange = createUnknownStation('shape-change', 0.375)
    const centerReplacement = createUnknownStation('measured-center', 0.5)
    const additions = [centerReplacement, shapeChange]
    const standardIds = standard.map((station) => station.id)

    const merged = mergeAndNormalizeStations(standard, additions)

    expect(merged).toHaveLength(22)
    expect(merged.map((station) => station.position.ratio)).toEqual(
      [...merged].map((station) => station.position.ratio).sort((left, right) => left - right),
    )
    expect(merged.find((station) => station.position.ratio === 0.5)?.id).toBe(
      'measured-center',
    )
    expect(standard.map((station) => station.id)).toEqual(standardIds)
    expect(additions).toEqual([centerReplacement, shapeChange])
  })
})

describe('sampled collision profile validation', () => {
  it('reports missing entrance 0% and exit 100% stations', () => {
    const profile = profileWithStations(generateStandardStations().slice(1, -1))
    const codes = validateCollisionProfile(profile).map((issue) => issue.code)

    expect(codes).toContain('missing-entrance')
    expect(codes).toContain('missing-exit')
  })

  it('detects an out-of-range ratio, duplicate ID, and reverse station order', () => {
    const entrance = createUnknownStation('duplicate', 0)
    const later = createUnknownStation('later', 0.75)
    const duplicate = createUnknownStation('duplicate', 0.25)
    const exit = createUnknownStation('exit', 1)
    const invalidRatio: CollisionProfileStation = {
      ...createUnknownStation('invalid-ratio-source', 0.9),
      position: {
        ...createUnknownStation('invalid-ratio-source', 0.9).position,
        ratio: 1.1,
      },
    }
    const profile = profileWithStations([entrance, later, duplicate, invalidRatio, exit])
    const codes = validateCollisionProfile(profile).map((issue) => issue.code)

    expect(codes).toContain('ratio-out-of-range')
    expect(codes).toContain('duplicate-station-id')
    expect(codes).toContain('stations-out-of-order')
  })

  it('keeps unknown and null station data intact without crashing validation', () => {
    const profile = profileWithStations(generateStandardStations())
    const first = profile.stations?.[0]
    const absentStations = profileWithStations(null)

    expect(first?.crossSection.underside).toMatchObject({
      sampleKind: 'unknown',
      status: 'unknown',
      value: null,
    })
    expect(validateCollisionProfile(profile)).toEqual([])
    expect(validateCollisionProfile(absentStations).map((issue) => issue.code)).toEqual([
      'missing-entrance',
      'missing-exit',
    ])
  })
})

describe('sampled collision profile interpolation', () => {
  // Synthetic scalar fixtures below verify interpolation only; they are not part dimensions.
  const measured = (stationId: string, ratio: number, value: number) => ({
    stationId,
    ratio,
    sample: measuredSample(value, 'provisional', 'mm', [
      'Synthetic interpolation test fixture; not a part dimension',
    ]),
  })

  it('does not extrapolate beyond known station samples', () => {
    const samples = [measured('left', 0.25, 10), measured('right', 0.75, 30)]

    expect(interpolateNumericSamples(samples, 0.1, 'mm')).toMatchObject({
      sampleKind: 'unknown',
      value: null,
    })
    expect(interpolateNumericSamples(samples, 0.9, 'mm')).toMatchObject({
      sampleKind: 'unknown',
      value: null,
    })
  })

  it('does not interpolate across an explicitly unknown station interval', () => {
    const samples = [
      measured('entrance', 0, 10),
      { stationId: 'unknown', ratio: 0.5, sample: unknownSample('Not measured', 'mm') },
      measured('exit', 1, 30),
    ]

    expect(interpolateNumericSamples(samples, 0.25, 'mm')).toMatchObject({
      sampleKind: 'unknown',
      value: null,
    })
  })

  it('linearly interpolates only between two measured points and marks the result derived', () => {
    const samples = [measured('entrance', 0, 10), measured('exit', 1, 30)]
    const result = interpolateNumericSamples(samples, 0.25, 'mm')

    expect(result.sampleKind).toBe('interpolated')
    if (result.sampleKind !== 'interpolated') throw new Error('Expected interpolation')

    expect(result.value).toBe(15)
    expect(result.status).toBe('provisional')
    expect(result.interpolation).toEqual({
      method: 'linear',
      sources: [
        { stationId: 'entrance', ratio: 0 },
        { stationId: 'exit', ratio: 1 },
      ],
    })
    expect(samples.every((sample) => sample.sample.sampleKind === 'measured')).toBe(true)
  })
})

describe('sampled collision profile capabilities', () => {
  it('represents the verified 115 mm slope entrance-to-exit elevation difference', () => {
    const entrance = createUnknownStation('entrance', 0)
    const exit = createUnknownStation('exit', 1)
    const evidence = ['User-confirmed slope elevation difference from Issue #1']
    const withElevation = (station: CollisionProfileStation, elevationMm: number) => ({
      ...station,
      crossSection: {
        ...station.crossSection,
        runningSurface: measuredSample(
          [{ y: mm(0), z: mm(elevationMm) }],
          'verified',
          'mm',
          evidence,
        ),
      },
    })
    const measuredEntrance = withElevation(entrance, 0)
    const measuredExit = withElevation(exit, 115)
    const entranceSurface = measuredEntrance.crossSection.runningSurface
    const exitSurface = measuredExit.crossSection.runningSurface

    if (entranceSurface.sampleKind !== 'measured' || exitSurface.sampleKind !== 'measured') {
      throw new Error('Expected measured running surfaces')
    }

    expect(exitSurface.value[0].z - entranceSurface.value[0].z).toBe(115)
  })

  it('retains a bank station positioned by thetaDeg without inventing other dimensions', () => {
    const entrance = createUnknownStation('bank-entrance', 0)
    const bankEntrance: CollisionProfileStation = {
      ...entrance,
      position: {
        ...entrance.position,
        thetaDeg: measuredSample(0, 'verified', 'degree', [
          'Bank entrance angle coordinate definition',
        ]),
      },
    }

    expect(bankEntrance.position.thetaDeg).toMatchObject({
      sampleKind: 'measured',
      value: 0,
    })
    expect(bankEntrance.position.sMm).toMatchObject({
      sampleKind: 'unknown',
      value: null,
    })
  })

  it('adds a new version and selects its variant without mutating the old catalog', () => {
    const base = profileWithStations(generateStandardStations(), {
      status: 'provisional',
    })
    const baseReference = collisionProfileReference(base)
    const transform: ProfileTransform = {
      travelDirection: 'reverse',
      turnSide: 'preserve',
      stationOrder: 'reverse',
      connectorMap: { entrance: 'exit', exit: 'entrance' },
      yAxis: 'preserve',
      crossSlopeSign: 'preserve',
      polygonWinding: 'preserve',
      elevationDeltaSign: 'negate',
    }
    const reverseVariant = profileWithStations(generateStandardStations(), {
      version: '1.1.0',
      variantId: 'reverse',
      status: 'provisional',
      supersedes: baseReference,
      variant: {
        sourceProfile: baseReference,
        status: 'provisional',
        transform,
        evidenceRefs: ['Transformation test; no new part dimensions'],
      },
    })
    const original: CollisionProfileCatalog = {
      profiles: [base],
      active: baseReference,
    }

    const withVariant = addCollisionProfileVersion(original, reverseVariant)
    const selected = selectActiveCollisionProfile(
      withVariant,
      collisionProfileReference(reverseVariant),
    )

    expect(original.profiles).toEqual([base])
    expect(original.active).toEqual(baseReference)
    expect(withVariant.profiles).toEqual([base, reverseVariant])
    expect(selected.active).toEqual({
      profileId: 'test-profile',
      version: '1.1.0',
      variantId: 'reverse',
    })
    expect(base.version).toBe('1.0.0')
    expect(base.variant).toBeNull()
  })
})
