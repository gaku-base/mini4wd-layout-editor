import type { Point3D, Rotation45 } from '../geometry'
import type { Dimension } from './dimensions'

export type ConnectorKind = 'entrance' | 'exit'

export interface DimensionedPoint3D {
  readonly x: Dimension
  readonly y: Dimension
  readonly z: Dimension
}

/** Connector offsets are defined in the part's local coordinate system. */
export interface ConnectorDefinition {
  readonly id: string
  readonly kind: ConnectorKind
  readonly offset: DimensionedPoint3D
  /** Tangent direction in the course's direction of travel. */
  readonly headingOffset: Rotation45
}

export interface ConnectorPose {
  readonly position: Point3D
  readonly heading: Rotation45
}

export interface WorldConnector {
  readonly definition: ConnectorDefinition
  readonly position: DimensionedPoint3D
  readonly heading: Rotation45
}
