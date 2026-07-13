import { describe, expect, it } from 'vitest'
import {
  isKnownDimension,
  provisionalDimension,
  unknownDimension,
  verifiedDimension,
} from '.'

describe('dimension states', () => {
  it('keeps verified, provisional, and unknown evidence distinct', () => {
    const verified = verifiedDimension(540, 'verified source')
    const provisional = provisionalDimension(1620, 'drawing check value')
    const unknown = unknownDimension('not measured')

    expect(verified).toMatchObject({ status: 'verified', value: 540 })
    expect(provisional).toMatchObject({ status: 'provisional', value: 1620 })
    expect(unknown).toEqual({ status: 'unknown', evidence: 'not measured' })
    expect(isKnownDimension(unknown)).toBe(false)
  })
})
