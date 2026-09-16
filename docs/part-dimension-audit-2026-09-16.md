# Placement-dimension audit — 2026-09-16

使用モデル: GPT-5.6 Sol（推論: High）

## 結論

レイアウトスペース上の配置寸法は、**2026-09-16時点でアプリが使用している寸法を正式なプロジェクト採用値**とする。

タミヤ公式の公開寸法は公称／参考値として保持するが、成形・ジョイント・実組立時の差をすべて含む配置寸法とはみなさない。したがって、公式値との差を理由に現在の配置ジオメトリを自動補正しない。

採用方針:

- placement authority: `PART_DIMENSIONS_MM`
- unit: mm
- version: `2026-09-16-molded-fit-v1`
- basis: `project-owner-approved-current-runtime-with-molding-tolerance`
- official dimensions: `OFFICIAL_DIMENSION_REFERENCES_MM` として分離
- existing JSON / localStorage format: 変更なし

## 現在の採用寸法

| Part | 採用する配置／表示基準 |
|---|---:|
| Straight | 540 × 360mm |
| Start | 540 × 360mm |
| Corner 45 R/L | center R540mm / inner R360mm / outer R720mm / current connector geometry |
| Lane Change | 1620 × 360mm |
| Wave | 540 × 420mm、track 360mm、amplitude 40mm |
| Slope | horizontal 540mm × depth 360mm、height delta +115mm |
| Bank20 | connector span 230mm × depth 360mm、0°→20° |
| LC Jump | 540 × 360mm |
| Burning Lane Change | display 1800 × 1440mm、current independent vector geometry |
| Common connection face | 370mm |

これらは「タミヤ公式値と同じだから採用」するのではなく、**現在アプリで実用している寸法を、成形誤差を考慮するプロジェクト寸法として採用する**という決定に基づく。

## タミヤ公式値の扱い

公開資料で確認した値は引き続き記録する。

- JCJC 1レーン幅: 115mm
- フェンス高さ: 50mm
- 90°カーブ集成外形: 717mm
- 180°カーブ集成外形幅: 1434mm
- Slope公称落差: 110mm（11cm）

これらは `verified` な**公式参考値**だが、配置寸法の正本ではない。コード上では `usage: reference-only` として採用寸法と分離する。

## Corner 717mm / 720mm

タミヤ公式図の90°集成外形717mmに対し、現在アプリのCornerは外R720mmである。

本プロジェクトでは720mmを採用する。

理由:

1. 公式図の717mmは公開上の公称／集成寸法として扱う。
2. レイアウトでは成形・ジョイント等を含む実用上の寸法差を考慮する。
3. 現在アプリで使用している720mm系ジオメトリをプロジェクト採用値として承認した。
4. 717mmは比較用の公式参考値として残し、配置・接続・当たり判定を自動変更しない。

したがって、717mmと720mmの差は「未解決エラー」ではなく、**公式参考値とプロジェクト採用値の差**として管理する。

## Slope 110mm / 115mm

タミヤ公開説明の11cm（110mm）は参考値として残す。

配置・高さ判定では従来どおり115mmを採用する。既存のR398 → straight → R803 longitudinal profileも115mmを前提として維持する。

## 寸法変更可能な構造

`part-catalog.js` の先頭に、全パーツの配置寸法をmm単位でまとめた `PART_DIMENSIONS_MM` を置く。

PARTSの以下は寸法マスターから生成する。

- `w / h`
- connector positions
- `geometry.width / height / bounds`
- Corner radii / connector coordinates
- Wave length / depth / amplitude / connector offset
- Slope horizontal span / depth / height delta
- Bank20 span / depth / angle
- Burning geometry / display bounds
- visual canvas size / origin

Canvasの既存XY単位は後方互換のためcmのままだが、変換はカタログ生成時の `mmToCm()` に集約する。

これにより、将来たとえばCornerだけを実測値へ変更する場合は、寸法マスターのCorner項目を変更し、対応テストを更新することで追跡できる。

## 描画追従

寸法マスターを変更したときに表示だけ旧360mmへ残らないよう、描画もパーツ定義を参照する。

- Straight-like lane guides: `def.geometry.height / def.h`
- Bank lane guides: part-specific height
- Corner body / lane guides: `outerRadius - innerRadius`
- LC Jump internal visual proportions: `def.w / def.h` に対する比率
- Corner joint patch: connectionするpart definitionからtrack widthを取得

現在の採用値では従来描画と同じ数値になるため、見た目は変えない。

## 公式資料

1. Tamiya, Japan Cup Jr. Circuit / Oval Home Circuit layout material:
   https://www.tamiya.com/cms/japan/mini4wd/regulation_rental/circuits_data.pdf
2. Tamiya Mini 4WD official competition rules:
   https://www.tamiya.com/japan/mini4wd/regulation.html
3. Tamiya Item 95447, JCJC Slope Section:
   https://www.tamiya.com/japan/products/95447/index.html
4. Tamiya Item 69571, JCJC Bank Approach 20:
   https://www.tamiya.com/japan/products/69571/index.html
5. Tamiya 2015 Station Championship report:
   https://www.tamiya.com/japan/report/mini4wd_report20151121
6. Tamiya 2016 Spring report:
   https://www.tamiya.com/japan/report/mini4wd_report20160313

## 将来の校正

Issue #117で、現物採寸により採用寸法をさらに校正できるよう追跡する。

- Issue #117: https://github.com/gaku-base/mini4wd-layout-editor/issues/117

これは現行アプリを使うためのblockerではない。現在値を正式採用したうえで、必要になったパーツだけ個別に実測更新するためのバックログである。

## 変更時の安全条件

1. 寸法変更はまず `PART_DIMENSIONS_MM` に反映する。
2. 公式参考値を理由に採用値を自動上書きしない。
3. connector / bounds / render / occupancyの回帰テストを同時更新する。
4. 保存済みレイアウトの座標を自動移動させない。
5. 保存形式を変更しない。
6. 寸法変更により既存レイアウトの見え方・干渉結果が変わる場合は、変更内容を明示して別PRで扱う。
