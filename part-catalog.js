(() => {
  'use strict';

  const mmToCm = value => Number(value) / 10;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  // Placement geometry authority.
  //
  // These values intentionally preserve the dimensions already used by the
  // editor. The project owner approved them on 2026-09-16 as the practical
  // molded-fit dimensions used for layout planning. Tamiya nominal dimensions
  // remain reference data below and do not overwrite this master automatically.
  //
  // Future physical calibration must update this one object first; PARTS is
  // derived from it so placement, connector geometry, visual bounds and current
  // 2D occupancy stay synchronized.
  const PART_DIMENSIONS_MM = deepFreeze({
    version: '2026-09-16-molded-fit-v1',
    basis: 'project-owner-approved-current-runtime-with-molding-tolerance',
    common: {
      runtimeTrackWidthMm: 360,
      connectionFaceOuterWidthMm: 370
    },
    straight: {
      lengthMm: 540,
      depthMm: 360
    },
    start: {
      lengthMm: 540,
      depthMm: 360
    },
    corner45: {
      visualWidthMm: 537.11688245,
      visualHeightMm: 493.44155877,
      visualOriginXMm: 222.837008,
      visualOriginYMm: 229.82286295,
      centerlineRadiusMm: 540,
      innerRadiusMm: 360,
      outerRadiusMm: 720,
      trackWidthMm: 360,
      angleDeg: 45,
      rightConnectorA: { xMm: -208.83700800371177, yMm: -35.8228629520206 },
      rightConnectorB: { xMm: 173.00065383702393, yMm: 122.33947520724378 }
    },
    lanechange: {
      lengthMm: 1620,
      depthMm: 360
    },
    wave: {
      lengthMm: 540,
      visualDepthMm: 420,
      trackWidthMm: 360,
      amplitudeMm: 40,
      centroidYMm: -20,
      connectorYMm: 20
    },
    slope: {
      horizontalSpanMm: 540,
      depthMm: 360,
      heightDeltaMm: 115
    },
    bank20: {
      connectorSpanMm: 230,
      depthMm: 360,
      bankAngleDeg: 20
    },
    lcjump: {
      lengthMm: 540,
      depthMm: 360
    },
    burning: {
      displayWidthMm: 1800,
      displayDepthMm: 1440,
      visualOriginXMm: 930,
      visualOriginYMm: 720,
      trackWidthMm: 360,
      centerlineRadiusMm: 540,
      innerRadiusMm: 360,
      outerRadiusMm: 720,
      endpointXMm: -930,
      endpointYMm: 540,
      arcCenterXMm: 150
    }
  });

  // Official nominal/published dimensions are references only. They are kept
  // separate because published drawings do not include every molded/joint
  // tolerance relevant to a real layout.
  const OFFICIAL_DIMENSION_REFERENCES_MM = deepFreeze({
    laneWidthMm: 115,
    fenceHeightMm: 50,
    curve90OuterMm: 717,
    curve180OuterWidthMm: 1434,
    slopeNominalDropMm: 110
  });

  const TRACK_WIDTH_CM = mmToCm(PART_DIMENSIONS_MM.common.runtimeTrackWidthMm);
  const STRAIGHT_CM = mmToCm(PART_DIMENSIONS_MM.straight.lengthMm);
  const STRAIGHT_CONNECTION_LENGTH_MM = PART_DIMENSIONS_MM.straight.lengthMm;
  const STRAIGHT_CONNECTION_WIDTH_MM = PART_DIMENSIONS_MM.common.connectionFaceOuterWidthMm;
  const OFFICIAL_JCJC_LANE_WIDTH_MM = OFFICIAL_DIMENSION_REFERENCES_MM.laneWidthMm;
  const OFFICIAL_JCJC_FENCE_HEIGHT_MM = OFFICIAL_DIMENSION_REFERENCES_MM.fenceHeightMm;
  const OFFICIAL_JCJC_CURVE_90_OUTER_MM = OFFICIAL_DIMENSION_REFERENCES_MM.curve90OuterMm;
  const OFFICIAL_JCJC_CURVE_180_OUTER_WIDTH_MM = OFFICIAL_DIMENSION_REFERENCES_MM.curve180OuterWidthMm;
  const DIMENSION_AUDIT_VERSION = '2026-09-16';
  const BANK20_PROJECTED_LENGTH_MM = PART_DIMENSIONS_MM.bank20.connectorSpanMm;
  const BANK20_PROJECTED_LENGTH_CM = mmToCm(BANK20_PROJECTED_LENGTH_MM);
  const BANK20_HALF_PROJECTED_LENGTH_CM = BANK20_PROJECTED_LENGTH_CM / 2;

  const palette = {
    base: '#efede9',
    lane: '#8d8c89',
    edge: '#858480',
    accent: '#e52f38'
  };

  // StartはStraightの派生であり、実寸・回転中心・コネクタ姿勢を同じ参照から使用する。
  const STRAIGHT_GEOMETRY = Object.freeze({
    width: mmToCm(PART_DIMENSIONS_MM.straight.lengthMm),
    height: mmToCm(PART_DIMENSIONS_MM.straight.depthMm),
    connectors: Object.freeze([
      Object.freeze({ id: 'a', label: '左端', x: -mmToCm(PART_DIMENSIONS_MM.straight.lengthMm) / 2, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }),
      Object.freeze({ id: 'b', label: '右端', x: mmToCm(PART_DIMENSIONS_MM.straight.lengthMm) / 2, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 })
    ]),
    bounds: Object.freeze({
      minX: -mmToCm(PART_DIMENSIONS_MM.straight.lengthMm) / 2,
      maxX: mmToCm(PART_DIMENSIONS_MM.straight.lengthMm) / 2,
      minY: -mmToCm(PART_DIMENSIONS_MM.straight.depthMm) / 2,
      maxY: mmToCm(PART_DIMENSIONS_MM.straight.depthMm) / 2
    })
  });

  // The start lane is straight-shaped, but its two ends have explicit traffic
  // roles.  Fast placement must use this semantic exit instead of relying on
  // connector array order or screen-space proximity.
  const START_GEOMETRY = Object.freeze({
    width: mmToCm(PART_DIMENSIONS_MM.start.lengthMm),
    height: mmToCm(PART_DIMENSIONS_MM.start.depthMm),
    connectors: Object.freeze([
      Object.freeze({ id: 'a', label: '入口（後方）', role: 'entry', x: -mmToCm(PART_DIMENSIONS_MM.start.lengthMm) / 2, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }),
      Object.freeze({ id: 'b', label: '出口（前方）', role: 'exit', x: mmToCm(PART_DIMENSIONS_MM.start.lengthMm) / 2, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 })
    ]),
    bounds: Object.freeze({
      minX: -mmToCm(PART_DIMENSIONS_MM.start.lengthMm) / 2,
      maxX: mmToCm(PART_DIMENSIONS_MM.start.lengthMm) / 2,
      minY: -mmToCm(PART_DIMENSIONS_MM.start.depthMm) / 2,
      maxY: mmToCm(PART_DIMENSIONS_MM.start.depthMm) / 2
    })
  });

  // geometry: 接続・当たり判定に使う実寸情報
  // visual: 表示画像／Canvas描画の登録枠。将来Canva画像へ差し替えてもgeometryは不変。
  const PARTS = {
    straight: {
      key: '1', name: 'ストレート', short: '直線', renderKind: 'straight',
      w: mmToCm(PART_DIMENSIONS_MM.straight.lengthMm), h: mmToCm(PART_DIMENSIONS_MM.straight.depthMm),
      geometry: STRAIGHT_GEOMETRY,
      visual: { file: 'assets/parts/straight.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.straight.lengthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.straight.depthMm), originX: mmToCm(PART_DIMENSIONS_MM.straight.lengthMm) / 2, originY: mmToCm(PART_DIMENSIONS_MM.straight.depthMm) / 2 },
      dimensionAudit: {
        placementSpanMm: { value: PART_DIMENSIONS_MM.straight.lengthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        runtimeFootprintMm: { width: PART_DIMENSIONS_MM.straight.lengthMm, depth: PART_DIMENSIONS_MM.straight.depthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' }
      },
      ...palette
    },
    'corner-45-right': {
      key: '2', name: 'コーナー（45度・右）', short: '45° R', renderKind: 'corner45', corner45: true, cornerVariant: 'right',
      w: mmToCm(PART_DIMENSIONS_MM.corner45.visualWidthMm), h: mmToCm(PART_DIMENSIONS_MM.corner45.visualHeightMm), radius: mmToCm(PART_DIMENSIONS_MM.corner45.centerlineRadiusMm), trackWidth: mmToCm(PART_DIMENSIONS_MM.corner45.trackWidthMm),
      geometry: { centerlineRadius: mmToCm(PART_DIMENSIONS_MM.corner45.centerlineRadiusMm), innerRadius: mmToCm(PART_DIMENSIONS_MM.corner45.innerRadiusMm), outerRadius: mmToCm(PART_DIMENSIONS_MM.corner45.outerRadiusMm), angleDeg: PART_DIMENSIONS_MM.corner45.angleDeg, pathOrientation: 'right', connectors: [{ id: 'a', label: '接続口A', x: mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorA.xMm), y: mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorA.yMm), localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '接続口B', x: mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorB.xMm), y: mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorB.yMm), localZMm: 0, heading: 45, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }] },
      visual: { file: 'assets/parts/corner45.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.corner45.visualWidthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.corner45.visualHeightMm), originX: mmToCm(PART_DIMENSIONS_MM.corner45.visualOriginXMm), originY: mmToCm(PART_DIMENSIONS_MM.corner45.visualOriginYMm) },
      dimensionAudit: {
        adoptedOuterRadiusMm: { value: PART_DIMENSIONS_MM.corner45.outerRadiusMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        officialAssembled90OuterMm: { value: OFFICIAL_DIMENSION_REFERENCES_MM.curve90OuterMm, status: 'verified', usage: 'reference-only', source: 'tamiya-circuits-data-pdf' },
        officialAssembled180OuterWidthMm: { value: OFFICIAL_DIMENSION_REFERENCES_MM.curve180OuterWidthMm, status: 'verified', usage: 'reference-only', source: 'tamiya-circuits-data-pdf' },
        localGeometry: { value: PART_DIMENSIONS_MM.corner45, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit', note: 'Current editor dimensions are the placement authority; official nominal aggregate values are reference-only.' }
      },
      ...palette
    },
    'corner-45-left': {
      key: '2', name: 'コーナー（45度・左）', short: '45° L', renderKind: 'corner45', corner45: true, cornerVariant: 'left',
      w: mmToCm(PART_DIMENSIONS_MM.corner45.visualWidthMm), h: mmToCm(PART_DIMENSIONS_MM.corner45.visualHeightMm), radius: mmToCm(PART_DIMENSIONS_MM.corner45.centerlineRadiusMm), trackWidth: mmToCm(PART_DIMENSIONS_MM.corner45.trackWidthMm),
      geometry: { centerlineRadius: mmToCm(PART_DIMENSIONS_MM.corner45.centerlineRadiusMm), innerRadius: mmToCm(PART_DIMENSIONS_MM.corner45.innerRadiusMm), outerRadius: mmToCm(PART_DIMENSIONS_MM.corner45.outerRadiusMm), angleDeg: PART_DIMENSIONS_MM.corner45.angleDeg, pathOrientation: 'left', connectors: [{ id: 'a', label: '接続口A', x: mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorA.xMm), y: -mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorA.yMm), localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '接続口B', x: mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorB.xMm), y: -mmToCm(PART_DIMENSIONS_MM.corner45.rightConnectorB.yMm), localZMm: 0, heading: 315, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }] },
      visual: { file: 'assets/parts/corner45.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.corner45.visualWidthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.corner45.visualHeightMm), originX: mmToCm(PART_DIMENSIONS_MM.corner45.visualOriginXMm), originY: mmToCm(PART_DIMENSIONS_MM.corner45.visualOriginYMm) },
      dimensionAudit: {
        adoptedOuterRadiusMm: { value: PART_DIMENSIONS_MM.corner45.outerRadiusMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        officialAssembled90OuterMm: { value: OFFICIAL_DIMENSION_REFERENCES_MM.curve90OuterMm, status: 'verified', usage: 'reference-only', source: 'tamiya-circuits-data-pdf' },
        officialAssembled180OuterWidthMm: { value: OFFICIAL_DIMENSION_REFERENCES_MM.curve180OuterWidthMm, status: 'verified', usage: 'reference-only', source: 'tamiya-circuits-data-pdf' },
        localGeometry: { value: PART_DIMENSIONS_MM.corner45, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit', note: 'Current editor dimensions are the placement authority; official nominal aggregate values are reference-only.' }
      },
      ...palette
    },
    lanechange: {
      key: '3', name: 'レーンチェンジ', short: 'LC', renderKind: 'lanechange', lanechange: true,
      w: mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm), h: mmToCm(PART_DIMENSIONS_MM.lanechange.depthMm),
      geometry: {
        width: mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm), height: mmToCm(PART_DIMENSIONS_MM.lanechange.depthMm),
        connectors: [{ x: -mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm) / 2, y: 0, heading: 180 }, { x: mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm) / 2, y: 0, heading: 0 }],
        connectorMetadata: [{ id: 'a', label: '左端', localZMm: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '右端', localZMm: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }],
        bounds: { minX: -mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm) / 2, maxX: mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm) / 2, minY: -mmToCm(PART_DIMENSIONS_MM.lanechange.depthMm) / 2, maxY: mmToCm(PART_DIMENSIONS_MM.lanechange.depthMm) / 2 }
      },
      visual: {
        file: 'assets/parts/lane-change.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.lanechange.depthMm),
        originX: mmToCm(PART_DIMENSIONS_MM.lanechange.lengthMm) / 2, originY: mmToCm(PART_DIMENSIONS_MM.lanechange.depthMm) / 2, profile: 'rc1-formal-v1'
      },
      dimensionAudit: {
        placementSpanMm: { value: PART_DIMENSIONS_MM.lanechange.lengthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        runtimeFootprintDepthMm: { value: PART_DIMENSIONS_MM.lanechange.depthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' }
      },
      ...palette
    },
    wave: {
      key: '4', name: 'ウェーブ', short: '波形', renderKind: 'wave', wave: true,
      w: mmToCm(PART_DIMENSIONS_MM.wave.lengthMm), h: mmToCm(PART_DIMENSIONS_MM.wave.visualDepthMm), trackWidth: mmToCm(PART_DIMENSIONS_MM.wave.trackWidthMm), amplitude: mmToCm(PART_DIMENSIONS_MM.wave.amplitudeMm),
      geometry: { width: mmToCm(PART_DIMENSIONS_MM.wave.lengthMm), trackWidth: mmToCm(PART_DIMENSIONS_MM.wave.trackWidthMm), amplitude: mmToCm(PART_DIMENSIONS_MM.wave.amplitudeMm), centroidY: mmToCm(PART_DIMENSIONS_MM.wave.centroidYMm), connectors: [{ id: 'a', label: '左端', x: -mmToCm(PART_DIMENSIONS_MM.wave.lengthMm) / 2, y: mmToCm(PART_DIMENSIONS_MM.wave.connectorYMm), localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '右端', x: mmToCm(PART_DIMENSIONS_MM.wave.lengthMm) / 2, y: mmToCm(PART_DIMENSIONS_MM.wave.connectorYMm), localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }], bounds: { minX: -mmToCm(PART_DIMENSIONS_MM.wave.lengthMm) / 2, maxX: mmToCm(PART_DIMENSIONS_MM.wave.lengthMm) / 2, minY: -mmToCm(PART_DIMENSIONS_MM.wave.visualDepthMm) / 2, maxY: mmToCm(PART_DIMENSIONS_MM.wave.visualDepthMm) / 2 } },
      visual: { file: 'assets/parts/wave.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.wave.lengthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.wave.visualDepthMm), originX: mmToCm(PART_DIMENSIONS_MM.wave.lengthMm) / 2, originY: mmToCm(PART_DIMENSIONS_MM.wave.visualDepthMm) / 2 },
      dimensionAudit: {
        runtimeFootprintMm: { width: PART_DIMENSIONS_MM.wave.lengthMm, depth: PART_DIMENSIONS_MM.wave.visualDepthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' }
      },
      ...palette
    },
    start: {
      key: '5', name: 'スタート', short: 'START', renderKind: 'start', special: 'start',
      w: mmToCm(PART_DIMENSIONS_MM.start.lengthMm), h: mmToCm(PART_DIMENSIONS_MM.start.depthMm),
      geometry: START_GEOMETRY,
      visual: { file: 'assets/parts/start.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.start.lengthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.start.depthMm), originX: mmToCm(PART_DIMENSIONS_MM.start.lengthMm) / 2, originY: mmToCm(PART_DIMENSIONS_MM.start.depthMm) / 2 },
      dimensionAudit: {
        placementSpanMm: { value: PART_DIMENSIONS_MM.start.lengthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        runtimeFootprintMm: { width: PART_DIMENSIONS_MM.start.lengthMm, depth: PART_DIMENSIONS_MM.start.depthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' }
      },
      ...palette, accent: '#e52f38'
    },
    slope: {
      key: '6', name: 'スロープ', short: '坂', renderKind: 'slope', slope: true,
      w: mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm), h: mmToCm(PART_DIMENSIONS_MM.slope.depthMm),
      geometry: { width: mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm), height: mmToCm(PART_DIMENSIONS_MM.slope.depthMm), connectors: [{ id: 'a', label: '低端', x: -mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm) / 2, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '高端', x: mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm) / 2, y: 0, localZMm: PART_DIMENSIONS_MM.slope.heightDeltaMm, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }], bounds: { minX: -mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm) / 2, maxX: mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm) / 2, minY: -mmToCm(PART_DIMENSIONS_MM.slope.depthMm) / 2, maxY: mmToCm(PART_DIMENSIONS_MM.slope.depthMm) / 2 } },
      visual: { file: 'assets/parts/slope.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.slope.depthMm), originX: mmToCm(PART_DIMENSIONS_MM.slope.horizontalSpanMm) / 2, originY: mmToCm(PART_DIMENSIONS_MM.slope.depthMm) / 2 },
      height: { startMm: 0, endMm: PART_DIMENSIONS_MM.slope.heightDeltaMm, maxMm: PART_DIMENSIONS_MM.slope.heightDeltaMm },
      dimensionAudit: {
        horizontalSpanMm: { value: PART_DIMENSIONS_MM.slope.horizontalSpanMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        heightDeltaMm: { value: PART_DIMENSIONS_MM.slope.heightDeltaMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        runtimeFootprintMm: { width: PART_DIMENSIONS_MM.slope.horizontalSpanMm, depth: PART_DIMENSIONS_MM.slope.depthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        tamiyaPublishedNominalDropMm: { value: OFFICIAL_DIMENSION_REFERENCES_MM.slopeNominalDropMm, status: 'verified', usage: 'reference-only', source: 'tamiya-item-95447', note: 'Published 11cm nominal copy does not overwrite the adopted 115mm molded-fit project dimension.' }
      },
      measurements: {
        floorBlockingSideWallLengthFromLowEndMm: {
          value: 270,
          status: 'verified',
          confidence: 'high',
          appliesTo: ['left', 'right'],
          source: 'project-owner-approved-2026-09-01'
        },
        sideWallHeightAboveRunningSurfaceMm: {
          value: 50,
          status: 'verified',
          confidence: 'high',
          appliesTo: ['left', 'right'],
          source: 'tamiya-official-and-project-owner-approved-2026-09-01'
        },
        sideWallThicknessMm: {
          value: 2.5,
          status: 'verified',
          confidence: 'high',
          appliesTo: ['left', 'right'],
          source: 'project-owner-approved-2026-09-01'
        },
        lowerLongitudinalCurveRadiusMm: {
          value: 398,
          status: 'verified',
          confidence: 'high',
          source: 'project-owner-approved-2026-09-01'
        },
        middleStraightLengthMm: {
          value: 169.10056179681956,
          status: 'verified',
          confidence: 'high',
          source: 'derived-from-approved-r398-r803-540-115-2026-09-01'
        },
        middleStraightAngleDeg: {
          value: 18.423741009432902,
          status: 'verified',
          confidence: 'high',
          source: 'derived-from-approved-r398-r803-540-115-2026-09-01'
        },
        upperLongitudinalCurveRadiusMm: {
          value: 803,
          status: 'verified',
          confidence: 'high',
          source: 'project-owner-approved-2026-09-01'
        },
        longitudinalProfileModule: {
          value: 'slope-longitudinal-profile.js',
          status: 'verified',
          confidence: 'high',
          source: 'project-owner-approved-2026-09-01'
        }
      },
      ...palette
    },
    bank20: {
      key: '7', name: '20度バンク入口／出口', short: '20°', renderKind: 'bank20', bank20: true,
      w: BANK20_PROJECTED_LENGTH_CM, h: mmToCm(PART_DIMENSIONS_MM.bank20.depthMm),
      geometry: { width: BANK20_PROJECTED_LENGTH_CM, height: mmToCm(PART_DIMENSIONS_MM.bank20.depthMm), connectors: [{ id: 'a', label: '平面側', x: -BANK20_HALF_PROJECTED_LENGTH_CM, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, bankTransitionToDeg: PART_DIMENSIONS_MM.bank20.bankAngleDeg, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: 'バンク側', x: BANK20_HALF_PROJECTED_LENGTH_CM, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: PART_DIMENSIONS_MM.bank20.bankAngleDeg, bankTransitionToDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }], bounds: { minX: -BANK20_HALF_PROJECTED_LENGTH_CM, maxX: BANK20_HALF_PROJECTED_LENGTH_CM, minY: -mmToCm(PART_DIMENSIONS_MM.bank20.depthMm) / 2, maxY: mmToCm(PART_DIMENSIONS_MM.bank20.depthMm) / 2 } },
      visual: { file: 'assets/parts/bank20.png', canvasWidth: BANK20_PROJECTED_LENGTH_CM, canvasHeight: mmToCm(PART_DIMENSIONS_MM.bank20.depthMm), originX: BANK20_HALF_PROJECTED_LENGTH_CM, originY: mmToCm(PART_DIMENSIONS_MM.bank20.depthMm) / 2 },
      bank: { angleDeg: PART_DIMENSIONS_MM.bank20.bankAngleDeg, dynamicRole: true },
      dimensionAudit: {
        projectedConnectorSpanMm: { value: PART_DIMENSIONS_MM.bank20.connectorSpanMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        runtimeFootprintMm: { width: PART_DIMENSIONS_MM.bank20.connectorSpanMm, depth: PART_DIMENSIONS_MM.bank20.depthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        bankAngleDeg: { value: PART_DIMENSIONS_MM.bank20.bankAngleDeg, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' }
      },
      measurements: {
        projectedLengthMm: {
          value: BANK20_PROJECTED_LENGTH_MM,
          status: 'verified',
          confidence: 'high',
          source: 'project-owner-approved-2026-09-04'
        },
        transitionArcChordMm: {
          value: 225.75,
          status: 'provisional',
          confidence: 'medium',
          source: 'agw-real-measurement-2021-02-22'
        },
        preferredRunningSideArcRadiusMm: {
          value: 650.02,
          status: 'provisional',
          confidence: 'medium',
          source: 'derived-from-official-20deg-and-agw-chord'
        }
      },
      ...palette
    },
    lcjump: {
      key: '8', name: 'LCジャンプ', short: 'JUMP', renderKind: 'lcjump', lcjump: true,
      w: mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm), h: mmToCm(PART_DIMENSIONS_MM.lcjump.depthMm),
      geometry: { width: mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm), height: mmToCm(PART_DIMENSIONS_MM.lcjump.depthMm), connectors: [{ id: 'a', label: '左端', x: -mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm) / 2, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '右端', x: mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm) / 2, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }], bounds: { minX: -mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm) / 2, maxX: mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm) / 2, minY: -mmToCm(PART_DIMENSIONS_MM.lcjump.depthMm) / 2, maxY: mmToCm(PART_DIMENSIONS_MM.lcjump.depthMm) / 2 } },
      visual: { file: 'assets/parts/lc-jump.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.lcjump.depthMm), originX: mmToCm(PART_DIMENSIONS_MM.lcjump.lengthMm) / 2, originY: mmToCm(PART_DIMENSIONS_MM.lcjump.depthMm) / 2 },
      dimensionAudit: {
        runtimeFootprintMm: { width: PART_DIMENSIONS_MM.lcjump.lengthMm, depth: PART_DIMENSIONS_MM.lcjump.depthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        constructionReference: { value: null, status: 'verified', usage: 'reference-only', source: 'tamiya-2015-station-championship-report', note: 'Tamiya describes LC Jump as using only the lane-change approach portion; the adopted placement dimensions remain the current project values.' }
      },
      ...palette
    },
    burning: {
      key: '9', name: 'バーニングレーンチェンジ', short: 'BLC', renderKind: 'burning', burning: true,
      w: mmToCm(PART_DIMENSIONS_MM.burning.displayWidthMm), h: mmToCm(PART_DIMENSIONS_MM.burning.displayDepthMm),
      geometry: {
        width: mmToCm(PART_DIMENSIONS_MM.burning.displayWidthMm), height: mmToCm(PART_DIMENSIONS_MM.burning.displayDepthMm), trackWidth: mmToCm(PART_DIMENSIONS_MM.burning.trackWidthMm),
        centerlineRadius: mmToCm(PART_DIMENSIONS_MM.burning.centerlineRadiusMm), outerRadius: mmToCm(PART_DIMENSIONS_MM.burning.outerRadiusMm), innerRadius: mmToCm(PART_DIMENSIONS_MM.burning.innerRadiusMm),
        endpointX: mmToCm(PART_DIMENSIONS_MM.burning.endpointXMm), endpointY: mmToCm(PART_DIMENSIONS_MM.burning.endpointYMm),
        arcCenterX: mmToCm(PART_DIMENSIONS_MM.burning.arcCenterXMm),
        connectors: [{ x: mmToCm(PART_DIMENSIONS_MM.burning.endpointXMm), y: -mmToCm(PART_DIMENSIONS_MM.burning.endpointYMm), heading: 180 }, { x: mmToCm(PART_DIMENSIONS_MM.burning.endpointXMm), y: mmToCm(PART_DIMENSIONS_MM.burning.endpointYMm), heading: 180 }],
        connectorMetadata: [{ id: 'a', label: '上端', localZMm: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }, { id: 'b', label: '下端', localZMm: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }],
        bounds: { minX: -mmToCm(PART_DIMENSIONS_MM.burning.visualOriginXMm), maxX: mmToCm(PART_DIMENSIONS_MM.burning.displayWidthMm - PART_DIMENSIONS_MM.burning.visualOriginXMm), minY: -mmToCm(PART_DIMENSIONS_MM.burning.visualOriginYMm), maxY: mmToCm(PART_DIMENSIONS_MM.burning.displayDepthMm - PART_DIMENSIONS_MM.burning.visualOriginYMm) }
      },
      visual: {
        file: 'assets/parts/burning-lc.png', canvasWidth: mmToCm(PART_DIMENSIONS_MM.burning.displayWidthMm), canvasHeight: mmToCm(PART_DIMENSIONS_MM.burning.displayDepthMm),
        originX: mmToCm(PART_DIMENSIONS_MM.burning.visualOriginXMm), originY: mmToCm(PART_DIMENSIONS_MM.burning.visualOriginYMm), profile: 'rc1-formal-v1'
      },
      dimensionAudit: {
        runtimeDisplayBoundsMm: { width: PART_DIMENSIONS_MM.burning.displayWidthMm, depth: PART_DIMENSIONS_MM.burning.displayDepthMm, status: 'verified', source: 'project-owner-approved-2026-09-16-molded-fit' },
        officialTypeReference: { value: 20, unit: 'deg', status: 'verified', usage: 'reference-only', source: 'tamiya-2016-spring-report' }
      },
      ...palette
    }
  };

  const MENU_ORDER = ['straight','corner-45-right','lanechange','wave','start','slope','bank20','lcjump','burning'];

  window.M4WD_PART_CATALOG = Object.freeze({
    version: '1.3.2',
    TRACK_WIDTH_CM,
    STRAIGHT_CM,
    STRAIGHT_CONNECTION_LENGTH_MM,
    STRAIGHT_CONNECTION_WIDTH_MM,
    PART_DIMENSIONS_MM,
    OFFICIAL_DIMENSION_REFERENCES_MM,
    OFFICIAL_JCJC_LANE_WIDTH_MM,
    OFFICIAL_JCJC_FENCE_HEIGHT_MM,
    OFFICIAL_JCJC_CURVE_90_OUTER_MM,
    OFFICIAL_JCJC_CURVE_180_OUTER_WIDTH_MM,
    DIMENSION_AUDIT_VERSION,
    BANK20_PROJECTED_LENGTH_MM,
    PARTS,
    MENU_ORDER
  });
})();