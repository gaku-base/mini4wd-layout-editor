# Placement-dimension audit — 2026-09-16

使用モデル: GPT-5.6 Sol（推論: High）

## Scope

This audit answers one narrow question: **does each course part occupy the correct
real-world size when placed in the layout space?**

The audit separates:

- a published or project-approved physical dimension (`verified`);
- the current editor's visual / occupancy value when it is not physically proven
  (`provisional`);
- a dimension that cannot be established from the available public evidence
  (`unknown`).

No unlabeled drawing dimension is promoted to `verified` by measuring pixels from a
PDF whose note says the figure is approximately 1/25 scale.

## Primary sources

1. Tamiya, Japan Cup Jr. Circuit / Oval Home Circuit layout material:
   https://www.tamiya.com/cms/japan/mini4wd/regulation_rental/circuits_data.pdf
   - labels Straight 540mm;
   - labels Lane Change 1620mm;
   - labels an assembled 90-degree JCJC curve outer footprint 717mm;
   - labels an assembled 180-degree JCJC curve outer width 1434mm.
2. Tamiya Mini 4WD official competition rules:
   https://www.tamiya.com/japan/mini4wd/regulation.html
   - one straight-lane width 115mm;
   - fence height 50mm.
3. Tamiya Item 95447, JCJC Slope Section:
   https://www.tamiya.com/japan/products/95447/index.html
   - public product copy calls the drop 11cm and lists 5cm fence / 11.5cm lane width.
4. Tamiya Item 69571, JCJC Bank Approach 20:
   https://www.tamiya.com/japan/products/69571/index.html
   - bank angle 20 degrees.
5. Tamiya 2015 Station Championship report:
   https://www.tamiya.com/japan/report/mini4wd_report20151121
   - LC Jump is described as using only the lane-change approach portion.
6. Tamiya 2016 Spring report:
   https://www.tamiya.com/japan/report/mini4wd_report20160313
   - confirms a 20-degree type Burning Lane Change, but publishes no footprint.

Project-approved values remain authoritative where the public product copy is only
nominal/rounded:

- Straight connector span: 540mm.
- JCJC connector-face outer width: 370mm.
- Slope height delta: 115mm.
- Bank20 connector-to-connector projected span: 230mm.

## Result

| Part | Current runtime placement / display reference | Verified evidence | Audit status | Runtime geometry change |
|---|---:|---|---|---|
| Start | 540 × 360mm rectangle | Start is project-derived from verified Straight span | span verified; outer depth provisional | none |
| Straight | 540 × 360mm rectangle | Tamiya labels 540mm span | span verified; outer depth provisional | none |
| 45° Corner R/L | local model R540, inner R360, outer R720 | Tamiya labels assembled 90° outer 717mm and 180° outer width 1434mm | aggregate footprint verified; local decomposition provisional | **none — unresolved 3mm aggregate mismatch** |
| Lane Change | 1620 × 360mm runtime rectangle | Tamiya labels 1620mm | span verified; outer depth provisional | none |
| Wave | 540 × max 420mm runtime bounds | Tamiya confirms JCJC Wave product but gives no dimension-labelled maximum footprint | span provisional; maximum footprint unknown | none |
| Slope | 540 × 360mm plan, +115mm height | project rule 540 / +115; Tamiya public copy says nominal 11cm drop | project geometry verified; full outer footprint unknown | none |
| Bank20 | 230 × 360mm plan, 0°→20° bank | project-approved 230mm connector span; Tamiya confirms 20° | connector span / angle verified; support/outer envelope unknown | none |
| LC Jump | 540 × 360mm current model | Tamiya says it is the lane-change approach portion only; no dimensions published | current span provisional; footprint unknown | none |
| Burning LC | 1800 × 1440mm current independent display model | Tamiya confirms a 20° Burning LC type; no footprint published | display bounds provisional; physical footprint unknown | none |

## Why the 360mm runtime width was not changed to 345mm or 370mm

Tamiya's regulation states **115mm per lane**, so 3 lane clear widths total 345mm.
That is not the same quantity as the complete outer plastic footprint including
fences/walls/joints.

The project also has a separately approved **370mm connector-face outer width**.
That is a connection-face measurement, not enough by itself to prove that every
part's complete plan-view footprint is a constant 370mm.

Therefore this audit does not replace the current 360mm legacy visual/occupancy
width by either 345mm or 370mm without a direct outer-footprint measurement.

## Corner discrepancy

The current 45-degree corner model uses:

- centerline radius 540mm;
- inner radius 360mm;
- outer radius 720mm.

Tamiya's official layout material labels the assembled 90-degree outer dimension as
717mm and the 180-degree outer width as 1434mm (= 717 × 2).

This is a real **3mm aggregate difference** from the current outer-radius model.
However, the public source does not publish the decomposition needed to determine
which local quantity should change:

- centerline radius;
- inner radius;
- radial track / wall width;
- connector local positions.

Changing the local geometry from the aggregate 717mm alone would invent one of
those values and would violate the repository rule against guessed dimensions.
The discrepancy is therefore recorded explicitly and left for measurement rather
than silently forced.

## Slope 110mm public copy vs project 115mm

Item 95447 describes the product as an 11cm-drop slope. The repository's binding
project value is 115mm and is backed by the approved longitudinal profile and
existing tests. The public 11cm wording is retained as a published nominal
reference only; it does **not** overwrite the 115mm authoritative project value.

## Code changes in this audit

- Adds additive `dimensionAudit` metadata to every current part family.
- Exposes Tamiya-published reference constants:
  - lane width 115mm;
  - fence height 50mm;
  - assembled 90° curve outer 717mm;
  - assembled 180° curve outer width 1434mm.
- Adds regression tests proving verified direct placement spans already match
  runtime geometry.
- Adds regression tests preventing provisional/unknown footprint values from
  being silently promoted to verified.
- Does **not** alter placement coordinates, connectors, drawing geometry,
  collision behavior, persistence, or output.

## Follow-up tracking

- Issue #117: https://github.com/gaku-base/mini4wd-layout-editor/issues/117
- This issue owns the remaining 2D placement-footprint measurements. Issue #12 remains focused on slope / bank 3D collision-profile measurement.

## Remaining measurements


The following require direct physical measurement or another dimension-labelled
authoritative source before geometry is changed:

1. 45° corner local centerline / inner / outer radii and connector locations
   consistent with the official 717mm assembled footprint.
2. Wave maximum plan footprint.
3. Straight / Start / Lane Change / Slope / Bank / LC Jump complete outer body
   depth, distinguished from lane clear width and connector-face width.
4. LC Jump standalone approach length and footprint.
5. Burning Lane Change physical footprint.
6. Bank support / body envelope beyond the already verified 230mm connector span.
