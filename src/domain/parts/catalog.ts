import type { ConnectorKind, ConnectorPose } from './connectors'
import { CORNER_45, SLOPE, START, STRAIGHT, type PartDefinition } from './definitions'
import {
  placePartAtConnector,
  placePartConnectorAtTarget,
  type PlacedPart,
} from './placement'

export type PartPlacementAvailability =
  | {
      readonly placement: 'available'
      readonly definition: PartDefinition
    }
  | {
      readonly placement: 'unavailable'
      readonly reason: string
      readonly definition?: PartDefinition
    }

const PLACEMENT_CATALOG: Readonly<Record<string, PartPlacementAvailability>> = {
  straight: {
    placement: 'available',
    definition: STRAIGHT,
  },
  corner45: {
    placement: 'unavailable',
    definition: CORNER_45,
    reason: 'Corner 45° exit coordinates and physical shape are not verified.',
  },
  start: {
    placement: 'available',
    definition: START,
  },
  slope: {
    placement: 'unavailable',
    definition: SLOPE,
    reason: 'Slope horizontal exit coordinates and physical shape are not verified.',
  },
}

export function getPartPlacementAvailability(partKey: string): PartPlacementAvailability {
  return (
    PLACEMENT_CATALOG[partKey] ?? {
      placement: 'unavailable',
      reason: `No domain shape and connector definition is registered for ${partKey}.`,
    }
  )
}

export function placeRegisteredPartAtConnector(
  partKey: string,
  target: ConnectorPose,
): PlacedPart {
  const availability = getPartPlacementAvailability(partKey)

  if (availability.placement === 'unavailable') {
    throw new Error(`Part ${partKey} cannot be placed: ${availability.reason}`)
  }

  return placePartAtConnector(availability.definition, target)
}

export function placeRegisteredPartConnectorAtTarget(
  partKey: string,
  connectorKind: ConnectorKind,
  target: ConnectorPose,
): PlacedPart {
  const availability = getPartPlacementAvailability(partKey)

  if (availability.placement === 'unavailable') {
    throw new Error(`Part ${partKey} cannot be placed: ${availability.reason}`)
  }

  return placePartConnectorAtTarget(availability.definition, connectorKind, target)
}
