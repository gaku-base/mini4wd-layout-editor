# Corner placement persistence decision

When a corner ghost is confirmed, the real part stores its semantic turn direction separately from its connector and rendering transform:

- `handedness` and `cornerHandedness`: persisted appearance/state (`right` or `left`)
- `selectedHandedness` and `appliedHandedness`: confirmation diagnostics copied from the proposal
- `entryConnectorId`, `cornerMirror`, `rotation`, position, height, and connections: persisted placement geometry
- `cornerGhostHandedness` and `lastPlacedCornerHandedness`: session-only state, never serialized

During JSON, localStorage, and Undo/Redo restoration, explicit `rotation` and `cornerMirror` are authoritative for the physical pose. Handedness remains semantic UI and validation data. Only legacy parts without `cornerMirror` derive a compatible mirror from their stored direction and entry connector.

## Rendering decision

Ghosts and confirmed parts use the same proposal-to-part pose and renderer. The click handler reuses the proposal most recently rendered for the current placement inputs, so it cannot silently choose a different connector or rotation than the visible ghost. Rendering reads `rotation` and `cornerMirror` directly; it never recomputes the mirror from handedness or connector ID. Geometry QA traces compare the transformed outer path and world connector coordinates before and after placement.
