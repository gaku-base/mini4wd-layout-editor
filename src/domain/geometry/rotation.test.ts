import { describe, expect, it } from 'vitest'
import { point3D, rotatePointAroundZ, rotation45 } from '.'

describe('45-degree rotation', () => {
  it('rotates an XYZ point around the Z axis', () => {
    const result = rotatePointAroundZ(point3D(540, 0, 12), rotation45(45))

    expect(result.x).toBeCloseTo(540 / Math.sqrt(2), 10)
    expect(result.y).toBeCloseTo(540 / Math.sqrt(2), 10)
    expect(result.z).toBe(12)
  })

  it('rejects angles outside the 45-degree grid', () => {
    expect(() => rotation45(10)).toThrow(RangeError)
  })
})
