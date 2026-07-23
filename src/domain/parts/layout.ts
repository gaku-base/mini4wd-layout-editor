import type { ConnectorPose } from './connectors'
import {
  connectCourseParts,
  isConnectorUsed,
  type ConnectorReference,
  type CourseConnection,
} from './connections'
import { placeRegisteredPartAtConnector, placeRegisteredPartConnectorAtTarget } from './catalog'
import { getWorldConnector, resolveConnectorPose, type PlacedPart } from './placement'

export interface LayoutPart extends PlacedPart {
  readonly id: string
  readonly partKey: string
}

export interface CourseLayout {
  readonly parts: readonly LayoutPart[]
  readonly connections: readonly CourseConnection[]
}

export interface OpenLayoutConnector {
  readonly reference: ConnectorReference
  readonly pose: ConnectorPose
}

export interface LayoutPlacementRequest {
  readonly id: string
  readonly partKey: string
  readonly freePose?: ConnectorPose
  readonly snapTarget?: ConnectorReference
}

export const EMPTY_COURSE_LAYOUT: CourseLayout = {
  parts: [],
  connections: [],
}

function layoutPartById(layout: CourseLayout, partId: string): LayoutPart {
  const part = layout.parts.find((candidate) => candidate.id === partId)

  if (part === undefined) {
    throw new Error(`Layout part ${partId} does not exist`)
  }

  return part
}

function connectorKindForReference(
  part: LayoutPart,
  reference: ConnectorReference,
) {
  const connector = part.definition.connectors.find(
    (candidate) => candidate.id === reference.connectorId,
  )

  if (connector === undefined) {
    throw new Error(
      `Connector ${reference.connectorId} does not exist on part ${reference.partId}`,
    )
  }

  return connector.kind
}

export function getLayoutConnectorPose(
  layout: CourseLayout,
  reference: ConnectorReference,
): ConnectorPose {
  const part = layoutPartById(layout, reference.partId)
  const connectorKind = connectorKindForReference(part, reference)
  const worldConnector = getWorldConnector(part, connectorKind)

  if (worldConnector.definition.id !== reference.connectorId) {
    throw new Error(`Connector ${reference.connectorId} could not be resolved uniquely`)
  }

  const pose = resolveConnectorPose(worldConnector)
  if (pose === null) {
    throw new Error(`Connector ${reference.connectorId} does not have a resolved pose`)
  }

  return pose
}

export function getOpenLayoutConnectors(
  layout: CourseLayout,
): readonly OpenLayoutConnector[] {
  const open: OpenLayoutConnector[] = []

  for (const part of layout.parts) {
    for (const connector of part.definition.connectors) {
      const reference = { partId: part.id, connectorId: connector.id }

      if (isConnectorUsed(layout.connections, reference)) {
        continue
      }

      const pose = resolveConnectorPose(getWorldConnector(part, connector.kind))
      if (pose !== null) {
        open.push({ reference, pose })
      }
    }
  }

  return open
}

function placeFreeStart(
  layout: CourseLayout,
  request: LayoutPlacementRequest,
): CourseLayout {
  if (layout.parts.some((part) => part.partKey === 'start')) {
    throw new Error('Only one Start can be placed in a layout')
  }

  if (layout.parts.length !== 0) {
    throw new Error('Start can only be freely placed into an empty layout')
  }

  if (request.freePose === undefined || request.snapTarget !== undefined) {
    throw new Error('Start requires a free placement pose')
  }

  const placed = placeRegisteredPartAtConnector('start', request.freePose)
  const part: LayoutPart = { id: request.id, partKey: 'start', ...placed }

  return { parts: [part], connections: [] }
}

function attachPart(
  layout: CourseLayout,
  request: LayoutPlacementRequest,
): CourseLayout {
  if (request.snapTarget === undefined || request.freePose !== undefined) {
    throw new Error(`Part ${request.partKey} requires an open connector`)
  }

  if (isConnectorUsed(layout.connections, request.snapTarget)) {
    throw new Error('A connector is already connected')
  }

  const targetPart = layoutPartById(layout, request.snapTarget.partId)
  const targetKind = connectorKindForReference(targetPart, request.snapTarget)
  const targetPose = getLayoutConnectorPose(layout, request.snapTarget)
  const connectingKind = targetKind === 'entrance' ? 'exit' : 'entrance'
  const placed = placeRegisteredPartConnectorAtTarget(
    request.partKey,
    connectingKind,
    targetPose,
  )
  const part: LayoutPart = {
    id: request.id,
    partKey: request.partKey,
    ...placed,
  }
  const connectingConnector = part.definition.connectors.find(
    (connector) => connector.kind === connectingKind,
  )

  if (connectingConnector === undefined) {
    throw new Error(`Part ${request.partKey} does not have an ${connectingKind} connector`)
  }

  const parts = [...layout.parts, part]
  const connections = connectCourseParts(
    parts,
    layout.connections,
    request.snapTarget,
    { partId: part.id, connectorId: connectingConnector.id },
  )

  return { parts, connections }
}

export function placeLayoutPart(
  layout: CourseLayout,
  request: LayoutPlacementRequest,
): CourseLayout {
  if (request.partKey === 'start') {
    return placeFreeStart(layout, request)
  }

  return attachPart(layout, request)
}
