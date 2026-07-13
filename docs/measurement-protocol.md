# パーツ計測プロトコル

## 1. 目的と適用範囲

本書は、Phase 2のコースパーツ本体干渉判定に使用する寸法、接続点、投影外形、3Dプロファイルを、根拠と精度を追跡できる形式で記録するためのルールを定める。

初期対象は次の3レーン用パーツに限定する。

- ストレート
- 45度コーナー
- スロープ
- バンク

判定対象はコースパーツ本体のみとする。支柱、橋脚、補強材、固定具、テープ、会場床は、計測マスターと干渉判定の対象外とする。

本Issueでは計測ルールとデータ仕様だけを定義する。外部3Dデータの取得・解析、精密3Dモデルの作成、干渉エンジンの実装は行わない。

## 2. 知的財産・アクセス・安全ルール

公開画面を将来参照する場合も、以下を絶対条件とする。

- 人が公開画面を通常の方法で観察・計測して得た数値だけを記録する。
- NOIRサイトのコード、画像、3Dモデル、メッシュ、テクスチャ、ロゴ、その他素材をコピー、保存、再配布しない。
- 開発者ツール、通信解析、キャッシュ調査などを使って3Dファイルや素材を抽出しない。
- アクセス制限、認証、暗号化、難読化、技術的保護を回避しない。
- 自動巡回、スクレイピング、大量アクセス、負荷を与える反復取得を行わない。
- サイト表示を複製せず、独自の表示用形状とcollision profileを作成する。
- 法令、利用規約、権利関係に疑義がある方法が必要になった時点で作業を停止し、Issueへ方法と懸念点だけを報告する。
- 疑義を解消できないデータは`unknown`のまま維持し、推測値を登録しない。

参照元の記録は、ページ名、公開URL、観察条件、得られた数値の説明に限定する。画面キャプチャやサイト由来ファイルを証跡としてリポジトリへ保存してはならない。

## 3. 単位と座標系

### 3.1 単位

- 長さ、座標、半径、高さ、クリアランス、許容誤差はmmで記録する。
- 角度と角度許容誤差はdegreeで記録する。
- 日付は`YYYY-MM-DD`形式とする。
- バージョン、反復回数、配列インデックス、識別子は寸法ではないため、寸法状態の対象外とする。

### 3.2 パーツローカル座標

パーツごとに右手系のローカルXYZ座標を持つ。

- 原点：入口コネクタの基準点
- +X：入口からパーツ内部へ進む基準走行方向
- +Z：上方向
- +Y：右手系を満たす横方向

入口コネクタの物理的な基準点が未確認の場合、その定義と座標値は`unknown`とする。単にローカル原点として0を置く場合は、物理寸法ではなく`coordinate-definition`を測定元として記録する。

角度は+Xを0度とし、+Z軸まわりの右手系回転で表す。UI操作に使用する角度は45度刻みだが、実パーツの計測値は測定結果と許容誤差を保持し、丸めて`verified`にしてはならない。

曲線パーツとスロープの長手方向位置は、入口から中心基準線に沿った距離`sMm`で表す。中心角を基準に観察するバンクは`thetaDeg`も使用できる。これにより、単純なX座標だけでは表現できないコーナー、スロープ、バンクにも同じ形式を使用できる。

## 4. 寸法状態と信頼度

### 4.1 `verified`

次のいずれかを満たし、プロジェクト上の確定値として承認された値。

- メーカー等の一次資料に明示された公称値で、項目との対応が明確である。
- 校正済みの実物計測を複数回行い、測定者、測定日、器具、許容誤差を記録して再現できる。
- 独立した複数の合法な測定元が許容誤差内で一致する。
- プロジェクト所有者が公称値として明示的に確定した。

単一の公開画面観察だけで`verified`へ昇格してはならない。公称値は物理的な製造ばらつきとは別であるため、物理公差が不明なら許容誤差を`unknown`として残す。

### 4.2 `provisional`

合法な観察・計測による数値はあるが、次のいずれかに該当する暫定値。

