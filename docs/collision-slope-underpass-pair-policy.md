# スロープ下通過 pair 適用ポリシー

更新日: 2026-09-02

## 目的

272mm polygon判定を、X条件だけで全パーツへ適用して誤って干渉警告を消さないための安全ゲートを定義する。

実装: `slope-underpass-pair-policy.js`

## 適用条件

`clear-underpass` / `blocked-underpass` まで判定するのは、次をすべて満たす組み合わせだけ。

1. 上段側が `slope`。
2. 下段側の定義が平坦な通常コース。
3. 下段側の全コネクタで `localZMm=0`、`pitchDeg=0`、`bankAngleDeg=0`。
4. `bankTransitionToDeg` が無いか0。
5. 下段側が slope / bank20 / lcjump / burning ではない。
6. 上段スロープの低端基準Zと下段コースの基準Zが同一。
7. XY polygon入力が有効。

現行カタログで自動適用可能な下段側:

- straight
- corner-45-right
- corner-45-left
- lanechange
- wave
- start

自動適用しない下段側:

- slope
- bank20
- lcjump
- burning

後者は実3D形状が平坦な標準コースと同じではないため、X>272だけを理由に通過可へしない。

## Z条件を同一基準高さに限定する理由

今回の272mmルールは、低端側と同じ基準高さに置かれた通常3レーンコースが高端側開口を通るケースについて確定したもの。

別レベルのコースまで同じルールで自動clearにすると、下段側が実際には高すぎる場合や、上段スロープが別高さに浮いている場合を誤判定できる。

そのため現在は安全側で、`slopePart.zMm === lowerPart.zMm` の場合だけpolygon判定を自動clear/blockへ昇格する。

異なる基準高さは `not-applicable / base-level-differs` とし、従来の干渉判定を勝手に抑制しない。

## 判定結果

- `clear-underpass`: 同一基準高さ・平坦通常コースで、実polygon交差部分全体がX>272mm
- `blocked-underpass`: 同条件だが、交差部分がX<=272mmへ入る
- `no-overlap`: XY polygonが重ならない
- `not-applicable`: 上記適用条件外
- `indeterminate`: 数値やpolygonが不足

## 安全性

- 数値文字列を数値へ暗黙変換しない。
- Z不明は0扱いしない。
- bank/slope等をflat扱いしない。
- 新しい物理寸法を追加しない。
- 272mmは `slope-longitudinal-profile.js` の値を間接的に使用する。
- 現時点では既存 `layout-graph.interferenceWarnings()` の挙動を変更しない。

## 次のruntime接続

既存干渉判定でXY polygonが重なり、vertical envelopeも重なったpairについて:

1. slope / lowerの向きを特定。
2. `layout-graph.occupancyPolygon()` をmmへ変換。
3. 本pair policyへ渡す。
4. `clear-underpass` の場合だけ従来の一律 `interference` warningを抑制。
5. `blocked-underpass` はwarningを維持し、polygon fragmentを干渉範囲表示へ渡す。
6. `not-applicable` / `indeterminate` は従来警告を維持する。

これにより、未確認形状を「通過可」にする方向の誤判定を避けながら段階的にruntimeへ接続できる。
