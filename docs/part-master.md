# パーツ寸法マスター

本書はパーツごとの採用値と準備状態を管理する。計測方法、記録形式、座標・外形・3Dプロファイル、正常接触除外範囲、collision profileの版管理は [`measurement-protocol.md`](measurement-protocol.md) に従う。

初期対象は3レーンのストレート、45度コーナー、スロープ、バンクとする。支柱、橋脚、補強材、固定具、テープ、会場床は対象外とする。

## 状態の定義

- `verified`：一次資料、再現可能な実物計測、独立確認、またはプロジェクト所有者の明示承認がある確定値。
- `provisional`：合法かつ追跡可能な測定値はあるが、独立確認、精度、基準点定義のいずれかが不足する暫定値。
- `unknown`：追跡可能な数値がない状態。数値欄は`null`とし、推測で埋めない。

状態と別に、証跡の質を`high` / `medium` / `low` / `none`の信頼度で記録する。判定の詳細は計測プロトコル4章を参照する。

## マスターレコードの必須項目

各数値または同じ条件で取得した数値群は、次の項目を持つ。

| 項目 | 内容 |
|---|---|
| 状態 | `verified` / `provisional` / `unknown` |
| 値・単位 | 物理寸法はmm、角度はdegree。unknownは`null` |
| 値の種類 | 公称値、実測値、画面観察値、導出値、座標定義 |
| 測定元 | 種別、資料・Issue・公開ページの参照、観察条件 |
| 観察・計算条件 | 基準寸法、複数視点、計算方法、反復回数、ばらつき |
| 測定日 | `YYYY-MM-DD`。不明または未測定は`null` |
| 測定者 | 追跡可能な担当者ID。不明または未測定は`null` |
| 許容誤差 | 値、単位、状態。未確認は数値を入れず`unknown` |
| 信頼度 | `high` / `medium` / `low` / `none` |
| 備考 | 未確認理由、基準点、測定条件、レビュー状況 |

## 現在の確定値

| パーツ／項目 | 値 | 単位 | 状態 | 測定元 | 測定日 | 測定者 | 許容誤差 | 信頼度 | 備考 |
|---|---:|---|---|---|---|---|---|---|---|
| ストレート1枚 長さ | 540 | mm | verified | ユーザー指定・添付寸法図、Issue #1 / #6 | unknown | unknown | unknown | high | 公称値。物理公差は未確認 |
| スロープ1枚 高低差 | 115 | mm | verified | ユーザー指定、Issue #1 / #6 | unknown | unknown | unknown | high | 公称値。物理公差は未確認 |
| スロープ 床まで塞ぐ側壁長（低い側から） | 270 | mm | verified | プロジェクト所有者の明示承認 | 2026-09-01 | project-owner | unknown | high | 左右側壁に適用。壁高・壁厚・下面曲線・高い側の開口形状は未確定 |

## 添付寸法図から読み取れる検算値

以下は画像資料の読取値であり、正式なパーツマスターへ採用する前に3D形状と照合する。

| 項目 | 読取値 | 単位 | 状態 | 測定元 | 測定日 | 測定者 | 許容誤差 | 信頼度 | 備考 |
|---|---:|---|---|---|---|---|---|---|---|
| ストレート3枚 | 1620 | mm | provisional | 添付寸法図の読取・540mmからの検算 | unknown | unknown | unknown | medium | 正式採用前に実形状と照合する |
| 90度コーナー外形 | 717 × 717 | mm | provisional | 添付寸法図の読取 | unknown | unknown | unknown | low | 初期対象外。正式採用前に再計測する |
| 180度コーナー外形 | 1434 × 717 | mm | provisional | 添付寸法図の読取 | unknown | unknown | unknown | low | 初期対象外。正式採用前に再計測する |

## 初期対象パーツ

### ストレート

| 項目 | 値 | 状態 | 測定元・根拠 | 測定日 | 測定者 | 許容誤差 | 信頼度 |
|---|---:|---|---|---|---|---|---|
| 長さ | 540mm | verified | ユーザー確定の公称値 | unknown | unknown | unknown | high |
| 幅 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 全高 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 入口ローカル座標 | X=0、Y=0、Z=0 | verified | 物理寸法ではなく座標原点の定義 | unknown | unknown | not-applicable | high |
| 出口ローカルX | 540mm | verified | 確定済み長さを座標へ適用 | unknown | unknown | unknown | high |
| 出口ローカルY・Z | 0mm | verified | 直進・高さ差なしの座標定義 | unknown | unknown | not-applicable | high |
| 入口・出口角度 | 0degree | verified | ローカル走行方向の座標定義 | unknown | unknown | not-applicable | high |
| 2D投影外形 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 走行面・下面・側壁 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 正常接触除外範囲 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| activeCollisionProfile | `null` | unknown | collision profile未作成 | unknown | unknown | unknown | none |