- 測定元が1件だけで独立確認がない。
- 公開画面の投影、縮尺、視点、表示丸めの影響を受ける。
- 測定器、測定回数、許容誤差の記録が不足している。
- 別の確定値から導出した検算値で、実物形状との照合が未完了である。
- 形状やコネクタ基準点の定義がレビュー待ちである。

`provisional`は構造検証に使用できるが、正式な干渉可否や製作判断の根拠にはしない。

### 4.3 `unknown`

合法かつ追跡可能な測定結果がない、測定対象の定義が曖昧、または数値を置くと推測になる状態。

- 数値欄は`null`とする。
- 架空の0、仮の長さ、便宜的な直方体寸法を入れない。
- 測定不能または未測定の理由を`notes`へ記録する。
- 信頼度は`none`とする。

### 4.4 信頼度

`confidence`は証跡の質を示し、寸法状態とは別に記録する。

| 値 | 意味 |
|---|---|
| `high` | 一次資料、再現可能な実物計測、または明示承認がある |
| `medium` | 合法な測定値があり、限定的な再確認がある |
| `low` | 単一観察、投影読取、または定義レビュー待ち |
| `none` | 数値がなく`unknown`である |

信頼度だけを理由に状態を昇格してはならない。

## 5. 共通測定レコード

すべての物理数値は、個別に次の形式を持つか、配列・プロファイル単位で同じメタデータを明示的に継承する。

```yaml
status: verified | provisional | unknown
value: number | null
unit: mm | degree
valueKind: nominal | measured | observed | derived | coordinate-definition
source:
  type: user-confirmed | physical-measurement | primary-document | public-screen-observation | derived | none
  reference: string | null
  observationNote: string | null
observation:
  viewpoints: [string, ...] | null
  calibrationReference: string | null
  calculationMethod: string | null
  repeatCount: integer | null
  dispersion:
    status: verified | provisional | unknown | not-applicable
    value: number | null
    unit: mm | degree
measuredAt: YYYY-MM-DD | null
measuredBy: string | null
tolerance:
  status: verified | provisional | unknown | not-applicable
  plus: number | null
  minus: number | null
  unit: mm | degree
confidence: high | medium | low | none
notes: string | null
```

`measuredBy`にはGitHubユーザー名、担当者ID、または組織内で追跡可能な識別子を使用し、不要な個人情報は記録しない。

`tolerance.status: not-applicable`は、物理測定ではない座標原点や軸方向の定義に限って使用できる。この場合、`plus`と`minus`は`null`にする。物理寸法の公差が未確認の場合は`not-applicable`ではなく`unknown`とする。

### 5.1 確定済み寸法の記入例

ストレート1枚の公称長540mmは、プロジェクト所有者が確定した値として次のように記録する。物理公差は未確認なので、架空の許容誤差を入れない。

```yaml
status: verified
value: 540
unit: mm
valueKind: nominal
source:
  type: user-confirmed
  reference: "Issue #1 / Issue #6"
  observationNote: "ストレート1枚の公称長"
observation:
  viewpoints: null
  calibrationReference: null
  calculationMethod: null
  repeatCount: null
  dispersion: { status: not-applicable, value: null, unit: mm }
measuredAt: null
measuredBy: null
tolerance:
  status: unknown
  plus: null
  minus: null
  unit: mm
confidence: high
notes: "製造ばらつきと実物公差は未確認"
```

### 5.2 未確認寸法の記入例

スロープ水平長は次のように記録し、便宜的な数値を置かない。

```yaml
status: unknown
value: null
unit: mm
valueKind: measured
source:
  type: none
  reference: null
  observationNote: null
observation:
  viewpoints: null
  calibrationReference: null
  calculationMethod: null
  repeatCount: null
  dispersion: { status: unknown, value: null, unit: mm }
measuredAt: null
measuredBy: null
tolerance:
  status: unknown
  plus: null
  minus: null
  unit: mm
confidence: none
notes: "水平長は未計測"
```

## 6. コネクタ仕様

各パーツは入口・出口コネクタを識別子付きで持つ。高さは`positionMm.z`で表し、重複する別の高さ値は持たない。出口と入口の高低差が必要な場合は、別途`elevationDeltaMm`を測定レコードとして持つ。

