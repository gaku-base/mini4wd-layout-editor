import type { CollisionProfileStation, StationRole } from './types'
import { unknownSample } from './samples'

export const STANDARD_STATION_INTERVAL_PERCENT = 5
export const STANDARD_STATION_COUNT = 21
/** Dimensionless floating-point tolerance; this is not a physical measurement tolerance. */
export const RATIO_NORMALIZATION_EPSILON = 1e-10

const RATIO_DECIMAL_PLACES = 12

function stationRole(percent: number): StationRole {
  if (percent === 0) return 'entrance'
  if (percent === 50) return 'center'
  if (percent === 100) return 'exit'
  return 'intermediate'
}

export function ratiosEquivalent(left: number, right: number): boolean {
  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(left - right) <= RATIO_NORMALIZATION_EPSILON
  )
}

export function normalizeRatio(ratio: number): number {
  if (
    !Number.isFinite(ratio) ||
    ratio < -RATIO_NORMALIZATION_EPSILON ||
    ratio > 1 + RATIO_NORMALIZATION_EPSILON
  ) {
    throw new RangeError('Station ratio must be a finite number from 0 to 1')
  }

  const boundedRatio = Math.min(1, Math.max(0, ratio))
  const standardIndex = Math.round(
    (boundedRatio * 100) / STANDARD_STATION_INTERVAL_PERCENT,
  )
  const standardRatio =
    (standardIndex * STANDARD_STATION_INTERVAL_PERCENT) / 100

  if (ratiosEquivalent(boundedRatio, standardRatio)) return standardRatio

  return Number(boundedRatio.toFixed(RATIO_DECIMAL_PLACES))
}

export function createUnknownStation(
  id: string,
  ratio: number,
  origin: CollisionProfileStation['origin'] = 'additional',
  role?: StationRole,
): CollisionProfileStation {
  const normalizedRatio = normalizeRatio(ratio)
  const reason = `Station ${id} has not been measured`
  const unknownPolyline = () => unknownSample(reason, 'mm')

  return {
    id,
    role: role ?? stationRole(normalizedRatio * 100),
    origin,
    position: {
      ratio: normalizedRatio,
      sMm: unknownSample(reason, 'mm'),
      thetaDeg: unknownSample(reason, 'degree'),
    },
    centerlinePositionMm: unknownSample(reason, 'mm'),
    tangentHeadingDeg: unknownSample(reason, 'degree'),
    crossSection: {
      runningSurface: unknownPolyline(),
      underside: unknownPolyline(),
      sideWalls: {
        left: unknownPolyline(),
        right: unknownPolyline(),
        inner: unknownPolyline(),
        outer: unknownPolyline(),
      },
      effectiveHeightMm: unknownSample(reason, 'mm'),
      effectiveWidthMm: unknownSample(reason, 'mm'),
    },
  }
}

export function generateStandardStations(): readonly CollisionProfileStation[] {
  return Array.from({ length: STANDARD_STATION_COUNT }, (_, index) => {
    const percent = index * STANDARD_STATION_INTERVAL_PERCENT
    const id = `station-${String(percent).padStart(3, '0')}`

    return createUnknownStation(id, percent / 100, 'standard', stationRole(percent))
  })
}

/**
 * Later stations replace earlier stations at the same ratio. This lets an explicit
 * measured/additional station replace a generated unknown placeholder without mutation.
 */
export function mergeAndNormalizeStations(
  baseStations: readonly CollisionProfileStation[],
  additionalStations: readonly CollisionProfileStation[],
): readonly CollisionProfileStation[] {
  const merged: CollisionProfileStation[] = []

  for (const station of [...baseStations, ...additionalStations]) {
    const normalizedRatio = normalizeRatio(station.position.ratio)
    const matchingIndex = merged.findIndex((candidate) =>
      ratiosEquivalent(candidate.position.ratio, normalizedRatio),
    )
    const normalizedStation: CollisionProfileStation = {
      ...station,
      position: { ...station.position, ratio: normalizedRatio },
    }

    if (matchingIndex === -1) {
      merged.push(normalizedStation)
    } else {
      const matchedRatio = merged[matchingIndex].position.ratio
      merged[matchingIndex] = {
        ...normalizedStation,
        position: { ...normalizedStation.position, ratio: matchedRatio },
      }
    }
  }

  return merged.sort(
    (left, right) => left.position.ratio - right.position.ratio,
  )
}
