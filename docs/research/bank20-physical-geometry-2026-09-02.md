# 20度バンクアプローチ 実物形状調査（2026-09-02）

## 対象

Tamiya Item No.69571 `JAPAN CUP JUNIOR CIRCUIT BANK-APPROACH 20`。
現行エディタの `bank20`（20度バンク入口／出口）の物理モデル見直し用資料。

この文書は調査記録であり、現時点では `part-catalog.js` の寸法を変更しない。

構造化した暫定値は [`bank20-provisional-master-2026-09-02.md`](bank20-provisional-master-2026-09-02.md) を参照する。

## 判定ルール

- `verified`: タミヤ公式、またはプロジェクトオーナーが正式採用した値
- `provisional`: 実物トレース・実測など有力だがメーカー公称ではない値
- `derived`: verified/provisional 値から幾何計算した値。実測値そのものではない
- `legacy-unverified`: アプリに既存するが、物理的根拠を追跡できない値
- `unknown`: 数値根拠が不足しており推測しない項目

## 公式に確認できる事項

### バンク角 20°

- 値: `20 deg`
- status: `verified`
- source:
  - Tamiya 69571: https://www.tamiya.com/japan/products/69571/index.html
  - Tamiya circuit feature: https://www.tamiya.com/japan/mini4wd/feature/2019/1206.html

タミヤは、カーブセクションとストレートセクションの間にバンクアプローチを連結し、バンク台でカーブを支持して20度バンクを作ると説明している。
したがってこの部品は、コース全体を長手方向へ20°上げるスロープではなく、平面状態から20°の横断勾配へ移行する**バンク遷移部**として扱う。

### セット構成

- バンクアプローチ x2
- バンク台 / アプローチ台 x1
- パイプ（長 x2、短 x1）
- ジョイント、キャップ、連結金具、両面テープ等
- ストレート／カーブ本体は別売

status: `verified`（構成の大枠）

参考:
- https://www.tamiya.com/japan/products/69571/index.html
- https://www.tamiyausa.com/shop/tracks/mini-4wd-bank-approach-20-red/
- https://www.suruga-ya.jp/product/other/603025208

## 実物トレース由来の形状

Mini4Science は2026-05-23、実物の20°バンクアプローチの切断片を借り、断面をトレース→スキャン→CAD解析している。

source:
- https://www.mini4science.com/2026/05/20-degree-bank-approach-mapped/
- https://www.mini4science.com/updates/

報告値:

| 項目 | 値 | status |
| --- | ---: | --- |
| section base length | 約240 mm | provisional |
| slope/running-side arc diameter | 約1321 mm | provisional |
| slope/running-side radius | 約660.5 mm | provisional |
| wall arc diameter | 約1195 mm | provisional |
| wall radius | 約597.5 mm | provisional |

同ページはトレース画像とSVGも公開している。単なる目視推定ではなく実物断面を基にしているため、非公式資料の中では有力資料として扱う。

公開SVGの直接URL:

`https://d1eyppkioqhwc7.cloudfront.net/wp-content/uploads/2026/05/20_degree_bank_side_view_1_orange.svg`

現調査環境ではCloudFront直取得ができず、SVG内部の座標は未確認。

### 240mm の解釈は未確定

Mini4Science の表現は `base length is 24cm` である。
ただし公開本文だけでは、次のどれを示すかを一意に確定できない。

- 樹脂本体の外形ベース長
- 接続面間の投影距離
- 円弧以外の端部を含む断面基準長

したがって現時点では、**240mmをエディタのコネクタ間距離へ直接採用しない**。

## 独立実測 1: 2015年の弦長・矢高

2015-08-09 の個人実測記事では、20°バンクアプローチについて次を測定している。

source:
- https://zspeed666.blogspot.com/2015/08/2015-08-09680.html

- 2点間距離: 約225 mm
- 下がり寸法（sagitta）: 9.3 mm
- status: `provisional`

この記事はこの2点間距離と矢高を使って3点円弧を求めているため、**225mmは水平投影ではなく円弧端点間の弦長として扱う**。

サジッタ式:

`R = c^2/(8s) + s/2`

`c=225mm, s=9.3mm` より:

- `R ~= 685.09 mm`
- status: `derived`

矢高は小さいため測定誤差が半径へ大きく効く。R685mmは曲率帯の独立QA値として保持し、正式候補値にはしない。

## 独立実測 2: 2021年の弦長 225.75mm

2021-02-22 のアガワAGWによる実測では、20°バンクを「中心角20°の円弧」として、**円弧の端から端までの直線距離（弦長）**を直接測っている。

source:
- https://note.com/agw8823/n/n37f3c0220962

報告:

- chord: 約225.75 mm
- sagitta: 約9.8 mm（加筆の簡易実測）
- status: `provisional`

