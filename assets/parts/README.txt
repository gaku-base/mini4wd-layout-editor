正式SVGパーツアセット
====================

レイアウト作成画面・一覧プレビュー・表示／書き出しでは、part-catalog.js の visual.file に登録した
assets/templates/*.svg を表示の正本として使用します。

表示と判定の役割分離
--------------------
・見た目：登録SVG
・接続位置／回転中心／寸法：part-catalog.js の geometry
・スナップ／干渉判定／高さ判定：geometry と各判定ロジック
・保存データ：部品種別・位置・回転・色など。SVG本体は保存しない

正式SVG
-------
straight.svg
corner45-exact.svg
lane-change.svg
wave.svg
start.svg
slope.svg
bank20.svg
lc-jump.svg
burning-lc.svg

運用ルール
----------
・背景は透明を基本とする
・visual.canvasWidth / canvasHeight / originX / originY とSVGの表示範囲を一致させる
・接続位置をSVG側の見た目に合わせて動かさない。接続の正本はgeometry
・45度コーナーは右向きSVGを正本とし、左向きはアプリ側で上下反転する
・20度バンクは入口SVGを正本とし、出口はアプリ側で左右反転する
・色変更時は同じSVGをアプリ側でパレット変換して使用する
・SVG読込に失敗した場合のみ従来Canvas描画をフォールバックとして使う

レーンチェンジ
--------------
lane-change.svg が表示の正本です。
レーン変更部の橋状レーン端にあった縦線は、行き止まりに見えるため正式SVGから削除しています。

assets/parts/*.png は過去互換・比較用の参照画像として残しますが、通常表示の正本には使用しません。
