import type { CollisionProfileStation, StationRole } from './types'
import { unknownSample } from './samples'

export const STANDARD_STATION_INTERVAL_PERCENT = 5
export const STANDARD_STATION_COUNT = 21

function stationRole(percent: number): StationRole {
  if (percent === 0) return 'entrance'
  if (percent === 50) return 'center'
  if (percent === 100) return 'exit'
  return 'intermediate'
}

function assertRatio(ratio: number): void {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new RangeError('Station ratio must be a finite number from 0 to 1')
  }
}

export function createUnknownStation(
  id: string,
  ratio: number,
  origin: CollisionProfileStation['origin'] = 'additional',
  role: StationRole = stationRole(ratio * 100),
): CollisionProfileStation {
  assertRatio(ratio)
  const reason = `Station ${id} has not been measured`
  const unknownPolyline = () => unknownSample(reason, 'mm')

  return {
    id,
    role,
    origin,
    position: {
      ratio,
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
  const byRatio = new Map<number, CollisionProfileStation>()

  for (const station of [...baseStations, ...additionalStations]) {
    assertRatio(station.position.ratio)
    byRatio.set(station.position.ratio, station)
  }

  return [...byRatio.values()].sort(
    (left, right) => left.position.ratio - right.position.ratio,
  )
}