公式20°と弦長225.75mmから:

`R = chord / (2 sin(20°/2))`

より:

- `R ~= 650.02 mm`
- status: `derived`

さらに `R=650mm` の理論sagittaは約9.87mmで、実測約9.8mmと約0.07mm差で一致する。

### 現時点で最も整合の強い円弧モデル

次の3点が `R ~= 650mm` で相互整合する。

1. Tamiya公式の20°
2. 実物弦長 約225.75mm
3. 別測定の矢高 約9.8mm

したがって現時点では、**走行面側の20°遷移円弧候補として R=650mm を最優先の provisional model** とする。

Mini4Science の `R ~= 660.5mm` は約1.6%大きい。実物トレース・スキャン・CAD化の方法差、トレースした線の位置差、個体差等の可能性があるため、否定せずQAクロスチェック値として保持する。

## R650mm からの派生値

`R=650mm`, 中心角 `20°` の単純円弧として:

- chord: `2R sin(10°) = 225.7426 mm`
- arc length: `R * rad(20°) = 226.8928 mm`
- tangent-frame horizontal projection: `R sin(20°) = 222.3131 mm`
- tangent-frame vertical difference: `R(1-cos(20°)) = 39.1998 mm`
- sagitta relative to chord: 約9.87 mm
- status: `derived`

**注意:** これらは断面円弧の幾何値であり、エディタのXYコネクタ間距離やZ差をそのまま意味しない。

## 240mm と 225.75mm の関係

現時点で確認できる2つの実物系長さは:

- Mini4Science base length: 約240mm
- AGW arc-end chord: 約225.75mm

差は:

- `240 - 225.75 = 14.25 mm`

である。

240mmが円弧の端部以外（接続用の直線／フランジ／樹脂端部等）を含む物理外形長である可能性を支持する。
ただし、左右へ均等に7.125mmずつ存在するといった対称性は**未確認のため仮定しない**。

また、円弧端点がそのままJCJCの正式な接続面なのかも未確認である。したがって:

- physical/base extent ≈240mm: provisional
- arc-end chord ≈225.75mm: provisional
- connector-to-connector distance: unknown

と分離して保持する。

## 独立したコミュニティ3D再現モデル

Thingiverse thing `4572311`、作者 `sako83`（2020）は、3レーンJCJCの20°バンクアプローチを `Dimensionally accurate` なレプリカとして公開している。

mirrors:
- https://3dgo.app/models/thingiverse/4572311
- https://3dmdb.com/en/3d-model/tamiya-mini4wd-20o-bank-approach-japan-cup-by-sako83/8195768/

説明では:

- 20° bank approach を実物レプリカとして作成
- brake setting用途
- 末端へ50mm straight trackを追加
- high precisionで再export

としている。

ただし検索可能な公開メタデータからは元バンク部分の数値寸法を抽出できていないため、**community QA corroboration** としてのみ扱う。STL外形寸法が直接確認できるまでは240mm/225.75mmの証明には使用しない。

## 実写・組立説明から確認できる構造

公式商品画像、説明書、中古出品写真から以下を確認できる。

- アプローチ本体は平板の直線的な傾斜ではなく、0°から20°へ滑らかにねじれる成形品
- 高い側のフェンス／側壁も曲線状に変化する
- バンクしたカーブ本体は別体のバンク台＋長短パイプで支持される
- 2枚のアプローチをバンクカーブの入口と出口に用いる
- Connector A / B系の通常JCJC連結機構を使う

実写・説明例:
- Tamiya official: https://www.tamiya.com/japan/products/69571/index.html
- Tamiya USA red: https://www.tamiyausa.com/shop/tracks/mini-4wd-bank-approach-20-red/
- Tamiya USA old green 69568: https://www.tamiyausa.com/shop/tracks/jr-circuit-bank-approach-20/
- Item 69571の中古出品には説明書・部品写真が複数存在する

説明書に見える45mmは両面テープの切断寸法であり、**バンクアプローチ本体長ではない**。

旧69568のTamiya USA説明にある「74%」は従来品に対する**パッケージサイズ縮小**であり、パーツ本体の長さには使用しない。

## 重要: 約39.2mm をコネクタZ差にしない

20°はバンク角（roll）であり、スロープのpitch角ではない。
したがってR650円弧から出る約39.2mmは、断面トレースの特定エッジについての幾何差であり、部品中心線や両コネクタ全体が39.2mm上昇することを意味しない。

現行モデルの「平面側 bank=0° → バンク側 bank=20°」という概念自体は妥当。
正確な3D面を作るには、横断方向の回転軸（pivot）と各レーン／壁のZ変化を確定する必要がある。

## 現行280mmの由来をリポジトリ履歴で追跡

現行 `part-catalog.js` は:

