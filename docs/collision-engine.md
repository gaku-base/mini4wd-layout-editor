# Collision broad-phase engine

## Scope

`collision-broadphase.js` is the Phase 2.0 domain-only broad-phase layer. It does **not** assert a physical collision. It transforms sampled collision-profile stations into world coordinates, builds conservative world AABBs, and classifies part pairs for later narrow-phase work.

`collision-placement-adapter.js` is the Phase 2.1 editor-boundary adapter. It converts the current runtime placement representation into the millimetre-only broad-phase contract without inventing missing profile data or physical dimensions.

UI rendering, red highlighting, mesh/triangle intersection, supports/bridges/floor, and measured slope/bank values are outside these modules.

## Units and placement contract

All engine inputs are millimetres except degrees.

```js
{
  partId: 'part-1',
  profileRef: 'slope-profile@0.1.0',
  profile: resolvedProfile3d,
  requiredWallKeys: ['left', 'right'],
  positionMm: { x: 0, y: 0, z: 115 },
  rotationDeg: 45
}
```

`profile` is the resolved `profile3d` / `bankProfile` geometry object described by the measurement protocol, not the full immutable version wrapper from section 10. `profileRef` keeps the outer profile/version reference available to diagnostics.

The current editor runtime still stores course-part `x` / `y` in centimetres and `zMm` in millimetres. The broad-phase engine intentionally does not accept those mixed-unit fields directly. Phase 2.1 adds `collision-placement-adapter.js`, which performs the explicit boundary conversion before the engine is called.

Course-part placement rotation must stay on the established 45-degree grid. Station `tangentHeadingDeg` remains independent and may contain measured profile headings. The adapter does not round or snap an invalid runtime rotation; it passes the finite numeric value through so the engine can return `indeterminate` when the 45-degree contract is violated.

`partId` must be non-empty and unique within one `analyzeBroadPhase` input set. A missing ID, or any pair involving a duplicated ID, is retained as `indeterminate`; invalid identities are never silently dropped from downstream collision checking. Passing the exact same placement object twice to `classifyPair` is still treated as self-comparison and excluded.

## Editor placement adapter

`collision-placement-adapter.js` is a pure adapter with no UI, persistence, or drawing responsibility.

Runtime input remains the current editor shape:

```js
{
  id: 'part-1',
  type: 'slope',
  x: 12.5,       // cm
  y: -3.25,      // cm
  zMm: 115,      // mm
  rotation: 45   // degrees
}
```

The adapter output uses the engine contract:

```js
{
  partId: 'part-1',
  profileRef: 'slope-profile@0.1.0',
  profile: resolvedProfile3d,
  requiredWallKeys: ['left', 'right'],
  positionMm: { x: 125, y: -32.5, z: 115 },
  rotationDeg: 45
}
```

Safety rules:

- finite numeric `x / y` values are multiplied by exactly `10` to convert cm to mm;
- finite numeric `zMm` is copied without unit conversion;
- `null`, `undefined`, `NaN`, infinities, and numeric strings are not converted to zero or parsed as numbers;
- missing or duplicated IDs are not synthesized or repaired;
- invalid rotations are not rounded to a legal value;
- the adapter does not mutate the runtime part, layout, catalog definition, or resolved profile;
- a missing collision profile or missing wall schema is represented as unresolved data, not as guessed geometry.

Profile binding is caller-controlled through `resolveCollisionProfile(part, definition)`. The resolver may return:

```js
{
  profileRef,
  profile,
  requiredWallKeys
}
```

If the resolver is absent, returns no binding, throws, omits the profile, or omits a usable wall schema, the adapter leaves that information unresolved. Adapter-created placements explicitly carry an empty `requiredWallKeys` array when the schema is unresolved, so a caller-wide legacy wall schema cannot accidentally turn an unresolved adapter placement into an authoritative AABB.

`adaptEditorLayout({ start, parts }, options)` includes the existing Start placement when present and then the existing `parts[]`. It never creates a synthetic Start.

## Profile readiness

An authoritative world AABB is produced only when the resolved profile satisfies the collision-readiness conditions used by the measurement protocol:

- `status` is `verified` or `provisional`;
- `coordinateFrame` is `part-local-xyz`;
- interpolation is `linear`; `none`, `unknown`, and spline interpolation are not treated as broad-phase safe by this first implementation because they do not provide the same conservative station-to-station linear sweep contract;
- stations have unique IDs, finite ratios in `[0, 1]`, ascending ratio order, and include ratio `0` and ratio `1`;
- every station has finite `centerlinePositionMm.x/y/z` and `tangentHeadingDeg`;
- required running-surface and underside polylines exist and each contains at least two valid Y/Z points;
- a non-empty wall schema is resolved for each placement and every requested wall is present and complete;
- every required side-wall polyline contains at least two valid Y/Z points;
- bank-style edge walls require both valid `lowerEdgeMm` and `upperEdgeMm`, unless a complete alternative `polylineYZMm` with at least two valid points is supplied;
- every station has finite effective height and effective width, either under `passableClearance` or the equivalent station-level fields.

