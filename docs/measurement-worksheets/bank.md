# 3レーン・バンク採寸ワークシート

このワークシートは [手動採寸セッションガイド](../measurement-session-guide.md) と [パーツ計測プロトコル](../measurement-protocol.md) に従って記入する。公開画面から得た値は原則`provisional`とし、確認できない値は`unknown`、数値は`null`として扱う。

## 1. セッション情報

| 項目 | 記録 |
|---|---|
| session ID | `unknown` |
| パーツID・版 | `unknown` |
| 走行方向 | 入口→出口／反転／`unknown` |
| 左右向き | 左／右／`unknown` |
| 測定日 | `unknown` |
| 測定者 | `unknown` |
| 数値化・確認担当 | `unknown` |
| 公開ページ名・URL | `unknown` |
| ブラウザー・OS | `unknown` |
| 画面解像度・表示倍率 | `unknown` |
| 計画測定回数 | `unknown` |
| セッション状態 | `unknown` |

## 2. 安全確認

- [ ] 通常の公開画面操作だけを使用する。
- [ ] 外部3Dファイルを取得、抽出、解析、ダウンロードしない。
- [ ] コード、画像、メッシュ、テクスチャ、ロゴを保存・コピーしない。
- [ ] 開発者ツール、通信・キャッシュ解析、保護回避を行わない。
- [ ] 自動巡回、スクレイピング、大量アクセスを行わない。
- [ ] 一時スクリーンショットをリポジトリへ追加しない。
- [ ] 疑義がある場合は作業を停止して報告する。

## 3. 視点記録

| view ID | 視点 | カメラ方向・投影 | 表示倍率 | calibration ID | 対象station | 透視歪み・端点の懸念 | 状態 |
|---|---|---|---|---|---|---|---|
| `unknown` | 上面 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| `unknown` | 左側面 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| `unknown` | 右側面 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| `unknown` | 正面 | `unknown` | `unknown` | `unknown` | 入口 | `unknown` | unknown |
| `unknown` | 背面 | `unknown` | `unknown` | `unknown` | 出口 | `unknown` | unknown |
| `unknown` | 斜視 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| `unknown` | station確認視点 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | unknown |

必要に応じて行を追加する。

## 4. 縮尺校正

| calibration ID | view ID | 既知寸法 | 画面上読取長 | 単位 | 値1 | 値2 | 値3 | 追加値 | 実施回数 | 平均 | 最大差 | 推定誤差 | 信頼度 | 状態・unknown理由 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `unknown` | `unknown` | 540mm / 115mm / `unknown` | `unknown` | screen-unit | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |

校正計算方法・誤差成分：`unknown`

## 5. 全体寸法

| 項目 | 単位 | view ID | calibration ID | 値1 | 値2 | 値3 | 追加値 | 実施回数 | 平均 | 最大差 | 推定誤差 | 信頼度 | 状態・unknown理由 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 全長 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| 中心角 | degree | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| 中心線半径 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| 内側半径 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| 外側半径 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| 全幅 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| 全高 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |

## 6. station計画

割合は採寸位置のラベルであり、実寸ではない。`sMm`と`thetaDeg`は計測できるまで`unknown`とする。

| station ID | 種別 | 計画位置 | sMm | thetaDeg | 確認view ID | 追加理由・形状変化 | 状態 |
|---|---|---|---|---|---|---|---|
| bank-entry | 入口 | 入口 | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| bank-25 | 中間 | 25% | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| bank-center | 中央 | 中央 | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| bank-75 | 中間 | 75% | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| bank-exit | 出口 | 出口 | `unknown` | `unknown` | `unknown` | `unknown` | unknown |
| `unknown` | 追加station | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | unknown |

## 7. station別断面集計

次の表を各stationについて複製する。内外側の対応と横断勾配の符号規約をセッション情報へ記録する。

### station ID：`unknown`

| 項目ID | 測定項目 | 単位 | view ID | calibration ID | 値1 | 値2 | 値3 | 追加値 | 実施回数 | 平均 | 最大差 | 推定誤差 | 信頼度 | 状態 | unknown理由・備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| centerline-z | 走行面中心高さ | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| cross-slope | 横断勾配 | degree | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| surface-profile | 走行面YZ断面点列 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| underside-profile | 下面YZ断面点列 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| inner-wall-lower | 内側壁下端 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| inner-wall-upper | 内側壁上端 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| outer-wall-lower | 外側壁下端 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| outer-wall-upper | 外側壁上端 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| clearance-height | 通過可能な有効高さ | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| clearance-width | 通過可能な有効幅 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |
| free-space-envelope | 通過可能空間YZ断面 | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown | `unknown` |

読取値の除外・集計方法・誤差成分：`unknown`

## 8. コネクタ

| connector | 物理基準点 | 項目 | 単位 | view ID | 値1 | 値2 | 値3 | 追加値 | 実施回数 | 平均 | 最大差 | 推定誤差 | 信頼度 | 状態・unknown理由 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entrance | `unknown` | X | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| entrance | `unknown` | Y | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| entrance | `unknown` | Z | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| entrance | `unknown` | heading | degree | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| exit | `unknown` | X | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| exit | `unknown` | Y | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| exit | `unknown` | Z | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| exit | `unknown` | heading | degree | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| exit | `unknown` | elevationDelta | mm | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |

## 9. 正常接触除外範囲

| connector | 正式接続相手 | 接触部位 | volume種別 | 境界・点列 | view ID | 実施回数 | 平均・最大差 | 推定誤差 | 信頼度 | 状態・unknown理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| entrance | `unknown` | `unknown` | unknown | `null` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |
| exit | `unknown` | `unknown` | unknown | `null` | `unknown` | `unknown` | `unknown` | `unknown` | none | unknown |

正式接続時だけ除外できる根拠：`unknown`

## 10. 方向反転・左右向きの再利用確認

| variant | 元profile | 同一物理形状・鏡像同形の証跡 | station順 | connector対応 | Y軸・横断勾配変換 | 信頼度 | 状態・unknown理由 |
|---|---|---|---|---|---|---|---|
| 方向反転 | `unknown` | `unknown` | unknown | unknown | unknown | none | unknown |
| 左右向き | `unknown` | `unknown` | unknown | unknown | unknown | none | unknown |

## 11. セッション集計と転記判定

| 項目 | 記録 |
|---|---|
| 全測定項目数 | `unknown` |
| 数値取得項目数 | `unknown` |
| unknown項目数 | `unknown` |
| 使用view ID | `unknown` |
| 使用calibration ID | `unknown` |
| 平均・最大差の計算方法 | `unknown` |
| 推定誤差の計算方法 | `unknown` |
| セッション全体の信頼度 | none |
| measurement record転記可否 | unknown |
| collision profile候補 | `null` |
| 未解決事項 | `unknown` |
