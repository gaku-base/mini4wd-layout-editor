import type { Millimeters, Point3D } from '../geometry'

export type ProfileStatus = 'verified' | 'provisional' | 'unknown'
export type KnownProfileStatus = Exclude<ProfileStatus, 'unknown'>
export type MeasurementUnit = 'mm' | 'degree'

export interface Tolerance {
  readonly status: ProfileStatus
  readonly plus: number | null
  readonly minus: number | null
  readonly unit: MeasurementUnit
}

export interface Uncertainty {
  readonly status: ProfileStatus
  readonly value: number | null
  readonly unit: MeasurementUnit
}

export interface SampleMetadata {
  readonly evidenceRefs: readonly string[]
  readonly tolerance: Tolerance
  readonly uncertainty: Uncertainty
  readonly provenance: MeasurementProvenance | null
}

export interface MeasurementProvenance {
  readonly sessionId: string
  readonly measuredAt: string | null
  readonly measuredBy: string | null
}

export interface MeasuredSample<T> {
  readonly sampleKind: 'measured'
  readonly status: KnownProfileStatus
  readonly value: T
  readonly metadata: SampleMetadata
}

export interface UnknownSample {
  readonly sampleKind: 'unknown'
  readonly status: 'unknown'
  readonly value: null
  readonly reason: string
  readonly metadata: SampleMetadata
}

export interface InterpolationSource {
  readonly stationId: string
  readonly ratio: number
}

export interface InterpolatedSample<T> {
  readonly sampleKind: 'interpolated'
  readonly status: 'provisional'
  readonly value: T
  readonly interpolation: {
    readonly method: string
    readonly sources: readonly [InterpolationSource, InterpolationSource]
  }
  readonly metadata: SampleMetadata
}

/** Values stored in the canonical station series are measured or unknown, never derived. */
export type SourceSample<T> = MeasuredSample<T> | UnknownSample
export type SampledValue<T> = SourceSample<T> | InterpolatedSample<T>

export interface PointYZMm {
  readonly y: Millimeters
  readonly z: Millimeters
}

export type PolylineYZMm = readonly PointYZMm[]
export type StationRole = 'entrance' | 'intermediate' | 'center' | 'exit'
export type StationOrigin = 'standard' | 'additional'

export interface CollisionProfileStation {
  readonly id: string
  readonly role: StationRole
  readonly origin: StationOrigin
  readonly position: {
    /** Dimensionless position from entrance 0 to exit 1. */
    readonly ratio: number
    readonly sMm: SourceSample<Millimeters>
    readonly thetaDeg: SourceSample<number>
  }
  readonly centerlinePositionMm: SourceSample<Point3D>
  readonly tangentHeadingDeg: SourceSample<number>
  readonly crossSection: {
    readonly runningSurface: SourceSample<PolylineYZMm>
    readonly underside: SourceSample<PolylineYZMm>
    readonly sideWalls: {
      readonly left: SourceSample<PolylineYZMm>
      readonly right: SourceSample<PolylineYZMm>
      readonly inner: SourceSample<PolylineYZMm>
      readonly outer: SourceSample<PolylineYZMm>
    }
    readonly effectiveHeightMm: SourceSample<Millimeters>
    readonly effectiveWidthMm: SourceSample<Millimeters>
  }
}

export type ExclusionVolumeKind =
  | 'oriented-box'
  | 'convex-polyhedron'
  | 'profile-extrusion'

export interface NormalContactExclusionVolume {
  readonly kind: ExclusionVolumeKind
  readonly centerMm: Point3D | null
  readonly sizeMm: Point3D | null
  readonly rotationDeg: {
    readonly x: number
    readonly y: number
    readonly z: number
  } | null
  readonly verticesMm: readonly Point3D[] | null
  readonly faces: readonly (readonly number[])[] | null
}

export interface NormalContactExclusion {
  readonly id: string
  readonly connectorId: string
  readonly status: ProfileStatus
  readonly appliesOnlyWhenFormallyConnected: true
  readonly volume: SourceSample<NormalContactExclusionVolume>
}

export interface CollisionProfileReference {
  readonly profileId: string
  readonly version: string
  readonly variantId: string | null
}

export interface ProfileTransform {
  readonly travelDirection: 'preserve' | 'reverse'
  readonly turnSide: 'preserve' | 'mirror-left-right'
  readonly stationOrder: 'preserve' | 'reverse'
  readonly connectorMap: {
    readonly entrance: 'entrance' | 'exit'
    readonly exit: 'entrance' | 'exit'
  }
  readonly yAxis: 'preserve' | 'negate'
  readonly crossSlopeSign: 'preserve' | 'negate'
  readonly polygonWinding: 'preserve' | 'reverse'
  readonly elevationDeltaSign: 'preserve' | 'negate'
}

export interface ProfileVariant {
  readonly sourceProfile: CollisionProfileReference
  readonly status: KnownProfileStatus
  readonly transform: ProfileTransform
  readonly evidenceRefs: readonly string[]
}

export interface SampledCollisionProfile {
  readonly profileId: string
  readonly version: string
  readonly schemaVersion: string
  readonly partId: string
  readonly variantId: string | null
  readonly status: ProfileStatus
  readonly stations: readonly CollisionProfileStation[] | null
  readonly normalContactExclusions: readonly NormalContactExclusion[] | null
  readonly variant: ProfileVariant | null
  readonly supersedes: CollisionProfileReference | null
}

export interface CollisionProfileCatalog {
  readonly profiles: readonly SampledCollisionProfile[]
  readonly active: CollisionProfileReference | null
}
