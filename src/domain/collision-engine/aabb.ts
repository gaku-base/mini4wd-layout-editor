import { point3D, type Point3D } from '../geometry'
import {
  assessCollisionProfileReadiness,
  collisionProfileReference,
} from '../collision-profile'
import { transformCollisionProfileToWorld } from './transform'
import type {
  BroadPhaseReasonCode,
  CollisionGeometryMissingItem,
  CollisionGeometryMissingStation,
  PlacedCollisionPart,
  WorldAabb,
  WorldAabbBuildResult,
} from './types'

/** Numerical guard only. This factor is not a physical tolerance or clearance. */
export const AABB_FLOATING_POINT_SAFETY_FACTOR = 16

function numericalPadding(values: readonly number[]): number {
  const magnitude = Math.max(1, ...values.map((value) => Math.abs(value)))
  return Number.EPSILON * magnitude * AABB_FLOATING_POINT_SAFETY_FACTOR
}

function boundsForAxis(values: readonly number[]): readonly [number, number] {
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = numericalPadding([minimum, maximum])

  return [minimum - padding, maximum + padding]
}

function aabbFromPoints(points: readonly Point3D[]): WorldAabb {
  const [minX, maxX] = boundsForAxis(points.map((point) => point.x))
  const [minY, maxY] = boundsForAxis(points.map((point) => point.y))
  const [minZ, maxZ] = boundsForAxis(points.map((point) => point.z))

  return {
    min: point3D(minX, minY, minZ),
    max: point3D(maxX, maxY, maxZ),
  }
}

function uniqueMissingItems(
  items: readonly CollisionGeometryMissingItem[],
): readonly CollisionGeometryMissingItem[] {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = `${item.partId}\u0000${item.stationId ?? ''}\u0000${item.item}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function missingStationsFrom(
  items: readonly CollisionGeometryMissingItem[],
): readonly CollisionGeometryMissingStation[] {
  const seen = new Set<string>()
  const stations: CollisionGeometryMissingStation[] = []

  for (const item of items) {
    if (item.stationId === null) continue
    const key = `${item.partId}\u0000${item.stationId}`
    if (seen.has(key)) continue
    seen.add(key)
    stations.push({ partId: item.partId, stationId: item.stationId })
  }

  return stations
}

export function buildConservativeWorldAabb(
  part: PlacedCollisionPart,
): WorldAabbBuildResult {
  const missing: CollisionGeometryMissingItem[] = []

  if (part.profile === null) {
    missing.push({ partId: part.partId, stationId: null, item: 'profile' })
  }
  if (part.pose === null) {
    missing.push({ partId: part.partId, stationId: null, item: 'placement.pose' })
  }

  if (part.profile !== null) {
    if (part.profile.status === 'unknown') {
      missing.push({ partId: part.partId, stationId: null, item: 'profile.status' })
    }

    const readiness = assessCollisionProfileReadiness(
      part.profile,
      part.collisionRequirements,
    )
    missing.push(
      ...readiness.collision.missingItems.map((item) => ({
        partId: part.partId,
        stationId: item.stationId,
        item: item.item,
      })),
    )
  }

  const worldProfile = transformCollisionProfileToWorld(part)
  if (worldProfile !== null) missing.push(...worldProfile.missingItems)

  if (worldProfile !== null && worldProfile.points.length === 0) {
    missing.push({ partId: part.partId, stationId: null, item: 'geometry.points' })
  }

  const missingItems = uniqueMissingItems(missing)
  const missingStations = missingStationsFrom(missingItems)

  if (
    part.profile === null ||
    worldProfile === null ||
    missingItems.length > 0 ||
    worldProfile.points.length === 0
  ) {
    return {
      status: 'indeterminate',
      partId: part.partId,
      profileReference:
        part.profile === null ? null : collisionProfileReference(part.profile),
      worldProfile,
      aabb: null,
      missingStations,
      missingItems,
    }
  }

  return {
    status: 'ready',
    partId: part.partId,
    profileReference: collisionProfileReference(part.profile),
    worldProfile,
    aabb: aabbFromPoints(worldProfile.points.map((entry) => entry.point)),
    missingStations: [],
    missingItems: [],
  }
}

export function aabbSeparationReason(
  left: WorldAabb,
  right: WorldAabb,
): Extract<BroadPhaseReasonCode, 'aabb-separated-xy' | 'aabb-separated-z'> | null {
  if (
    left.max.x < right.min.x ||
    right.max.x < left.min.x ||
    left.max.y < right.min.y ||
    right.max.y < left.min.y
  ) {
    return 'aabb-separated-xy'
  }

  if (left.max.z < right.min.z || right.max.z < left.min.z) {
    return 'aabb-separated-z'
  }

  return null
}

export function intersectWorldAabbs(left: WorldAabb, right: WorldAabb): WorldAabb | null {
  if (aabbSeparationReason(left, right) !== null) return null

  return {
    min: point3D(
      Math.max(left.min.x, right.min.x),
      Math.max(left.min.y, right.min.y),
      Math.max(left.min.z, right.min.z),
    ),
    max: point3D(
      Math.min(left.max.x, right.max.x),
      Math.min(left.max.y, right.max.y),
      Math.min(left.max.z, right.max.z),
    ),
  }
}

export function containsPoint(aabb: WorldAabb, point: Point3D): boolean {
  return (
    point.x >= aabb.min.x &&
    point.x <= aabb.max.x &&
    point.y >= aabb.min.y &&
    point.y <= aabb.max.y &&
    point.z >= aabb.min.z &&
    point.z <= aabb.max.z
  )
}
