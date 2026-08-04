# Interference obstacle editor

## Scope

The New Layout modal's third tab creates a rectangular interference obstacle. It is not a course part, does not participate in course snapping, and does not change course geometry.

## Data model

Each stored obstacle has a stable `id`, `name`, centre coordinates in cm, `widthCm`, `depthCm`, clockwise `rotation`, `visible`, and `locked`. The UI accepts metres and converts them to centimetres before storage. Missing `obstacles` data is treated as an empty list for JSON and localStorage compatibility.

## Placement and editing

The first form accepts only a name, width, and depth. The resulting ghost follows the pointer from the centre. Placement requires all four rotated corners to remain within the layout-space boundary and to avoid visible room cutouts. After placement, the sidebar provides the remaining properties, duplicate, and delete controls. Locked obstacles retain visibility and lock controls but reject position, size, and rotation changes.

## Collision presentation

Obstacle-to-course overlap is calculated in 2D with the existing course occupancy polygons and is displayed as a warning. It does not prevent placement because it is not a substitute for the project's required 3D course-body collision model.

## Export

Visible placed obstacles are included in PNG output. Placement ghosts, selection outlines, and editor warnings are excluded.
