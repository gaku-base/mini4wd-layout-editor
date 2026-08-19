# Collision broad-phase engine

## Scope

`collision-broadphase.js` is the Phase 2.0 domain-only broad-phase layer. It does **not** assert a physical collision. It transforms sampled collision-profile stations into world coordinates, builds conservative world AABBs, and classifies part pairs for later narrow-phase work.

UI rendering, red highlighting, mesh/triangle intersection, supports/bridges/floor, and measured slope/bank values are outside this module.

## Units and placement contract

All engine inputs are millimetres except degrees.

```js
{
  partId: 'part-1',
  profileRef: 'slope-profile@0.1.0',
  profile: resolvedProfile3d,
  positionMm: { x: 0, y: 0, z: 115 },
  rotationDeg: 45
}
```

`profile` is the resolved `profile3d` / `bankProfile` geometry object described by the measurement protocol, not the full immutable version wrapper from section 10. `profileRef` keeps the outer profile/version reference available to diagnostics.

The current editor runtime still stores course-part `x` / `y` in centimetres and `zMm` in millimetres. This module intentionally does not accept those mixed-unit fields. A future UI adapter must convert XY to millimetres explicitly before calling the engine.

Course-part placement rotation must stay on the established 45-degree grid. Station `tangentHeadingDeg` remains independent and may contain measured profile headings.

## Profile readiness

An authoritative world AABB is produced only when the resolved profile satisfies the collision-readiness conditions used by the measurement protocol:

- `status` is `verified` or `provisional`;
- `coordinateFrame` is `part-local-xyz`;
- interpolation is `linear` or `none`; `unknown` and spline interpolation are not treated as broad-phase safe by this first implementation;
- stations have unique IDs, finite ratios in `[0, 1]`, ascending ratio order, and include ratio `0` and ratio `1`;
- every station has finite `centerlinePositionMm.x/y/z` and `tangentHeadingDeg`;
- required running-surface and underside polylines exist;
- any wall keys requested by the caller are present;
- every station has finite effective height and effective width, either under `passableClearance` or the equivalent station-level fields.

Unknown or missing values are never converted to zero. If required data is missing, the result is `indeterminate`.

For an incomplete profile, `knownWorldAabb*` may contain a diagnostic bound of the points that were actually known, but `worldAabb*` remains `null`. The partial bound must never be used to certify `clear` or `collision`.

The ratio comparison epsilon is `1e-10`, matching the measurement protocol. It is dimensionless and exists only to absorb JavaScript representation differences such as `0.3` versus `0.30000000000000004`.

## Station-frame transform

The engine interprets each station Y/Z cross-section point as an offset from `centerlinePositionMm` in the station frame:

1. `tangentHeadingDeg` orients the station transverse Y axis inside part-local XY;
2. the station-local point is transformed into part-local XYZ;
3. the part `rotationDeg` is applied around +Z;
4. `positionMm` translates the point into world XYZ.

This makes curved and sloped station sections transform without assuming a rectangular part body.

## Conservative sampled AABB

For XY, the engine does not simply take the extrema of the transformed station wall points. It takes the world centerline-station bounds and expands them by the largest known lateral station radius. With linear/no interpolation this conservatively encloses the sampled cross-section sweep even while station tangent headings change between samples. Z uses the extrema of the sampled transformed collision points.

This AABB is conservative for the profile representation accepted by this Phase 2.0 contract. It does not improve the physical accuracy of a provisional measurement profile; unknown geometry still stays `indeterminate`.

## Supported wall representations

The engine accepts both profile forms already documented by the measurement protocol:

- `sideWallPolylinesYZMm.left/right = [[y, z], ...]`
- bank-style `walls.inner/outer.lowerEdgeMm` / `upperEdgeMm` as `{ y, z }`

The caller chooses which wall keys are required with `requiredWallKeys`, for example `['left', 'right']` or `['inner', 'outer']`.

## AABB classification

Pair results use these statuses:

- `clear`: both profiles are ready, a physical tolerance was explicitly supplied, and one AABB axis is separated beyond that physical tolerance plus numeric epsilon.
- `candidate`: AABBs overlap or lie within the supplied physical tolerance. A narrow phase is required. This is **not** a collision result.
- `indeterminate`: profile, placement, or required physical-tolerance information is incomplete. Missing paths are returned.
- `excluded-normal-contact`: only available for formal connector relationships whose normal-contact exclusions are known and whose broad-phase overlap coverage was separately confirmed.

`candidateRangeMm` is the conservative physical-tolerance overlap range that later UI code can use as a red-highlight candidate region. It may be `null` when the pair is retained only by floating-point epsilon rather than by a physical overlap/tolerance band.

## Numeric epsilon and physical tolerance

The module keeps these separate:

- `numericEpsilonMm`: floating-point comparison allowance only; default `1e-7` mm.
- `physicalToleranceMm`: caller-supplied physical/contact tolerance. It has **no implicit default for pair classification**.

If `physicalToleranceMm` is absent, non-finite, or negative, `classifyPair` returns `indeterminate` with reason `physical-tolerance-unknown`. A caller may explicitly provide `0` only when zero additional physical padding is an intentional project decision for that diagnostic context. Numeric epsilon is never substituted for a missing physical tolerance.

## Normal-contact safety

A connection alone never suppresses an AABB overlap.

The `connections` option may include:

```js
{
  partAId: 'A',
  connectorAId: 'exit',
  partBId: 'B',
  connectorBId: 'entrance',
  normalContactExclusion: {
    status: 'verified',
    broadPhaseCoverage: 'confirmed'
  }
}
```

`excluded-normal-contact` is returned only when all of the following are true:

1. the pair matches at least one formal connection record;
2. every matching connection edge has exclusion status `verified` or `provisional`;
3. every matching connection edge has `broadPhaseCoverage: 'confirmed'`, supplied by a caller that has enough exclusion geometry to make that statement.

If a part pair has multiple formal connection edges and even one edge has unknown/unconfirmed exclusion coverage, the pair remains `candidate`. A connection belonging to another pair cannot exclude the current pair. The broad-phase module itself does not infer exclusion volume coverage.

## Public API

- `validatePlacement(placement)`
- `validateStationSequence(stations)`
- `transformStationGeometry(station, placement, options)`
- `buildWorldAabb(placement, options)`
- `separatingAxis(aabbA, aabbB, options)`
- `intersectionAabb(aabbA, aabbB, expandMm)`
- `classifyPair(partA, partB, options)`
- `analyzeBroadPhase(placements, options)`
- `extractBroadPhaseCandidates(placements, options)`

`analyzeBroadPhase` returns stable part-ID-ordered diagnostics for all distinct pairs. `extractBroadPhaseCandidates` removes `clear` and `excluded-normal-contact` pairs and keeps `candidate` plus `indeterminate` pairs for downstream work.

## Current architecture note

`AGENTS.md` and the roadmap target TypeScript/Vite, but the current production branch is a direct-browser JavaScript application without `package.json`, `tsconfig.json`, or a TypeScript build step. Issue #67 tracks establishing that build path. Phase 2.0 therefore uses the repository's existing pure-JavaScript module pattern to avoid coupling collision logic to a large toolchain migration.

No app UI, persistence schema, saved-space schema, part dimensions, or current collision behavior is changed by this Phase 2.0 broad-phase module.