```yaml
connectors:
  - id: entrance
    kind: entrance
    referenceFeature: string | null
    positionMm:
      x: <共通測定レコード>
      y: <共通測定レコード>
      z: <共通測定レコード>
    headingDeg: <共通測定レコード>
    elevationDeltaMm: <共通測定レコード>
  - id: exit
    kind: exit
    referenceFeature: string | null
    positionMm:
      x: <共通測定レコード>
      y: <共通測定レコード>
      z: <共通測定レコード>
    headingDeg: <共通測定レコード>
    elevationDeltaMm: <共通測定レコード>
```

### 6.1 スロープ出口の記入例

水平位置を推測せず、確定済みの高低差だけを記録する。

```yaml
id: exit
kind: exit
referenceFeature: null
positionMm:
  x: { status: unknown, value: null, unit: mm, confidence: none }
  y: { status: unknown, value: null, unit: mm, confidence: none }
  z:
    status: verified
    value: 115
    unit: mm
    valueKind: nominal
    source: { type: user-confirmed, reference: "Issue #1 / Issue #6" }
    measuredAt: null
    measuredBy: null
    tolerance: { status: unknown, plus: null, minus: null, unit: mm }
    confidence: high
    notes: "入口ローカル高さを0mmとした上り方向の公称高低差"
headingDeg: { status: unknown, value: null, unit: degree, confidence: none }
elevationDeltaMm:
  status: verified
  value: 115
  unit: mm
  valueKind: nominal
  source: { type: user-confirmed, reference: "Issue #1 / Issue #6" }
  measuredAt: null
  measuredBy: null
  tolerance: { status: unknown, plus: null, minus: null, unit: mm }
  confidence: high
  notes: null
```

省略記法を使用する場合も、保存時には共通測定レコードの必須フィールドを補完する。

## 7. 2D投影外形

2D投影外形は、パーツローカルXY平面上の閉じたポリゴンとして表す。外周は反時計回り、穴は時計回りとし、最後の点から最初の点は暗黙に閉じる。

```yaml
outline2d:
  status: verified | provisional | unknown
  measurement: <共通測定メタデータ>
  coordinateFrame: part-local-xy
  inheritsMeasurementMetadata: true
  outerRingsMm:
    - [[x, y], [x, y], ...]
  holesMm:
    - [[x, y], [x, y], ...]
```

`outerRingsMm`と`holesMm`内の全数値は`measurement`の状態、測定元、日付、測定者、許容誤差、信頼度を継承する。頂点ごとに精度が異なる場合はリングを分割するか、各頂点に個別の共通測定レコードを持たせる。

未確認時の例：

```yaml
outline2d:
  status: unknown
  measurement:
    source: { type: none, reference: null, observationNote: null }
    observation:
      viewpoints: null
      calibrationReference: null
      calculationMethod: null
      repeatCount: null
      dispersion: { status: unknown, value: null, unit: mm }
    measuredAt: null
    measuredBy: null
    tolerance: { status: unknown, plus: null, minus: null, unit: mm }
    confidence: none
    notes: "外形は未計測"
  coordinateFrame: part-local-xy
  inheritsMeasurementMetadata: true
  outerRingsMm: null
  holesMm: null
```

## 8. 3Dプロファイル

走行面、下面、側壁は単純な直方体ではなく、中心基準線に沿った複数の`station`と、その位置でのYZ断面ポリラインとして表す。各stationは中心線位置と接線角度を持つため、ストレート、コーナー、スロープで同じ形式を使用できる。

```yaml
profile3d:
  status: verified | provisional | unknown
  measurement: <共通測定メタデータ>
  coordinateFrame: part-local-xyz
  inheritsMeasurementMetadata: true
  interpolation: none | linear | spline | unknown
  stations:
    - id: string
      role: entrance | intermediate | center | exit
      positionParameter: ratio | sMm | thetaDeg
      ratio: number
      sMm: number | null
      thetaDeg: number | null
      centerlinePositionMm: { x: number, y: number, z: number }
      tangentHeadingDeg: number
      runningSurfacePolylineYZMm: [[y, z], ...] | null
      undersidePolylineYZMm: [[y, z], ...] | null
      sideWallPolylinesYZMm:
        left: [[y, z], ...] | null
        right: [[y, z], ...] | null
```

