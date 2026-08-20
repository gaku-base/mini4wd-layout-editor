# Part outline guides

Issue #73 の実装メモ。

## 現状監査

- 通常コースパーツの選択点線は、既に回転済みCanvas context上で`tracePartShapePath()`を使用している。
- Corner 45°は曲線外周、WaveとBurning Changerも既存の専用外形Pathを使用している。
- Straight / Slope / Bank / Lane Changeなどの矩形系もローカル外形をパーツ回転と一緒に描いているため、水平・垂直・斜めで画面軸AABBにはならない。
- 残っている画面軸AABBの点線は、Start配置ghostの`startBounds(candidate)` + `strokeRect`。

## 今回の変更

- Start配置時だけ、従来AABBの中心位置を保持したまま、`PARTS.start`の正式54×36cm外形を現在の0° / 45° / 90° / 135°…の回転へ追従させて点線表示する。
- 点線の中心線は既存`lineWidth / 2`だけ外側へ出し、Canvasの中心stroke分を二重に加算しない。
- 既存のvalid（緑）/ invalid（赤）の意味・dash設定は維持する。
- 通常コースパーツへ新しい点線レイヤーは追加しない。既に正しい既存選択表示をそのまま使用する。
- Start guideの置換は寸法一致だけに依存しない。Startモード中に正式54×36cmのsolid Start本体`strokeRect`を検出した場合だけ、その**直後の1回の`strokeRect`**を置換候補としてarmする。
- armされた次の`strokeRect`が点線かつ現在角度のStart回転AABB寸法と一致する場合だけ、実外形点線へ置換する。
- arm後に別の`strokeRect`が先に来た場合はarmを消費して通常描画する。誤置換より補正を見送るfail-safeを優先する。
- したがって、Startモード中でも先に描かれる設置範囲・設置不可エリア・マーキー等は、仮に54×36cmと同寸法でも置換されない。
- 色コードには依存しない。valid/invalid色が変わってもStart外形補正は維持する。

## 対象外

- PNG export
- hit test / collision
- persistence / saved-space
- snapping
- part dimensions / physical geometry
- 通常course placement ghostへの新しい表示追加

## 検証

- Start 0° / 45° / 90° / 135° / 180° / 225° / 270° / 315°で回転を保持する。
- AABB中心位置は変えない。
- 正式Start寸法54×36cmを使用する。
- 点線外側オフセットは`lineWidth / 2`。
- 同寸法54×36cmの点線設置範囲がStart本体より前に描かれても変更しない。
- Start本体後に別の`strokeRect`が割り込んだ場合はarmを消費し、その後の矩形を誤置換しない。
- 全NodeテストとChromium smokeを通す。