# 20度バンクアプローチ 実物形状調査（2026-09-02）

## 対象

Tamiya Item No.69571 `JAPAN CUP JUNIOR CIRCUIT BANK-APPROACH 20`。
現行エディタの `bank20`（20度バンク入口／出口）の物理モデル見直し用資料。

最新の正式決定は [`../decisions/2026-09-02-bank20-projected-length-240mm.md`](../decisions/2026-09-02-bank20-projected-length-240mm.md) を参照する。
構造化値は [`bank20-provisional-master-2026-09-02.md`](bank20-provisional-master-2026-09-02.md) を参照する。

## 現在の正式モデル

2026-09-02 project-owner decision:

- bank angle: **20°** (`verified`)
- projected length: **240mm** (`verified`)
- editor runtime width: **24cm**
- local flat-side connector X: **-120mm**
- local banked-side connector X: **+120mm**
- old 280mm model: **superseded**

240mmはアプリの配置・接続で使用する正式な投影延長である。

## アプリで扱う範囲

対象:
- バンクアプローチ本体の2D外形
- 接続基準点
- 0°→20°のbank/roll遷移
- 走行面、下面、側壁の3D占有形状
- コース本体同士の接続・干渉判定に必要な形状

対象外:
- バンク台
- 長／短パイプ
- 支持ポール、キャップ、固定具、両面テープ
- 支持部品の床面高さ

支持部品は実物セットの構成理解には利用するが、アプリのcollision readinessには要求しない。

## 判定ルール

- `verified`: タミヤ公式、またはプロジェクトオーナーが正式採用した値
- `provisional`: 実物トレース・実測など有力だがメーカー公称ではない値
- `derived`: verified/provisional値から幾何計算した値
- `superseded`: 以前使用していたが正式決定で置き換えられた値
- `unknown`: 数値根拠が不足しており推測しない項目

## 公式に確認できる事項

### バンク角20°

- value: `20 deg`
- status: `verified`
- sources:
  - https://www.tamiya.com/japan/products/69571/index.html
  - https://www.tamiya.com/japan/mini4wd/feature/2019/1206.html

Tamiyaはストレートとカーブの間にバンクアプローチを接続し、20度バンクを作ると説明している。
この部品は長手方向へ20°登るスロープではなく、平面状態から20°の横断勾配へ移行する**bank/roll transition**として扱う。

### セット構成

- バンクアプローチ x2
- バンク台 x1
- 長／短パイプ、ジョイント、キャップ等

セット構成はverifiedだが、バンク台・パイプは本アプリではscope外。

## Mini4Science 実物切断片トレース

source:
- https://www.mini4science.com/2026/05/20-degree-bank-approach-mapped/
- https://www.mini4science.com/updates/

2026-05-23、実物の20°バンクアプローチ切断片をトレース→スキャン→CAD解析。

| 項目 | 値 | status |
| --- | ---: | --- |
| section base length | 約240mm | provisional external evidence / owner-approved runtime valueと整合 |
| running-side arc diameter | 約1321mm | provisional |
| running-side radius | 約660.5mm | provisional |
| wall arc diameter | 約1195mm | provisional |
| wall radius | 約597.5mm | provisional |

公開SVG:

`https://d1eyppkioqhwc7.cloudfront.net/wp-content/uploads/2026/05/20_degree_bank_side_view_1_orange.svg`

現環境ではSVG内部座標を直接取得できていない。

### 240mmの扱い

Mini4Science本文だけでは`base length is 24cm`の厳密な物理基準点は一意に定義できない。
ただし、2026-09-02にプロジェクトオーナーが**アプリ上の投影延長240mm**を正式採用したため、runtimeでは240mmをauthorityとして使用する。

物理接続面をノギス等で独立測定した値が将来得られた場合はQA比較を行うが、現行240mmモデルを未確定へ戻す理由にはしない。

## 独立実測1: 2015年 弦長・矢高

source:
- https://zspeed666.blogspot.com/2015/08/2015-08-09680.html

報告:
- arc-end chord相当: 約225mm
- sagitta: 約9.3mm
- status: provisional

