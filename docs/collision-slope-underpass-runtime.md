# スロープ下通過 runtime 接続

## 目的

PR #97で確定した `X<=272mm` 下通過NGルールと、PR #98で追加した任意polygon判定・安全pair policyを、既存アプリの干渉警告経路へ接続する。

## 接続方針

既存 `layout-graph.js` の `interferenceWarnings()` は変更・削除しない。

アプリ起動前に `slope-underpass-runtime.js` が `window.M4WD_LAYOUT_GRAPH` を新しい immutable object へ差し替え、`interferenceWarnings()` だけをラップする。

処理順序は次のとおり。

1. 既存 `interferenceWarnings()` をそのまま実行する。
2. 既存警告配列を `slope-underpass-warning-filter.js` へ渡す。
3. `clear-underpass` と確定した警告だけを除外する。
4. `blocked-underpass` は警告を維持し、交差fragment・X範囲・272mm境界情報を付加する。
5. `not-applicable` / `indeterminate` / スロープ以外の警告は変更しない。

このため既存の同一高さ干渉、接続、障害物、設置範囲、保存形式には影響しない。

## 起動順序

現行アプリでは `app.js` がロード時に `window.M4WD_LAYOUT_GRAPH` をローカル定数へ保持する。そのためruntime wrapperは `app.js` より前に導入する必要がある。

現在のRC6互換構成では `wheel-rotation.js` に残っている一時parser bridgeから `slope-underpass-runtime-preload.js` を同期ロードする。preloadは依存順を固定する。

1. `slope-longitudinal-profile.js`
2. `slope-underpass-overlap.js`
3. `slope-underpass-pair-policy.js`
4. `slope-underpass-warning-filter.js`
5. `slope-underpass-runtime.js`

これは既存の一時互換bridge内に限定した処理であり、wheel入力ロジックそのものへ判定責務を追加するものではない。将来 `index.html` / build bootstrapを整理した段階で、専用の静的ロード順へ移す。

## fail-closed

runtime filterが利用できない、polygonが不正、Z基準が不明、下段が承認対象外の特殊パーツである場合、既存警告を消さない。

自動的に警告を除外できるのは、既存仕様で承認した同一基準Zの平坦通常コースが、実polygon交差範囲の全体で `X>272mm` にある場合だけである。

## 検証

- runtime wrapper前は従来警告が1件発生すること。
- 高端側の承認済み下通過ではwrapper後に0件となること。
- 272mm帯へ一部でも入る場合は警告を維持すること。
- installを複数回呼んでも二重ラップしないこと。
- parser preloadの依存順が固定されていること。
- JavaScript syntax check / 全Node自動テストを通すこと。
- one-time UI smokeで実Chromium起動を確認すること。

## 未解決

- blocked polygon fragmentの実画面赤色表示。
- 異なる基準Z同士の3D clearance。
- bank / 別slope / LC jump / Burning LC等の個別通過条件。
- 将来のbuild/bootstrap整理時にparser bridgeを専用ロードへ移設すること。
