# スロープ下通過 polygon 判定

更新日: 2026-09-02

## 目的

PR #97で確定したスロープ下通過ルールを、中央90度交差だけではなく、低端寄り・高端寄り・斜め交差など任意のXY配置へ適用する。

本モジュールは `slope-underpass-overlap.js`。

## 正式ルール

物理寸法と判定用余裕を分離する。

- 床まで塞ぐ側壁: 低端から270mm
- 干渉判定用安全マージン: 2mm
- 下通過NG: X<=272mm
- 下通過OK: X>272mm

Xはスロープ低端を0mm、高端を540mmとしたスロープローカル長手座標。

272mmの値は `slope-longitudinal-profile.js` の `underpassBlockedThroughXMm` を唯一の参照元として使用する。polygon判定側へ272を別定義しない。

## 判定方法

1. 上段スロープの実際の2D占有polygonをworld XY(mm)で受け取る。
2. 下段コースの実際の2D占有polygonをworld XY(mm)で受け取る。
3. 2 polygonの交差部分だけを三角形分割＋convex clippingで抽出する。
4. 交差部分の全頂点をスロープローカル座標へ逆変換する。
5. スロープ中心原点のXへ270mmを加え、低端基準X=0..540mmへ変換する。
6. 交差部分の最小Xと最大Xを `classifyUnderpassLongitudinalRange()` へ渡す。
7. 交差部分の最小X<=272mmなら `blocked-by-underpass-zone`。
8. 交差部分全体がX>272mmなら `clear-by-approved-rule`。

下段パーツの中心点ではなく、**実際にスロープと重なっているpolygon部分の最も低端側**を使う。このため、斜め配置でもコースの角だけが272mm帯へ入った場合を検出できる。

## polygon入力

単位はすべてmm。

```js
{
  slopePlacement: {
    positionMm: { x, y },
    rotationDeg
  },
  slopeFootprintPolygonMm: [
    { x, y }, ...
  ],
  lowerCoursePolygonMm: [
    { x, y }, ...
  ]
}
```

現行エディタから接続する場合は、`layout-graph.js` の `occupancyPolygon(part, definition)` が返すcm座標を明示的に10倍してmmへ変換して入力する。

`occupancyPolygon()` は直線系だけでなく45度コーナーの曲線帯polygonも返せるため、今後のruntime接続では矩形AABBではなく同じ実占有polygonを使う。

## 戻り値

主なstatus:

- `no-overlap`: XY上でスロープと下段polygonが重ならない
- `blocked-by-underpass-zone`: 重複部分がX<=272mmへ入る
- `clear-by-approved-rule`: 重複部分全体がX>272mm
- `indeterminate`: 入力または正式profileが不足

付加情報:

- `overlapAreaMm2`
- `overlapMinXMm`
- `overlapMaxXMm`
- `blockedThroughXMm`
- `intersectionFragmentsMm`
- `reasonCode`

`intersectionFragmentsMm` は将来、干渉部分を赤く描画するときに使用できる。

## 高さ方向との責務分離

このモジュールが確定するのは**スロープ下通過のXY位置ルール**だけ。

以下はこのモジュールだけでは決めない。

- 下段コースが上段より本当に低いか
- 別レベルのコースをX>272だからという理由だけで通過可にしてよいか
- バンク、別スロープ、LCジャンプ、バーニングLC等の高さ形状
- 未確定の下面リブ寸法を使った3D clearance

したがってruntimeで既存 `interferenceWarnings()` へ接続するときは、下段側が承認済みの通過高さ条件を満たすことを別途確認してから、このXY結果で警告を抑制する。

現時点では保存形式・UI・既存警告処理を変更しない。

## 自動テスト

`slope-underpass-overlap.test.js` で次を確認する。

- X=272mmちょうどはNG
- 272mmをわずかに超えればOK
- 実際のエディタStraight polygonで低端寄りNG
- 実際のエディタStraight polygonで高端寄りOK
- 中心位置ではなくpolygon外縁で272mm境界を判定
- 45度斜め交差
- スロープ自体を90度回転した場合
- XY非交差
- 文字列数値等を暗黙変換しない
- 入力を変更しない純粋関数

## 次段階

1. runtime側で上段/下段のZ関係を安全に分類する。
2. `layout-graph.interferenceWarnings()` の既存polygon重複結果へ本モジュールを接続する。
3. 承認済み条件の下段コースのみ、`clear-by-approved-rule` の場合に従来の一律干渉警告を抑制する。
4. `blocked-by-underpass-zone` の `intersectionFragmentsMm` を警告範囲表示へ接続する。