### 45度コーナー

| 項目 | 値 | 状態 | 測定元・根拠 | 測定日 | 測定者 | 許容誤差 | 信頼度 |
|---|---:|---|---|---|---|---|---|
| 曲率半径 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 全幅・全高 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 入口ローカル座標 | X=0、Y=0、Z=0 | verified | 物理寸法ではなく座標原点の定義 | unknown | unknown | not-applicable | high |
| 出口ローカル座標 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 入口角度 | 0degree | verified | ローカル走行方向の座標定義 | unknown | unknown | not-applicable | high |
| 出口角度差 | 45degree | provisional | 既存仕様。実パーツの基準点と角度許容差は未確認 | unknown | unknown | unknown | low |
| 2D投影外形 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 走行面・下面・側壁 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 正常接触除外範囲 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| activeCollisionProfile | `null` | unknown | collision profile未作成 | unknown | unknown | unknown | none |

### スロープ

| 項目 | 値 | 状態 | 測定元・根拠 | 測定日 | 測定者 | 許容誤差 | 信頼度 |
|---|---:|---|---|---|---|---|---|
| 水平長 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 高低差 | 115mm | verified | ユーザー確定の公称値 | unknown | unknown | unknown | high |
| 床まで塞ぐ側壁長（低い側から） | 270mm | verified | プロジェクト所有者の明示承認 | 2026-09-01 | project-owner | unknown | high |
| 全幅・全高 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 入口ローカル座標 | X=0、Y=0、Z=0 | verified | 物理寸法ではなく座標原点の定義 | unknown | unknown | not-applicable | high |
| 出口ローカルX・Y | `null` | unknown | 水平形状が未計測 | unknown | unknown | unknown | none |
| 出口ローカルZ | 115mm | verified | 確定済み高低差を座標へ適用 | unknown | unknown | unknown | high |
| 入口・出口角度 | `null` | unknown | 実パーツの接線方向は未計測 | unknown | unknown | unknown | none |
| 2D投影外形 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 走行面プロファイル | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 長手方向下面プロファイル | `null` | unknown | 未計測。`sMm`ごとのYZ断面が必要 | unknown | unknown | unknown | none |
| 側壁プロファイル | `null` | unknown | 低い側から270mmの床まで塞ぐ区間だけverified。壁高・壁厚・断面形状・高い側の開口形状は未計測 | unknown | unknown | unknown | none |
| 正常接触除外範囲 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| activeCollisionProfile | `null` | unknown | collision profile未作成 | unknown | unknown | unknown | none |

### バンク

バンクは入口、中央、出口と複数の中間断面を持つ。位置は`sMm`または`thetaDeg`で記録し、走行面、横断勾配、下面、内外側壁、通過可能空間を同じstationへ関連付ける。以下は未計測状態のテンプレートであり、数値を推測して埋めてはならない。

| 項目 | 値 | 状態 | 測定元・根拠 | 測定日 | 測定者 | 許容誤差 | 信頼度 |
|---|---:|---|---|---|---|---|---|
| 全長 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 中心角 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 中心線半径 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 内側半径 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 外側半径 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 全幅 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 全高 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 入口ローカル座標・角度 | `null` | unknown | 物理基準点と接線方向が未計測 | unknown | unknown | unknown | none |
| 出口ローカル座標・角度 | `null` | unknown | 物理基準点と接線方向が未計測 | unknown | unknown | unknown | none |
| 入口・出口高さ差 | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 入口・中央・出口station | `null` | unknown | 未計測 | unknown | unknown | unknown | none |
| 中間station | `null` | unknown | 断面数と位置が未決定 | unknown | unknown | unknown | none |
| `sMm` / `thetaDeg` | `null` | unknown | 長手方向パラメータが未計測 | unknown | unknown | unknown | none |
| 走行面高さ | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 横断勾配 | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 下面プロファイル | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 内側壁上端・下端 | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 外側壁上端・下端 | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 通過可能な有効高さ | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 通過可能な有効幅 | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 通過可能空間エンベロープ | `null` | unknown | station別に未計測 | unknown | unknown | unknown | none |
| 正常接触除外範囲 | `null` | unknown | コネクタ別に未計測 | unknown | unknown | unknown | none |
| 方向反転variant | `null` | unknown | 同一物理形状としての再利用可否が未確認 | unknown | unknown | unknown | none |
| 左右向きvariant | `null` | unknown | 鏡像同形か未確認 | unknown | unknown | unknown | none |
| activeCollisionProfile | `null` | unknown | collision profile未作成 | unknown | unknown | unknown | none |