`ratio`は入口を0、出口を1とする無次元の採寸位置であり、全stationで必須とする。`sMm`または`thetaDeg`は実測できた場合だけ値を持ち、未確認なら`unknown / null`にする。`stations`内の物理数値は`profile3d.measurement`を継承する。走行面、下面、左右側壁で測定元や精度が異なる場合は、`runningSurface`、`underside`、`sideWalls`を別プロファイルへ分ける。

`interpolation`は実測station間の補間方法である。初期実装の既定値は`linear`とするが、既知の実測2点に挟まれた区間の照会結果だけに使用する。測定点列自体を補間値で上書きせず、測定密度や曲線モデルが未確認なら後続の厳密干渉判定に使用しない。

### 8.1 スロープ下面の長手方向形式

スロープ下を通過可能な部分と不可能な部分を判定できるよう、各`sMm`で下面断面を保持する。中心だけの高さでは側壁や横方向の凹凸を失うため、`undersidePolylineYZMm`を必須の最終形式とする。

軽量な候補絞り込み用には、同じstationから導出した下面エンベロープを別に保持できる。

```yaml
undersideEnvelope:
  status: verified | provisional | unknown
  derivedFromProfileVersion: string | null
  inheritsMeasurementMetadata: true
  samples:
    - sMm: number
      minimumUndersideZMm: number
      maximumUndersideZMm: number
```

エンベロープは元の下面断面を置き換えない。`derivedFromProfileVersion`が一致しないエンベロープは無効とする。

未計測スロープの例：

```yaml
profile3d:
  status: unknown
  measurement:
    source: { type: none, reference: null, observationNote: null }
    observation:
      viewpoints: null
      calibrationReference: null
      calculationMethod: null
      repeatCount: null
      dispersion: { status: unknown, value: null, unit: mm }
    measuredAt: null
    measuredBy: null
    tolerance: { status: unknown, plus: null, minus: null, unit: mm }
    confidence: none
    notes: "走行面、下面、側壁は未計測"
  coordinateFrame: part-local-xyz
  inheritsMeasurementMetadata: true
  interpolation: unknown
  stations: null
undersideEnvelope:
  status: unknown
  derivedFromProfileVersion: null
  inheritsMeasurementMetadata: true
  samples: null
```

### 8.2 バンクの計測形式

バンクは平面曲線だけでなく、長手方向と横断方向の勾配、下面、内外側壁、下を通過できる空間を同時に表現する。入口・中央・出口に加えて複数の中間stationを設定し、傾斜が変化する区間を省略しない。

#### 基本寸法

次の項目を個別の共通測定レコードとして持つ。

```yaml
bankDimensions:
  totalLengthMm: <共通測定レコード>
  centerAngleDeg: <共通測定レコード>
  centerlineRadiusMm: <共通測定レコード>
  innerRadiusMm: <共通測定レコード>
  outerRadiusMm: <共通測定レコード>
  totalWidthMm: <共通測定レコード>
  totalHeightMm: <共通測定レコード>
```

中心線半径は中心基準線、内外半径はパーツ本体の2D投影外形を基準とする。基準線や外形の物理的な定義が確定するまでは、半径を推定せず`unknown`とする。

#### stationと断面

stationは`role`で入口、中央、出口、中間断面を区別する。位置は入口から中心基準線に沿う`sMm`、または入口を0degreeとする中心角`thetaDeg`のどちらかで管理する。両方を記録する場合、導出側は`valueKind: derived`とし、元の測定値を参照する。

