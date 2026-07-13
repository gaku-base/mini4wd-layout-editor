import { mm, type Millimeters } from '../geometry'
import { collisionProfileReference } from './catalog'
import {
  createUnknownStation,
  generateStandardStations,
  mergeAndNormalizeStations,
  normalizeRatio,
  ratiosEquivalent,
} from './stations'
import type {
  CollisionProfileStation,
  MeasurementProvenance,
  MeasurementUnit,
  PolylineYZMm,
  SampleMetadata,
  SampledCollisionProfile,
  SourceSample,
  Tolerance,
  Uncertainty,
} from './types'

export const SAMPLED_COLLISION_PROFILE_SCHEMA_VERSION = '1.0.0'

export type SparseTolerance = Omit<Tolerance, 'status'> & {
  readonly status: 'provisional' | 'unknown'
}

export type SparseUncertainty = Omit<Uncertainty, 'status'> & {
  readonly status: 'provisional' | 'unknown'
}

export interface SparseProvisionalMeasurement<T> {
  readonly status: 'provisional'
  readonly value: T
  readonly evidenceRefs: readonly string[]
  readonly tolerance: SparseTolerance
  readonly uncertainty: SparseUncertainty
}

export interface SparseUnknownMeasurement {
  readonly status: 'unknown'
  readonly value: null
  readonly reason: string
  readonly evidenceRefs: readonly string[]
  readonly tolerance: SparseTolerance
  readonly uncertainty: SparseUncertainty
}

export type SparseMeasurementValue<T> =
  | SparseProvisionalMeasurement<T>
  | SparseUnknownMeasurement

export interface SparseMeasurementStationInput {
  readonly id: string
  readonly ratio: number
  readonly sMm?: SparseMeasurementValue<Millimeters>
  readonly thetaDeg?: SparseMeasurementValue<number>
  readonly runningSurface?: SparseMeasurementValue<PolylineYZMm>
  readonly underside?: SparseMeasurementValue<PolylineYZMm>
  readonly sideWalls?: Readonly<
    Partial<
      Record<
        keyof CollisionProfileStation['crossSection']['sideWalls'],
        SparseMeasurementValue<PolylineYZMm>
      >
    >
  >
  readonly effectiveHeightMm?: SparseMeasurementValue<Millimeters>
  readonly effectiveWidthMm?: SparseMeasurementValue<Millimeters>
}

export interface SparseMeasurementSessionInput {
  readonly sessionId: string
  readonly partId: string
  readonly variantId: string | null
  readonly profileId: string
  readonly version: string
  readonly schemaVersion?: string
  readonly measuredAt: string | null
  readonly measuredBy: string | null
  readonly evidenceRefs: readonly string[]
  readonly stations: readonly SparseMeasurementStationInput[]
}

export interface SparseMeasurementIngestionOptions {
  readonly existingProfile?: SampledCollisionProfile | null
  readonly standardStations?: readonly CollisionProfileStation[]
}

function unknownTolerance(unit: MeasurementUnit): SparseTolerance {
  return { status: 'unknown', plus: null, minus: null, unit }
}

function unknownUncertainty(unit: MeasurementUnit): SparseUncertainty {
  return { status: 'unknown', value: null, unit }
}

export function provisionalSparseMeasurement<T>(
  value: T,
  unit: MeasurementUnit,
  evidenceRefs: readonly string[] = [],
  tolerance: SparseTolerance = unknownTolerance(unit),
  uncertainty: SparseUncertainty = unknownUncertainty(unit),
): SparseProvisionalMeasurement<T> {
  return {
    status: 'provisional',
    value,
    evidenceRefs: [...evidenceRefs],
    tolerance: { ...tolerance },
    uncertainty: { ...uncertainty },
  }
}

export function unknownSparseMeasurement(
  reason: string,
  unit: MeasurementUnit,
  evidenceRefs: readonly string[] = [],
): SparseUnknownMeasurement {
  return {
    status: 'unknown',
    value: null,
    reason,
    evidenceRefs: [...evidenceRefs],
    tolerance: unknownTolerance(unit),
    uncertainty: unknownUncertainty(unit),
  }
}

function metadataFor(
  input: SparseMeasurementValue<unknown>,
  session: SparseMeasurementSessionInput,
): SampleMetadata {
  const provenance: MeasurementProvenance = {
    sessionId: session.sessionId,
    measuredAt: session.measuredAt,
    measuredBy: session.measuredBy,
  }

  return {
    evidenceRefs: [...new Set([...session.evidenceRefs, ...input.evidenceRefs])],
    tolerance: { ...input.tolerance },
    uncertainty: { ...input.uncertainty },
    provenance,
  }
}

function clonePolyline(polyline: PolylineYZMm): PolylineYZMm {
  return polyline.map((point) => ({ y: mm(point.y), z: mm(point.z) }))
}

