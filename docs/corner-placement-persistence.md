# Corner placement persistence decision

## Concrete corner definitions

45-degree corners are two concrete catalog part types:

- `corner-45-right`
- `corner-45-left`

The part `type` is the single source of truth for the physical left/right shape. The catalog owns each type's outer path, lane paths, connector A/B coordinates, and connector tangent directions. Ghost rendering and placed-part rendering both resolve the same catalog definition by `part.type` and then apply only the stored position and rotation.

The corner-direction UI changes the current ghost type. Confirmation copies that visible ghost type unchanged to the placed part. Selecting connector A or B, calculating a tangent rotation, or choosing a height may change only placement geometry; none of those operations may rewrite the type.

## Snapping and persistence

Each concrete corner type exposes connector A and connector B. Every ghost update evaluates both connectors, keeps compatible candidates within the 24px snap radius, and selects the nearest candidate using the existing stable tie-break. Outside the radius the same concrete type is freely placed.

Persisted placed-part geometry is represented by the normal part fields:

- `type`, `rotation`, `x`, `y`, `zMm`, `bankAngle`, and connection data
- `entryConnectorId` when a connection records which endpoint was used

`handedness`, `cornerHandedness`, `cornerMirror`, and proposal-only direction fields are not runtime placement or drawing state and are not written for new parts. Undo/Redo, JSON, localStorage, and PNG all reproduce the concrete type directly.

## Legacy JSON migration

Before validation, old `corner45`, `corner-45`, or `curve` parts migrate by their semantic saved direction only:

- `handedness: "left"` or `cornerHandedness: "left"` -> `corner-45-left`
- `handedness: "right"`, `cornerHandedness: "right"`, or no semantic value -> `corner-45-right`

Old `cornerMirror`, connector ID, and rotation never influence this mapping. The migrated layout removes those legacy runtime fields before normal save, restore, history, and rendering paths continue.
