import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { point3D } from '../domain/geometry'
import {
  getConnectedComponentPartIds,
  getOpenLayoutConnectors,
  getWorldConnector,
  placeRegisteredPartAtConnector,
  resolveConnectorPose,
  translateLayoutParts,
  type ConnectorReference,
  type LayoutPart,
  type OpenLayoutConnector,
} from '../domain/parts'
import type { EditorAction, EditorState } from './editor-state'
import PALETTE, { type PaletteItem, type PartKey } from './parts'
import {
  normalizeSelectionRect,
  partIdAtPoint,
  partIdsIntersectingRect,
  selectionAfterBlankClick,
  selectionAfterPartClick,
  selectionAfterRange,
  type Point2D,
} from './selection'

const CANVAS_WIDTH_PX = 800
const CANVAS_HEIGHT_PX = 600
// UI scale only; it is not a physical part dimension.
const WORLD_UNITS_PER_PIXEL = 4
const WORLD_WIDTH = CANVAS_WIDTH_PX * WORLD_UNITS_PER_PIXEL
const WORLD_HEIGHT = CANVAS_HEIGHT_PX * WORLD_UNITS_PER_PIXEL
const CONNECTOR_MARKER_RADIUS = 32
const START_MARKER_HALF_LENGTH = 60
const PART_HIT_TOLERANCE = 36
const RANGE_INTERSECTION_TOLERANCE = 14
const DRAG_THRESHOLD = 16
const SNAP_DISTANCE = 100

interface PartEndpoints {
  readonly entrance: Point2D
  readonly exit: Point2D
}

type PointerInteraction =
  | {
      readonly kind: 'range'
      readonly pointerId: number
      readonly start: Point2D
      readonly current: Point2D
      readonly additive: boolean
    }
  | {
      readonly kind: 'move'
      readonly pointerId: number
      readonly start: Point2D
      readonly current: Point2D
      readonly partIds: readonly string[]
    }

interface Props {
  readonly selectedKey?: PartKey
  readonly state: EditorState
  readonly dispatch: Dispatch<EditorAction>
}

function findPaletteItem(key?: PartKey): PaletteItem {
  return PALETTE.find((item) => item.key === key) ?? PALETTE[0]
}

function partEndpoints(part: LayoutPart): PartEndpoints | null {
  const entrance = resolveConnectorPose(getWorldConnector(part, 'entrance'))
  const exit = resolveConnectorPose(getWorldConnector(part, 'exit'))

  if (entrance === null || exit === null) {
    return null
  }

  return { entrance: entrance.position, exit: exit.position }
}

function startPreview(
  pointer: Point2D,
  rotation: EditorState['rotation'],
): PartEndpoints | null {
  const placed = placeRegisteredPartAtConnector('start', {
    position: point3D(pointer.x, pointer.y, 0),
    heading: rotation,
  })
  return partEndpoints({ id: 'start-preview', partKey: 'start', ...placed })
}

function connectorKey(connector: OpenLayoutConnector): string {
  return `${connector.reference.partId}:${connector.reference.connectorId}`
}

function dragDistance(interaction: PointerInteraction): number {
  return Math.hypot(
    interaction.current.x - interaction.start.x,
    interaction.current.y - interaction.start.y,
  )
}