```yaml
bankProfile:
  status: verified | provisional | unknown
  measurement: <共通測定メタデータ>
  coordinateFrame: part-local-xyz
  inheritsMeasurementMetadata: true
  interpolation: none | linear | spline | unknown
  stations:
    - id: string
      role: entrance | intermediate | center | exit
      positionParameter: ratio | sMm | thetaDeg
      ratio: number
      sMm: number | null
      thetaDeg: number | null
      centerlinePositionMm: { x: number, y: number, z: number }
      tangentHeadingDeg: number
      runningSurfaceCenterZMm: number
      crossSlopeDeg: number
      runningSurfacePolylineYZMm: [[y, z], ...]
      undersidePolylineYZMm: [[y, z], ...]
      walls:
        inner:
          lowerEdgeMm: { y: number, z: number }
          upperEdgeMm: { y: number, z: number }
          polylineYZMm: [[y, z], ...]
        outer:
          lowerEdgeMm: { y: number, z: number }
          upperEdgeMm: { y: number, z: number }
          polylineYZMm: [[y, z], ...]
      passableClearance:
        effectiveHeightMm: number
        effectiveWidthMm: number
        freeSpaceEnvelopeYZMm: [[y, z], ...]
```

各数値は`bankProfile.measurement`を継承する。走行面、横断勾配、下面、内外側壁、通過可能空間で測定元や精度が異なる場合は、それぞれに個別の共通測定メタデータを持たせる。

- `runningSurfaceCenterZMm`：中心基準線上の走行面高さ
- `crossSlopeDeg`：stationの接線方向から見た横断勾配。符号規約はprofileの向きとともに記録する
- `undersidePolylineYZMm`：下面全体の横断形状。単一の下面高さだけで代用しない
- `walls.inner` / `walls.outer`：内外側壁の上端、下端、必要な中間点
- `effectiveHeightMm` / `effectiveWidthMm`：そのstationで連続して通過に使える有効寸法
- `freeSpaceEnvelopeYZMm`：下面と側壁で囲まれた通過可能空間の断面

通過可能空間はstation間で連続する必要がある。単一断面の有効高さ・有効幅だけで通過可能と確定せず、後続エンジンは全stationと補間規則から空間エンベロープを評価する。

collision profileには、station断面から導出した連続空間を次の参照形式で保持できる。元stationや補間規則が変わった場合は再生成し、版が一致しないエンベロープを使用しない。

```yaml
passableSpaceEnvelope3d:
  status: verified | provisional | unknown
  derivedFromProfileVersion: string | null
  interpolation: none | linear | spline | unknown
  stationEnvelopeRefs: [string, ...] | null
```

入口・出口コネクタは6章の形式でXYZ、`headingDeg`、`elevationDeltaMm`を記録する。正常接続部は9章の`normalContactExclusions`をコネクタごとに持ち、正式接続時だけ除外する。

#### 未計測バンクの記入例

以下は可読性のための省略記法であり、保存時には各項目を5章の共通測定レコードへ展開する。

```yaml
bankDimensions:
  totalLengthMm: { status: unknown, value: null, unit: mm, confidence: none }
  centerAngleDeg: { status: unknown, value: null, unit: degree, confidence: none }
  centerlineRadiusMm: { status: unknown, value: null, unit: mm, confidence: none }
  innerRadiusMm: { status: unknown, value: null, unit: mm, confidence: none }
  outerRadiusMm: { status: unknown, value: null, unit: mm, confidence: none }
  totalWidthMm: { status: unknown, value: null, unit: mm, confidence: none }
  totalHeightMm: { status: unknown, value: null, unit: mm, confidence: none }
bankProfile:
  status: unknown
  measurement:
    source: { type: none, reference: null, observationNote: null }
    observation:
      viewpoints: null
      calibrationReference: null
      calculationMethod: null
      repeatCount: null
      dispersion: { status: unknown, value: null, unit: mm }
    measuredAt: null
    measuredBy: null
    tolerance: { status: unknown, plus: null, minus: null, unit: mm }
    confidence: none
    notes: "入口、中央、出口、中間断面は未計測"
  coordinateFrame: part-local-xyz
  inheritsMeasurementMetadata: true
  interpolation: unknown
  stations: null
connectors: null
normalContactExclusions: null
passableSpaceEnvelope3d: null
activeCollisionProfile: null
```

### 8.3 sampled collision profileのstation規則

実装上のcollision profileは、数学的な単一曲線式ではなくstationの測定点列を正本とする。

