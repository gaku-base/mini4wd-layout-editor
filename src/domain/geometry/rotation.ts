import { mm, type Millimeters, type Point3D } from './types'

export const ROTATIONS_45 = [0, 45, 90, 135, 180, 225, 270, 315] as const

export type Rotation45 = (typeof ROTATIONS_45)[number]

interface RotatedXY {
  readonly x: Millimeters
  readonly y: Millimeters
}

const ROOT_HALF = Math.SQRT1_2
const COSINES: Readonly<Record<Rotation45, number>> = {
  0: 1,
  45: ROOT_HALF,
  90: 0,
  135: -ROOT_HALF,
  180: -1,
  225: -ROOT_HALF,
  270: 0,
  315: ROOT_HALF,
}
const SINES: Readonly<Record<Rotation45, number>> = {
  0: 0,
  45: ROOT_HALF,
  90: 1,
  135: ROOT_HALF,
  180: 0,
  225: -ROOT_HALF,
  270: -1,
  315: -ROOT_HALF,
}

export function rotation45(degrees: number): Rotation45 {
  if (!Number.isInteger(degrees) || degrees % 45 !== 0) {
    throw new RangeError('Rotation must be an integer multiple of 45 degrees')
  }

  return (((degrees % 360) + 360) % 360) as Rotation45
}

export function addRotation45(left: Rotation45, right: Rotation45): Rotation45 {
  return rotation45(left + right)
}

export function subtractRotation45(left: Rotation45, right: Rotation45): Rotation45 {
  return rotation45(left - right)
}

export function rotateXY(
  x: Millimeters,
  y: Millimeters,
  rotation: Rotation45,
): RotatedXY {
  return {
    x: mm(x * COSINES[rotation] - y * SINES[rotation]),
    y: mm(x * SINES[rotation] + y * COSINES[rotation]),
  }
}

export function rotatePointAroundZ(point: Point3D, rotation: Rotation45): Point3D {
  const rotated = rotateXY(point.x, point.y, rotation)

  return { ...rotated, z: point.z }
}
