# Bank20 暫定パーツマスター（2026-09-02）

## 目的

Tamiya Item No.69571 `JAPAN CUP JUNIOR CIRCUIT BANK-APPROACH 20` について、公式情報・実物トレース・独立実測・プロジェクトオーナー決定を分離して構造化する。

2026-09-02のプロジェクトオーナー決定により、**Bank20のアプリ上の投影延長は240mmを正式採用**する。

詳細な証拠と計算は [`bank20-physical-geometry-2026-09-02.md`](bank20-physical-geometry-2026-09-02.md) を参照する。

## アプリで扱う範囲

このレイアウトエディターでモデル化するのは**コース本体**である。

対象:
- バンクアプローチ本体の2D外形
- 接続基準点／接続面
- 0°→20°のbank/roll遷移
- 走行面、下面、側壁などコース本体の3D占有形状
- コース本体同士の接続・干渉判定に必要な形状

対象外:
- バンク台
- 長／短パイプ
- 支持ポール、キャップ、固定具、両面テープ
- バンク台による床からの支持高さ

支持部品は実物セットの構成要素だが、このアプリのパーツ配置・接続・コース本体干渉判定には使用しない。したがって未解決の必須寸法にもcollision readinessのblockerにもしない。

## 状態

- `verified`: 公式値またはプロジェクト所有者が正式採用した値
- `provisional`: 追跡可能な実物測定／トレースだが、基準点または独立確認が不足
- `derived`: verified/provisional入力から計算した値
- `superseded`: 以前のランタイム値だが、正式決定により置き換えられた値
- `unknown`: 根拠不足。数値は `null`

## 構造化レコード

```yaml
partId: three-lane-bank-approach-20
itemNo: 69571
coordinateFrame: part-local-xyz
scope:
  courseBody: included
  bankStand: excluded
  supportPipes: excluded
  supportHardware: excluded

bankTransition:
  bankAngleDeg:
    value: 20
    status: verified
    source: tamiya-item-69571
    confidence: high

projectionModel:
  projectedLengthMm:
    value: 240
    status: verified
    source: project-owner-approved-2026-09-02
    confidence: high
    corroboration: mini4science-real-cut-section-base-length-about-240mm
    note: authoritative app/runtime projected course length

  modelConnectorDistanceMm:
    value: 240
    status: verified
    source: project-owner-approved-2026-09-02
    confidence: high
    note: runtime places the two model connector references at the ends of the 240mm projection

  physicalConnectorPlaneMeasurementMm:
    value: null
    status: unknown
    confidence: none
    note: independent physical connector-plane measurement has not been found; this does not block the approved app model

longitudinalProfileResearch:
  transitionArcChordMm:
    value: 225.75
    status: provisional
    source: agw-real-measurement-2021-02-22
    confidence: medium
    note: measured as straight-line distance between the two ends of the 20-degree arc; separate from the 240mm projection

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

crossSection:
  rollPivotAxis:
    value: null
    status: unknown
    confidence: none

  exactOverallWidthMm:
    value: null
    status: unknown
    confidence: none

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

supersededRuntime:
  longitudinalLengthMm:
    value: 280
    status: superseded
    source: static-RC1-part-catalog-introduction-2026-07-23
    confidence: none
    supersededBy: project-owner-approved-240mm-projection-2026-09-02

collisionProfile:
  activeCollisionProfile: null
  readiness: not-ready
  missing:
    - 3D running surface
    - underside geometry
    - inner/outer wall geometry
    - effective clearance geometry
    - roll pivot / cross-section model
```

## R650モデルのQA計算

公式20°と `R=650mm` の単純円弧では:

- chord = `2R sin(10°)` = 約 `225.7426mm`
- arc length = `R * rad(20°)` = 約 `226.8928mm`
- sagitta = 約 `9.87mm`

AGW実測の弦長約225.75mm、矢高約9.8mmと整合する。

`225.75mm`は曲面の円弧端点間弦長であり、正式採用した**投影延長240mmとは別寸法**として保持する。

また、`R(1-cos20°) ≈ 39.2mm` 等は特定側面円弧の幾何量であり、Bank20のコネクタZ差として使用しない。20°はbank/rollであってslope/pitchではない。

## 公開情報の探索結果

公開資料から独立した物理connector-to-connector実測は確認できていない。一方でMini4Science実物切断片トレースの`base length is 24cm`は、今回の240mm正式モデルと整合する。

Mini4Science公開SVGの直接URL:

`https://d1eyppkioqhwc7.cloudfront.net/wp-content/uploads/2026/05/20_degree_bank_side_view_1_orange.svg`

SVG内部座標は現環境では未確認だが、240mmのproduction採用を妨げる条件にはしない。今後取得できればQA資料として照合する。

バンク台・パイプ類については追加の寸法探索を終了する。本アプリではモデル化しない。

## 正式採用決定

2026-09-02 project-owner decision:

- Bank20 projected length = **240mm**
- runtime width = **24cm**
- model connector references = **-120mm / +120mm**（部品中心原点）
- old 280mm model = **superseded**
- 225.75mm arc chord / R650 research modelは240mm projectionと混同しない

## 現時点の判断

- `20°`: verified / production
- `240mm projected length`: verified / production
- `225.75mm / R650 / R660.5 / R597.5`: research/provisional
- `280mm`: superseded
- bank stand / support pipes: app scope外
- collision profile: `not-ready`（3D断面情報が未確定）
- 未確認値は推測で補完しない
