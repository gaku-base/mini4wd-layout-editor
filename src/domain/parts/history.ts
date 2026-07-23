import { point3D, type Point3D } from '../geometry'
import {
  deleteLayoutParts,
  layoutHasPart,
  moveLayoutParts,
  type MoveLayoutPartsOptions,
} from './layout-editing'
import {
  EMPTY_COURSE_LAYOUT,
  placeLayoutPart,
  type CourseLayout,
  type LayoutPlacementRequest,
} from './layout'

export interface LayoutDocument {
  readonly layout: CourseLayout
  readonly lastPlacedPartId: string | null
}

export interface LayoutHistory {
  readonly past: readonly LayoutDocument[]
  readonly present: LayoutDocument
  readonly future: readonly LayoutDocument[]
}

export const EMPTY_LAYOUT_DOCUMENT: LayoutDocument = {
  layout: EMPTY_COURSE_LAYOUT,
  lastPlacedPartId: null,
}

function cloneLayout(layout: CourseLayout): CourseLayout {
  return {
    parts: layout.parts.map((part) => ({
      ...part,
      origin: point3D(part.origin.x, part.origin.y, part.origin.z),
    })),
    connections: layout.connections.map((connection) => ({
      first: { ...connection.first },
      second: { ...connection.second },
    })),
  }
}

function cloneDocument(document: LayoutDocument): LayoutDocument {
  return {
    layout: cloneLayout(document.layout),
    lastPlacedPartId: document.lastPlacedPartId,
  }
}

export function createLayoutHistory(
  document: LayoutDocument = EMPTY_LAYOUT_DOCUMENT,
): LayoutHistory {
  return { past: [], present: cloneDocument(document), future: [] }
}

function commitDocument(
  history: LayoutHistory,
  nextDocument: LayoutDocument,
): LayoutHistory {
  if (nextDocument.layout === history.present.layout) {
    return history
  }

  return {
    past: [...history.past, cloneDocument(history.present)],
    present: cloneDocument(nextDocument),
    future: [],
  }
}

export function placePartWithHistory(
  history: LayoutHistory,
  request: LayoutPlacementRequest,
): LayoutHistory {
  const layout = placeLayoutPart(history.present.layout, request)
  return commitDocument(history, {
    layout,
    lastPlacedPartId: request.id,
  })
}

export function movePartsWithHistory(
  history: LayoutHistory,
  partIds: readonly string[],
  options: MoveLayoutPartsOptions,
): LayoutHistory {
  const layout = moveLayoutParts(history.present.layout, partIds, options)
  return commitDocument(history, { ...history.present, layout })
}

export function deletePartsWithHistory(
  history: LayoutHistory,
  partIds: readonly string[],
): LayoutHistory {
  const layout = deleteLayoutParts(history.present.layout, partIds)
  return commitDocument(history, { ...history.present, layout })
}

export function removeLastPlacementWithHistory(
  history: LayoutHistory,
): LayoutHistory {
  const partId = history.present.lastPlacedPartId
  if (partId === null || !layoutHasPart(history.present.layout, partId)) {
    return history
  }

  return deletePartsWithHistory(history, [partId])
}

export function undoLayoutHistory(history: LayoutHistory): LayoutHistory {
  const previous = history.past.at(-1)
  if (previous === undefined) {
    return history
  }

  return {
    past: history.past.slice(0, -1),
    present: cloneDocument(previous),
    future: [cloneDocument(history.present), ...history.future],
  }
}

export function redoLayoutHistory(history: LayoutHistory): LayoutHistory {
  const next = history.future[0]
  if (next === undefined) {
    return history
  }

  return {
    past: [...history.past, cloneDocument(history.present)],
    present: cloneDocument(next),
    future: history.future.slice(1),
  }
}

export function translation2D(x: number, y: number): Point3D {
  return point3D(x, y, 0)
}
