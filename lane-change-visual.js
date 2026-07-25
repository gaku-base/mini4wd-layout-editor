(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_LANE_CHANGE_VISUAL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROFILE_VERSION = 'rc1-formal-v1';

  function createGeometry(width, trackWidth) {
    if (!Number.isFinite(width) || width <= 0) throw new Error('lane-change width must be positive');
    if (!Number.isFinite(trackWidth) || trackWidth <= 0) throw new Error('lane-change track width must be positive');

    const halfWidth = width / 2;
    const laneWidth = trackWidth / 3;
    const transitionHalfSpan = width * 5 / 18;
    const controlHalfSpan = transitionHalfSpan / 3;
    const guideOffset = laneWidth / 2;
    const bridgeOffset = laneWidth;

    const guide = (startY, endY) => ({
      start: { x: -halfWidth, y: startY },
      transitionStart: { x: -transitionHalfSpan, y: startY },
      control1: { x: -controlHalfSpan, y: startY },
      control2: { x: controlHalfSpan, y: endY },
      transitionEnd: { x: transitionHalfSpan, y: endY },
      end: { x: halfWidth, y: endY }
    });

    return Object.freeze({
      version: PROFILE_VERSION,
      width,
      trackWidth,
      laneWidth,
      connectors: Object.freeze([
        Object.freeze({ x: -halfWidth, y: 0, heading: 180 }),
        Object.freeze({ x: halfWidth, y: 0, heading: 0 })
      ]),
      guides: Object.freeze([
        Object.freeze(guide(-guideOffset, guideOffset)),
        Object.freeze(guide(guideOffset, -guideOffset))
      ]),
      bridge: Object.freeze({
        start: Object.freeze({ x: -transitionHalfSpan, y: bridgeOffset }),
        control1: Object.freeze({ x: -controlHalfSpan, y: bridgeOffset }),
        control2: Object.freeze({ x: controlHalfSpan, y: -bridgeOffset }),
        end: Object.freeze({ x: transitionHalfSpan, y: -bridgeOffset }),
        width: laneWidth,
        edgeWidth: laneWidth + 1.6,
        caps: Object.freeze([
          Object.freeze({
            start: Object.freeze({ x: -transitionHalfSpan, y: bridgeOffset - laneWidth / 2 }),
            end: Object.freeze({ x: -transitionHalfSpan, y: bridgeOffset + laneWidth / 2 })
          }),
          Object.freeze({
            start: Object.freeze({ x: transitionHalfSpan, y: -bridgeOffset - laneWidth / 2 }),
            end: Object.freeze({ x: transitionHalfSpan, y: -bridgeOffset + laneWidth / 2 })
          })
        ])
      }),
      support: Object.freeze([
        Object.freeze({ x: -laneWidth * .75, y: -trackWidth / 2 + .8 }),
        Object.freeze({ x: laneWidth * .45, y: -trackWidth / 2 + 1.8 }),
        Object.freeze({ x: laneWidth * .82, y: -laneWidth * .62 }),
        Object.freeze({ x: laneWidth * .30, y: trackWidth / 2 - .8 }),
        Object.freeze({ x: -laneWidth * .60, y: trackWidth / 2 - 1.8 }),
        Object.freeze({ x: -laneWidth * .90, y: laneWidth * .60 })
      ])
    });
  }

  return Object.freeze({ PROFILE_VERSION, createGeometry });
});
