import { interpolatedSample, unknownSample } from './samples'
import type {
  MeasurementUnit,
  SampledValue,
  SourceSample,
} from './types'

export interface NumericStationSample<T extends number> {
  readonly stationId: string
  readonly ratio: number
  readonly sample: SourceSample<T>
}

export interface NumericInterpolationInput<T extends number> {
  readonly samples: readonly NumericStationSample<T>[]
  readonly targetRatio: number
  readonly left: NumericStationSample<T> & {
    readonly sample: Extract<SourceSample<T>, { sampleKind: 'measured' }>
  }
  readonly right: NumericStationSample<T> & {
    readonly sample: Extract<SourceSample<T>, { sampleKind: 'measured' }>
  }
}

export interface NumericProfileInterpolator {
  readonly method: string
  interpolate<T extends number>(input: NumericInterpolationInput<T>): T
}

export const linearNumericInterpolator: NumericProfileInterpolator = {
  method: 'linear',
  interpolate: <T extends number>(input: NumericInterpolationInput<T>): T => {
    const { left, right, targetRatio } = input
    const span = right.ratio - left.ratio
    const progress = (targetRatio - left.ratio) / span

    return (left.sample.value + (right.sample.value - left.sample.value) * progress) as T
  },
}

function evidenceFrom<T extends number>(
  left: NumericStationSample<T>,
  right: NumericStationSample<T>,
): readonly string[] {
  return [...new Set([...left.sample.metadata.evidenceRefs, ...right.sample.metadata.evidenceRefs])]
}

export function interpolateNumericSamples<T extends number>(
  samples: readonly NumericStationSample<T>[],
  targetRatio: number,
  unit: MeasurementUnit,
  interpolator: NumericProfileInterpolator = linearNumericInterpolator,
): SampledValue<T> {
  if (!Number.isFinite(targetRatio) || targetRatio < 0 || targetRatio > 1) {
    return unknownSample('Interpolation target is outside the ratio range', unit)
  }

  const ordered = [...samples].sort((left, right) => left.ratio - right.ratio)
  const exact = ordered.find((candidate) => candidate.ratio === targetRatio)

  if (exact !== undefined) {
    return exact.sample
  }

  const upperIndex = ordered.findIndex((candidate) => candidate.ratio > targetRatio)

  if (upperIndex <= 0) {
    return unknownSample('Interpolation would require extrapolation', unit)
  }

  const left = ordered[upperIndex - 1]
  const right = ordered[upperIndex]

  if (left.sample.sampleKind !== 'measured' || right.sample.sampleKind !== 'measured') {
    return unknownSample('Interpolation is blocked by an unknown station interval', unit)
  }

  const value = interpolator.interpolate({
    samples: ordered,
    targetRatio,
    left: { ...left, sample: left.sample },
    right: { ...right, sample: right.sample },
  })

  if (!Number.isFinite(value)) {
    return unknownSample('Interpolator returned a non-finite value', unit)
  }

  return interpolatedSample(
    value,
    interpolator.method,
    [
      { stationId: left.stationId, ratio: left.ratio },
      { stationId: right.stationId, ratio: right.ratio },
    ],
    unit,
    evidenceFrom(left, right),
  )
}