サジッタ式:

`R = c^2/(8s) + s/2`

`c=225mm, s=9.3mm` → `R ~= 685.09mm`。

矢高の測定誤差が半径へ大きく効くため、R685は低優先QA値とする。

## 独立実測2: 2021年 弦長225.75mm

source:
- https://note.com/agw8823/n/n37f3c0220962

報告:
- arc-end chord: 約225.75mm
- sagitta: 約9.8mm
- status: provisional

公式20°と弦長225.75mmから:

`R = chord / (2 sin(10°)) ~= 650.02mm`

R650mmの理論sagittaは約9.87mmで、実測約9.8mmと約0.07mm差。

### 優先研究円弧モデル

次がR≈650mmで相互整合する。

1. Tamiya公式20°
2. 実物弦長約225.75mm
3. 実測矢高約9.8mm

したがって走行面側の遷移円弧研究モデルは**R≈650mm**を最優先provisional modelとする。
Mini4Science R≈660.5mmは約1.6%差の独立QA値として保持する。

## R650mm派生値

`R=650mm`, 中心角20°:

- chord = `225.7426mm`
- arc length = `226.8928mm`
- tangent-frame horizontal projection = `222.3131mm`
- tangent-frame vertical difference = `39.1998mm`
- sagitta ≈ `9.87mm`

これらは**円弧自身の幾何値**であり、アプリの投影延長240mmとは別。
約39.2mmをコネクタZ差に使用しない。20°はpitchではなくbank/rollである。

## 240mmと225.75mmの関係

- approved projected length: **240mm**
- measured transition arc chord: **225.75mm**
- difference: **14.25mm**

したがって、円弧遷移部だけでパーツ全投影延長を表していないモデルとして扱う。
14.25mmを左右7.125mmずつへ機械的に分配することはしない。

## 280mm旧モデルの履歴

静的RC1採用コミット:
- `557fce43b034b15da7f45bf17c87904ab443f438`
- 2026-07-23

の最初期`part-catalog.js`ですでに`bank20 w:28`が存在したが、測定元・evidence・confidenceは記録されていなかった。
直前のReact/domain実装ではBank20の正式物理寸法定義自体がなかった。

したがって280mmは検証済み物理値ではなく、2026-09-02の240mm正式採用により**superseded**とする。

## runtime反映

`part-catalog.js`:

- `BANK20_PROJECTED_LENGTH_MM = 240`
- `bank20.w = 24cm`
- geometry width = `24cm`
- connector X = `-12cm / +12cm`
- bounds X = `-12cm .. +12cm`
- visual canvas width = `24cm`
- bank angle = `20°`

`225.75mm / R650 / R660.5 / R597.5`はmeasurements/research値として別管理する。

## 未確定3D項目

以下は`unknown / null`を維持する。

- bank/roll pivot axis
- 低い側・高い側エッジの正確なZ profile
- 各レーン境界の3D surface
- underside geometry
- inner/outer wall 3D geometry
- 裏面リブ／ボス／接続爪の最大下方突出
- effective clearance envelope

これらが未確定なのでBank20 collision profile全体はまだ`not-ready`。

## 現時点の採用可否

| パラメータ | 値 | 状態 | runtime |
| --- | ---: | --- | --- |
| bank angle | 20° | verified | 採用 |
| projected length | 240mm | verified / owner-approved | 採用 |
| old app length | 280mm | superseded | 廃止 |
| transition arc chord | ~225.75mm | provisional | research |
| preferred running-side radius | ~650mm | provisional/derived | research |
| Mini4Science running-side radius | ~660.5mm | provisional | QA |
| wall radius | ~597.5mm | provisional | research |
| roll pivot axis | null | unknown | 未採用 |
| 3D collision profile | null | not-ready | 未採用 |

## 次工程

投影延長の追加探索は終了する。240mmを正式値として使用する。

次はBank20の見た目・接続挙動を24cmモデルで回帰確認した後、必要に応じて3D断面（roll pivot / running surface / underside / walls）を詰める。
