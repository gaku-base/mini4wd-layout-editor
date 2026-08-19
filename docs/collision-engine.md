# Collision broad-phase engine

## Scope

`collision-broadphase.js` is the Phase 2.0 domain-only broad-phase layer. It does **not** assert a physical collision. It transforms collision-profile stations into world coordinates, builds conservative world AABBs, and classifies part pairs for later narrow-phase work.

UI rendering, red highlighting, mesh/triangle intersection, supports/bridges/floor, and measured slope/bank values are outside this module.

## Units and placement contract

All engine inputs are millimetres except degrees.

```js
{
  partId: 'part-1',
  profileRef: 'slope-profile@0.1.0',
  profile: collisionProfile,
  positionMm: { x: 0, y: 0, z: 115 },
  rotationDeg: 45
}
```

The current editor runtime still stores course-part `x` / `y` in centimetres and `zMm` in millimetres. This module intentionally does not accept those mixed-unit fields. A future UI adapter must convert XY to millimetres explicitly before calling the engine.

## Profile readiness

A profile is broad-phase ready only when:

- `status` is `verified` or `provisional`;
- `coordinateFrame` is `part-local-xyz`;
- `stations` is a non-empty array;
- every station has finite `centerlinePositionMm.x/y/z` and `tangentHeadingDeg`;
- required running-surface and underside polylines exist;
- any wall keys requested by the caller are present.

Unknown or missing values are never converted to zero. If required data is missing, the result is `indeterminate`.

For an incomplete profile, `knownWorldAabb*` may contain a diagnostic bound of the points that were actually known, but `worldAabb*` remains `null`. The partial bound must never be used to certify `clear` or `collision`.

## Station-frame transform

The engine interprets each station Y/Z cross-section point as an offset from `centerlinePositionMm` in the station frame:

1. `tangentHeadingDeg` orients the station transverse Y axis inside part-local XY;
2. the station-local point is transformed into part-local XYZ;
3. the part `rotationDeg` is applied around +Z;
4. `positionMm` translates the point into world XYZ.

This makes curved and sloped station sections transform without assuming a rectangular part body.

## Supported wall representations

The engine accepts both profile forms already documented by the measurement protocol:

- `sideWallPolylinesYZMm.left/right = [[y, z], ...]`
- bank-style `walls.inner/outer.lowerEdgeMm` / `upperEdgeMm` as `{ y, z }`

The caller chooses which wall keys are required with `requiredWallKeys`, for example `['left', 'right']` or `['inner', 'outer']`.

## AABB classification

Pair results use these statuses:

- `clear`: both profiles are ready and one AABB axis is separated beyond the supplied physical tolerance plus numeric epsilon.
- `candidate`: AABBs overlap or lie within the supplied physical tolerance. A narrow phase is required. This is **not** a collision result.
- `indeterminate`: profile or placement information is incomplete. Missing paths are returned.
- `excluded-normal-contact`: only available for a formal connector relationship whose normal-contact exclusion is known and whose broad-phase overlap coverage was separately confirmed.

`candidateRangeMm` is the conservative overlap range that later UI code can use as a red-highlight candidate region.

## Numeric epsilon and physical tolerance

The module keeps these separate:

- `numericEpsilonMm`: floating-point comparison allowance only; default `1e-7` mm.
- `physicalToleranceMm`: caller-supplied physical/contact tolerance; default `0` because no unverified manufacturing tolerance is invented.

A physical tolerance must come from an explicit project decision or verified/provisional measurement. Numeric epsilon is not a substitute for physical tolerance.

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

1. the pair matches a formal connection record;
2. exclusion status is `verified` or `provisional`;
3. `broadPhaseCoverage` is explicitly `confirmed` by a caller that has enough exclusion geometry to make that statement.

`unknown`, missing coverage, or a connection belonging to another pair leaves the result as `candidate`. The broad-phase module itself does not infer exclusion volume coverage.

## Public API

- `validatePlacement(placement)`
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
