import { mm, type Millimeters } from '../geometry'

export type DimensionStatus = 'verified' | 'provisional' | 'unknown'

export interface VerifiedDimension {
  readonly status: 'verified'
  readonly value: Millimeters
  readonly evidence: string
}

export interface ProvisionalDimension {
  readonly status: 'provisional'
  readonly value: Millimeters
  readonly evidence: string
}

export interface UnknownDimension {
  readonly status: 'unknown'
  readonly evidence: string
}

export type Dimension =
  | VerifiedDimension
  | ProvisionalDimension
  | UnknownDimension

export type KnownDimension = VerifiedDimension | ProvisionalDimension

export function verifiedDimension(value: number, evidence: string): VerifiedDimension {
  return { status: 'verified', value: mm(value), evidence }
}

export function provisionalDimension(
  value: number,
  evidence: string,
): ProvisionalDimension {
  return { status: 'provisional', value: mm(value), evidence }
}

export function unknownDimension(evidence: string): UnknownDimension {
  return { status: 'unknown', evidence }
}

export function isKnownDimension(dimension: Dimension): dimension is KnownDimension {
  return dimension.status !== 'unknown'
}