- 標準stationは`ratio: 0`から`ratio: 1`まで0.05刻みの21点とする。
- 標準stationに加え、走行面、下面、側壁などの形状変化点へ任意の`ratio`を持つ追加stationを登録できる。
- 手動採寸ワークシートの25%刻み等はセッション開始時の基本視点である。collision profileへ転記する際は21点の標準格子を生成し、採寸していない5% stationを`unknown / null`のまま残す。
- station配列は`ratio`昇順へ正規化し、同じ`ratio`の生成済みunknown stationは明示的な追加stationで置き換えられる。station IDはprofile内で重複させない。
- 入口`ratio: 0`と出口`ratio: 1`は必須とし、範囲外ratio、重複ID、逆順stationを検証エラーとする。
- 各stationの`sMm`、`thetaDeg`、走行面、下面、左右・内外側壁、有効高さ、有効幅は、`measured`または`unknown`の正本値として保持する。
- `unknown`は`value: null`とし、標準stationを作るために未確認寸法を0等で埋めない。
- 各正本値には不確かさ、許容誤差、測定根拠参照を保持する。未確認の不確かさ・許容誤差にも数値を置かず`null`とする。

補間は正本stationから別途導出する照会結果であり、次を守る。

1. 初期既定方式は線形補間とする。
2. 対象ratioの直前・直後に実測値がある場合だけ補間する。
3. 片側しか実測値がない場合は外挿せず`unknown / null`を返す。
4. 間に明示的なunknown stationがある区間を飛び越えて補間しない。
5. 補間値は`sampleKind: interpolated`、方式、両側のstation IDとratioを持ち、`sampleKind: measured`と区別する。
6. 補間結果を測定点列へ書き戻さない。
7. 補間interfaceは差し替え可能とし、将来のmonotone cubicや形状保持方式でも元測定点を変更しない。

profileの`status`は`verified | provisional | unknown`を許可する。unknownのdraft profileは安全に保持できるが、必要な形状が存在しない間はパーツマスターの`activeCollisionProfile`を`null`のままにする。

## 9. 正常接続部の干渉除外範囲

正式に接続されたコネクタ同士の正常接触だけを除外するため、各コネクタに`normalContactExclusion`を定義する。接続関係のないパーツや、除外範囲を越えた食い込みには適用しない。

```yaml
normalContactExclusions:
  - id: string
    connectorId: string
    status: verified | provisional | unknown
    measurement: <共通測定メタデータ>
    coordinateFrame: connector-local-xyz
    appliesOnlyWhenFormallyConnected: true
    volume:
      kind: oriented-box | convex-polyhedron | profile-extrusion | unknown
      centerMm: { x: number, y: number, z: number } | null
      sizeMm: { x: number, y: number, z: number } | null
      rotationDeg: { x: number, y: number, z: number } | null
      verticesMm: [[x, y, z], ...] | null
      faces: [[vertexIndex, ...], ...] | null
```

`volume`内の物理数値は`measurement`を継承する。`faces`のインデックスは寸法ではない。未計測時は`kind: unknown`とし、数値配列を`null`にする。除外範囲が`unknown`の間は、厳密判定で正常接触を無条件除外してはならない。

## 10. collision profileのバージョン管理

collision profileはパーツ寸法マスターから独立した、差し替え可能な不変データとして管理する。

```yaml
profileId: string
partId: string
version: <semantic-version>
schemaVersion: <semantic-version>
status: verified | provisional | unknown
measurementRevision: string
supersedes: <profileId@version> | null
createdAt: YYYY-MM-DD
createdBy: string
changeSummary: string
geometry:
  outline2d: <7章の形式>
  profile3d: <8章の形式>
  passableSpaceEnvelope3d: <8章の形式>
  normalContactExclusions: <9章の形式>
```

運用ルール：

