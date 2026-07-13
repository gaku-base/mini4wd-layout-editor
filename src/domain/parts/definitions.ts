import { rotation45 } from '../geometry'
import type { ConnectorDefinition } from './connectors'
import {
  unknownDimension,
  verifiedDimension,
  type Dimension,
  type UnknownDimension,
  type VerifiedDimension,
} from './dimensions'

const LOCAL_ORIGIN = 'Local connector coordinate-system definition'
const STRAIGHT_LENGTH_EVIDENCE = 'User-specified dimension drawing'
const SLOPE_RISE_EVIDENCE = 'User-specified verified dimension'

export type CollisionGeometry =
  | {
      readonly kind: 'unavailable'
      readonly status: 'unknown'
      readonly evidence: string
    }
  | {
      readonly kind: 'profile-reference'
      readonly status: 'verified' | 'provisional'
      readonly profileId: string
      readonly evidence: string
    }

export interface PartDefinition<
  TDimensions extends Readonly<Record<string, Dimension>> = Readonly<
    Record<string, Dimension>
  >,
> {
  readonly id: string
  readonly name: string
  readonly dimensions: TDimensions
  readonly connectors: readonly ConnectorDefinition[]
  readonly collisionGeometry: CollisionGeometry
}

interface StraightDimensions extends Readonly<Record<string, Dimension>> {
  readonly length: VerifiedDimension
  readonly width: UnknownDimension
  readonly height: UnknownDimension
}

interface SlopeDimensions extends Readonly<Record<string, Dimension>> {
  readonly horizontalLength: UnknownDimension
  readonly elevationGain: VerifiedDimension
  readonly width: UnknownDimension
  readonly height: UnknownDimension
}

const zero = () => verifiedDimension(0, LOCAL_ORIGIN)

const straightLength = verifiedDimension(540, STRAIGHT_LENGTH_EVIDENCE)

export const STRAIGHT: PartDefinition<StraightDimensions> = {
  id: 'straight-540',
  name: 'ストレート',
  dimensions: {
    length: straightLength,
    width: unknownDimension('Straight width has not been measured'),
    height: unknownDimension('Straight height has not been measured'),
  },
  connectors: [
    {
      id: 'entrance',
      kind: 'entrance',
      offset: { x: zero(), y: zero(), z: zero() },
      headingOffset: rotation45(0),
    },
    {
      id: 'exit',
      kind: 'exit',
      offset: { x: straightLength, y: zero(), z: zero() },
      headingOffset: rotation45(0),
    },
  ],
  collisionGeometry: {
    kind: 'unavailable',
    status: 'unknown',
    evidence: 'Straight collision geometry has not been measured',
  },
}

const slopeRise = verifiedDimension(115, SLOPE_RISE_EVIDENCE)

export const SLOPE: PartDefinition<SlopeDimensions> = {
  id: 'slope-up-115',
  name: 'スロープ（上り）',
  dimensions: {
    horizontalLength: unknownDimension('Slope horizontal length has not been measured'),
    elevationGain: slopeRise,
    width: unknownDimension('Slope width has not been measured'),
    height: unknownDimension('Slope total height has not been measured'),
  },
  connectors: [
    {
      id: 'entrance',
      kind: 'entrance',
      offset: { x: zero(), y: zero(), z: zero() },
      headingOffset: rotation45(0),
    },
    {
      id: 'exit',
      kind: 'exit',
      offset: {
        x: unknownDimension('Slope horizontal exit offset has not been measured'),
        y: unknownDimension('Slope horizontal profile has not been measured'),
        z: slopeRise,
      },
      headingOffset: rotation45(0),
    },
  ],
  collisionGeometry: {
    kind: 'unavailable',
    status: 'unknown',
    evidence:
      'Slope running surface, underside, and side-wall profiles have not been measured',
  },
}
