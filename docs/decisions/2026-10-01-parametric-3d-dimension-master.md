# Parametric 3D geometry — 2D dimension master is authoritative

- Date: 2026-10-01
- Status: adopted
- Scope: OUTPUT > 3D and every future 3D part implementation

## Required architecture

`PART_DIMENSIONS_MM` in `part-catalog.js` is the single dimensional source of truth for both 2D and 3D.

The 3D implementation must not introduce a second table containing duplicated physical part dimensions such as:

- Straight = 540 mm
- Bank20 = 220 mm
- Slope = 540 mm / 115 mm
- Corner radius = 540 mm

Those values must be read from the current 2D catalog at generation time.

If a 2D dimension is changed in `PART_DIMENSIONS_MM`, the generated 3D geometry must change automatically without a manual 3D dimension edit.

## Mandatory checks for every 3D part

Before a 3D part is considered complete, automated checks must verify:

1. local connector centres match the corresponding 2D connector centres;
2. track width matches the 2D physical track width;
3. every vertex is finite;
4. every face references valid vertices;
5. faces are not degenerate or zero-area;
6. slope/bank height or angle contracts match the current 2D runtime data;
7. a representative browser render completes without 3D geometry errors.

A detected geometry failure must be surfaced rather than silently rendered.

## Current fidelity policy

Parts with verified vertical data may use dimensional 3D geometry.

Parts whose special vertical detail has not been verified must keep their verified 2D plan dimensions and use an explicitly identified simplified vertical model. Unverified heights must not be invented.

Current simplified vertical-detail cases:

- Lane Change
- LC Jump
- Burning Lane Change bridge height

These remain eligible for later refinement when verified physical dimensions are available.

## Regression requirement for future 2D changes

Any change to `PART_DIMENSIONS_MM` must run the 3D dimension and integrity regression suite.

The suite includes a mutation test that changes representative 2D dimensions and confirms that generated 3D geometry follows those changes automatically.

## OUTPUT contract

- LAYOUT remains the precise 2D editing workspace.
- OUTPUT provides 2D / 3D viewing.
- 2D and 3D use the same saved layout state.
- 3D must not alter editor coordinates, connections, colors, heights, or bank states.
- PNG/A4 output uses the currently selected OUTPUT view.
