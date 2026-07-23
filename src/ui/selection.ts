import {
  getWorldConnector,
  resolveConnectorPose,
  type CourseLayout,
  type LayoutPart,
} from '../domain/parts'

export interface Point2D {
  readonly x: number
  readonly y: number
}

export interface SelectionRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

interface PartSegment {
  readonly start: Point2D
  readonly end: Point2D
}

function uniquePartIds(partIds: readonly string[]): readonly string[] {
  return [...new Set(partIds)]
}

export function selectionAfterPartClick(
  selectedPartIds: readonly string[],
  partId: string,
  additive: boolean,
): readonly string[] {
  if (!additive) {
    return [partId]
  }

  return selectedPartIds.includes(partId)
    ? selectedPartIds.filter((selectedId) => selectedId !== partId)
    : [...selectedPartIds, partId]
}

export function selectionAfterRange(
  selectedPartIds: readonly string[],
  intersectingPartIds: readonly string[],
  additive: boolean,
): readonly string[] {
  return additive
    ? uniquePartIds([...selectedPartIds, ...intersectingPartIds])
    : uniquePartIds(intersectingPartIds)
}

export function selectionAfterBlankClick(
  selectedPartIds: readonly string[],
  additive: boolean,
): readonly string[] {
  return additive ? selectedPartIds : []
}

export function reconcileSelection(
  selectedPartIds: readonly string[],
  layout: CourseLayout,
): readonly string[] {
  const existingIds = new Set(layout.parts.map((part) => part.id))
  return selectedPartIds.filter((partId) => existingIds.has(partId))
}

export function normalizeSelectionRect(
  first: Point2D,
  second: Point2D,
): SelectionRect {
  return {
    left: Math.min(first.x, second.x),
    top: Math.min(first.y, second.y),
    right: Math.max(first.x, second.x),
    bottom: Math.max(first.y, second.y),
  }
}

function partSegment(part: LayoutPart): PartSegment | null {
  const entrance = resolveConnectorPose(getWorldConnector(part, 'entrance'))
  const exit = resolveConnectorPose(getWorldConnector(part, 'exit'))

  if (entrance === null || exit === null) {
    return null
  }

  return {
    start: entrance.position,
    end: exit.position,
  }
}

function squaredDistanceToSegment(
  point: Point2D,
  segment: PartSegment,
): number {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    return (
      (point.x - segment.start.x) ** 2 +
      (point.y - segment.start.y) ** 2
    )
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segment.start.x) * dx +
        (point.y - segment.start.y) * dy) /
        lengthSquared,
    ),
  )
  const closestX = segment.start.x + projection * dx
  const closestY = segment.start.y + projection * dy
  return (point.x - closestX) ** 2 + (point.y - closestY) ** 2
}

/** Returns the topmost centerline hit within a UI-only interaction tolerance. */
export function partIdAtPoint(
  layout: CourseLayout,
  point: Point2D,
  tolerance: number,
): string | null {
  const toleranceSquared = tolerance * tolerance

  for (const part of [...layout.parts].reverse()) {
    const segment = partSegment(part)
    if (
      segment !== null &&
      squaredDistanceToSegment(point, segment) <= toleranceSquared
    ) {
      return part.id
    }
  }

  return null
}

function pointInsideRect(point: Point2D, rect: SelectionRect): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  )
}

function cross(first: Point2D, second: Point2D, third: Point2D): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  )
}

function segmentsIntersect(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
): boolean {
  const firstSideStart = cross(firstStart, firstEnd, secondStart)
  const firstSideEnd = cross(firstStart, firstEnd, secondEnd)
  const secondSideStart = cross(secondStart, secondEnd, firstStart)
  const secondSideEnd = cross(secondStart, secondEnd, firstEnd)

  const crosses =
    firstSideStart * firstSideEnd < 0 && secondSideStart * secondSideEnd < 0
  if (crosses) return true

  function onSegment(start: Point2D, end: Point2D, point: Point2D) {
    return (
      point.x >= Math.min(start.x, end.x) &&
      point.x <= Math.max(start.x, end.x) &&
      point.y >= Math.min(start.y, end.y) &&
      point.y <= Math.max(start.y, end.y)
    )
  }

  return (
    (firstSideStart === 0 && onSegment(firstStart, firstEnd, secondStart)) ||
    (firstSideEnd === 0 && onSegment(firstStart, firstEnd, secondEnd)) ||
    (secondSideStart === 0 && onSegment(secondStart, secondEnd, firstStart)) ||
    (secondSideEnd === 0 && onSegment(secondStart, secondEnd, firstEnd))
  )
}

function segmentIntersectsRect(
  segment: PartSegment,
  rect: SelectionRect,
): boolean {
  if (pointInsideRect(segment.start, rect) || pointInsideRect(segment.end, rect)) {
    return true
  }

  const topLeft = { x: rect.left, y: rect.top }
  const topRight = { x: rect.right, y: rect.top }
  const bottomRight = { x: rect.right, y: rect.bottom }
  const bottomLeft = { x: rect.left, y: rect.bottom }

  return [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ].some(([start, end]) =>
    segmentsIntersect(segment.start, segment.end, start, end),
  )
}

export function partIdsIntersectingRect(
  layout: CourseLayout,
  rect: SelectionRect,
  tolerance = 0,
): readonly string[] {
  const expanded = {
    left: rect.left - tolerance,
    top: rect.top - tolerance,
    right: rect.right + tolerance,
    bottom: rect.bottom + tolerance,
  }

  return layout.parts
    .filter((part) => {
      const segment = partSegment(part)
      return segment !== null && segmentIntersectsRect(segment, expanded)
    })
    .map((part) => part.id)
}
