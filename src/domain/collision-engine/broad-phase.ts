import type {
  NormalContactExclusion,
  NormalContactExclusionVolume,
  SampledCollisionProfile,
} from '../collision-profile'
import {
  aabbSeparationReason,
  buildConservativeWorldAabb,
  intersectWorldAabbs,
} from './aabb'
import type {
  BroadPhasePairDiagnostic,
  BroadPhaseReasonCode,
  BroadPhaseResult,
  FormalConnectorConnection,
  FormalConnectorEndpoint,
  PlacedCollisionPart,
  WorldAabbBuildResult,
} from './types'

function comparePartIds(left: PlacedCollisionPart, right: PlacedCollisionPart): number {
  if (left.partId < right.partId) return -1
  if (left.partId > right.partId) return 1
  return 0
}

function validateUniquePartIds(parts: readonly PlacedCollisionPart[]): void {
  const ids = new Set<string>()

  for (const part of parts) {
    if (part.partId.trim() === '') {
      throw new Error('Placed collision part IDs must not be empty')
    }
    if (ids.has(part.partId)) {
      throw new Error(`Placed collision part ID ${part.partId} is duplicated`)
    }
    ids.add(part.partId)
  }
}

function endpointPairFor(
  connection: FormalConnectorConnection,
  leftPartId: string,
  rightPartId: string,
): readonly [FormalConnectorEndpoint, FormalConnectorEndpoint] | null {
  const [first, second] = connection.endpoints

  if (first.partId === leftPartId && second.partId === rightPartId) {
    return [first, second]
  }
  if (first.partId === rightPartId && second.partId === leftPartId) {
    return [second, first]
  }

  return null
}

function hasKnownVolumeGeometry(volume: NormalContactExclusionVolume): boolean {
  if (volume.kind === 'oriented-box') {
    return (
      volume.centerMm !== null &&
      volume.sizeMm !== null &&
      volume.rotationDeg !== null
    )
  }

  return (
    volume.verticesMm !== null &&
    volume.verticesMm.length > 0 &&
    volume.faces !== null &&
    volume.faces.length > 0
  )
}

function isKnownExclusion(exclusion: NormalContactExclusion): boolean {
  return (
    exclusion.status !== 'unknown' &&
    exclusion.appliesOnlyWhenFormallyConnected &&
    exclusion.volume.sampleKind === 'measured' &&
    hasKnownVolumeGeometry(exclusion.volume.value)
  )
}

function hasKnownExclusionForConnector(
  profile: SampledCollisionProfile,
  connectorId: string,
): boolean {
  return (
    profile.normalContactExclusions?.some(
      (exclusion) =>
        exclusion.connectorId === connectorId && isKnownExclusion(exclusion),
    ) ?? false
  )
}

function authorizedNormalContactConnection(
  left: PlacedCollisionPart,
  right: PlacedCollisionPart,
  connections: readonly FormalConnectorConnection[],
): FormalConnectorConnection | null {
  if (left.profile === null || right.profile === null) return null

  for (const connection of connections) {
    const endpoints = endpointPairFor(connection, left.partId, right.partId)
    if (endpoints === null) continue

    const [leftEndpoint, rightEndpoint] = endpoints
    if (
      hasKnownExclusionForConnector(left.profile, leftEndpoint.connectorId) &&
      hasKnownExclusionForConnector(right.profile, rightEndpoint.connectorId)
    ) {
      return connection
    }
  }

  return null
}

function indeterminateReasons(
  left: WorldAabbBuildResult,
  right: WorldAabbBuildResult,
): readonly BroadPhaseReasonCode[] {
  const missingItems = [...left.missingItems, ...right.missingItems]
  const reasons: BroadPhaseReasonCode[] = []

  if (missingItems.some((item) => item.item.startsWith('placement.'))) {
    reasons.push('collision-placement-incomplete')
  }
  if (missingItems.some((item) => !item.item.startsWith('placement.'))) {
    reasons.push('collision-profile-incomplete')
  }

  return reasons.length === 0 ? ['collision-profile-incomplete'] : reasons
}

