import { ratiosEquivalent } from './stations'
import type {
  CollisionProfileStation,
  PolylineYZMm,
  SampledCollisionProfile,
  SourceSample,
} from './types'
import {
  validateCollisionProfile,
  type CollisionProfileValidationIssue,
} from './validation'

export type ProfileReadinessState =
  | 'structurally-valid'
  | 'height-chain-ready'
  | 'collision-ready'
  | 'not-ready'

export type ProfileUsePurpose = Exclude<ProfileReadinessState, 'not-ready'>
export type SideWallKey = keyof CollisionProfileStation['crossSection']['sideWalls']

export interface CollisionReadinessRequirements {
  /** Omit to require every station in the canonical profile. */
  readonly requiredStationIds?: readonly string[]
  /** Callers must choose the physical side-wall semantics for the part. */
  readonly requiredSideWalls: readonly SideWallKey[]
}

export const DEFAULT_COLLISION_READINESS_REQUIREMENTS: CollisionReadinessRequirements = {
  requiredSideWalls: ['left', 'right', 'inner', 'outer'],
}

export interface MissingReadinessItem {
  readonly stationId: string | null
  readonly item: string
}

export interface ReadinessCheck<TReady extends ProfileUsePurpose> {
  readonly status: TReady | 'not-ready'
  readonly missingItems: readonly MissingReadinessItem[]
}

export interface ProfileReadinessAssessment {
  readonly highestReadyState: ProfileReadinessState
  readonly structural: ReadinessCheck<'structurally-valid'>
  readonly heightChain: ReadinessCheck<'height-chain-ready'>
  readonly collision: ReadinessCheck<'collision-ready'>
  readonly missingStations: readonly string[]
  readonly missingItems: readonly MissingReadinessItem[]
  readonly validationIssues: readonly CollisionProfileValidationIssue[]
}

function isKnownPolyline(sample: SourceSample<PolylineYZMm>): boolean {
  return sample.sampleKind === 'measured' && sample.value.length > 0
}

function stationIdForValidationIssue(
  issue: CollisionProfileValidationIssue,
  stations: readonly CollisionProfileStation[],
): string | null {
  if (issue.code === 'missing-entrance') return 'entrance@0'
  if (issue.code === 'missing-exit') return 'exit@1'

  const indexMatch = /^stations\[(\d+)]/.exec(issue.path)
  if (indexMatch === null) return null

  return stations[Number(indexMatch[1])]?.id ?? null
}

function structuralMissingItems(
  issues: readonly CollisionProfileValidationIssue[],
  stations: readonly CollisionProfileStation[],
): readonly MissingReadinessItem[] {
  return issues.map((issue) => ({
    stationId: stationIdForValidationIssue(issue, stations),
    item: issue.code,
  }))
}

function heightChainMissingItems(
  stations: readonly CollisionProfileStation[],
  structurallyValid: boolean,
): readonly MissingReadinessItem[] {
  const missing: MissingReadinessItem[] = []

  if (!structurallyValid) {
    missing.push({ stationId: null, item: 'structural-validation' })
  }

  const endpoints = [
    { label: 'entrance@0', station: stations.find((station) => ratiosEquivalent(station.position.ratio, 0)) },
    { label: 'exit@1', station: stations.find((station) => ratiosEquivalent(station.position.ratio, 1)) },
  ] as const

  for (const endpoint of endpoints) {
    if (endpoint.station === undefined) continue
    if (!isKnownPolyline(endpoint.station.crossSection.runningSurface)) {
      missing.push({
        stationId: endpoint.station.id || endpoint.label,
        item: 'runningSurface',
      })
    }
  }

  return missing
}

function collisionMissingItems(
  stations: readonly CollisionProfileStation[],
  structurallyValid: boolean,
  requirements: CollisionReadinessRequirements,
): readonly MissingReadinessItem[] {
  const missing: MissingReadinessItem[] = []

  if (!structurallyValid) {
    missing.push({ stationId: null, item: 'structural-validation' })
  }

  let requiredStations: CollisionProfileStation[] = [...stations]

  if (requirements.requiredStationIds !== undefined) {
    requiredStations = []
    for (const stationId of requirements.requiredStationIds) {
      const station = stations.find((candidate) => candidate.id === stationId)
      if (station === undefined) {
        missing.push({ stationId, item: 'station' })
      } else {
        requiredStations.push(station)
      }
    }
  } else if (stations.length === 0) {
    missing.push({ stationId: null, item: 'stations' })
  }

  for (const station of requiredStations) {
    if (!isKnownPolyline(station.crossSection.runningSurface)) {
      missing.push({ stationId: station.id, item: 'runningSurface' })
    }
    if (!isKnownPolyline(station.crossSection.underside)) {
      missing.push({ stationId: station.id, item: 'underside' })
    }

    for (const sideWall of requirements.requiredSideWalls) {
      if (!isKnownPolyline(station.crossSection.sideWalls[sideWall])) {
        missing.push({ stationId: station.id, item: `sideWalls.${sideWall}` })
      }
    }

    if (station.crossSection.effectiveHeightMm.sampleKind !== 'measured') {
      missing.push({ stationId: station.id, item: 'effectiveHeightMm' })
    }
    if (station.crossSection.effectiveWidthMm.sampleKind !== 'measured') {
      missing.push({ stationId: station.id, item: 'effectiveWidthMm' })
    }
  }

  return missing
}

function uniqueMissingItems(
  items: readonly MissingReadinessItem[],
): readonly MissingReadinessItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.stationId ?? ''}\u0000${item.item}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function assessCollisionProfileReadiness(
  profile: SampledCollisionProfile,
  requirements: CollisionReadinessRequirements = DEFAULT_COLLISION_READINESS_REQUIREMENTS,
): ProfileReadinessAssessment {
  const stations = profile.stations ?? []
  const validationIssues = validateCollisionProfile(profile)
  const structuralMissing = structuralMissingItems(validationIssues, stations)
  const structurallyValid = validationIssues.length === 0
  const heightMissing = heightChainMissingItems(stations, structurallyValid)
  const collisionMissing = collisionMissingItems(
    stations,
    structurallyValid,
    requirements,
  )
  const heightChainReady = structurallyValid && heightMissing.length === 0
  const collisionReady = structurallyValid && collisionMissing.length === 0
  const missingItems = uniqueMissingItems([
    ...structuralMissing,
    ...heightMissing,
    ...collisionMissing,
  ])
  const missingStations = [
    ...new Set(
      missingItems.flatMap((item) =>
        item.stationId === null ? [] : [item.stationId],
      ),
    ),
  ]
  const highestReadyState: ProfileReadinessState = collisionReady
    ? 'collision-ready'
    : heightChainReady
      ? 'height-chain-ready'
      : structurallyValid
        ? 'structurally-valid'
        : 'not-ready'

  return {
    highestReadyState,
    structural: {
      status: structurallyValid ? 'structurally-valid' : 'not-ready',
      missingItems: structuralMissing,
    },
    heightChain: {
      status: heightChainReady ? 'height-chain-ready' : 'not-ready',
      missingItems: heightMissing,
    },
    collision: {
      status: collisionReady ? 'collision-ready' : 'not-ready',
      missingItems: collisionMissing,
    },
    missingStations,
    missingItems,
    validationIssues,
  }
}