export function Canvas({ selectedKey, state, dispatch }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const nextPartId = useRef(1)
  const [mouse, setMouse] = useState<Point2D | null>(null)
  const [interaction, setInteraction] = useState<PointerInteraction | null>(null)
  const layout = state.history.present.layout
  const selectedItem = findPaletteItem(selectedKey)
  const selectedIdSet = new Set(state.selectedPartIds)
  const displayLayout =
    interaction?.kind === 'move'
      ? translateLayoutParts(
          layout,
          interaction.partIds,
          point3D(
            interaction.current.x - interaction.start.x,
            interaction.current.y - interaction.start.y,
            0,
          ),
        )
      : layout
  const openConnectors = getOpenLayoutConnectors(layout)

  useEffect(() => {
    const currentSvg = svgRef.current
    if (currentSvg === null) return

    function onWheel(event: WheelEvent) {
      if (event.deltaY === 0 || state.mode !== 'place') {
        return
      }

      event.preventDefault()
      dispatch({ type: 'rotate', delta: event.deltaY < 0 ? 45 : -45 })
    }

    currentSvg.addEventListener('wheel', onWheel, { passive: false })
    return () => currentSvg.removeEventListener('wheel', onWheel)
  }, [dispatch, state.mode])

  function toSvgPoint(clientX: number, clientY: number): Point2D | null {
    const svg = svgRef.current
    if (svg === null) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const screenTransform = svg.getScreenCTM()
    if (screenTransform === null) return null
    const local = point.matrixTransform(screenTransform.inverse())
    return { x: local.x, y: local.y }
  }

  function nextId(partKey: PartKey): string {
    const id = `${partKey}-${nextPartId.current}`
    nextPartId.current += 1
    return id
  }

  function placeStart(point: Point2D) {
    if (
      selectedItem.key !== 'start' ||
      selectedItem.placement === 'unavailable'
    ) {
      return
    }

    dispatch({
      type: 'place',
      request: {
        id: nextId('start'),
        partKey: 'start',
        freePose: {
          position: point3D(point.x, point.y, 0),
          heading: state.rotation,
        },
      },
    })
  }

  function placeAtConnector(reference: ConnectorReference) {
    if (
      state.mode !== 'place' ||
      selectedItem.key === 'start' ||
      selectedItem.placement === 'unavailable'
    ) {
      return
    }

    dispatch({
      type: 'place',
      request: {
        id: nextId(selectedItem.key),
        partKey: selectedItem.key,
        snapTarget: reference,
      },
    })
  }

  function onConnectorKeyDown(
    event: ReactKeyboardEvent<SVGCircleElement>,
    reference: ConnectorReference,
  ) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    placeAtConnector(reference)
  }

  function beginMove(
    event: ReactPointerEvent<SVGSVGElement>,
    point: Point2D,
    clickedPartId: string,
  ) {
    if (event.shiftKey) {
      dispatch({
        type: 'set-selection',
        partIds: selectionAfterPartClick(
          state.selectedPartIds,
          clickedPartId,
          true,
        ),
      })
      return
    }

    const initialSelection = state.selectedPartIds.includes(clickedPartId)
      ? state.selectedPartIds
      : [clickedPartId]
    const expanded = getConnectedComponentPartIds(layout, initialSelection)
    const expandedBy = expanded.length - initialSelection.length
    dispatch({
      type: 'set-selection',
      partIds: expanded,
      message:
        expandedBy > 0
          ? `接続コンポーネント全体へ${expanded.length}個に拡張`
          : `${expanded.length}個を移動対象に選択`,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
    setInteraction({
      kind: 'move',
      pointerId: event.pointerId,
      start: point,
      current: point,
      partIds: expanded,
    })
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || interaction !== null) return
    const point = toSvgPoint(event.clientX, event.clientY)
    if (point === null) return
    const clickedPartId = partIdAtPoint(layout, point, PART_HIT_TOLERANCE)

    if (clickedPartId !== null) {
      if (state.mode === 'move') {
        beginMove(event, point, clickedPartId)
      } else {
        dispatch({
          type: 'set-selection',
          partIds: selectionAfterPartClick(
            state.selectedPartIds,
            clickedPartId,
            event.shiftKey,
          ),
        })
        dispatch({ type: 'set-mode', mode: 'select' })
      }
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    setInteraction({
      kind: 'range',
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey,
    })
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = toSvgPoint(event.clientX, event.clientY)
    if (point === null) return
    setMouse(point)
    setInteraction((current) =>
      current === null || current.pointerId !== event.pointerId
        ? current
        : { ...current, current: point },
    )
  }

  function finishRange(interactionState: Extract<PointerInteraction, { kind: 'range' }>) {
    if (dragDistance(interactionState) >= DRAG_THRESHOLD) {
      const rect = normalizeSelectionRect(
        interactionState.start,
        interactionState.current,
      )
      const intersecting = partIdsIntersectingRect(
        layout,
        rect,
        RANGE_INTERSECTION_TOLERANCE,
      )
      dispatch({
        type: 'set-selection',
        partIds: selectionAfterRange(
          state.selectedPartIds,
          intersecting,
          interactionState.additive,
        ),
      })
      dispatch({ type: 'set-mode', mode: 'select' })
      return
    }

    if (state.mode === 'place' && layout.parts.length === 0) {
      placeStart(interactionState.current)
      return
    }

    dispatch({
      type: 'set-selection',
      partIds: selectionAfterBlankClick(
        state.selectedPartIds,
        interactionState.additive,
      ),
    })
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (interaction === null || interaction.pointerId !== event.pointerId) return
    const releasePoint = toSvgPoint(event.clientX, event.clientY)
    const finalInteraction =
      releasePoint === null
        ? interaction
        : { ...interaction, current: releasePoint }

    if (finalInteraction.kind === 'move') {
      if (dragDistance(finalInteraction) >= DRAG_THRESHOLD) {
        dispatch({
          type: 'move',
          partIds: finalInteraction.partIds,
          translation: point3D(
            finalInteraction.current.x - finalInteraction.start.x,
            finalInteraction.current.y - finalInteraction.start.y,
            0,
          ),
          snapDistance: SNAP_DISTANCE,
        })
      }
    } else {
      finishRange(finalInteraction)
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    setInteraction(null)
  }

  const canPreviewStart =
    state.mode === 'place' &&
    mouse !== null &&
    selectedItem.key === 'start' &&
    layout.parts.length === 0
  const preview = canPreviewStart ? startPreview(mouse, state.rotation) : null
  const unavailableSelection =
    state.mode === 'place' && selectedItem.placement === 'unavailable'
  const rangeRect =
    interaction?.kind === 'range' && dragDistance(interaction) >= DRAG_THRESHOLD
      ? normalizeSelectionRect(interaction.start, interaction.current)
      : null
  const placementConnectors =
    state.mode === 'place' &&
    selectedItem.key !== 'start' &&
    selectedItem.placement === 'available'
      ? openConnectors
      : []

  return (
    <svg
      ref={svgRef}
      aria-label="Course layout canvas"
      data-connection-count={layout.connections.length}
      data-editor-mode={state.mode}
      data-history-future-count={state.history.future.length}
      data-history-past-count={state.history.past.length}
      data-open-connector-count={openConnectors.length}
      data-part-count={layout.parts.length}
      data-selected-count={state.selectedPartIds.length}
      width={CANVAS_WIDTH_PX}
      height={CANVAS_HEIGHT_PX}
      viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
      className="course-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setInteraction(null)}
      onPointerLeave={() => {
        if (interaction === null) setMouse(null)
      }}
    >
      {displayLayout.parts.map((part) => {
        const endpoints = partEndpoints(part)
        if (endpoints === null) return null
        const isStart = part.definition.variant === 'start'
        const isSelected = selectedIdSet.has(part.id)
        const midpoint = {
          x: (endpoints.entrance.x + endpoints.exit.x) / 2,
          y: (endpoints.entrance.y + endpoints.exit.y) / 2,
        }

        return (
          <g
            key={part.id}
            data-part-id={part.id}
            data-part-key={part.partKey}
            data-part-rotation={part.rotation}
            data-part-selected={isSelected ? 'true' : 'false'}
            data-part-variant={part.definition.variant}
            pointerEvents="none"
          >
            {isSelected && (
              <line
                x1={endpoints.entrance.x}
                y1={endpoints.entrance.y}
                x2={endpoints.exit.x}
                y2={endpoints.exit.y}
                stroke="#facc15"
                strokeWidth={18}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <line
              x1={endpoints.entrance.x}
              y1={endpoints.entrance.y}
              x2={endpoints.exit.x}
              y2={endpoints.exit.y}
              stroke={isStart ? '#d97706' : '#3b82c4'}
              strokeWidth={isStart ? 10 : 7}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {isStart && (
              <g transform={`translate(${midpoint.x},${midpoint.y}) rotate(${part.rotation})`}>
                {/* Symbolic UI marker; it does not represent a measured physical width. */}
                <line
                  x1={0}
                  y1={-START_MARKER_HALF_LENGTH}
                  x2={0}
                  y2={START_MARKER_HALF_LENGTH}
                  stroke="#111827"
                  strokeWidth={8}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={0}
                  y={-82}
                  fill="#92400e"
                  fontSize={48}
                  fontWeight={700}
                  textAnchor="middle"
                >
                  START
                </text>
              </g>
            )}
          </g>
        )
      })}

      {placementConnectors.map((connector) => (
        <circle
          key={connectorKey(connector)}
          aria-label={`Open connector ${connector.reference.partId} ${connector.reference.connectorId}`}
          data-connector-id={connector.reference.connectorId}
          data-part-id={connector.reference.partId}
          cx={connector.pose.position.x}
          cy={connector.pose.position.y}
          r={CONNECTOR_MARKER_RADIUS}
          fill="#ffffff"
          stroke="#16a34a"
          strokeWidth={5}
          role="button"
          tabIndex={0}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => {
            event.stopPropagation()
            placeAtConnector(connector.reference)
          }}
          onKeyDown={(event) => onConnectorKeyDown(event, connector.reference)}
        />
      ))}

      {preview && (
        <g data-ghost-rotation={state.rotation} opacity={0.55} pointerEvents="none">
          <line
            x1={preview.entrance.x}
            y1={preview.entrance.y}
            x2={preview.exit.x}
            y2={preview.exit.y}
            stroke="#d97706"
            strokeWidth={10}
            strokeDasharray="18 12"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}

      {mouse !== null && unavailableSelection && (
        <g
          data-placement-status="unavailable"
          transform={`translate(${mouse.x},${mouse.y})`}
          opacity={0.7}
          pointerEvents="none"
        >
          <circle r={40} fill="#fee2e2" stroke="#dc2626" strokeWidth={5} />
          <line x1={-28} y1={-28} x2={28} y2={28} stroke="#dc2626" strokeWidth={6} />
          <line x1={-28} y1={28} x2={28} y2={-28} stroke="#dc2626" strokeWidth={6} />
        </g>
      )}

      {rangeRect !== null && (
        <rect
          data-selection-rectangle="true"
          x={rangeRect.left}
          y={rangeRect.top}
          width={rangeRect.right - rangeRect.left}
          height={rangeRect.bottom - rangeRect.top}
          fill="rgb(37 99 235 / 12%)"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="12 8"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </svg>
  )
}

export default Canvas
