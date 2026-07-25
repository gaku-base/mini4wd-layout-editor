import type { Point3D, Rotation45 } from '../geometry'
import type {
  CollisionProfileReference,
  CollisionReadinessRequirements,
  SampledCollisionProfile,
  SideWallKey,
} from '../collision-profile'

export type CollisionGeometryComponent =
  | 'runningSurface'
  | 'underside'
  | `sideWalls.${SideWallKey}`

export interface CollisionPlacementPose {
  readonly origin: Point3D
  readonly rotation: Rotation45
}

/** A placed course-part body. Supports are intentionally outside this domain model. */
export interface PlacedCollisionPart {
  /** Stable placed-part instance ID, not the part-master definition ID. */
  readonly partId: string
  readonly profile: SampledCollisionProfile | null
  readonly pose: CollisionPlacementPose | null
  readonly collisionRequirements: CollisionReadinessRequirements
}

export interface WorldCollisionPoint {
  readonly stationId: string
  readonly component: CollisionGeometryComponent
  readonly point: Point3D
}

export interface WorldCollisionStation {
  readonly stationId: string
  readonly ratio: number
  readonly points: readonly WorldCollisionPoint[]
}

export interface CollisionGeometryMissingItem {
  readonly partId: string
  readonly stationId: string | null
  readonly item: string
}

export interface CollisionGeometryMissingStation {
  readonly partId: string
  readonly stationId: string
}

export interface WorldCollisionProfile {
  readonly partId: string
  readonly profileReference: CollisionProfileReference
  readonly stations: readonly WorldCollisionStation[]
  readonly points: readonly WorldCollisionPoint[]
  readonly missingStations: readonly CollisionGeometryMissingStation[]
  readonly missingItems: readonly CollisionGeometryMissingItem[]
}

export interface WorldAabb {
  readonly min: Point3D
  readonly max: Point3D
}

export type WorldAabbBuildResult =
  | {
      readonly status: 'ready'
      readonly partId: string
      readonly profileReference: CollisionProfileReference
      readonly worldProfile: WorldCollisionProfile
      readonly aabb: WorldAabb
      readonly missingStations: readonly []
      readonly missingItems: readonly []
    }
  | {
      readonly status: 'indeterminate'
      readonly partId: string
      readonly profileReference: CollisionProfileReference | null
      readonly worldProfile: WorldCollisionProfile | null
      readonly aabb: null
      readonly missingStations: readonly CollisionGeometryMissingStation[]
      readonly missingItems: readonly CollisionGeometryMissingItem[]
    }

export interface FormalConnectorEndpoint {
  readonly partId: string
  readonly connectorId: string
}

export interface FormalConnectorConnection {
  readonly connectionId: string
  readonly endpoints: readonly [FormalConnectorEndpoint, FormalConnectorEndpoint]
}

export type BroadPhaseDiagnosticStatus =
  | 'clear'
  | 'candidate'
  | 'indeterminate'
  | 'excluded-normal-contact'

export type BroadPhaseReasonCode =
  | 'aabb-separated-xy'
  | 'aabb-separated-z'
  | 'aabb-overlap-needs-narrow-phase'
  | 'collision-profile-incomplete'
  | 'collision-placement-incomplete'
  | 'formal-connection-known-normal-contact-exclusion'

export interface BroadPhasePairDiagnostic {
  readonly status: BroadPhaseDiagnosticStatus
  readonly partIds: readonly [string, string]
  readonly profileReferences: readonly [
    CollisionProfileReference | null,
    CollisionProfileReference | null,
  ]
  readonly worldAabbs: readonly [WorldAabb | null, WorldAabb | null]
  /** AABB overlap only. It is never proof of a physical collision. */
  readonly candidateRange: WorldAabb | null
  readonly reasonCodes: readonly BroadPhaseReasonCode[]
  readonly missingStations: readonly CollisionGeometryMissingStation[]
  readonly missingItems: readonly CollisionGeometryMissingItem[]
  /** Set only when an exact formal connector relationship authorized the contract. */
  readonly formalConnectionId: string | null
}

export interface BroadPhaseResult {
  /** All unique part pairs, sorted by stable part instance ID. */
  readonly diagnostics: readonly BroadPhasePairDiagnostic[]
  /** Plain AABB-overlap diagnostics without a normal-contact contract. */
  readonly candidates: readonly BroadPhasePairDiagnostic[]
  readonly indeterminate: readonly BroadPhasePairDiagnostic[]
  /** Normal-contact contracts; these do not prove the remaining pair is collision-free. */
  readonly excludedNormalContacts: readonly BroadPhasePairDiagnostic[]
  /** Both candidates and normal-contact contracts must continue to narrow phase. */
  readonly pairsRequiringNarrowPhase: readonly BroadPhasePairDiagnostic[]
}
