# TypeScript build path — Stage 1

Status: infrastructure only / no runtime behavior change

## Purpose

Issue #67 introduces a typed build path for future domain-engine modules without changing the current static JavaScript application or GitHub Pages delivery.

## Stage 1 boundary

- Existing browser-loaded JavaScript remains the production runtime source.
- TypeScript source lives under `src/domain/` only.
- TypeScript output is generated under `.build-ts/domain/`.
- `.build-ts/` is build output only and is not committed or loaded by `index.html`.
- No saved-data schema, UI behavior, part dimensions, collision decisions, or bootstrap order are changed.
- No existing JavaScript module is migrated in this stage.

## Toolchain

- Node.js: 22+
- TypeScript: pinned to `5.9.2`
- `npm run typecheck`: strict no-emit type checking
- `npm run lint`: compiler-based additional unused/fallthrough/implicit-return checks
- `npm run build`: emits isolated domain output to `.build-ts/domain/`

The dependency set is intentionally limited to TypeScript. Existing JavaScript syntax checks, Node tests, and Chromium rehearsal remain separate and unchanged.

## Type safety defaults

`tsconfig.json` enables strict checking and additionally keeps optional-property and indexed-access handling explicit. Values are not coerced into valid dimensions. The initial `toolchain-probe.ts` exists only to exercise the typed build path and is not loaded by the production application.

## Migration rule

A production JavaScript domain module must not be replaced merely because this build path exists. Each migration is a separate task/PR with:

1. behavior-preserving tests,
2. explicit runtime loading/output design,
3. browser regression confirmation,
4. no persistence-format changes unless separately approved.

## Stage 1 completion check

Stage 1 is complete when CI can run `npm ci`, typecheck, lint, and build while all pre-existing JavaScript and browser checks remain green and the public static application remains unchanged.
