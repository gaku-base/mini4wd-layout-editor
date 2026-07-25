import { point3D, rotatePointAroundZ, type Point3D } from '../geometry'
import {
  collisionProfileReference,
  type CollisionProfileStation,
  type PolylineYZMm,
  type SourceSample,
} from '../collision-profile'
import type {
  CollisionGeometryComponent,
  CollisionGeometryMissingItem,
  CollisionGeometryMissingStation,
  CollisionPlacementPose,
  PlacedCollisionPart,
  WorldCollisionPoint,
  WorldCollisionProfile,
  WorldCollisionStation,
} from './types'

function isFinitePoint(point: Point3D): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
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
  const missing: CollisionGeometryMissingStation[] = []

  for (const item of items) {
    if (item.stationId === null) continue
    const key = `${item.partId}\u0000${item.stationId}`
    if (seen.has(key)) continue
    seen.add(key)
    missing.push({ partId: item.partId, stationId: item.stationId })
  }

  return missing
}

function worldPointFromSectionPoint(
  centerline: Point3D,
  tangentHeadingDeg: number,
  sectionPoint: PolylineYZMm[number],
  pose: CollisionPlacementPose,
): Point3D | null {
  if (
    !isFinitePoint(centerline) ||
    !Number.isFinite(tangentHeadingDeg) ||
    !Number.isFinite(sectionPoint.y) ||
    !Number.isFinite(sectionPoint.z)
  ) {
    return null
  }

  const radians = (tangentHeadingDeg * Math.PI) / 180
  const localPoint = point3D(
    centerline.x - sectionPoint.y * Math.sin(radians),
    centerline.y + sectionPoint.y * Math.cos(radians),
    centerline.z + sectionPoint.z,
  )
  const rotated = rotatePointAroundZ(localPoint, pose.rotation)

  return point3D(
    pose.origin.x + rotated.x,
    pose.origin.y + rotated.y,
    pose.origin.z + rotated.z,
  )
}

function transformPolyline(
  partId: string,
  station: CollisionProfileStation,
  component: CollisionGeometryComponent,
  sample: SourceSample<PolylineYZMm>,
  pose: CollisionPlacementPose,
  missing: CollisionGeometryMissingItem[],
): readonly WorldCollisionPoint[] {
  if (sample.sampleKind !== 'measured' || sample.value.length === 0) {
    missing.push({ partId, stationId: station.id, item: component })
    return []
  }

  const centerline = station.centerlinePositionMm
  if (centerline.sampleKind !== 'measured') {
    missing.push({ partId, stationId: station.id, item: 'centerlinePositionMm' })
    return []
  }

  const tangent = station.tangentHeadingDeg
  if (tangent.sampleKind !== 'measured') {
    missing.push({ partId, stationId: station.id, item: 'tangentHeadingDeg' })
    return []
  }

  const transformed: WorldCollisionPoint[] = []

  for (const point of sample.value) {
    const worldPoint = worldPointFromSectionPoint(
      centerline.value,
      tangent.value,
      point,
      pose,
    )

    if (worldPoint === null) {
      missing.push({ partId, stationId: station.id, item: `${component}.finitePoints` })
      return []
    }

    transformed.push({ stationId: station.id, component, point: worldPoint })
  }

  return transformed
}

export function transformCollisionProfileToWorld(
  part: PlacedCollisionPart,
): WorldCollisionProfile | null {
  if (part.profile === null || part.pose === null) return null

  const missing: CollisionGeometryMissingItem[] = []
  const worldStations: WorldCollisionStation[] = []
  const availableStations = part.profile.stations ?? []
  const requiredStationIds = part.collisionRequirements.requiredStationIds
  const stations =
    requiredStationIds === undefined
      ? availableStations
      : availableStations.filter((station) =>
          requiredStationIds.includes(station.id),
        )

  if (part.profile.stations === null) {
    missing.push({ partId: part.partId, stationId: null, item: 'stations' })
  }

  for (const station of stations) {
    const points: WorldCollisionPoint[] = []
    points.push(
      ...transformPolyline(
        part.partId,
        station,
        'runningSurface',
        station.crossSection.runningSurface,
        part.pose,
        missing,
      ),
      ...transformPolyline(
        part.partId,
        station,
        'underside',
        station.crossSection.underside,
        part.pose,
        missing,
      ),
    )

    for (const sideWall of part.collisionRequirements.requiredSideWalls) {
      points.push(
        ...transformPolyline(
          part.partId,
          station,
          `sideWalls.${sideWall}`,
          station.crossSection.sideWalls[sideWall],
          part.pose,
          missing,
        ),
      )
    }

    worldStations.push({
      stationId: station.id,
      ratio: station.position.ratio,
      points,
    })
  }

  const missingItems = uniqueMissingItems(missing)

  return {
    partId: part.partId,
    profileReference: collisionProfileReference(part.profile),
    stations: worldStations,
    points: worldStations.flatMap((station) => station.points),
    missingStations: missingStationsFrom(missingItems),
    missingItems,
  }
}