function ingestValue<T>(
  input: SparseMeasurementValue<T> | undefined,
  existing: SourceSample<T>,
  session: SparseMeasurementSessionInput,
  cloneValue: (value: T) => T = (value) => value,
): SourceSample<T> {
  if (input === undefined) return existing

  if (input.status === 'unknown') {
    return {
      sampleKind: 'unknown',
      status: 'unknown',
      value: null,
      reason: input.reason,
      metadata: metadataFor(input, session),
    }
  }

  return {
    sampleKind: 'measured',
    status: 'provisional',
    value: cloneValue(input.value),
    metadata: metadataFor(input, session),
  }
}

function ingestStation(
  input: SparseMeasurementStationInput,
  existing: CollisionProfileStation,
  session: SparseMeasurementSessionInput,
): CollisionProfileStation {
  const sideWalls = input.sideWalls

  return {
    ...existing,
    id: input.id,
    position: {
      ...existing.position,
      ratio: normalizeRatio(input.ratio),
      sMm: ingestValue(input.sMm, existing.position.sMm, session),
      thetaDeg: ingestValue(input.thetaDeg, existing.position.thetaDeg, session),
    },
    crossSection: {
      runningSurface: ingestValue(
        input.runningSurface,
        existing.crossSection.runningSurface,
        session,
        clonePolyline,
      ),
      underside: ingestValue(
        input.underside,
        existing.crossSection.underside,
        session,
        clonePolyline,
      ),
      sideWalls: {
        left: ingestValue(
          sideWalls?.left,
          existing.crossSection.sideWalls.left,
          session,
          clonePolyline,
        ),
        right: ingestValue(
          sideWalls?.right,
          existing.crossSection.sideWalls.right,
          session,
          clonePolyline,
        ),
        inner: ingestValue(
          sideWalls?.inner,
          existing.crossSection.sideWalls.inner,
          session,
          clonePolyline,
        ),
        outer: ingestValue(
          sideWalls?.outer,
          existing.crossSection.sideWalls.outer,
          session,
          clonePolyline,
        ),
      },
      effectiveHeightMm: ingestValue(
        input.effectiveHeightMm,
        existing.crossSection.effectiveHeightMm,
        session,
      ),
      effectiveWidthMm: ingestValue(
        input.effectiveWidthMm,
        existing.crossSection.effectiveWidthMm,
        session,
      ),
    },
  }
}

function stationSamples(station: CollisionProfileStation): readonly SourceSample<unknown>[] {
  return [
    station.position.sMm,
    station.position.thetaDeg,
    station.centerlinePositionMm,
    station.tangentHeadingDeg,
    station.crossSection.runningSurface,
    station.crossSection.underside,
    station.crossSection.sideWalls.left,
    station.crossSection.sideWalls.right,
    station.crossSection.sideWalls.inner,
    station.crossSection.sideWalls.outer,
    station.crossSection.effectiveHeightMm,
    station.crossSection.effectiveWidthMm,
  ]
}

function assertExistingProfileMatches(
  input: SparseMeasurementSessionInput,
  existing: SampledCollisionProfile,
): void {
  if (
    existing.profileId !== input.profileId ||
    existing.partId !== input.partId ||
    existing.variantId !== input.variantId
  ) {
    throw new Error('Existing profile does not match the sparse measurement target')
  }
}

export function ingestSparseMeasurements(
  input: SparseMeasurementSessionInput,
  options: SparseMeasurementIngestionOptions = {},
): SampledCollisionProfile {
  const existing = options.existingProfile ?? null
  if (existing !== null) assertExistingProfileMatches(input, existing)

  const standardStations = options.standardStations ?? generateStandardStations()
  let stations = mergeAndNormalizeStations(
    standardStations,
    existing?.stations ?? [],
  )

  for (const sparseStation of input.stations) {
    const ratio = normalizeRatio(sparseStation.ratio)
    const matching = stations.find((station) =>
      ratiosEquivalent(station.position.ratio, ratio),
    )
    const base =
      matching ?? createUnknownStation(sparseStation.id, ratio, 'additional')
    const ingested = ingestStation(sparseStation, base, input)
    stations = mergeAndNormalizeStations(stations, [ingested])
  }

  const hasMeasuredData = stations.some((station) =>
    stationSamples(station).some((sample) => sample.sampleKind === 'measured'),
  )
  const existingReference =
    existing === null ? null : collisionProfileReference(existing)
  const supersedes =
    existing !== null && existingReference !== null && existing.version !== input.version
      ? existingReference
      : (existing?.supersedes ?? null)

  return {
    profileId: input.profileId,
    version: input.version,
    schemaVersion:
      input.schemaVersion ??
      existing?.schemaVersion ??
      SAMPLED_COLLISION_PROFILE_SCHEMA_VERSION,
    partId: input.partId,
    variantId: input.variantId,
    status: hasMeasuredData ? 'provisional' : 'unknown',
    stations,
    normalContactExclusions:
      existing?.normalContactExclusions === null ||
      existing?.normalContactExclusions === undefined
        ? null
        : [...existing.normalContactExclusions],
    variant: existing?.variant ?? null,
    supersedes,
  }
}
