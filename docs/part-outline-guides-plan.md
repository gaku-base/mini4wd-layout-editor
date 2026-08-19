# Part outline guides

Issue #73 の実装メモ。

## 現状監査

- 通常コースパーツの選択点線は、既に回転済みCanvas context上で`tracePartShapePath()`を使用している。
- Corner 45°は曲線外周、WaveとBurning Changerも既存の専用外形Pathを使用している。
- Straight / Slope / Bank / Lane Changeなどの矩形系もローカル外形をパーツ回転と一緒に描いているため、水平・垂直・斜めで画面軸AABBにはならない。
- 残っている画面軸AABBの点線は、Start配置ghostの`startBounds(candidate)` + `strokeRect`。

## 今回の変更

- Start配置時だけ、従来AABBの中心位置を保持したまま、`PARTS.start`の正式54×36cm外形を現在の0° / 45° / 90° / 135°…の回転へ追従させて点線表示する。
- 点線は本体線を隠しにくいよう、既存lineWidth 1本分だけ画面上で外側へ広げる。
- 既存のvalid（緑）/ invalid（赤）の意味・dash設定は維持する。
- 通常コースパーツへ新しい点線レイヤーは追加しない。既に正しい既存選択表示をそのまま使用する。
- Canvas全体の`strokeRect`を書き換えるのではなく、`courseCanvas`かつ`mode-start-position`かつStart配置用の緑/赤の点線strokeだけを限定置換する。
- 設置範囲、設置不可エリア、マーキー選択など他の`strokeRect`は通過させる。

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
- 設置範囲など別色・実線・別モードの`strokeRect`は変更しない。
- 全NodeテストとChromium smokeを通す。