function diagnosePair(
  leftPart: PlacedCollisionPart,
  rightPart: PlacedCollisionPart,
  left: WorldAabbBuildResult,
  right: WorldAabbBuildResult,
  connections: readonly FormalConnectorConnection[],
): BroadPhasePairDiagnostic {
  const partIds = [leftPart.partId, rightPart.partId] as const
  const profileReferences = [left.profileReference, right.profileReference] as const
  const worldAabbs = [left.aabb, right.aabb] as const
  const missingStations = [...left.missingStations, ...right.missingStations]
  const missingItems = [...left.missingItems, ...right.missingItems]

  if (left.status === 'indeterminate' || right.status === 'indeterminate') {
    return {
      status: 'indeterminate',
      partIds,
      profileReferences,
      worldAabbs,
      candidateRange: null,
      reasonCodes: indeterminateReasons(left, right),
      missingStations,
      missingItems,
      formalConnectionId: null,
    }
  }

  const separationReason = aabbSeparationReason(left.aabb, right.aabb)
  if (separationReason !== null) {
    return {
      status: 'clear',
      partIds,
      profileReferences,
      worldAabbs,
      candidateRange: null,
      reasonCodes: [separationReason],
      missingStations: [],
      missingItems: [],
      formalConnectionId: null,
    }
  }

  const candidateRange = intersectWorldAabbs(left.aabb, right.aabb)
  const authorizedConnection = authorizedNormalContactConnection(
    leftPart,
    rightPart,
    connections,
  )

  if (authorizedConnection !== null) {
    return {
      status: 'excluded-normal-contact',
      partIds,
      profileReferences,
      worldAabbs,
      candidateRange,
      reasonCodes: ['formal-connection-known-normal-contact-exclusion'],
      missingStations: [],
      missingItems: [],
      formalConnectionId: authorizedConnection.connectionId,
    }
  }

  return {
    status: 'candidate',
    partIds,
    profileReferences,
    worldAabbs,
    candidateRange,
    reasonCodes: ['aabb-overlap-needs-narrow-phase'],
    missingStations: [],
    missingItems: [],
    formalConnectionId: null,
  }
}

export function diagnoseBroadPhasePairs(
  parts: readonly PlacedCollisionPart[],
  formalConnections: readonly FormalConnectorConnection[] = [],
): BroadPhaseResult {
  validateUniquePartIds(parts)
  const orderedParts = [...parts].sort(comparePartIds)
  const bounds = new Map(
    orderedParts.map((part) => [part.partId, buildConservativeWorldAabb(part)]),
  )
  const diagnostics: BroadPhasePairDiagnostic[] = []

  for (let leftIndex = 0; leftIndex < orderedParts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < orderedParts.length;
      rightIndex += 1
    ) {
      const leftPart = orderedParts[leftIndex]
      const rightPart = orderedParts[rightIndex]
      const leftBounds = bounds.get(leftPart.partId)
      const rightBounds = bounds.get(rightPart.partId)

      if (leftBounds === undefined || rightBounds === undefined) {
        throw new Error('Broad-phase bounds cache is incomplete')
      }

      diagnostics.push(
        diagnosePair(
          leftPart,
          rightPart,
          leftBounds,
          rightBounds,
          formalConnections,
        ),
      )
    }
  }

  const candidates = diagnostics.filter((result) => result.status === 'candidate')
  const excludedNormalContacts = diagnostics.filter(
    (result) => result.status === 'excluded-normal-contact',
  )

  return {
    diagnostics,
    candidates,
    indeterminate: diagnostics.filter(
      (result) => result.status === 'indeterminate',
    ),
    excludedNormalContacts,
    pairsRequiringNarrowPhase: [...candidates, ...excludedNormalContacts].sort(
      (left, right) => {
        const leftKey = `${left.partIds[0]}\u0000${left.partIds[1]}`
        const rightKey = `${right.partIds[0]}\u0000${right.partIds[1]}`
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
      },
    ),
  }
}

export function extractBroadPhaseCandidates(
  parts: readonly PlacedCollisionPart[],
  formalConnections: readonly FormalConnectorConnection[] = [],
): readonly BroadPhasePairDiagnostic[] {
  return diagnoseBroadPhasePairs(parts, formalConnections)
    .pairsRequiringNarrowPhase
}