- `w = 28cm` (=280mm)
- `h = 36cm`
- connector x = `-14cm / +14cm`
- bank transition = `0° -> 20°`

としている。

Git履歴を遡ると、静的RC1エディタを採用したコミット:

- `557fce43b034b15da7f45bf17c87904ab443f438`
- message: `feat: adopt static RC1 editor with persistence and part seams`
- 2026-07-23

の最初期 `part-catalog.js` ですでに `bank20 w:28` が入っている。
しかし同ファイルには、28cmについて測定元・evidence・confidence・statusの記録がない。

さらに直前のReact/domain実装（例: `fe59cc6dcbddb2bfb4b98bf7fd2ee16cef2d3e28`）では、物理寸法は `verifiedDimension` / `unknownDimension` で明示管理され、StraightとSlopeは定義されているが、**Bank20の物理寸法定義自体が存在しない**。

したがって、280mmは「以前の検証済み物理モデルから継承された値」とは確認できない。

### 280mmの現在の扱い

- value: 280mm
- status: `legacy-unverified`
- runtime: 現行互換のため維持中
- physical authority: なし

今回の外部調査でも280mmを裏付ける一次・実測資料は見つかっていない。
実物系資料からは:

- physical/base ≈240mm
- arc chord ≈225.75mm
- preferred provisional arc R≈650mm

が得られているため、**280mmは正式な物理寸法としては見直し対象**とする。

ただし、正式なJCJC接続面間距離をまだ直接確認できていないので、このPRではランタイムを変更しない。

## 接続距離・支持系の追加探索結果

Tamiya Japan / English / USA、旧69568、販売店、説明書画像、中古出品、コミュニティ資料を追加検索した。

確認できた事項:

- 69571/95591ともに長パイプx2・短パイプx1を使用する
- 旧69568もsupport standと長短パイプを使う同系統の構成
- 公式公認コースの直線1レーン幅は115mm、フェンス高50mm

ただし次の数値は公開資料で確認できなかった:

- connector-to-connector distance
- bank stand height
- long pipe length
- short pipe length
- support-point Z
- roll pivot axis

中古出品の実写にも両接続面を同時に定規／ノギスで測った画像は確認できなかった。

したがってこれらはすべて `unknown / null` を維持する。

## 未確定項目

以下はすべて `unknown` とし、数値を推測しない。

- 正式な接続面中心間距離
- 240mmの基準点の厳密な定義
- 円弧端点とJCJC接続面の位置関係
- バンク遷移の横断方向pivot軸位置
- 低い側エッジのZプロファイル
- 高い側エッジのZプロファイルの基準面
- 各レーン境界の3D曲面
- 裏面リブ／ボス／接続爪の最大下方突出
- バンク台の正確な高さ
- 長／短パイプの正確な長さ
- バンクカーブ支持時の各支持点Z

## 次に必要な証拠

優先度順:

1. アプローチ単品を真上から定規付きで撮影した写真（物理全長と接続面位置を同時に確認）
2. 円弧端点と連結面が同時に見える真横写真
3. 裏面全体と接続爪／リブの写真
4. Mini4Science SVGの実座標を取得し、240mm両端と円弧端点を比較
5. sako83 STLのbank本体部分の実寸boundsを確認
6. バンク台を組み立てた状態の高さ実測
7. パイプ長・支持点位置の実測

## 現時点の採用可否

| パラメータ | 候補値 | 状態 | ランタイム採用 |
| --- | ---: | --- | --- |
| bank angle | 20° | verified | 現行維持 |
| legacy app length | 280mm | legacy-unverified | 互換のため暫定維持 |
| physical/base extent | ~240mm | provisional | まだ変更しない |
| arc-end chord | ~225.75mm | provisional | 研究値として保持 |
| preferred running-side arc radius | ~650mm | provisional/derived | 最優先研究モデル |
| Mini4Science running-side radius | ~660.5mm | provisional | QAクロスチェック |
| 2015 sagitta-derived radius | ~685.1mm | derived | 低優先QA |
| wall radius | ~597.5mm | provisional | 研究値として保持 |
| connector-to-connector distance | null | unknown | 未変更 |
| pivot axis | null | unknown | 未変更 |
| support height | null | unknown | 未変更 |

## 推奨

現在の `280mm` を即座に `240mm` や `225.75mm` へ置換しない。

次の正式化では、スロープ時と同様に最低でも:

1. `physicalBaseExtentMm`
2. `connectorDistanceMm`
3. `transitionArcChordMm`
4. `transitionArcRadiusMm`
5. 3D surface / collision geometry

を別パラメータとして分離する。

現時点では `R≈650mm / chord≈225.75mm` を最も整合の強い実測系モデルとし、**接続面間距離だけはunknownのまま維持**する。
