import { point3D, type Point3D } from '../geometry'
import { connectCourseParts, type ConnectorReference } from './connections'
import type { ConnectorKind } from './connectors'
import {
  getLayoutConnectorKind,
  getLayoutPart,
  getOpenLayoutConnectors,
  type CourseLayout,
  type LayoutPart,
  type OpenLayoutConnector,
} from './layout'

function sameConnector(
  left: ConnectorReference,
  right: ConnectorReference,
): boolean {
  return left.partId === right.partId && left.connectorId === right.connectorId
}

function connectionPartIds(
  firstPartId: string,
  secondPartId: string,
  candidatePartId: string,
): string | null {
  if (firstPartId === candidatePartId) return secondPartId
  if (secondPartId === candidatePartId) return firstPartId
  return null
}

export function getConnectedComponentPartIds(
  layout: CourseLayout,
  seedPartIds: readonly string[],
): readonly string[] {
  const existingIds = new Set(layout.parts.map((part) => part.id))
  const included = new Set(seedPartIds.filter((partId) => existingIds.has(partId)))
  const pending = [...included]

  while (pending.length > 0) {
    const partId = pending.pop()
    if (partId === undefined) break

    for (const connection of layout.connections) {
      const connectedPartId = connectionPartIds(
        connection.first.partId,
        connection.second.partId,
        partId,
      )

      if (connectedPartId !== null && !included.has(connectedPartId)) {
        included.add(connectedPartId)
        pending.push(connectedPartId)
      }
    }
  }

  return layout.parts
    .filter((part) => included.has(part.id))
    .map((part) => part.id)
}

function translatedPart(part: LayoutPart, translation: Point3D): LayoutPart {
  return {
    ...part,
    origin: point3D(
      part.origin.x + translation.x,
      part.origin.y + translation.y,
      part.origin.z + translation.z,
    ),
  }
}

/** Translates a rigid group and moves it to the end of the paint order. */
export function translateLayoutParts(
  layout: CourseLayout,
  partIds: readonly string[],
  translation: Point3D,
): CourseLayout {
  const movingIds = new Set(partIds)
  const moving = layout.parts.filter((part) => movingIds.has(part.id))

  if (
    moving.length === 0 ||
    (translation.x === 0 && translation.y === 0 && translation.z === 0)
  ) {
    return layout
  }

  const stationary = layout.parts.filter((part) => !movingIds.has(part.id))
  return {
    parts: [
      ...stationary,
      ...moving.map((part) => translatedPart(part, translation)),
    ],
    connections: layout.connections,
  }
}

interface SnapCandidate {
  readonly moving: OpenLayoutConnector
  readonly stationary: OpenLayoutConnector
  readonly distance: number
}

function oppositeConnectorKinds(
  first: ConnectorKind,
  second: ConnectorKind,
): boolean {
  return first !== second
}

function connectorDistance(
  first: OpenLayoutConnector,
  second: OpenLayoutConnector,
): number {
  return Math.hypot(
    first.pose.position.x - second.pose.position.x,
    first.pose.position.y - second.pose.position.y,
    first.pose.position.z - second.pose.position.z,
  )
}

function closestSnapCandidate(
  layout: CourseLayout,
  movingPartIds: ReadonlySet<string>,
  maximumDistance: number,
): SnapCandidate | null {
  const openConnectors = getOpenLayoutConnectors(layout)
  const moving = openConnectors.filter((connector) =>
    movingPartIds.has(connector.reference.partId),
  )
  const stationary = openConnectors.filter(
    (connector) => !movingPartIds.has(connector.reference.partId),
  )
  let closest: SnapCandidate | null = null

  for (const movingConnector of moving) {
    const movingPart = getLayoutPart(layout, movingConnector.reference.partId)
    const movingKind = getLayoutConnectorKind(
      movingPart,
      movingConnector.reference,
    )

    for (const stationaryConnector of stationary) {
      if (sameConnector(movingConnector.reference, stationaryConnector.reference)) {
        continue
      }

      const stationaryPart = getLayoutPart(
        layout,
        stationaryConnector.reference.partId,
      )
      const stationaryKind = getLayoutConnectorKind(
        stationaryPart,
        stationaryConnector.reference,
      )

      if (
        !oppositeConnectorKinds(movingKind, stationaryKind) ||
        movingConnector.pose.heading !== stationaryConnector.pose.heading
      ) {
        continue
      }

      const distance = connectorDistance(movingConnector, stationaryConnector)
      if (
        distance <= maximumDistance &&
        (closest === null || distance < closest.distance)
      ) {
        closest = {
          moving: movingConnector,
          stationary: stationaryConnector,
          distance,
        }
      }
    }
  }

  return closest
}

export interface MoveLayoutPartsOptions {
  readonly translation: Point3D
  readonly snapDistance: number
}

/**
 * Moves every connected component reached from the supplied parts as one rigid
 * group. A single compatible pair of open connectors may add a new connection.
 */
export function moveLayoutParts(
  layout: CourseLayout,
  selectedPartIds: readonly string[],
  options: MoveLayoutPartsOptions,
): CourseLayout {
  const movingPartIds = getConnectedComponentPartIds(layout, selectedPartIds)

  if (
    movingPartIds.length === 0 ||
    (options.translation.x === 0 &&
      options.translation.y === 0 &&
      options.translation.z === 0)
  ) {
    return layout
  }

  const moved = translateLayoutParts(layout, movingPartIds, options.translation)
  const movingIdSet = new Set(movingPartIds)
  const candidate = closestSnapCandidate(moved, movingIdSet, options.snapDistance)

  if (candidate === null) {
    return moved
  }

  const correction = point3D(
    candidate.stationary.pose.position.x - candidate.moving.pose.position.x,
    candidate.stationary.pose.position.y - candidate.moving.pose.position.y,
    candidate.stationary.pose.position.z - candidate.moving.pose.position.z,
  )
  const snapped = translateLayoutParts(moved, movingPartIds, correction)
  const connections = connectCourseParts(
    snapped.parts,
    snapped.connections,
    candidate.stationary.reference,
    candidate.moving.reference,
  )

  return { parts: snapped.parts, connections }
}

export function deleteLayoutParts(
  layout: CourseLayout,
  partIds: readonly string[],
): CourseLayout {
  const deletedIds = new Set(partIds)
  const parts = layout.parts.filter((part) => !deletedIds.has(part.id))

  if (parts.length === layout.parts.length) {
    return layout
  }

  const connections = layout.connections.filter(
    (connection) =>
      !deletedIds.has(connection.first.partId) &&
      !deletedIds.has(connection.second.partId),
  )

  return { parts, connections }
}

export function layoutHasPart(layout: CourseLayout, partId: string): boolean {
  return layout.parts.some((part) => part.id === partId)
}
