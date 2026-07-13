import {
  addRotation45,
  mm,
  point3D,
  rotateXY,
  subtractRotation45,
  type Point3D,
} from '../geometry'
import type {
  ConnectorDefinition,
  ConnectorKind,
  ConnectorPose,
  DimensionedPoint3D,
  WorldConnector,
} from './connectors'
import {
  isKnownDimension,
  unknownDimension,
  type Dimension,
  type KnownDimension,
} from './dimensions'
import type { PartDefinition } from './definitions'

export interface PlacedPart {
  readonly definition: PartDefinition
  readonly origin: Point3D
  readonly rotation: ConnectorPose['heading']
}

function connectorByKind(
  definition: PartDefinition,
  kind: ConnectorKind,
): ConnectorDefinition {
  const connector = definition.connectors.find((candidate) => candidate.kind === kind)

  if (connector === undefined) {
    throw new Error(`Part ${definition.id} does not have an ${kind} connector`)
  }

  return connector
}

function requireKnownOffset(offset: DimensionedPoint3D): Point3D {
  if (
    !isKnownDimension(offset.x) ||
    !isKnownDimension(offset.y) ||
    !isKnownDimension(offset.z)
  ) {
    throw new Error('The connector offset is not fully known')
  }

  return { x: offset.x.value, y: offset.y.value, z: offset.z.value }
}

export function placePartAtConnector(
  definition: PartDefinition,
  target: ConnectorPose,
): PlacedPart {
  const entrance = connectorByKind(definition, 'entrance')
  const rotation = subtractRotation45(target.heading, entrance.headingOffset)
  const entranceOffset = requireKnownOffset(entrance.offset)
  const rotatedEntrance = rotateXY(entranceOffset.x, entranceOffset.y, rotation)

  return {
    definition,
    origin: point3D(
      target.position.x - rotatedEntrance.x,
      target.position.y - rotatedEntrance.y,
      target.position.z - entranceOffset.z,
    ),
    rotation,
  }
}

function mergedStatus(left: KnownDimension, right: KnownDimension): KnownDimension['status'] {
  return left.status === 'verified' && right.status === 'verified'
    ? 'verified'
    : 'provisional'
}

function rotateHorizontalDimensions(
  offset: DimensionedPoint3D,
  rotation: PlacedPart['rotation'],
): Pick<DimensionedPoint3D, 'x' | 'y'> {
  if (!isKnownDimension(offset.x) || !isKnownDimension(offset.y)) {
    const evidence = `Unresolved rotated offset: x=${offset.x.evidence}; y=${offset.y.evidence}`
    return { x: unknownDimension(evidence), y: unknownDimension(evidence) }
  }

  const rotated = rotateXY(offset.x.value, offset.y.value, rotation)
  const status = mergedStatus(offset.x, offset.y)
  const evidence = `Rotated from: x=${offset.x.evidence}; y=${offset.y.evidence}`

  return {
    x: { status, value: rotated.x, evidence },
    y: { status, value: rotated.y, evidence },
  }
}

function translateDimension(origin: number, offset: Dimension): Dimension {
  if (!isKnownDimension(offset)) {
    return offset
  }

  return { ...offset, value: mm(origin + offset.value) }
}

export function getWorldConnector(
  placedPart: PlacedPart,
  kind: ConnectorKind,
): WorldConnector {
  const definition = connectorByKind(placedPart.definition, kind)
  const horizontal = rotateHorizontalDimensions(definition.offset, placedPart.rotation)

  return {
    definition,
    position: {
      x: translateDimension(placedPart.origin.x, horizontal.x),
      y: translateDimension(placedPart.origin.y, horizontal.y),
      z: translateDimension(placedPart.origin.z, definition.offset.z),
    },
    heading: addRotation45(placedPart.rotation, definition.headingOffset),
  }
}

export function resolveConnectorPose(connector: WorldConnector): ConnectorPose | null {
  const { x, y, z } = connector.position

  if (!isKnownDimension(x) || !isKnownDimension(y) || !isKnownDimension(z)) {
    return null
  }

  return {
    position: { x: x.value, y: y.value, z: z.value },
    heading: connector.heading,
  }
}

export function connectPart(
  source: PlacedPart,
  nextDefinition: PartDefinition,
): PlacedPart {
  const sourceExit = resolveConnectorPose(getWorldConnector(source, 'exit'))

  if (sourceExit === null) {
    throw new Error(`Part ${source.definition.id} has an unresolved exit position`)
  }

  return placePartAtConnector(nextDefinition, sourceExit)
}
