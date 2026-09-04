export interface Point3Mm {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}

export function isFinitePoint3Mm(value: unknown): value is Point3Mm {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<Point3Mm>;
  return typeof candidate.xMm === 'number'
    && Number.isFinite(candidate.xMm)
    && typeof candidate.yMm === 'number'
    && Number.isFinite(candidate.yMm)
    && typeof candidate.zMm === 'number'
    && Number.isFinite(candidate.zMm);
}

export function translatePoint3Mm(point: Point3Mm, delta: Point3Mm): Point3Mm {
  return Object.freeze({
    xMm: point.xMm + delta.xMm,
    yMm: point.yMm + delta.yMm,
    zMm: point.zMm + delta.zMm
  });
}