1. 公開済みバージョンは上書きしない。修正は新しいsemantic versionとして追加する。
2. 測定値、許容誤差、station、除外範囲の変更は、少なくともminor versionを更新する。
3. 座標系、補間規則、データ構造の互換性を壊す変更はmajor versionを更新する。
4. 誤記など形状結果を変えない変更はpatch versionを更新する。
5. パーツマスターは`activeCollisionProfile`で採用バージョンを参照する。形状データを直接埋め込まない。
6. 差し替え時は旧版を削除せず、`supersedes`と変更理由を残す。
7. 保存済みレイアウトは使用した`profileId@version`を保持し、後から再現できるようにする。
8. `unknown`で形状データが存在しない場合、架空のprofileを作らず`activeCollisionProfile: null`とする。

collision profileを差し替える処理は将来の実装対象であり、本Issueでは文書仕様だけを定義する。

### 10.1 方向反転・左右向きの再利用

同一の実パーツを逆方向に走行する場合や、左右向きの派生profileを作る場合は、元の測定点を複製・再測定したように扱わず、変換規則と元profile versionを記録する。

```yaml
profileVariant:
  sourceProfile: <profileId@version>
  status: verified | provisional
  transform:
    travelDirection: preserve | reverse
    turnSide: preserve | mirror-left-right
    stationOrder: preserve | reverse
    connectorMap:
      entrance: entrance | exit
      exit: exit | entrance
    yAxis: preserve | negate
    crossSlopeSign: preserve | negate
    polygonWinding: preserve | reverse
    elevationDeltaSign: preserve | negate
  evidence: string
```

再利用ルール：

1. スロープの上り／下りは同じ物理形状を反対方向に通る場合だけ再利用できる。station順と入口・出口を入れ替え、高低差の符号を反転する。Z形状自体を上下反転しない。
2. バンクの入口／出口方向反転も同じ物理形状に限り、station順、コネクタ、接線方向、長手方向パラメータを変換する。
3. 左右向きはY座標、横断勾配の符号、ポリゴン巻き方向を変換し、内側・外側の意味ラベルを変換後の半径側へ対応付ける。
4. 左右の実パーツが鏡像同形であることを測定または一次資料で確認できない場合、mirror variantを作らず別profileを`unknown`から計測する。
5. variantの状態と信頼度は元profileを超えてはならない。変換規則が未検証なら`provisional`とする。
6. 保存済みレイアウトは元profile versionとvariant変換の両方を保持し、再現可能にする。

## 11. 計測・レビュー手順

1. パーツID、版、測定対象項目、基準点を先に定義する。
2. 参照方法が本書2章に適合するか確認する。疑義があれば作業を停止する。
3. 測定元、測定日、測定者、器具、基準寸法、視点、計算方法を記録する。
4. 数値、単位、許容誤差、信頼度を記録する。得られない値は`unknown`にする。
5. 同じ条件で反復測定し、反復回数とばらつきを記録する。外れ値は削除せず理由とともに残す。
6. 状態判定を行い、`provisional`から`verified`への昇格はレビューで承認する。
7. 形状データから新しいcollision profile versionを生成し、旧版との差分を記録する。
8. パーツマスターの`activeCollisionProfile`更新は、テストとレビューを伴う別変更として行う。

スロープとバンクを将来公開3D表示から採寸する場合は、通常の画面操作だけを用い、上面・側面・正面・背面・斜視などの複数視点と、入口・中央・出口・中間の複数断面で同じ部位を確認する。既知寸法による縮尺校正、視点、計算方法、反復回数、ばらつきを記録し、公開表示から得た値は原則`provisional`とする。

## 12. 初期対象の準備状態

| パーツ | 公称基準 | コネクタ | 2D外形 | 走行面 | 下面 | 側壁 | 正常接触除外 | collision profile |
|---|---|---|---|---|---|---|---|---|
| 3レーン ストレート | 長さ540mm verified | 一部定義済み | unknown | unknown | unknown | unknown | unknown | 未作成 |
| 3レーン 45度コーナー | 出口角度差45度 provisional | unknown | unknown | unknown | unknown | unknown | unknown | 未作成 |
| 3レーン スロープ | 高低差115mm verified | XY unknown、Z一部定義済み | unknown | unknown | unknown | unknown | unknown | 未作成 |
| 3レーン バンク | unknown（数値は`null`） | unknown | unknown | unknown | unknown | unknown | unknown | 未作成 |
