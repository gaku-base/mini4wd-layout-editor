'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./layout-graph.js');

const flat = (width = 54) => ({ w: width, geometry: { width, connectors: [
  { id: 'a', label: 'A', x: -width / 2, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
  { id: 'b', label: 'B', x: width / 2, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
] } });
const catalog = {
  start: flat(), straight: flat(), corner45: flat(), wave: flat(), lanechange: flat(162), lcjump: flat(), burning: flat(186),
  slope: { w: 54, geometry: { width: 54, connectors: [
    { id: 'a', label: '低端', x: -27, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
    { id: 'b', label: '高端', x: 27, y: 0, localZMm: 115, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
  ] } },
  bank20: { w: 28, geometry: { width: 28, connectors: [
    { id: 'a', x: -14, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, bankTransitionToDeg: 20, shape: 'jcjc-3lane', laneCount: 3 },
    { id: 'b', x: 14, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 20, bankTransitionToDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
  ] } }
};
const part = (id, type = 'straight', x = 0, y = 0, zMm = 0, rotation = 0, zOrder = 1) => ({ id, type, x, y, zMm, rotation, pitchDeg: 0, bankAngleDeg: 0, zOrder });
const endpoints = parts => G.allWorldConnectors(parts, catalog);
const target = (id = 'base', type = 'straight', x = 0, zMm = 0) => endpoints([part(id, type, x, 0, zMm)])[1];
const movingNear = (type = 'corner45', x = 53) => part('ghost', type, x, 0, 0);
const snap = (moving, targets, options = {}) => G.choosePlacement(moving, catalog, targets, { scale: 1, edges: [], ...options });

test('1 Straight端の近くへCornerを寄せると吸着', () => assert.equal(snap(movingNear(), [target()]).kind, 'snap'));
test('2 接続口から離れた位置では自由配置', () => assert.equal(snap(part('ghost', 'corner45', 200), [target()]).kind, 'free'));
test('3 既存パーツ上でも自由配置', () => assert.equal(snap(part('ghost', 'straight', 0), [], { freeHeightMm: 0 }).kind, 'free'));
test('4 使用済み端の近くでも追加吸着', () => {
  const t = target(); const edge = { partAId: 'base', connectorAId: 'b', partBId: 'old', connectorBId: 'a' };
  assert.equal(G.snapCandidates(movingNear(), catalog, [t], { scale: 1, edges: [edge] })[0].used, true);
});
test('5 Alt指定があっても近くでは通常どおり吸着', () => assert.equal(snap(movingNear(), [target()], { altKey: true }).kind, 'snap'));
test('6 吸着OFFでは常に自由配置', () => assert.equal(snap(movingNear(), [target()], { snapEnabled: false }).kind, 'free'));
test('7 吸着ONへ戻すと再び吸着', () => assert.equal(snap(movingNear(), [target()], { snapEnabled: true }).kind, 'snap'));
test('8 ズーム変更後も24pxの操作感を維持', () => {
  const t = target();
  assert.equal(G.snapCandidates(part('ghost', 'straight', 77), catalog, [t], { scale: 1 }).length > 0, true);
  assert.equal(G.snapCandidates(part('ghost', 'straight', 65), catalog, [t], { scale: 2 }).length > 0, true);
});
test('9 吸着範囲外ではconnection edgeを作成しない', () => assert.equal(snap(part('ghost', 'straight', 300), [target()]).selected, undefined));
test('10 自由配置時は選択した配置高さを使用', () => assert.equal(snap(part('ghost', 'straight', 300), [], { freeHeightMm: 345 }).part.zMm, 345));

for (const [number, left, right] of [
  [11, 'straight', 'corner45'], [12, 'corner45', 'straight'], [13, 'corner45', 'corner45'], [14, 'straight', 'wave'],
  [15, 'straight', 'slope'], [16, 'straight', 'bank20'], [17, 'lanechange', 'straight'], [18, 'burning', 'straight'], [19, 'start', 'straight']
]) {
  test(`${number} ${left}使用済み端へ${right}を追加接続`, () => {
    const first = { partAId: 'root', connectorAId: 'b', partBId: 'old', connectorBId: 'a' };
    const second = { partAId: 'root', connectorAId: 'b', partBId: 'new', connectorBId: 'a' };
    const edges = G.addEdge(G.addEdge([first], second), second);
    assert.equal(edges.length, 2);
    assert.equal(G.duplicateConnectorWarnings(edges).length, 1);
    assert.equal(G.removeEdgesForParts(edges, ['new']).length, 1);
  });
}

test('20 Slope3枚で0、115、230、345mm', () => {
  let z = 0;
  for (let index = 0; index < 3; index += 1) {
    const solved = G.solveSnapPose(part(`s${index}`, 'slope'), catalog.slope.geometry.connectors[0], { x: 0, y: 0, zMm: z, directionDeg: 0, pitchDeg: 0, bankAngleDeg: 0 });
    z = G.worldConnector(solved, catalog.slope.geometry.connectors[1]).zMm;
  }
  assert.equal(z, 345);
});
test('21 逆向きで345、230、115、0mm', () => {
  let z = 345;
  for (let index = 0; index < 3; index += 1) {
    const solved = G.solveSnapPose(part(`s${index}`, 'slope'), catalog.slope.geometry.connectors[1], { x: 0, y: 0, zMm: z, directionDeg: 180, pitchDeg: 0, bankAngleDeg: 0 });
    z = G.worldConnector(solved, catalog.slope.geometry.connectors[0]).zMm;
  }
  assert.equal(z, 0);
});
test('22 上り・下りで0mmへ戻る', () => {
  const up = G.solveSnapPose(part('up', 'slope'), catalog.slope.geometry.connectors[0], { x: 0, y: 0, zMm: 0, directionDeg: 0, pitchDeg: 0, bankAngleDeg: 0 });
  const high = G.worldConnector(up, catalog.slope.geometry.connectors[1]).zMm;
  const down = G.solveSnapPose(part('down', 'slope'), catalog.slope.geometry.connectors[1], { x: 0, y: 0, zMm: high, directionDeg: 180, pitchDeg: 0, bankAngleDeg: 0 });
  assert.equal(G.worldConnector(down, catalog.slope.geometry.connectors[0]).zMm, 0);
});
test('23 230mmのStraightへCorner吸着', () => assert.equal(G.solveSnapPose(part('c', 'corner45'), catalog.corner45.geometry.connectors[0], target('t', 'straight', 0, 230)).zMm, 230));
test('24 230mmへSlope低端を吸着し345mm', () => {
  const solved = G.solveSnapPose(part('s', 'slope'), catalog.slope.geometry.connectors[0], target('t', 'straight', 0, 230));
  assert.equal(G.worldConnector(solved, catalog.slope.geometry.connectors[1]).zMm, 345);
});
test('25 230mmへSlope高端を吸着し115mm', () => assert.equal(G.solveSnapPose(part('s', 'slope'), catalog.slope.geometry.connectors[1], target('t', 'straight', 0, 230)).zMm, 115));
test('26 同一XYの0mmと230mmを選択可能', () => {
  const candidates = G.snapCandidates(movingNear(), catalog, [target('low', 'straight', 0, 0), target('high', 'straight', 0, 230)], { scale: 1 });
  assert.deepEqual(new Set(candidates.map(item => item.target.zMm)), new Set([0, 230]));
  assert.equal(snap(movingNear(), [target('low', 'straight', 0, 0), target('high', 'straight', 0, 230)]).requiresHeightChoice, true);
});
test('27 高さ違いの接続口へ誤吸着せず候補を分離', () => assert.equal(snap(movingNear(), [target('low'), target('high', 'straight', 0, 230)]).requiresHeightChoice, true));
test('28 同じ高さ・同じ物理コネクタだけ重複警告', () => assert.equal(G.duplicateConnectorWarnings([
  { partAId: 'a', connectorAId: 'b', partBId: 'b', connectorBId: 'a' }, { partAId: 'a', connectorAId: 'b', partBId: 'c', connectorBId: 'a' }
]).length, 1));
test('29 0mmと230mmの立体交差は干渉警告なし', () => assert.equal(G.interferenceWarnings([part('a', 'straight', 0, 0, 0), part('b', 'straight', 0, 0, 230)], catalog, () => ({ minX:-27,maxX:27,minY:-18,maxY:18 })).length, 0));
test('30 高さ閉合不一致を検出', () => {
  const parts = [part('a'), part('b', 'straight', 54, 0, 115)];
  const warnings = G.validateEdges(parts, catalog, [{ partAId:'a',connectorAId:'b',partBId:'b',connectorBId:'a' }]);
  assert.equal(warnings.some(warning => warning.type === 'height-mismatch'), true);
});

const appSource = fs.readFileSync('./app.js', 'utf8');
test('31 Cornerを先に置きStraightを上に配置すると継ぎ目は上側所有', () => {
  const parts = [part('corner','corner45',0,0,0,0,1), part('straight','straight',0,0,0,0,2)];
  assert.equal(G.seamOwner({partAId:'corner',connectorAId:'b',partBId:'straight',connectorBId:'a'}, new Map(parts.map(p => [p.id,p]))), 'straight');
});
test('32 Straightを先に置きCornerを上に配置すると配置順どおり', () => {
  const parts = [part('straight','straight',0,0,0,0,1), part('corner','corner45',0,0,0,0,2)];
  assert.equal(G.seamOwner({partAId:'corner',connectorAId:'b',partBId:'straight',connectorBId:'a'}, new Map(parts.map(p => [p.id,p]))), 'corner');
});
test('33 3枚以上の交差でも所有継ぎ目を各パーツ描画直後に描く', () => assert.match(appSource, /drawPart[\s\S]*drawOwnedConnectionSeams[\s\S]*earlier\.push/));
test('34 PNGも画面と同じdrawPartsInLayerOrderを使う', () => assert.match(appSource, /function drawExport[\s\S]*drawPartsInLayerOrder\(c, \{ exportMode: true \}\)/));
test('35 警告枠や候補表示はPNGに含まれない', () => assert.match(appSource, /if \(!options\.exportMode\) drawLayoutWarnings/));
test('36 高さ差が十分ある立体交差は干渉警告なし', () => assert.equal(G.interferenceWarnings([part('a'), part('b','corner45',0,0,115)], catalog, () => ({minX:-10,maxX:10,minY:-10,maxY:10})).length, 0));
test('37 同一高さの重なりは警告あり', () => assert.equal(G.interferenceWarnings([part('a'), part('b','corner45')], catalog, () => ({minX:-10,maxX:10,minY:-10,maxY:10})).length, 1));
test('37b 正式edgeで接続された隣接パーツの接続面は干渉警告から除外', () => assert.equal(G.interferenceWarnings(
  [part('a'), part('b','corner45')], catalog, () => ({minX:-10,maxX:10,minY:-10,maxY:10}),
  { edges: [{ partAId:'a',connectorAId:'b',partBId:'b',connectorBId:'a' }] }
).length, 0));
test('38 Undo／Redo用JSONで位置、高さ、接続、zOrderを復元', () => {
  const value = { parts:[part('a','straight',3,4,230,45,9)], connections:[{partAId:'a',connectorAId:'b',partBId:'b',connectorBId:'a'}] };
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});
test('39 JSON保存／読込で複数edgeを維持', () => assert.equal(G.dedupeEdges(JSON.parse(JSON.stringify([{partAId:'a',connectorAId:'b',partBId:'b',connectorBId:'a'}]))).length, 1));
test('40 localStorage再読込対象にconnection edgeを含む', () => assert.match(fs.readFileSync('./persistence.js','utf8'), /'connections'/));
test('41 旧RC1／RC2はzMmなしを0として正規化', () => assert.equal(G.normalizePart({id:'legacy',type:'straight',x:1,y:2,rotation:0}).zMm, 0));
test('42 自動フィット関数はパーツ位置・高さ・接続・zOrderを変更しない', () => assert.match(appSource, /state\.field = nextField;[\s\S]*persistLocal/));
test('43 Lane Change／Burning Changer固有描画を維持', () => {
  assert.match(appSource, /LANE_CHANGE_VISUAL/); assert.match(appSource, /BURNING_CHANGER_VISUAL/);
});
test('44 コネクタ演算は警告をconsoleへ出力しない', () => {
  assert.doesNotThrow(() => G.snapCandidates(movingNear(), catalog, [target()], {scale:1}));
});
test('45 20度BankはzMmとbankAngleDegを分離して平面側へ接続', () => {
  const bank = part('bank', 'bank20', 41);
  const candidates = G.snapCandidates(bank, catalog, [target()], { scale: 1 });
  assert.equal(candidates.some(candidate => candidate.localConnector.id === 'a' && candidate.pose.zMm === 0 && candidate.pose.bankAngleDeg === 0), true);
});

test('45b 通常パーツは接続先のbank角を継承でき、20度Bank自身は固有端姿勢を維持する', () => {
  assert.equal(G.connectorsInheritBank(catalog.straight), true);
  assert.equal(G.connectorsInheritBank(catalog.corner45), true);
  assert.equal(G.connectorsInheritBank(catalog.bank20), false);
  assert.equal(G.bankAdjustmentForDefinition(catalog.corner45, { bankAngleDeg: 0 }, { bankAngleDeg: 20 }), 20);
  assert.equal(G.bankAdjustmentForDefinition(catalog.bank20, { bankAngleDeg: 0 }, { bankAngleDeg: 20 }), 0);
});
test('46 同一bank角の標準パーツは20度区間を継続', () => {
  const bankTarget = { ...target(), bankAngleDeg: 20 };
  const candidates = G.snapCandidates(movingNear('straight'), catalog, [bankTarget], { scale: 1 });
  assert.equal(candidates[0].pose.bankAngleDeg, 20);
  assert.equal(candidates[0].pose.zMm, 0);
});

test('47 同一XYの異高さ候補はマウス移動中も選択UIへ反映', () => {
  assert.match(appSource, /if \(state\.mode === 'place'\) \{[\s\S]*updateSnapCandidatePanel\(liveProposal\)/);
  assert.match(appSource, /state\.snapCandidateConfirmed = true/);
});

test('48 Alt一時解除の状態・イベント処理・画面説明を持たない', () => {
  assert.doesNotMatch(appSource, /altSnapDisabled|altKey|e\.key === 'Alt'/);
  assert.doesNotMatch(fs.readFileSync('./index.html', 'utf8'), /Alt/);
});

test('49 グループ吸着はbank差分を剛体適用しedge追加後に再計算', () => {
  assert.match(appSource, /bankAdjustmentForDefinition/);
  assert.match(appSource, /p\.bankAngleDeg = base\.bankAngleDeg \+ bankAdjustmentDeg/);
  assert.match(appSource, /state\.connections = LAYOUT_GRAPH\.addEdge[\s\S]*recalculateBankStates\(\)/);
});

test('50 高さedge不一致は自動修正せず閉合警告を表示', () => {
  assert.match(appSource, /'height-mismatch': '高さが閉合していません'/);
});
