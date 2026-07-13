import type {
  InterpolatedSample,
  InterpolationSource,
  KnownProfileStatus,
  MeasurementUnit,
  MeasuredSample,
  SampleMetadata,
  UnknownSample,
} from './types'

function unknownMetadata(unit: MeasurementUnit, evidenceRefs: readonly string[]): SampleMetadata {
  return {
    evidenceRefs: [...evidenceRefs],
    tolerance: { status: 'unknown', plus: null, minus: null, unit },
    uncertainty: { status: 'unknown', value: null, unit },
    provenance: null,
  }
}

export function measuredSample<T>(
  value: T,
  status: KnownProfileStatus,
  unit: MeasurementUnit,
  evidenceRefs: readonly string[],
): MeasuredSample<T> {
  return {
    sampleKind: 'measured',
    status,
    value,
    metadata: unknownMetadata(unit, evidenceRefs),
  }
}

export function unknownSample(
  reason: string,
  unit: MeasurementUnit,
  evidenceRefs: readonly string[] = [],
): UnknownSample {
  return {
    sampleKind: 'unknown',
    status: 'unknown',
    value: null,
    reason,
    metadata: unknownMetadata(unit, evidenceRefs),
  }
}

export function interpolatedSample<T>(
  value: T,
  method: string,
  sources: readonly [InterpolationSource, InterpolationSource],
  unit: MeasurementUnit,
  evidenceRefs: readonly string[],
): InterpolatedSample<T> {
  return {
    sampleKind: 'interpolated',
    status: 'provisional',
    value,
    interpolation: { method, sources },
    metadata: unknownMetadata(unit, evidenceRefs),
  }
}
