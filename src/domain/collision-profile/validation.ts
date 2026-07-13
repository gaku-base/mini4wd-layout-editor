import type {
  CollisionProfileStation,
  SampledCollisionProfile,
  SourceSample,
} from './types'
import { normalizeRatio, ratiosEquivalent } from './stations'

export type CollisionProfileValidationCode =
  | 'invalid-profile-id'
  | 'invalid-version'
  | 'invalid-schema-version'
  | 'missing-entrance'
  | 'missing-exit'
  | 'ratio-out-of-range'
  | 'duplicate-station-id'
  | 'duplicate-station-ratio'
  | 'stations-out-of-order'
  | 'invalid-unknown-value'

export interface CollisionProfileValidationIssue {
  readonly code: CollisionProfileValidationCode
  readonly path: string
  readonly message: string
}

const SEMANTIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

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

export function validateCollisionProfile(
  profile: SampledCollisionProfile,
): readonly CollisionProfileValidationIssue[] {
  const issues: CollisionProfileValidationIssue[] = []

  if (profile.profileId.trim() === '') {
    issues.push({
      code: 'invalid-profile-id',
      path: 'profileId',
      message: 'Profile ID must not be empty',
    })
  }

  if (!SEMANTIC_VERSION.test(profile.version)) {
    issues.push({
      code: 'invalid-version',
      path: 'version',
      message: 'Profile version must be a semantic version',
    })
  }

  if (!SEMANTIC_VERSION.test(profile.schemaVersion)) {
    issues.push({
      code: 'invalid-schema-version',
      path: 'schemaVersion',
      message: 'Schema version must be a semantic version',
    })
  }

  const stations = profile.stations ?? []

  if (
    !stations.some(
      (station) =>
        ratiosEquivalent(station.position.ratio, 0) && station.role === 'entrance',
    )
  ) {
    issues.push({
      code: 'missing-entrance',
      path: 'stations',
      message: 'An entrance station at ratio 0 is required',
    })
  }

  if (
    !stations.some(
      (station) =>
        ratiosEquivalent(station.position.ratio, 1) && station.role === 'exit',
    )
  ) {
    issues.push({
      code: 'missing-exit',
      path: 'stations',
      message: 'An exit station at ratio 1 is required',
    })
  }

  const ids = new Set<string>()
  const ratios: number[] = []
  let previousRatio = Number.NEGATIVE_INFINITY

  stations.forEach((station, index) => {
    const path = `stations[${index}]`
    const ratio = station.position.ratio
    let normalizedRatio = ratio

    try {
      normalizedRatio = normalizeRatio(ratio)
    } catch {
      issues.push({
        code: 'ratio-out-of-range',
        path: `${path}.position.ratio`,
        message: 'Station ratio must be a finite number from 0 to 1',
      })
    }

    if (ids.has(station.id)) {
      issues.push({
        code: 'duplicate-station-id',
        path: `${path}.id`,
        message: `Station ID ${station.id} is duplicated`,
      })
    }
    ids.add(station.id)

    if (ratios.some((candidate) => ratiosEquivalent(candidate, normalizedRatio))) {
      issues.push({
        code: 'duplicate-station-ratio',
        path: `${path}.position.ratio`,
        message: `Station ratio ${ratio} is duplicated`,
      })
    }
    ratios.push(normalizedRatio)

    if (
      normalizedRatio < previousRatio &&
      !ratiosEquivalent(normalizedRatio, previousRatio)
    ) {
      issues.push({
        code: 'stations-out-of-order',
        path: `${path}.position.ratio`,
        message: 'Stations must be ordered by ascending ratio',
      })
    }
    previousRatio = normalizedRatio

    stationSamples(station).forEach((sample, sampleIndex) => {
      if (sample.status === 'unknown' && sample.value !== null) {
        issues.push({
          code: 'invalid-unknown-value',
          path: `${path}.samples[${sampleIndex}]`,
          message: 'Unknown samples must store null values',
        })
      }
    })
  })

  return issues
}
