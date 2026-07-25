Canvaで作成したパーツ画像の差し替え先
========================================

このフォルダーへ、以下の透明PNGを配置すると自動的にCanvas描画から画像表示へ切り替わります。
画像がない場合はアプリ内のベクター描画を使用します。

straight.png       54 × 36 px
corner45.png       52 × 52 px
lane-change.png    1296 × 288 px（8倍書出し、表示寸法162 × 36）
wave.png           54 × 42 px
start.png          54 × 36 px
slope.png          54 × 36 px
bank20.png         28 × 36 px
lc-jump.png        54 × 36 px
burning-lc.png     1440 × 1152 px（8倍書出し、表示寸法180 × 144）

基本ルール
----------
・1 px ＝ 1 cmとして作成
・背景は透明
・画像サイズは変更しない
・回転や接続位置は画像ではなくpart-catalog.jsのgeometryで管理
・透明余白を追加しない
・画像の向きは一覧プレビューと同じ（接続方向は左→右）

lane-changeは正式ベクター描画を優先します。正本はlane-change-visual.js、
編集用テンプレートはassets/templates/lane-change.svg、lane-change.pngは
同じ描画を高解像度で同期した参照・フォールバック画像です。

burning-lcも正式ベクター描画を優先します。正本はburning-changer-visual.js、
編集用テンプレートはassets/templates/burning-lc.svg、burning-lc.pngは
同じ描画を高解像度で同期した参照・フォールバック画像です。

corner45.pngのみ、画像内の回転基準は左上から
X=20.8837 px / Y=21.5823 pxです。
アプリ側で自動補正するため、Canvaでは52×52pxのキャンバス全体をそのまま書き出してください。

この版では、提供画像を透明化・トリミング・比率補正したPNGを同梱しています。
