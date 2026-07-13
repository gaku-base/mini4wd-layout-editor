declare const millimetersBrand: unique symbol

/** A finite length or coordinate expressed in millimeters. */
export type Millimeters = number & { readonly [millimetersBrand]: 'millimeters' }

export interface Point3D {
  readonly x: Millimeters
  readonly y: Millimeters
  readonly z: Millimeters
}

export function mm(value: number): Millimeters {
  if (!Number.isFinite(value)) {
    throw new RangeError('Millimeter values must be finite')
  }

  return value as Millimeters
}

export function point3D(x: number, y: number, z: number): Point3D {
  return { x: mm(x), y: mm(y), z: mm(z) }
}
