import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { point3D, rotation45 } from '../domain/geometry'
import {
  EMPTY_COURSE_LAYOUT,
  getOpenLayoutConnectors,
  getWorldConnector,
  placeLayoutPart,
  placeRegisteredPartAtConnector,
  resolveConnectorPose,
  type ConnectorReference,
  type CourseLayout,
  type LayoutPart,
  type OpenLayoutConnector,
} from '../domain/parts'
import { isEditableKeyboardTarget } from './keyboard'
import PALETTE, { type PaletteItem, type PartKey } from './parts'

const CANVAS_WIDTH_PX = 800
const CANVAS_HEIGHT_PX = 600
// UI scale only; it is not a physical part dimension.
const WORLD_UNITS_PER_PIXEL = 4
const WORLD_WIDTH = CANVAS_WIDTH_PX * WORLD_UNITS_PER_PIXEL
const WORLD_HEIGHT = CANVAS_HEIGHT_PX * WORLD_UNITS_PER_PIXEL
const CONNECTOR_MARKER_RADIUS = 32
const START_MARKER_HALF_LENGTH = 60

interface PointerPoint {
  readonly x: number
  readonly y: number
}

interface PartEndpoints {
  readonly entrance: { readonly x: number; readonly y: number }
  readonly exit: { readonly x: number; readonly y: number }
}

interface Props {
  readonly selectedKey?: PartKey
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

function startPreview(pointer: PointerPoint, rotation: ReturnType<typeof rotation45>) {
  const placed = placeRegisteredPartAtConnector('start', {
    position: point3D(pointer.x, pointer.y, 0),
    heading: rotation,
  })
  const entrance = resolveConnectorPose(getWorldConnector(placed, 'entrance'))
  const exit = resolveConnectorPose(getWorldConnector(placed, 'exit'))

  if (entrance === null || exit === null) {
    return null
  }

  return { entrance: entrance.position, exit: exit.position }
}

function connectorKey(connector: OpenLayoutConnector): string {
  return `${connector.reference.partId}:${connector.reference.connectorId}`
}

export function Canvas({ selectedKey }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const nextPartId = useRef(1)
  const [mouse, setMouse] = useState<PointerPoint | null>(null)
  const [rotation, setRotation] = useState(rotation45(0))
  const [layout, setLayout] = useState<CourseLayout>(EMPTY_COURSE_LAYOUT)
  const selectedItem = findPaletteItem(selectedKey)
  const openConnectors = getOpenLayoutConnectors(layout)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'x') {
        return
      }

      event.preventDefault()
      setRotation((current) =>
        key === 'z' ? rotation45(current - 45) : rotation45(current + 45),
      )
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const currentSvg = svgRef.current
    if (!currentSvg) return
    const svg: SVGSVGElement = currentSvg

    function toSvgPoint(event: MouseEvent) {
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const screenTransform = svg.getScreenCTM()
      if (!screenTransform) return null
      const local = point.matrixTransform(screenTransform.inverse())
      return { x: local.x, y: local.y }
    }

    function onMove(event: MouseEvent) {
      const point = toSvgPoint(event)
      if (point) setMouse(point)
    }

    function onWheel(event: WheelEvent) {
      if (event.deltaY === 0) {
        return
      }

      event.preventDefault()
      setRotation((current) =>
        event.deltaY < 0 ? rotation45(current + 45) : rotation45(current - 45),
      )
    }

    svg.addEventListener('mousemove', onMove)
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('mousemove', onMove)
      svg.removeEventListener('wheel', onWheel)
    }
  }, [])

  function nextId(partKey: PartKey): string {
    const id = `${partKey}-${nextPartId.current}`
    nextPartId.current += 1
    return id
  }

  function onClickCanvas() {
    if (
      mouse === null ||
      selectedItem.key !== 'start' ||
      selectedItem.placement === 'unavailable'
    ) {
      return
    }

    const id = nextId('start')
    setLayout((current) => {
      try {
        return placeLayoutPart(current, {
          id,
          partKey: 'start',
          freePose: {
            position: point3D(mouse.x, mouse.y, 0),
            heading: rotation,
          },
        })
      } catch {
        return current
      }
    })
  }

  function onClickConnector(reference: ConnectorReference) {
    if (
      selectedItem.key === 'start' ||
      selectedItem.placement === 'unavailable'
    ) {
      return
    }

    const id = nextId(selectedItem.key)
    setLayout((current) => {
      try {
        return placeLayoutPart(current, {
          id,
          partKey: selectedItem.key,
          snapTarget: reference,
        })
      } catch {
        return current
      }
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
    onClickConnector(reference)
  }

  const canPreviewStart =
    mouse !== null && selectedItem.key === 'start' && layout.parts.length === 0
  const preview = canPreviewStart ? startPreview(mouse, rotation) : null
  const unavailableSelection = selectedItem.placement === 'unavailable'

  return (
    <svg
      ref={svgRef}
      aria-label="Course layout canvas"
      data-open-connector-count={openConnectors.length}
      data-part-count={layout.parts.length}
      width={CANVAS_WIDTH_PX}
      height={CANVAS_HEIGHT_PX}
      viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
      style={{ background: '#f9fefe', border: '1px solid #e2e8e8' }}
      onClick={onClickCanvas}
    >
      {layout.parts.map((part) => {
        const endpoints = partEndpoints(part)
        if (endpoints === null) return null
        const isStart = part.definition.variant === 'start'
        const midpoint = {
          x: (endpoints.entrance.x + endpoints.exit.x) / 2,
          y: (endpoints.entrance.y + endpoints.exit.y) / 2,
        }

        return (
          <g
            key={part.id}
            data-part-id={part.id}
            data-part-key={part.partKey}
            data-part-variant={part.definition.variant}
          >
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

      {openConnectors.map((connector) => (
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
          onClick={(event) => {
            event.stopPropagation()
            onClickConnector(connector.reference)
          }}
          onKeyDown={(event) => onConnectorKeyDown(event, connector.reference)}
        />
      ))}

      {preview && (
        <g data-ghost-rotation={rotation} opacity={0.55} pointerEvents="none">
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

      {mouse && unavailableSelection && (
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
    </svg>
  )
}

export default Canvas
