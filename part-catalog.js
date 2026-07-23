(() => {
  'use strict';

  const TRACK_WIDTH_CM = 36;
  const STRAIGHT_CM = 54;

  const palette = {
    base: '#efede9',
    lane: '#8d8c89',
    edge: '#858480',
    accent: '#e52f38'
  };

  // geometry: 接続・当たり判定に使う実寸情報
  // visual: 表示画像／Canvas描画の登録枠。将来Canva画像へ差し替えてもgeometryは不変。
  const PARTS = {
    straight: {
      key: '1', name: 'ストレート', short: '直線', renderKind: 'straight',
      w: 54, h: 36,
      geometry: { width: 54, height: 36, bounds: { minX: -27, maxX: 27, minY: -18, maxY: 18 } },
      visual: { file: 'assets/parts/straight.png', canvasWidth: 54, canvasHeight: 36, originX: 27, originY: 18 },
      ...palette
    },
    corner45: {
      key: '2', name: 'コーナー（45度）', short: '45°', renderKind: 'corner45', corner45: true,
      w: 53.711688245, h: 49.344155877, radius: 54, trackWidth: 36,
      geometry: { centerlineRadius: 54, innerRadius: 36, outerRadius: 72, angleDeg: 45 },
      visual: { file: 'assets/parts/corner45.png', canvasWidth: 53.711688245, canvasHeight: 49.344155877, originX: 22.283700800, originY: 22.982286295 },
      ...palette
    },
    lanechange: {
      key: '3', name: 'レーンチェンジ', short: 'LC', renderKind: 'lanechange', lanechange: true,
      w: 162, h: 36,
      geometry: { width: 162, height: 36, bounds: { minX: -81, maxX: 81, minY: -18, maxY: 18 } },
      visual: { file: 'assets/parts/lane-change.png', canvasWidth: 162, canvasHeight: 36, originX: 81, originY: 18 },
      ...palette
    },
    wave: {
      key: '4', name: 'ウェーブ', short: '波形', renderKind: 'wave', wave: true,
      w: 54, h: 42, trackWidth: 36, amplitude: 4,
      geometry: { width: 54, trackWidth: 36, amplitude: 4, centroidY: -2, connectors: [{ x: -27, y: 2, heading: 180 }, { x: 27, y: 2, heading: 0 }], bounds: { minX: -27, maxX: 27, minY: -21, maxY: 21 } },
      visual: { file: 'assets/parts/wave.png', canvasWidth: 54, canvasHeight: 42, originX: 27, originY: 21 },
      ...palette
    },
    start: {
      key: '5', name: 'スタート', short: 'START', renderKind: 'start', special: 'start',
      w: 54, h: 36,
      geometry: { width: 54, height: 36, bounds: { minX: -27, maxX: 27, minY: -18, maxY: 18 } },
      visual: { file: 'assets/parts/start.png', canvasWidth: 54, canvasHeight: 36, originX: 27, originY: 18 },
      ...palette, accent: '#e52f38'
    },
    slope: {
      key: '6', name: 'スロープ', short: '坂', renderKind: 'slope', slope: true,
      w: 54, h: 36,
      geometry: { width: 54, height: 36, bounds: { minX: -27, maxX: 27, minY: -18, maxY: 18 } },
      visual: { file: 'assets/parts/slope.png', canvasWidth: 54, canvasHeight: 36, originX: 27, originY: 18 },
      height: { startMm: 0, endMm: 115, maxMm: 115 },
      ...palette
    },
    bank20: {
      key: '7', name: '20度バンク入口／出口', short: '20°', renderKind: 'bank20', bank20: true,
      w: 28, h: 36,
      geometry: { width: 28, height: 36, bounds: { minX: -14, maxX: 14, minY: -18, maxY: 18 } },
      visual: { file: 'assets/parts/bank20.png', canvasWidth: 28, canvasHeight: 36, originX: 14, originY: 18 },
      bank: { angleDeg: 20, dynamicRole: true },
      ...palette
    },
    lcjump: {
      key: '8', name: 'LCジャンプ', short: 'JUMP', renderKind: 'lcjump', lcjump: true,
      w: 54, h: 36,
      geometry: { width: 54, height: 36, connectors: [{ x: -27, y: 0, heading: 180 }, { x: 27, y: 0, heading: 0 }], bounds: { minX: -27, maxX: 27, minY: -18, maxY: 18 } },
      visual: { file: 'assets/parts/lc-jump.png', canvasWidth: 54, canvasHeight: 36, originX: 27, originY: 18 },
      ...palette
    },
    burning: {
      key: '9', name: 'バーニングレーンチェンジ', short: 'BLC', renderKind: 'burning', burning: true,
      w: 180, h: 144,
      geometry: {
        width: 180, height: 144, trackWidth: 36,
        centerlineRadius: 54, outerRadius: 72, innerRadius: 36,
        endpointX: -93, endpointY: 54,
        arcCenterX: 15,
        connectors: [{ x: -93, y: -54, heading: 180 }, { x: -93, y: 54, heading: 180 }],
        bounds: { minX: -93, maxX: 87, minY: -72, maxY: 72 }
      },
      visual: { file: 'assets/parts/burning-lc.png', canvasWidth: 180, canvasHeight: 144, originX: 93, originY: 72 },
      ...palette
    }
  };

  const MENU_ORDER = ['straight','corner45','lanechange','wave','start','slope','bank20','lcjump','burning'];

  window.M4WD_PART_CATALOG = Object.freeze({
    version: '1.3.0',
    TRACK_WIDTH_CM,
    STRAIGHT_CM,
    PARTS,
    MENU_ORDER
  });
})();
