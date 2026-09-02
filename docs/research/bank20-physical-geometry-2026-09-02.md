# 20度バンクアプローチ 実物形状調査（2026-09-02）

## 対象

Tamiya Item No.69571 `JAPAN CUP JUNIOR CIRCUIT BANK-APPROACH 20`。
現行エディタの `bank20`（20度バンク入口／出口）の物理モデル見直し用資料。

この文書は調査記録であり、現時点では `part-catalog.js` の寸法を変更しない。

## 判定ルール

- `verified`: タミヤ公式、またはプロジェクトオーナーが正式採用した値
- `provisional`: 実物トレース・実測など有力だがメーカー公称ではない値
- `derived`: verified/provisional 値から幾何計算した値。実測値そのものではない
- `unknown`: 数値根拠が不足しており推測しない項目

## 公式に確認できる事項

### バンク角 20°

- 値: `20 deg`
- status: `verified`
- source:
  - Tamiya 69571: https://www.tamiya.com/japan/products/69571/index.html
  - Tamiya circuit feature: https://www.tamiya.com/japan/mini4wd/feature/2019/1206.html

タミヤは「カーブセクションとストレートセクションの間にバンクアプローチを連結し、バンク台でカーブを支持して20度バンクを作る」と説明している。
したがってこの部品は、コース全体を長手方向へ20°上げるスロープではなく、平面状態から20°の横断勾配へ移行する**バンク遷移部**として扱う。

### セット構成

- バンクアプローチ x2
- バンク台 x1
- 支持ポール／パイプ、ジョイント等
- ストレート／カーブ本体は別売

status: `verified`（構成の大枠）

参考:
- https://www.tamiya.com/japan/products/69571/index.html
- https://www.suruga-ya.jp/product/other/603025208
- https://enomotoy.jp/SHOP/T69571.html

## 実物トレース由来の形状

Mini4Science は2026-05-23、実物の20°バンクアプローチを借り、切断された実物断面をトレース→スキャン→CAD解析している。

source:
- https://www.mini4science.com/2026/05/20-degree-bank-approach-mapped/

報告値:

| 項目 | 値 | status |
| --- | ---: | --- |
| section base length | 約240 mm | provisional |
| slope/running-side arc diameter | 約1321 mm | provisional |
| slope/running-side radius | 約660.5 mm | provisional |
| wall arc diameter | 約1195 mm | provisional |
| wall radius | 約597.5 mm | provisional |

同ページはトレース画像とSVGも公開しており、単なる目視推定ではなく実物断面を基にしているため、非公式資料の中では優先度を高く扱う。

### 240mm の解釈は未確定

Mini4Science の表現は `base length is 24cm` である。
ただし公開文だけでは、次のどれを示すかを一意に確定できない。

- 樹脂本体の外形ベース長
- 接続面間の投影距離
- 円弧の有効区間を含む基準長

したがって現時点では、**240mmをエディタのコネクタ間距離へ直接採用しない**。

## 独立した日本の実測クロスチェック

2015-08-09 の個人実測記事では、20°バンクアプローチについて次を測定している。

source:
- https://zspeed666.blogspot.com/2015/08/2015-08-09680.html

- 2点間距離: 約225 mm
- 下がり寸法（サジッタ）: 9.3 mm
- status: `provisional`

3点を通る円弧としてサジッタから半径を計算すると:

`R = c^2/(8s) + s/2`

`c=225mm, s=9.3mm` より:

- `R ~= 685.09 mm`
- status: `derived`

Mini4Science の走行側 `R ~= 660.5mm` に対し約3.7%の差であり、測定基準やトレース誤差を考えると同じ曲率帯を独立に支持する資料として扱える。

## 20°との幾何クロスチェック

Mini4Science の走行側半径 `R=660.5mm` と公式バンク角 `20°` を、単純円弧の端部接線角差20°として計算すると:

- 水平投影: `R sin(20°) = 225.9043 mm`
- 高低差: `R (1-cos(20°)) = 39.8330 mm`
- 円弧長: `R * rad(20°) = 230.5580 mm`
- chord: `2 R sin(10°) = 229.3892 mm`
- status: `derived`

特に水平投影 `225.90mm` は、独立実測の「2点間距離 約225mm」と非常によく一致する。

この一致から現時点では次を有力仮説とする。

> 約225〜226mm = 実際に曲率を持つ有効遷移区間／基準点間の水平進行量
>
> 約240mm = 樹脂本体を含むベース外形長

ただし、接続口位置を直接計測した資料が見つかるまでは **provisional hypothesis** とし、正式寸法にはしない。

## 重要: 39.833mm をコネクタZ差にしない

20°はバンク角（roll）であり、スロープのpitch角ではない。
したがって上記円弧から出る `39.833mm` は断面トレースの特定エッジを円弧として読んだ場合の幾何差であり、部品中心線や両コネクタ全体が39.833mm上昇することを意味しない。

現行モデルのように「平面側 bank=0° → バンク側 bank=20°」という概念自体は妥当。
一方で正確な3D面を作るには、横断方向の回転軸（pivot）と各レーン／壁のZ変化を確定する必要がある。

## 実写から確認できる構造

実物・中古写真および組立説明書から、以下は視覚的に確認できる。

- アプローチ本体は平板の直線的な傾斜ではなく、低端から高端へ滑らかにねじれる成形品
- 高い側のフェンス／側壁も曲線状に立ち上がる
- バンクしたカーブ本体は別体のバンク台＋パイプで支持される
- 2枚のアプローチをバンクカーブの入口と出口に用いる

実写・説明書例:
- Tamiya official product page: https://www.tamiya.com/japan/products/69571/index.html
- used kit / instruction examples are searchable under Item 69571

## 現行アプリとの相違

現行 `part-catalog.js` は:

- `w = 28cm` (=280mm)
- `h = 36cm`（legacy visual width）
- connector x = `-14cm / +14cm`
- bank transition = `0° -> 20°`

としている。

今回の外部調査では **280mmを裏付ける一次・実測資料は見つかっていない**。
一方、240mm（実物トレース）と225〜226mm（曲率区間の独立整合）が得られたため、280mmは見直し候補とする。

ただし現段階ではランタイムを変更しない。

## 未確定項目

以下はすべて `unknown` とし、数値を推測しない。

- 正式な接続面中心間距離
- 240mmの基準点の厳密な定義
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

1. アプローチ単品を真上から定規付きで撮影した写真
2. 真横から低端・高端の接続面が同時に分かる写真
3. 裏面全体と接続爪／リブの写真
4. 240mmの両端がどこか分かるMini4Science SVG/トレース座標
5. バンク台を組み立てた状態の高さ実測
6. パイプ長・支持点位置の実測

## 現時点の採用可否

| パラメータ | 候補値 | 状態 | ランタイム採用 |
| --- | ---: | --- | --- |
| bank angle | 20° | verified | 現行維持 |
| physical/base extent | ~240mm | provisional | まだ変更しない |
| effective curved span/projection | ~225〜226mm | provisional/derived | まだ変更しない |
| running-side radius | ~660.5mm | provisional | 研究値として保持 |
| independent radius | ~685.1mm | derived from real measurement | QAクロスチェック |
| wall radius | ~597.5mm | provisional | 研究値として保持 |
| connector-to-connector distance | null | unknown | 未変更 |
| pivot axis | null | unknown | 未変更 |
| support height | null | unknown | 未変更 |

## 推奨

現在の `280mm` を即座に `240mm` へ置換するのではなく、まず「240mmの端点」と「225mm実測の端点」を特定する。
その後、スロープ時と同様に**物理外形・接続基準・3D干渉用形状を別パラメータとして分離**して正式化する。
