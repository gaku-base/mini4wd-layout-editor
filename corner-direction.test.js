'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const DIRECTION = require('./corner-direction.js');
const GRAPH = require('./layout-graph.js');

const appSource = fs.readFileSync('./app.js', 'utf8');
const catalogSource = fs.readFileSync('./part-catalog.js', 'utf8');
const persistenceSource = fs.readFileSync('./persistence.js', 'utf8');
const section = (from, to) => appSource.slice(appSource.indexOf(from), appSource.indexOf(to, appSource.indexOf(from)));
const corner = {
  turnDirections: ['right', 'left'],
  defaultTurnDirection: 'right',
  geometry: { connectors: [
    { id: 'a', x: -20.883700800371177, y: -3.58228629520206, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
    { id: 'b', x: 17.300065383702393, y: 12.233947520724378, localZMm: 0, heading: 45, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
  ] }
};
const straight = { geometry: { connectors: [
  { id: 'a', x: -27, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
  { id: 'b', x: 27, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
] } };
const catalog = { corner45: corner, straight };
const target = (heading = 0, zMm = 0, id = 'start') => ({ partId: id, connectorId: 'b', x: 0, y: 0, zMm, directionDeg: heading, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 });

function entryIndex(direction) {
  return DIRECTION.defaultEntryIndexForDirection(corner, direction);
}

function cornerPart(anchor, direction, index = entryIndex(direction), id = 'corner') {
  const pose = DIRECTION.poseForConnection(corner, anchor.directionDeg, direction, index);
  return {
    id, type: 'corner45', x: 0, y: 0, zMm: 0, rotation: pose.rotation, pitchDeg: 0, bankAngleDeg: 0,
    routeIndex: pose.entryIndex, entryConnectorId: pose.entryConnectorId, cornerMirror: pose.cornerMirror,
    handedness: pose.handedness, selectedHandedness: pose.handedness, candidateHandedness: pose.handedness
  };
}

function placeCorner(anchor, direction, index = entryIndex(direction), id = 'corner') {
  const pending = cornerPart(anchor, direction, index, id);
  const solved = GRAPH.solveSnapPose(pending, corner.geometry.connectors[index], anchor);
  const part = { ...solved, routeIndex: index, entryConnectorId: DIRECTION.entryConnectorId(corner, index), cornerMirror: pending.cornerMirror };
  const endpoints = GRAPH.allWorldConnectors([part], catalog);
  const exitIndex = DIRECTION.exitIndexForEntry(corner, index);
  return { part, entryIndex: index, exit: endpoints[exitIndex] };
}

function cornerChain(direction, count = 4, anchor = target()) {
  const parts = [];
  let next = anchor;
  for (let index = 0; index < count; index += 1) {
    const placed = placeCorner(next, direction, entryIndex(direction), `corner-${index + 1}`);
    parts.push(placed.part);
    next = placed.exit;
  }
  return { parts, exit: next };
}

function candidatesFor(direction, anchor = target()) {
  const ghost = cornerPart(anchor, direction);
  return GRAPH.snapCandidates(ghost, catalog, [anchor], {
    scale: 1,
    radiusPx: 1000,
    partForSnapCandidate: (_connector, index, snapTarget) => cornerPart(snapTarget, direction, index)
  });
}

function candidatePartFor(direction) {
  return (_connector, index, snapTarget, ghost) => {
    const pose = DIRECTION.poseForConnection(corner, snapTarget.directionDeg, direction, index);
    return {
      ...ghost,
      rotation: pose.rotation,
      routeIndex: pose.entryIndex,
      entryConnectorId: pose.entryConnectorId,
      cornerMirror: pose.cornerMirror,
      handedness: pose.handedness,
      selectedHandedness: pose.handedness,
      candidateHandedness: pose.handedness
    };
  };
}

function ghostAtEntry(anchor, direction, index, offset = {}) {
  const pending = cornerPart(anchor, direction, entryIndex(direction), 'ghost');
  const endpoint = GRAPH.worldConnector({ ...pending, x: 0, y: 0 }, corner.geometry.connectors[index], index);
  return {
    ...pending,
    x: anchor.x - endpoint.x + (offset.x || 0),
    y: anchor.y - endpoint.y + (offset.y || 0),
    zMm: anchor.zMm
  };
}

function automaticPlacement(direction, ghost, anchors, options = {}) {
  return GRAPH.choosePlacement(ghost, catalog, anchors, {
    scale: 1,
    radiusPx: 24,
    partForSnapDistanceCandidate: () => ghost,
    partForSnapCandidate: candidatePartFor(direction),
    ...options
  });
}

function endpointAtGhost(_direction, ghost, index) {
  return GRAPH.worldConnector(ghost, corner.geometry.connectors[index], index);
}

test('1. direction state is semantic right / left, not connector IDs', () => assert.deepEqual(DIRECTION.directionsForDefinition(corner), ['right', 'left']));
test('2. standard ghost direction is right', () => assert.equal(DIRECTION.defaultDirection(corner), 'right'));
test('3. right and left default entry indexes are distinct numbers', () => assert.deepEqual([entryIndex('right'), entryIndex('left')], [0, 1]));
test('4. connector IDs remain separate from handedness values', () => assert.deepEqual([DIRECTION.entryConnectorId(corner, 0), DIRECTION.entryConnectorId(corner, 1)], ['a', 'b']));
test('5. both entry indexes identify the opposite connector as exit', () => assert.deepEqual([DIRECTION.exitIndexForEntry(corner, 0), DIRECTION.exitIndexForEntry(corner, 1)], [1, 0]));
test('6. right via A uses the unmirrored physical shape', () => assert.equal(DIRECTION.mirrorForDirectionAndEntry(corner, 'right', 0), false));
test('7. right via B mirrors the physical shape without changing its semantic direction', () => assert.equal(DIRECTION.mirrorForDirectionAndEntry(corner, 'right', 1), true));
test('8. left via A mirrors the physical shape without changing its semantic direction', () => assert.equal(DIRECTION.mirrorForDirectionAndEntry(corner, 'left', 0), true));
test('9. left via B uses the unmirrored physical shape', () => assert.equal(DIRECTION.mirrorForDirectionAndEntry(corner, 'left', 1), false));

for (const [number, direction, index, expectedHeading] of [
  [10, 'right', 0, 45], [11, 'right', 1, 45], [12, 'left', 0, 315], [13, 'left', 1, 315]
]) {
  test(`${number}. ${direction} via ${index === 0 ? 'A' : 'B'} preserves the course-relative turn`, () => {
    const placed = placeCorner(target(), direction, index, `${direction}-${index}`);
    assert.equal(placed.exit.directionDeg, expectedHeading);
  });
}

test('14. right candidates include connector A', () => assert.equal(candidatesFor('right').some(candidate => candidate.entryConnectorId === 'a'), true));
test('15. right candidates include connector B', () => assert.equal(candidatesFor('right').some(candidate => candidate.entryConnectorId === 'b'), true));
test('16. left candidates include connector A', () => assert.equal(candidatesFor('left').some(candidate => candidate.entryConnectorId === 'a'), true));
test('17. left candidates include connector B', () => assert.equal(candidatesFor('left').some(candidate => candidate.entryConnectorId === 'b'), true));
test('18. both candidates snap at 0, 45, 90, and 180 degrees', () => {
  [0, 45, 90, 180].forEach(heading => {
    ['right', 'left'].forEach(direction => {
      assert.deepEqual(candidatesFor(direction, target(heading)).map(candidate => candidate.localConnectorIndex).sort(), [0, 1]);
    });
  });
});
test('19. both connectors inherit a 115mm target height', () => {
  ['right', 'left'].forEach(direction => [0, 1].forEach(index => assert.equal(placeCorner(target(0, 115), direction, index).part.zMm, 115)));
});
test('20. both connectors inherit a 230mm target height', () => {
  ['right', 'left'].forEach(direction => [0, 1].forEach(index => assert.equal(placeCorner(target(0, 230), direction, index).part.zMm, 230)));
});
test('21. four right corners produce a 180-degree turn', () => assert.equal(cornerChain('right').exit.directionDeg, 180));
test('22. four left corners produce a 180-degree turn', () => assert.equal(cornerChain('left').exit.directionDeg, 180));
test('23. right then left keeps left for the following confirmed corner', () => {
  const first = placeCorner(target(), 'right');
  const second = placeCorner(first.exit, 'left');
  const third = placeCorner(second.exit, 'left');
  assert.deepEqual([first.part.routeIndex, second.part.routeIndex, third.part.routeIndex], [0, 1, 1]);
});
test('24. snapping remains free outside the 24px range', () => {
  const ghost = cornerPart(target(), 'right');
  assert.equal(GRAPH.choosePlacement({ ...ghost, x: 300, y: 300 }, catalog, [target()], { scale: 1, radiusPx: 24 }).kind, 'free');
});
test('25. graph keeps all local connector candidates when no filter is requested', () => {
  const candidates = GRAPH.snapCandidates(cornerPart(target(), 'right'), catalog, [target()], {
    scale: 1, radiusPx: 1000,
    partForSnapCandidate: (_connector, index, snapTarget) => cornerPart(snapTarget, 'right', index)
  });
  assert.deepEqual(candidates.map(candidate => candidate.localConnectorIndex).sort(), [0, 1]);
});
test('26. partForSnapCandidate supplies an independently oriented ghost for each entry', () => {
  assert.match(fs.readFileSync('./layout-graph.js', 'utf8'), /partForSnapCandidate/);
  assert.match(section('function getPlacementProposal', 'function isPartInsideField'), /poseForConnection\(def, target\.directionDeg, selectedHandedness, entryIndex\)/);
});
test('27. app no longer filters a corner candidate down to one route index', () => {
  const proposal = section('function getPlacementProposal', 'function isPartInsideField');
  assert.doesNotMatch(proposal, /localConnectorIndexes/);
  assert.match(proposal, /entryConnectorId: chosen\.entryConnectorId/);
});
test('28. confirmed placement alone updates remembered handedness', () => {
  const placement = section('function placePartAtCursor', 'function recalculateBankStates');
  assert.match(placement, /state\.lastPlacedCornerHandedness = handedness/);
  assert.equal((appSource.match(/state\.lastPlacedCornerHandedness = handedness/g) || []).length, 1);
});
test('29. ghost changes and cancellation do not update remembered handedness', () => {
  const change = section('function setCornerGhostHandedness', 'function toggleCornerGhostHandedness');
  const cancel = section('function cancelCornerGhostDirection', 'const WAVE_PATH_SAMPLES');
  assert.doesNotMatch(change, /lastPlacedCornerHandedness\s*=/);
  assert.doesNotMatch(cancel, /lastPlacedCornerHandedness\s*=/);
});
test('30. JSON, localStorage, and history exclude session handedness but preserve placed geometry', () => {
  const serialization = section('function serializeState', 'function applySerialized');
  const restore = section('function applySerialized', 'function persistLocal');
  assert.doesNotMatch(serialization, /lastPlacedCornerHandedness|cornerGhostHandedness/);
  assert.doesNotMatch(restore, /lastPlacedCornerHandedness|cornerGhostHandedness/);
  assert.match(restore, /entryConnectorId/);
  assert.match(restore, /cornerMirror/);
  assert.match(persistenceSource, /entryConnectorId/);
});
test('31. catalog declares semantic directions without an a/b direction map', () => {
  assert.doesNotMatch(catalogSource, /turnDirections:\s*Object\.freeze\(\{\s*right:\s*'a'/);
  assert.match(catalogSource, /turnDirections:\s*Object\.freeze\(\['right', 'left'\]\)/);
});
test('32. mirrored connector geometry reverses local Y and heading only', () => {
  const mirrored = GRAPH.mirroredConnector(corner.geometry.connectors[1], true, 1);
  assert.deepEqual([mirrored.localX, mirrored.localY, mirrored.directionDeg], [17.300065383702393, -12.233947520724378, 315]);
});
test('33. Alt remains absent from corner snap behavior', () => {
  const relevant = [section('function freePlacement', 'function getPlacementProposal'), section('function placePartAtCursor', 'function recalculateBankStates')].join('\n');
  assert.doesNotMatch(relevant, /altKey|Alt/);
});
test('34. UI does not expose manual entry A/B selection', () => {
  const panel = section('function updateSnapCandidatePanel', 'function updatePlacementInstruction');
  assert.doesNotMatch(panel, /entryConnectorId|data-snap-candidate|入口/);
  assert.match(panel, /data-snap-target-key/);
});
test('35. automatic nearest selection reaches A and B for right and left corners', () => {
  ['right', 'left'].forEach(direction => {
    [0, 1].forEach(index => {
      const anchor = target(0, 0, `${direction}-${index}`);
      const placement = automaticPlacement(direction, ghostAtEntry(anchor, direction, index), [anchor]);
      assert.equal(placement.kind, 'snap');
      assert.equal(placement.selected.entryConnectorId, index === 0 ? 'a' : 'b');
    });
  });
});
test('36. nearest entry wins when both corner ends are within 24px', () => {
  const direction = 'right';
  const ghost = cornerPart(target(), direction);
  const a = endpointAtGhost(direction, ghost, 0);
  const b = endpointAtGhost(direction, ghost, 1);
  const nearA = { ...target(0, 0, 'target-a'), x: a.x + 4, y: a.y };
  const nearB = { ...target(0, 0, 'target-b'), x: b.x + 12, y: b.y };
  const placement = automaticPlacement(direction, ghost, [nearB, nearA]);
  assert.equal(placement.selected.entryConnectorId, 'a');
  assert.equal(placement.selected.target.partId, 'target-a');
});
test('37. equal-distance choices use a stable target then connector ordering', () => {
  const direction = 'left';
  const ghost = cornerPart(target(), direction);
  const a = endpointAtGhost(direction, ghost, 0);
  const b = endpointAtGhost(direction, ghost, 1);
  const sameDistanceA = { ...target(0, 0, 'anchor-a'), x: a.x + 8, y: a.y };
  const sameDistanceB = { ...target(0, 0, 'anchor-b'), x: b.x + 8, y: b.y };
  const placement = automaticPlacement(direction, ghost, [sameDistanceB, sameDistanceA]);
  assert.equal(placement.selected.target.partId, 'anchor-a');
  assert.equal(placement.selected.entryConnectorId, 'a');
});
test('38. moving from a free position to either end recalculates the entry', () => {
  const anchor = target();
  const free = automaticPlacement('right', { ...cornerPart(anchor, 'right'), x: 300, y: 300 }, [anchor]);
  const viaA = automaticPlacement('right', ghostAtEntry(anchor, 'right', 0), [anchor]);
  const viaB = automaticPlacement('right', ghostAtEntry(anchor, 'right', 1), [anchor]);
  assert.equal(free.kind, 'free');
  assert.deepEqual([viaA.selected.entryConnectorId, viaB.selected.entryConnectorId], ['a', 'b']);
});
test('39. a previous A selection cannot fix the next ghost to A', () => {
  const anchor = target();
  const viaA = automaticPlacement('left', ghostAtEntry(anchor, 'left', 0), [anchor]);
  const viaB = automaticPlacement('left', ghostAtEntry(anchor, 'left', 1), [anchor]);
  assert.equal(viaA.selected.entryConnectorId, 'a');
  assert.equal(viaB.selected.entryConnectorId, 'b');
  assert.equal(viaB.selectedTargetKey, GRAPH.snapTargetKey(viaB.selected));
});
test('40. automatic entry selection works at 0, 45, 90, and 180 degrees', () => {
  [0, 45, 90, 180].forEach(heading => {
    ['right', 'left'].forEach(direction => [0, 1].forEach(index => {
      const anchor = target(heading, 0, `h-${heading}-${direction}-${index}`);
      const placement = automaticPlacement(direction, ghostAtEntry(anchor, direction, index), [anchor]);
      assert.equal(placement.selected.entryConnectorId, index === 0 ? 'a' : 'b');
    }));
  });
});
test('41. automatic entry selection preserves 0, 115, and 230mm targets', () => {
  [0, 115, 230].forEach(zMm => ['right', 'left'].forEach(direction => [0, 1].forEach(index => {
    const anchor = target(0, zMm, `z-${zMm}-${direction}-${index}`);
    const placement = automaticPlacement(direction, ghostAtEntry(anchor, direction, index), [anchor]);
    assert.equal(placement.selected.entryConnectorId, index === 0 ? 'a' : 'b');
    assert.equal(placement.part.zMm, zMm);
  })));
});
test('42. used target connectors remain candidates for both automatic entries', () => {
  const anchor = target();
  [0, 1].forEach(index => {
    const placement = automaticPlacement('right', ghostAtEntry(anchor, 'right', index), [anchor], {
      edges: [{ partAId: 'other', connectorAId: 'a', partBId: anchor.partId, connectorBId: anchor.connectorId }]
    });
    assert.equal(placement.selected.entryConnectorId, index === 0 ? 'a' : 'b');
    assert.equal(placement.selected.used, true);
  });
});
test('43. multiple height targets keep their nearest entry while requiring a height choice', () => {
  const direction = 'right';
  const low = target(0, 0, 'low');
  const high = target(0, 115, 'high');
  const ghost = ghostAtEntry(low, direction, 1);
  const first = automaticPlacement(direction, ghost, [high, low]);
  assert.equal(first.requiresHeightChoice, true);
  assert.equal(first.selected.entryConnectorId, 'b');
  const selectedHigh = automaticPlacement(direction, ghost, [high, low], { selectedTargetKey: GRAPH.snapTargetKey(first.candidates.find(candidate => candidate.target.partId === 'high')) });
  assert.equal(selectedHigh.selected.target.partId, 'high');
  assert.equal(selectedHigh.selected.entryConnectorId, 'b');
});
test('44. app delegates selection to nearest target keys, not a retained candidate index', () => {
  const proposal = section('function getPlacementProposal', 'function isPartInsideField');
  const pointer = section('function onPointerMove', 'function onPointerUp');
  assert.match(proposal, /selectedTargetKey: state\.snapTargetChoiceKey/);
  assert.doesNotMatch(proposal, /candidateIndex|snapCandidateIndex/);
  assert.match(pointer, /clearSnapTargetChoice\(\)/);
});

function cornerExitTarget(direction, index = entryIndex(direction), zMm = 0) {
  const placed = placeCorner(target(0, zMm, `existing-${direction}-${index}`), direction, index, `existing-${direction}-${index}`);
  return { ...placed.exit, directionDeg: placed.exit.directionDeg };
}

function assertLockedSnap(direction, targetEndpoint, index) {
  const ghost = ghostAtEntry(targetEndpoint, direction, index);
  const placement = automaticPlacement(direction, ghost, [targetEndpoint]);
  assert.equal(placement.kind, 'snap', JSON.stringify(placement));
  const pose = placement.selected.pose;
  assert.equal(placement.selected.entryConnectorId, index === 0 ? 'a' : 'b');
  assert.equal(pose.handedness, direction);
  assert.equal(pose.selectedHandedness, direction);
  assert.equal(pose.candidateHandedness, direction);
  assert.equal(DIRECTION.handednessForEntryAndMirror(corner, index, pose.cornerMirror), direction);
  return placement;
}

test('45. pose keeps right/left separate from every A/B mirror combination', () => {
  ['right', 'left'].forEach(direction => [0, 1].forEach(index => {
    const pose = DIRECTION.poseForConnection(corner, 45, direction, index);
    assert.equal(pose.handedness, direction);
    assert.equal(pose.entryConnectorId, index === 0 ? 'a' : 'b');
    assert.equal(DIRECTION.handednessForEntryAndMirror(corner, index, pose.cornerMirror), direction);
  }));
});

test('46. left stays left when snapped from A or B to a straight', () => {
  [0, 1].forEach(index => assertLockedSnap('left', target(0, 0, `straight-left-${index}`), index));
});

test('47. right stays right when snapped from A or B to a straight', () => {
  [0, 1].forEach(index => assertLockedSnap('right', target(0, 0, `straight-right-${index}`), index));
});

test('48. left stays left when snapping to either handed corner exit', () => {
  ['right', 'left'].forEach(existingDirection => [0, 1].forEach(index => {
    assertLockedSnap('left', cornerExitTarget(existingDirection), index);
  }));
});

test('49. right stays right when snapping to either handed corner exit', () => {
  ['right', 'left'].forEach(existingDirection => [0, 1].forEach(index => {
    assertLockedSnap('right', cornerExitTarget(existingDirection), index);
  }));
});

test('50. direction lock remains valid at 0, 115, and 230mm corner targets', () => {
  [0, 115, 230].forEach(zMm => ['right', 'left'].forEach(direction => [0, 1].forEach(index => {
    const placement = assertLockedSnap(direction, cornerExitTarget(direction, entryIndex(direction), zMm), index);
    assert.equal(placement.part.zMm, zMm);
  })));
});

test('51. nearest reverse-looking endpoint cannot replace the selected handedness', () => {
  const anchor = cornerExitTarget('right');
  const placement = assertLockedSnap('left', anchor, 1);
  assert.equal(placement.selected.pose.candidateHandedness, 'left');
  assert.notEqual(placement.selected.pose.candidateHandedness, 'right');
});

test('52. a free corner keeps its selected handedness outside snap range', () => {
  const ghost = { ...cornerPart(target(), 'left'), x: 300, y: 300 };
  const placement = automaticPlacement('left', ghost, [target()]);
  assert.equal(placement.kind, 'free');
  assert.equal(ghost.handedness, 'left');
});

test('53. app locks candidate and applied handedness to the selected direction', () => {
  const proposal = section('function getPlacementProposal', 'function isPartInsideField');
  const placement = section('function placePartAtCursor', 'function recalculateBankStates');
  assert.match(proposal, /const selectedHandedness = hasCornerDirection/);
  assert.match(proposal, /CORNER_DIRECTION\.poseForConnection\(def, target\.directionDeg, selectedHandedness, entryIndex\)/);
  assert.match(proposal, /candidateHandedness !== selectedHandedness \|\| shapeHandedness !== selectedHandedness/);
  assert.doesNotMatch(proposal, /state\.cornerGhostHandedness\s*=/);
  assert.match(placement, /part\.cornerHandedness = CORNER_DIRECTION\.normalizeDirection/);
  assert.match(placement, /proposal\.appliedHandedness/);
});

test('54. saved part geometry keeps semantic handedness without restoring the session choice', () => {
  const restore = section('function applySerialized', 'function persistLocal');
  assert.match(restore, /handednessForEntryAndMirror/);
  assert.match(restore, /cornerHandedness/);
  assert.doesNotMatch(restore, /cornerGhostHandedness\s*=/);
  assert.doesNotMatch(restore, /lastPlacedCornerHandedness\s*=/);
});

function assertTargetTangentPose(direction, index, heading, zMm = 0, id = 'target-tangent') {
  const anchor = target(heading, zMm, id);
  const pose = DIRECTION.poseForConnection(corner, anchor.directionDeg, direction, index);
  const solved = GRAPH.solveSnapPose({
    id: 'candidate', type: 'corner45', x: 0, y: 0, zMm: 0,
    rotation: pose.rotation, candidateRotation: pose.candidateRotation,
    cornerMirror: pose.cornerMirror, pitchDeg: 0, bankAngleDeg: 0
  }, corner.geometry.connectors[index], anchor);
  const entry = GRAPH.worldConnector(solved, corner.geometry.connectors[index], index);
  assert.equal(pose.entryConnectorId, index === 0 ? 'a' : 'b');
  assert.equal(pose.handedness, direction);
  assert.equal(pose.targetTangent, heading);
  assert.equal(pose.rotation, pose.candidateRotation);
  assert.equal(pose.entryTangent, (heading + 180) % 360);
  assert.equal(solved.rotation, pose.candidateRotation);
  assert.equal(entry.directionDeg, (heading + 180) % 360);
  assert.equal(entry.x, anchor.x);
  assert.equal(entry.y, anchor.y);
  assert.equal(solved.zMm, zMm);
  assert.equal(DIRECTION.handednessForEntryAndMirror(corner, index, pose.cornerMirror), direction);
  return pose;
}

for (const direction of ['right', 'left']) {
  for (const index of [0, 1]) {
    for (const heading of [0, 45, 90, 180]) {
      test(`pose: ${direction} + entry ${index === 0 ? 'a' : 'b'} follows target tangent ${heading} degrees`, () => {
        assertTargetTangentPose(direction, index, heading, 0, `${direction}-${index}-${heading}`);
      });
    }
  }
}

test('pose: the same entry A has a distinct target-facing rotation at 0, 45, 90, and 180 degrees', () => {
  const rotations = [0, 45, 90, 180].map(heading => assertTargetTangentPose('right', 0, heading).candidateRotation);
  assert.equal(new Set(rotations).size, 4);
});

test('pose: the same entry B has a distinct target-facing rotation at 0, 45, 90, and 180 degrees', () => {
  const rotations = [0, 45, 90, 180].map(heading => assertTargetTangentPose('left', 1, heading).candidateRotation);
  assert.equal(new Set(rotations).size, 4);
});

test('pose: either entry supports both selected directions', () => {
  [0, 1].forEach(index => ['right', 'left'].forEach(direction => {
    assertTargetTangentPose(direction, index, 90, 0, `both-${direction}-${index}`);
  }));
});

test('pose: mirror is not fixed by entry connector alone', () => {
  [0, 1].forEach(index => {
    const right = assertTargetTangentPose('right', index, 0, 0, `right-${index}`);
    const left = assertTargetTangentPose('left', index, 0, 0, `left-${index}`);
    assert.notEqual(right.cornerMirror, left.cornerMirror);
  });
});

test('pose: 115mm and 230mm targets retain the independent entry transforms', () => {
  [115, 230].forEach(zMm => ['right', 'left'].forEach(direction => [0, 1].forEach(index => {
    assertTargetTangentPose(direction, index, 45, zMm, `height-${zMm}-${direction}-${index}`);
  })));
});

test('pose: a target-facing entry connects naturally to a corner exit', () => {
  ['right', 'left'].forEach(existingDirection => ['right', 'left'].forEach(direction => [0, 1].forEach(index => {
    const pose = assertTargetTangentPose(direction, index, cornerExitTarget(existingDirection).directionDeg, 0, `corner-${existingDirection}-${direction}-${index}`);
    assert.equal(pose.handedness, direction);
  })));
});

test('pose: straight, slope, and 20-degree bank tangents use the same target-facing calculation', () => {
  const targets = [
    { name: 'straight', heading: 0, zMm: 0 },
    { name: 'slope', heading: 90, zMm: 115 },
    { name: 'bank20', heading: 180, zMm: 230 }
  ];
  targets.forEach(value => {
    const pose = assertTargetTangentPose('right', 1, value.heading, value.zMm, value.name);
    assert.equal(pose.targetTangent, value.heading);
  });
});

test('pose: stale candidate rotations are discarded rather than reused for another target', () => {
  const pose = DIRECTION.poseForConnection(corner, 90, 'left', 0);
  const stale = GRAPH.solveSnapPose({
    id: 'stale', type: 'corner45', x: 0, y: 0, zMm: 0,
    rotation: pose.rotation, candidateRotation: (pose.candidateRotation + 45) % 360,
    cornerMirror: pose.cornerMirror, pitchDeg: 0, bankAngleDeg: 0
  }, corner.geometry.connectors[0], target(90));
  assert.equal(stale.rotation, pose.candidateRotation);
});

test('pose: app passes target tangent and candidate rotation into every corner snap candidate', () => {
  const proposal = section('function getPlacementProposal', 'function isPartInsideField');
  assert.match(proposal, /targetTangent: pose\.targetTangent/);
  assert.match(proposal, /candidateRotation: pose\.candidateRotation/);
  assert.match(appSource, /targetTangent: proposal\?\.targetTangent/);
  assert.match(appSource, /appliedRotation: proposal\?\.rotation/);
});

test('pose: target-facing transform is derived by candidate evaluation, not an entry-to-pose map', () => {
  const source = fs.readFileSync('./corner-direction.js', 'utf8');
  const poseSection = source.slice(source.indexOf('function poseForConnection'), source.indexOf('function rotationDeltaForDirectionChange'));
  assert.match(poseSection, /\[false, true\]\.map/);
  assert.match(poseSection, /rotationForEntryAndMirror/);
  assert.doesNotMatch(poseSection, /mirrorForDirectionAndEntry/);
});
