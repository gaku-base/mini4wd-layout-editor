# Bank20 接続口間230mm・総延長0.66m 正式採用決定

- Date: 2026-09-04
- Status: verified / project-owner decision
- Part: Tamiya 3-lane Bank Approach 20 (Item 69571)

## 決定

20度バンクアプローチは、**配置・接続に使う接続口間距離**と、**発表・出力に使う3レーン総延長**を別の値として扱う。

### 配置・接続ジオメトリ

- connector-to-connector projected span: `230mm`
- editor internal legacy XY unit: `23cm`
- local origin: part center
- flat-side connector X: `-115mm` (`-11.5cm`)
- banked-side connector X: `+115mm` (`+11.5cm`)
- runtime bounds X: `-115mm .. +115mm`
- bank transition: `0° -> 20°`

この230mmは、アプリ上で隣接パーツをつなぐ**接続口間の距離**として採用する。

### 発表・出力の総延長

Pimentoso互換の総延長では、Bank20 1個を**3レーンを各1回ずつ走った合計 `0.66m`**として加算する。

- Bank20 track-length contribution: `0.66m`
- 1レーン換算の計算値: `0.22m`
- ただし、この22cmを配置・接続ジオメトリには使わない

したがって、**接続口間23cm**と**総延長0.66m**は意図的に別値である。

## 旧仕様との関係

`2026-09-02-bank20-projected-length-240mm.md` の240mmモデルは本決定でsupersededとする。

24cmという外形・ベース側の観察値が存在しても、現行アプリの接続口間距離には使用しない。

## 研究値との区別

次の値は引き続き別の幾何量として保持する。

- transition arc chord: 約`225.75mm` (provisional)
- preferred running-side arc radius: 約`R650.02mm` (provisional/derived)

225.75mmは遷移円弧の端点間弦長であり、採用済みの接続口間230mmや、総延長計算22cm/レーンとは同一視しない。

## 3D形状について

この決定で確定するのは接続口間距離と総延長計算値のみであり、Bank20のcollision profile完成を意味しない。

引き続き`unknown / null`:

- roll pivot axis
- running surface 3D cross-section
- underside 3D geometry
- inner/outer wall 3D geometry
- effective clearance envelope

根拠のない値は補完しない。
