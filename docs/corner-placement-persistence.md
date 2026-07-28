# Corner placement persistence decision

When a corner ghost is confirmed, the real part stores its semantic turn direction separately from its connector and rendering transform:

- `handedness` and `cornerHandedness`: persisted appearance/state (`right` or `left`)
- `selectedHandedness` and `appliedHandedness`: confirmation diagnostics copied from the proposal
- `entryConnectorId`, `cornerMirror`, `rotation`, position, height, and connections: persisted placement geometry
- `cornerGhostHandedness` and `lastPlacedCornerHandedness`: session-only state, never serialized

During JSON, localStorage, and Undo/Redo restoration, explicit `handedness` or `cornerHandedness` is authoritative. The connector mirror is reconstructed for that direction. Legacy parts without an explicit direction continue to derive it from their stored connector and mirror.
