# Part-dimension audit — 2026-08-04

This is a code audit, not a physical measurement record. Values labelled
`observed` are read from the current catalog and must not be promoted to
verified physical dimensions without a measurement record.

## Confirmed connection references

| Value | Status | Source |
|---|---|---|
| Straight connection length: 540mm | verified | Project rule and existing `STRAIGHT_CM = 54` |
| JCJC connection-face outer width: 370mm | verified | 2026-08-04 requirements supplied by the user |
| Slope entry-to-exit height delta: 115mm | verified | Project rule and catalog `localZMm` |

The legacy canvas/world plane remains centimetre-based. `TRACK_WIDTH_CM = 36`
is an existing visual lane width used by raster assets; it is not used as the
connection-face width. The new `connectionWidthMm` defaults to 370 and is
converted only at drawing time.

## Catalog audit

| Part | Visual asset / canvas size (observed) | Connector centres (observed cm) | Connection length / width | Visual and collision status |
|---|---|---|---|---|
| Start | `start.png`, 54×36 | (-27,0), (27,0) | 540mm / 370mm | visual bounds are raster-sized; collision is legacy rectangle |
| Straight | `straight.png`, 54×36 | (-27,0), (27,0) | 540mm / 370mm | visual bounds are raster-sized; collision is legacy rectangle |
| Corner 45 R | `corner45.png`, 53.712×49.344 | (-20.884,-3.582), (17.300,12.234) | endpoint separation is derived from radii; 370mm faces | independent 45° annular visual/collision polygon |
| Corner 45 L | `corner45.png`, 53.712×49.344 | (-20.884,3.582), (17.300,-12.234) | endpoint separation is derived from radii; 370mm faces | independent mirrored 45° annular visual/collision polygon |
| Wave | `wave.png`, 54×42 | (-27,2), (27,2) | observed 540mm / 370mm | visual bounds ±27×±21; physical maximum envelope requires measurement |
| Slope | `slope.png`, 54×36 | (-27,0,z0), (27,0,z115) | observed horizontal 540mm / 370mm | underside/clearance/collision profile unknown |
| Lane Change | `lane-change.png`, 162×36 | (-81,0), (81,0) | 1620mm (= straight ×3) / 370mm | bridge, clearance, and collision profile unknown |
| LC Jump | `lc-jump.png`, 54×36 | (-27,0), (27,0) | observed current axis 540mm / 370mm | long/short-side physical measurements and collision footprint unknown |
| Bank 20 | `bank20-entry.png`/`bank20-exit.png`, 28×36 | (-14,0), (14,0) | observed current axis 280mm / 370mm | compositional bank; floor/underside/collision profile unknown |
| Burning Lane Change | `burning-lc.png`, 180×144 | (-93,-54), (-93,54) | no longitudinal value inferred / 370mm | U-shape visual and collision paths are separate; physical dimensions unknown |

## Connection-face rendering

`part-seams.js` derives a face from a connector centre, heading, and
`connectionWidthMm`. It is used for previews, ghosts, placed parts, movement,
and PNG output. Connected connector IDs come from the persisted connection
graph: their two per-part faces are omitted and exactly one owned seam is
drawn. This prevents a double-thick line without using screen-coordinate
string comparisons.

The raster images still contain their own edge appearance. Dynamic lines are
the connection authority; no asset dimensions are used to calculate their
positions or orientations.

## Required measurements before further geometry changes

- Wave maximum outer footprint and collision footprint.
- Slope horizontal end-face distance, underside clearance, and collision mask.
- LC Jump long-side and short-side end-face distances and its collision footprint.
- Bank approach dimensions and measured 3D/collision profiles.
- Raster-to-world registration for every PNG, if assets are retained.