記入データは計測プロトコル8.2章の形式を使用する。コネクタは6章、正常接触除外範囲は9章、方向反転と左右向きは10.1章に従う。

## 形状データとcollision profile

形状データは計測プロトコルに従い、次を分離して記録する。

- 2D投影外形：ローカルXYのポリゴン
- 走行面、下面、左右・内外側壁：長手方向stationごとのYZ断面
- 正常接触除外範囲：正式接続時だけ有効なコネクタローカル体積
- collision profile：上記をまとめた不変のversion付きデータ

sampled collision profileの標準stationは`ratio: 0`から`ratio: 1`まで0.05刻みの21点とし、形状変化点には任意の追加stationを許可する。`sMm`はスロープ等、`thetaDeg`はバンク等で実測できた場合だけ保持し、未確認値は`unknown / null`のままとする。

測定点列を形状の正本とし、補間値を正本へ書き戻さない。初期補間は既知の実測2点間だけの線形補間とし、unknown区間の外挿や、明示的なunknown stationを飛び越える補間を行わない。補間結果は方式と元station参照を持ち、実測値と区別する。補間interfaceを将来差し替えても、元の測定点と旧profile versionを保持する。

collision profileは`profileId@semantic-version`とvariant IDで識別し、公開済み版を上書きしない。現在は全パーツで`activeCollisionProfile: null`であり、仮の直方体を採用しない。

手動採寸の疎な入力はMarkdownから自動抽出せず、session ID、測定日、測定者、証拠参照、tolerance、uncertaintyを持つ構造化入力へレビュー後に転記する。domain取り込み処理は標準21 stationへ測定済みstationだけを重ね、未測定16点等を`unknown / null`のまま残す。形状変化点の追加stationも統合するが、補間値を正本stationへ書き込まず、取り込みだけで`verified`へ昇格しない。

ratio統合の固定許容差`1e-10`は浮動小数点表現の正規化専用であり、物理公差ではない。元入力、既存profile、標準stationは変更せず、新しい不変profile versionを生成する。

active profileの候補は、statusとは別に`structurally-valid`、`height-chain-ready`、`collision-ready`を用途ごとに確認する。不足がある場合は`not-ready`としてstation IDと不足項目を記録する。partial provisional profileは構造検証や高さ連鎖の検討には使えても、必要な走行面、下面、対象側壁、有効高さ・有効幅が揃うまでcollision-readyとしてactiveにしない。

## 記入例：未確認形状

未確認寸法には架空の数値を入れない。

```yaml
partId: three-lane-slope
outline2d:
  status: unknown
  outerRingsMm: null
  holesMm: null
profile3d:
  status: unknown
  interpolation: unknown
  stations: null
normalContactExclusions:
  status: unknown
  volumes: null
activeCollisionProfile: null
```

バンクも同様に、未計測のstation、通過可能空間、variantへ架空値を入れない。

```yaml
partId: three-lane-bank
bankDimensions:
  totalLengthMm: { status: unknown, value: null, unit: mm, confidence: none }
  centerAngleDeg: { status: unknown, value: null, unit: degree, confidence: none }
  centerlineRadiusMm: { status: unknown, value: null, unit: mm, confidence: none }
  innerRadiusMm: { status: unknown, value: null, unit: mm, confidence: none }
  outerRadiusMm: { status: unknown, value: null, unit: mm, confidence: none }
bankProfile:
  status: unknown
  stations: null
connectors: null
normalContactExclusions: null
passableSpaceEnvelope3d: null
profileVariants: null
activeCollisionProfile: null
```

外部の公開画面を将来参考にする場合も、人による通常の観察から得た数値だけを記録する。NOIRサイトのコード、画像、3Dモデル、メッシュ、テクスチャ、ロゴをコピー・保存せず、開発者ツール等による抽出、保護回避、自動巡回、大量アクセスを行わない。

## 未決事項

- 3レーン全パーツの正式一覧
- 3レーン幅、壁高、底面厚
- スロープの水平長と曲線形状
- スロープ側壁の壁高・壁厚・断面形状、高い側の開口形状、下面プロファイル
- バンクの全長、中心角、中心線半径、内外半径、横断勾配
- 初期対象4パーツの測定日、測定者、物理公差
- 入口・出口コネクタの物理基準点
- 正常接触除外範囲
- 初回collision profileのversionと採用レビュー
- スロープ上り／下りとバンク方向反転・左右向きの再利用可否
- レーンチェンジャー、ウェーブの精密形状
- 接触注意と干渉エラーの許容差