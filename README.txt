Mini 4WD Course Layout — v1.1 RC6
===================================

ブラウザー上でミニ四駆コースを2D設計するレイアウトエディターです。
現在の正式なアプリ表示バージョンは VERSION.txt を基準に管理します。

主な機能
--------
- Start／ストレート／コーナー／レーンチェンジ／スロープ／バンク等の配置
- パーツ移動・削除・回転・カラー変更・Undo / Redo
- 設置範囲、設置不可エリア、干渉物の編集
- JSONによるレイアウト保存・読込
- 発表・出力モード
  - Grid（白背景＋実寸1mグリッド）
  - White
  - Transparent
  - PNG保存
  - A4縦／横／自動印刷
- 大会名、任意レイアウター名、総延長、使用パーツ数の表示

主要ファイル
------------
- app.js
  コース編集の中心ロジック。現時点では大きいため、一括リファクタリングは避けて段階的に分離します。
- persistence.js
  レイアウトの保存・読込・検証。
- editor-extensions-bootstrap.js
  Start再配置、範囲選択プレビュー、発表モード、簡易UIなどの拡張起動順序を集約します。
- wheel-rotation.js
  マウスホイール／トラックパッド回転入力。現在は既存UIとの一時的な互換bridgeだけを残しています。
- simple-ui.js
  編集画面の簡易UIとツールバー補助。
- presentation-data.js / presentation-renderer.js / presentation-export.js / presentation-mode.js
  発表用データ、2D描画、PNG/A4出力、発表画面を分担します。
- VERSION.txt
  ユーザー向けアプリバージョンの正本。

品質確認
--------
GitHub ActionsのPR checksで次を自動確認します。
- 全JavaScriptの構文チェック
- ルートの *.test.js / *.spec.js 全件
- Chromiumによる通常編集総合スモーク
- ゴミ箱削除・Undo回帰
- モード案内UI
- 範囲選択ターゲットプレビュー
- Start再配置スナップ
- 発表モード総合リハーサル
- UI整理スモーク

発表モード総合リハーサルでは、Gridの実寸、背景切替、PNG透過、A4 300dpi構成、印刷余白、スマホ幅、編集画面への状態復帰まで検証します。

運用・保守方針
--------------
- mainへ直接コミットせず、Issue → branch → PR → CI → review → mergeで進めます。
- 機能追加とコード健全化を同じPRへ混在させません。
- 大規模なapp.js書き換えより、小さな責務単位の安全な切り出しを優先します。
- 商品バージョンと保存データ内部のschema versionは別概念として扱います。
- private runtime bridgeは現在の挙動を守るための一時互換層です。公式の狭いeditor APIへ置換できる段階で削除します。

補助資料
--------
- docs/product-spec.md              製品仕様
- docs/roadmap.md                   開発ロードマップ
- docs/decision-log.md              設計判断履歴
- docs/part-master.md               パーツ情報
- docs/measurement-protocol.md      実測手順
- docs/collision-engine.md          干渉判定設計
- HUMAN_QA_CHECKLIST.csv            手動QAチェックリスト
- CANVA_ASSET_GUIDE.txt             パーツ画像資産の補助ガイド

ローカル起動
------------
Windowsでは run_local.bat / run_local_server.bat、macOSでは run_local.command を利用できます。
GitHub Pagesでも静的アプリとして動作します。
