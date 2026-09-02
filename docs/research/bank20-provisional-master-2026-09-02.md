# Bank20 暫定パーツマスター（2026-09-02）

## 目的

Tamiya Item No.69571 `JAPAN CUP JUNIOR CIRCUIT BANK-APPROACH 20` について、公開一次情報・実物トレース・独立実測から得られた値を、現行ランタイム寸法とは分離して構造化する。

この文書は **research / provisional master** であり、`part-catalog.js`、保存形式、描画、snap、collision runtimeを変更しない。

詳細な証拠と計算は [`bank20-physical-geometry-2026-09-02.md`](bank20-physical-geometry-2026-09-02.md) を参照する。

## 状態

- `verified`: 公式値またはプロジェクト所有者が正式採用した値
- `provisional`: 追跡可能な実物測定／トレースだが、基準点または独立確認が不足
- `derived`: verified/provisional入力から計算した値
- `legacy-unverified`: 現行アプリに存在するが物理的根拠を追跡できない値
- `unknown`: 根拠不足。数値は `null`

## 構造化レコード

```yaml
partId: three-lane-bank-approach-20
itemNo: 69571
coordinateFrame: part-local-xyz

bankTransition:
  bankAngleDeg:
    value: 20
    status: verified
    source: tamiya-item-69571
    confidence: high

longitudinalProfileResearch:
  physicalBaseExtentMm:
    value: 240
    status: provisional
    source: mini4science-real-cut-section-trace-2026-05-23
    confidence: medium
    note: base-length endpoint definition is not yet proven to equal connector planes

  transitionArcChordMm:
    value: 225.75
    status: provisional
    source: agw-real-measurement-2021-02-22
    confidence: medium
    note: measured as straight-line distance between the two ends of the 20-degree arc

  preferredRunningSideArcRadiusMm:
    value: 650.02
    status: derived
    source: official-20deg-plus-agw-225.75mm-chord
    confidence: medium
    note: preferred provisional circular-arc model; not a Tamiya nominal radius

  mini4scienceRunningSideArcRadiusMm:
    value: 660.5
    status: provisional
    source: mini4science-real-cut-section-trace-2026-05-23
    confidence: medium
    note: independent trace; about 1.6 percent above R650 model

  wallArcRadiusMm:
    value: 597.5
    status: provisional
    source: mini4science-real-cut-section-trace-2026-05-23
    confidence: medium

connectors:
  connectorDistanceMm:
    value: null
    status: unknown
    confidence: none
    reason: no public source found that directly measures both JCJC connector reference planes

  arcEndToConnectorOffsetsMm:
    lowEnd: null
    bankedEnd: null
    status: unknown
    reason: 240mm base endpoints and 225.75mm arc endpoints are not yet tied to connector planes

crossSection:
  rollPivotAxis:
    value: null
    status: unknown
    confidence: none

  exactOverallWidthMm:
    value: null
    status: unknown
    confidence: none
    note: Tamiya verifies 115mm lane width for straight course, but bank sections may locally vary; do not infer full Bank20 width here

  runningSurface3d:
    value: null
    status: unknown

  underside3d:
    value: null
    status: unknown

  innerWall3d:
    value: null
    status: unknown

  outerWall3d:
    value: null
    status: unknown

supportSystem:
  bankStandHeightMm:
    value: null
    status: unknown

  longPipeLengthMm:
    value: null
    status: unknown

  shortPipeLengthMm:
    value: null
    status: unknown

  supportPointZMm:
    value: null
    status: unknown

legacyRuntime:
  longitudinalLengthMm:
    value: 280
    status: legacy-unverified
    source: static-RC1-part-catalog-introduction-2026-07-23
    confidence: none
    note: retained only for current runtime compatibility; no measurement/evidence record was found

collisionProfile:
  activeCollisionProfile: null
  readiness: not-ready
  missing:
    - connector reference geometry
    - 3D running surface
    - underside geometry
    - inner/outer wall geometry
    - effective clearance geometry
    - support geometry if included in collision scope
```

## R650モデルのQA計算

公式20°と `R=650mm` の単純円弧では:

- chord = `2R sin(10°)` = 約 `225.7426mm`
- arc length = `R * rad(20°)` = 約 `226.8928mm`
- sagitta = 約 `9.87mm`

AGW実測の弦長約225.75mm、矢高約9.8mmと整合する。

一方、`R(1-cos20°) ≈ 39.2mm` 等の値は特定側面円弧の幾何量であり、**Bank20のコネクタZ差として使用しない**。20°はbank/rollであってslope/pitchではない。

## 公開情報の探索結果

Tamiya Japan / English / USA、旧69568、販売店、説明書画像、中古出品、コミュニティ資料を確認したが、以下の正式数値は確認できなかった。

- connector-to-connector distance
- 240mm baseの厳密な端点定義
- long/short pipe length
- bank stand height
- support-point Z

旧69568の「従来比74%」は**パッケージ縮小率**であり、パーツ寸法には使用しない。

Mini4Science公開SVGの直接URLは特定済み:

`https://d1eyppkioqhwc7.cloudfront.net/wp-content/uploads/2026/05/20_degree_bank_side_view_1_orange.svg`

現環境ではCloudFront直取得ができず内部座標は未確認。SVG座標を確認できれば、240mm基準線と円弧端点の関係を再評価する。

## 正式採用ゲート

ランタイムの `280mm` を変更する前に、最低でも次のどちらかを満たす。

1. 実物を定規／ノギスで測り、両JCJC接続基準面間距離を直接記録する。
2. 公開トレース／CAD資料で、240mmの両端が正式接続基準面であることを明示的に確認する。

どちらも満たさない場合、`connectorDistanceMm` は `unknown / null` のまま維持する。

## 現時点の判断

- `20°`: productionで使用可能なverified値
- `240mm / 225.75mm / R650 / R660.5 / R597.5`: research/provisional値として保持
- `280mm`: legacy runtime値。物理正本にはしない
- collision profile: `not-ready`
- 未確認値は推測で補完しない
