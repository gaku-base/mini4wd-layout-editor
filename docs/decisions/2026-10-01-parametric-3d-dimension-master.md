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

Current non-final vertical-detail cases:

- Lane Change: photo/instruction-derived provisional 3D profile
- LC Jump: provisional 3D profile inherited from the Lane Change rising approach
- Burning Lane Change: bridge height/profile still unmeasured

Lane Change mirrors the adopted 2D SVG bridge path in plan view using normalized coordinates scaled from the current dimension master. Its vertical profile is now explicitly provisional rather than flat: both connectors remain z=0, the bridge rises smoothly and symmetrically to approximately 95mm at the center, then returns to z=0. The approximation carries ±10mm uncertainty and must not be treated as a Tamiya-published nominal dimension.

The 95mm value is based on cross-checking the official Tamiya 69579 assembled product photo, the Tamiya assembly instruction drawing for the two over-bridge halves and two supports, the official 50mm fence height, and a secondary listing of the genuine bridge-support part at 93×108mm. The 108mm support overall height includes attachment/post geometry, so the running-surface rise is modeled slightly lower at 95mm. The longitudinal shape uses a smooth symmetric sine-squared profile because the instruction drawing shows two curved bridge halves meeting at the center; this avoids inventing unverified individual curve radii or station lengths.

Two simplified support panels are rendered at the center for visual fidelity. Their longitudinal span uses 93mm from the support-part envelope, while their rendered vertical extent stops at the modeled running-surface rise. They are visual approximations only.

LC Jump now follows the official 2015 description that it uses only the Lane Change approach portion. The adopted LC Jump placement footprint remains 540 × 360mm and both editor connectors remain at the existing z=0 contract, but OUTPUT 3D adds one auxiliary raised approach lane. Its vertical shape is not given an independent guessed height: the renderer takes the rising prefix of the current Lane Change provisional profile using the adopted physical length ratio 540/1620 = 1/3. With the current 95mm Lane Change peak this derives a launch-edge running-surface rise of 71.25mm. That number is therefore derived, not a separately measured LC Jump dimension, and will automatically change if the Lane Change provisional profile or adopted lengths are corrected.

This LC Jump model is intentionally tagged provisional-photo-derived. The Tamiya 2015 Station Championship report is the construction reference for “Lane Change approach only,” while the 69579 Lane Change set description confirms that separate bridge-approach components exist. The existing 2D footprint and connector geometry are not changed.

Burning Lane Change already follows its adopted 2D plan path while its bridge height stays unresolved.

All provisional Lane Change and LC Jump vertical values must be replaced or recalculated if direct physical measurements become available.

## Regression requirement for future 2D changes

Any change to `PART_DIMENSIONS_MM` must run the 3D dimension and integrity regression suite.

The suite includes a mutation test that changes representative 2D dimensions and confirms that generated 3D geometry follows those changes automatically.

## OUTPUT contract

- LAYOUT remains the precise 2D editing workspace.
- OUTPUT provides 2D / 3D viewing.
- 2D and 3D use the same saved layout state.
- 3D must not alter editor coordinates, connections, colors, heights, or bank states.
- PNG/A4 output uses the currently selected OUTPUT view.
