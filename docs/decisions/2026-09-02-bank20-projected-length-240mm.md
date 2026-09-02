# Bank20 投影延長240mm 正式採用決定

- Date: 2026-09-02
- Status: verified / project-owner decision
- Part: Tamiya 3-lane Bank Approach 20 (Item 69571)

## 決定

20度バンクアプローチの**アプリ上の投影延長を240mm**として正式採用する。

ランタイム表現:

- projected length: `240mm`
- editor internal legacy XY unit: `24cm`
- local origin: part center
- flat-side connector X: `-120mm` (`-12cm`)
- banked-side connector X: `+120mm` (`+12cm`)
- bank transition: `0° -> 20°`

従来の`280mm / 28cm / ±14cm`モデルはsupersededとする。

## 根拠

正式値のauthorityは**プロジェクトオーナーの明示決定**である。

外部QAとして、Mini4Scienceの実物切断片トレースでも`base length is 24cm`が報告されており、240mmモデルと整合する。

## 別寸法との区別

次の研究値は240mm投影延長と同一視しない。

- arc-end chord: 約`225.75mm` (provisional)
- preferred running-side arc radius: 約`R650mm` (provisional/derived)
- Mini4Science running-side radius: 約`R660.5mm` (provisional)
- wall radius: 約`R597.5mm` (provisional)

225.75mmは20°遷移円弧の端点間弦長であり、パーツ全体の投影延長240mmとは別の幾何量である。

## アプリ対象外

- バンク台
- 長／短パイプ
- 支持ポール・固定具
- 支持部品の床面高さ

これらはコース本体の配置・接続・干渉判定には使用しない。

## 3D形状について

投影延長240mmの確定は、Bank20全体のcollision profile完成を意味しない。

未確定のため引き続き`unknown / null`:

- roll pivot axis
- running surface 3D cross-section
- underside 3D geometry
- inner/outer wall 3D geometry
- effective clearance envelope

根拠のない値は補完しない。
