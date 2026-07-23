import type { ConnectorKind } from './connectors'

export interface ConnectableConnectorDefinition {
  readonly id: string
  readonly kind: ConnectorKind
}

export interface ConnectablePartDefinition {
  readonly id: string
  readonly connectors: readonly ConnectableConnectorDefinition[]
}

export interface CoursePartInstance {
  readonly id: string
  readonly definition: ConnectablePartDefinition
}

export interface ConnectorReference {
  readonly partId: string
  readonly connectorId: string
}

export interface CourseConnection {
  readonly first: ConnectorReference
  readonly second: ConnectorReference
}

function sameConnector(left: ConnectorReference, right: ConnectorReference): boolean {
  return left.partId === right.partId && left.connectorId === right.connectorId
}

export function isConnectorUsed(
  connections: readonly CourseConnection[],
  reference: ConnectorReference,
): boolean {
  return connections.some(
    (connection) =>
      sameConnector(connection.first, reference) ||
      sameConnector(connection.second, reference),
  )
}

function resolveConnector(
  parts: readonly CoursePartInstance[],
  reference: ConnectorReference,
): ConnectableConnectorDefinition {
  const matchingParts = parts.filter((part) => part.id === reference.partId)

  if (matchingParts.length !== 1) {
    throw new Error(`Part instance ${reference.partId} must exist exactly once`)
  }

  const connector = matchingParts[0].definition.connectors.find(
    (candidate) => candidate.id === reference.connectorId,
  )

  if (connector === undefined) {
    throw new Error(
      `Connector ${reference.connectorId} does not exist on part ${reference.partId}`,
    )
  }

  return connector
}

export function connectCourseParts(
  parts: readonly CoursePartInstance[],
  connections: readonly CourseConnection[],
  first: ConnectorReference,
  second: ConnectorReference,
): readonly CourseConnection[] {
  if (sameConnector(first, second)) {
    throw new Error('A connector cannot be connected to itself')
  }

  if (isConnectorUsed(connections, first) || isConnectorUsed(connections, second)) {
    throw new Error('A connector is already connected')
  }

  const firstDefinition = resolveConnector(parts, first)
  const secondDefinition = resolveConnector(parts, second)

  if (firstDefinition.kind === secondDefinition.kind) {
    throw new Error('Only entrance and exit connectors can be paired')
  }

  return [...connections, { first, second }]
}
