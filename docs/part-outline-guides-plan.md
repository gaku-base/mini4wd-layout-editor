# Part outline guides

Issue #73 の実装メモ。

- 選択・配置時の点線ガイドは、画面軸に平行なAABB矩形ではなくパーツの正式外形Pathを使用する。
- 0° / 45° / 90° / 135°を含む回転時も、配置後のパーツ外周と同じ向き・形状に追従する。
- Start配置ghostは現在の`startBounds(candidate)` + `strokeRect`を廃止し、`type: 'start'`の正式外形Pathを使用する。
- 通常のcourse placement ghostも同じ外形ガイドを使用する。
- 既存の`tracePartShapePath()`を中心に再利用し、Corner 45° / Wave / Burning Changerの既存専用形状を壊さない。
- Straight系は実外周長方形に沿わせる。
- 点線ガイドは一時表示のみ。PNG export、hit test、collision、persistence、part dimensionsへ混入させない。
- 選択色・valid/invalid/out-of-boundsの意味は維持する。
- 本体の外周線を見失わない線幅・dash間隔にする。

検証ではStartの斜め配置でAABB四角枠が出ないこと、Cornerの曲線外周、通常ghost、選択表示、PNG非混入を確認する。