Unknown or missing values are never converted to zero. If required data is missing, the result is `indeterminate`.

`transformStationGeometry` may use `requireRunningSurface: false` or `requireUnderside: false` for standalone diagnostic transformation. Those switches **cannot** relax authoritative collision readiness: `buildWorldAabb`, and therefore pair classification, always requires both running-surface and underside geometry.

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

For XY, the engine does not simply take the extrema of the transformed station wall points. It takes the world centerline-station bounds and expands them by the largest known lateral station radius. With the accepted linear interpolation contract this conservatively encloses the sampled cross-section sweep even while station tangent headings change between samples. Z uses the extrema of the sampled transformed collision points.

This AABB is conservative for the profile representation accepted by this Phase 2.0 contract. It does not improve the physical accuracy of a provisional measurement profile; unknown geometry still stays `indeterminate`.

## Supported wall representations

The engine accepts both profile forms already documented by the measurement protocol:

- `sideWallPolylinesYZMm.left/right = [[y, z], ...]`
- bank-style `walls.inner/outer.lowerEdgeMm` / `upperEdgeMm` as `{ y, z }`

Each placement may now carry its own non-empty `requiredWallKeys`, for example `['left', 'right']` or `['inner', 'outer']`. This allows different profile families to coexist in one `analyzeBroadPhase` input set.

Wall-schema precedence is intentionally strict:

1. if the placement has its own `requiredWallKeys` property, that property is authoritative for the placement;
2. only when the placement property is absent may legacy `options.requiredWallKeys` be used as a fallback;
3. an explicitly empty or invalid placement-level schema is **not** rescued by the global fallback and remains `indeterminate`.

This prevents an unresolved adapter placement from borrowing an unrelated wall schema and prevents a mixed slope/bank layout from requiring one global naming convention.

For required polyline walls, at least two valid points are necessary to establish an extent. For bank-style edge objects, both lower and upper edges are required for a complete wall. A complete `polylineYZMm` with at least two valid points may be used as an alternative representation. A single known edge or one-point polyline is diagnostic-only and cannot make the AABB authoritative.

## AABB classification

Pair results use these statuses:

- `clear`: both profiles are ready, a physical tolerance was explicitly supplied, and one AABB axis is separated beyond that physical tolerance plus numeric epsilon.
- `candidate`: AABBs overlap or lie within the supplied physical tolerance. A narrow phase is required. This is **not** a collision result.
- `indeterminate`: profile, placement, part identity, wall schema, or required physical-tolerance information is incomplete. Missing paths are returned.
- `excluded-normal-contact`: only available for formal connector relationships whose connector identities are valid, whose normal-contact exclusions are known, and whose broad-phase overlap coverage was separately confirmed.

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

1. the pair matches at least one connection record with non-empty `connectorAId` and `connectorBId`;
2. every matching connection edge has valid, non-empty connector identities;
3. every matching connection edge has exclusion status `verified` or `provisional`;
4. every matching connection edge has `broadPhaseCoverage: 'confirmed'`, supplied by a caller that has enough exclusion geometry to make that statement.

If a part pair has multiple matching connection edges and even one edge has missing connector identity or unknown/unconfirmed exclusion coverage, the pair remains `candidate`. A connection belonging to another pair cannot exclude the current pair. The broad-phase module itself does not infer exclusion volume coverage.

## Public API

Broad-phase:

- `validatePlacement(placement)`
- `validateStationSequence(stations)`
- `transformStationGeometry(station, placement, options)`
- `buildWorldAabb(placement, options)`
- `separatingAxis(aabbA, aabbB, options)`
- `intersectionAabb(aabbA, aabbB, expandMm)`
- `classifyPair(partA, partB, options)`
- `analyzeBroadPhase(placements, options)`
- `extractBroadPhaseCandidates(placements, options)`

Editor adapter:

- `editorCmToMm(value)`
- `normalizeRequiredWallKeys(value)`
- `adaptEditorPlacement(part, options)`
- `adaptEditorLayout(layout, options)`

`analyzeBroadPhase` validates part-ID uniqueness before classifying pairs and returns stable part-ID-ordered diagnostics for all distinct placements. Missing or duplicated identities are retained as `indeterminate`. `extractBroadPhaseCandidates` removes `clear` and `excluded-normal-contact` pairs and keeps `candidate` plus `indeterminate` pairs for downstream work.

## Current architecture note

`AGENTS.md` and the roadmap target TypeScript/Vite, but the current production branch is a direct-browser JavaScript application without `package.json`, `tsconfig.json`, or a TypeScript build step. Issue #67 tracks establishing that build path. Phase 2.0 and Phase 2.1 therefore use the repository's existing pure-JavaScript module pattern to avoid coupling collision logic to a large toolchain migration.

Phase 2.1 still does not wire collision analysis into `app.js`, does not load collision modules in the browser runtime, and does not change UI, persistence schema, saved-space schema, part dimensions, or current warning behavior. It only establishes the safe boundary adapter and the per-placement wall-schema contract needed before runtime integration.