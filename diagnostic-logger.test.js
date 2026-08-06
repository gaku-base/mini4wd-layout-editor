'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  SCHEMA_VERSION,
  createDiagnosticLogger,
  safeClone
} = require('./diagnostic-logger.js');

function clock(start = Date.parse('2026-08-06T06:00:00.000Z')) {
  let current = start;
  return {
    now: () => current,
    advance: milliseconds => { current += milliseconds; }
  };
}

test('infoログは単調増加sequence・ISO timestamp・elapsedMsを持つ', () => {
  const time = clock();
  const logger = createDiagnosticLogger({ now: time.now, random: () => 0.5 });
  time.advance(25);
  logger.logAction('layout-created', { width: 1000 }, { category: 'layout-space' });
  const payload = logger.exportDiagnosticLog();
  assert.deepEqual(payload.events.map(event => event.sequence), [1, 2]);
  assert.match(payload.events[1].timestamp, /^2026-08-06T06:00:00\.025Z$/);
  assert.equal(payload.events[1].elapsedMs, 25);
  assert.equal(payload.events[1].level, 'info');
  assert.equal(payload.events[1].category, 'layout-space');
});

test('errorログはErrorと直前操作を安全に記録する', () => {
  const logger = createDiagnosticLogger({ getState: ({ includeParts }) => ({ mode: 'place', includeParts }) });
  logger.logAction('part-selected', { type: 'straight' }, { category: 'course-part' });
  logger.logError(new TypeError('placement failed'), { phase: 'commit' });
  const error = logger.exportDiagnosticLog().events.at(-1);
  assert.equal(error.level, 'error');
  assert.equal(error.details.error.name, 'TypeError');
  assert.equal(error.details.error.message, 'placement failed');
  assert.equal(error.details.previousAction.event, 'part-selected');
  assert.equal(error.state.includeParts, true);
});

test('リングバッファは古いinfoを優先削除しerrorを可能な限り保持する', () => {
  const logger = createDiagnosticLogger({ maxEvents: 10 });
  logger.logError(new Error('keep-me'));
  for (let index = 0; index < 14; index += 1) logger.logAction(`action-${index}`);
  const events = logger.exportDiagnosticLog().events;
  assert.equal(events.length, 10);
  assert.ok(events.some(event => event.level === 'error' && event.details.error.message === 'keep-me'));
  assert.ok(!events.some(event => event.event === 'action-0'));
});

test('循環参照・巨大配列・長文を安全に制限する', () => {
  const circular = { label: 'x'.repeat(700), values: Array.from({ length: 60 }, (_, index) => index) };
  circular.self = circular;
  const cloned = safeClone(circular);
  assert.match(cloned.label, /\[truncated\]$/);
  assert.equal(cloned.self, '[Circular]');
  assert.equal(cloned.values.length, 31);
  assert.match(cloned.values.at(-1), /more items/);
});

test('unhandledrejection相当の理由を記録し解除できる', () => {
  const listeners = new Map();
  const target = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => { if (listeners.get(name) === handler) listeners.delete(name); }
  };
  const logger = createDiagnosticLogger();
  const detach = logger.attachGlobalErrorHandlers(target);
  const reason = { message: 'object rejection' };
  listeners.get('unhandledrejection')({ reason });
  assert.equal(logger.exportDiagnosticLog().events.at(-1).event, 'unhandled-rejection');
  assert.deepEqual(logger.exportDiagnosticLog().events.at(-1).details.error, reason);
  detach();
  assert.equal(listeners.size, 0);
});

test('window errorの位置情報を記録し絶対パスを除去する', () => {
  const listeners = new Map();
  const target = { addEventListener: (name, handler) => listeners.set(name, handler) };
  const logger = createDiagnosticLogger();
  logger.attachGlobalErrorHandlers(target);
  listeners.get('error')({ error: new Error('boom'), filename: 'C:\\Users\\name\\app.js', lineno: 42, colno: 7 });
  const entry = logger.exportDiagnosticLog().events.at(-1);
  assert.equal(entry.event, 'window-error');
  assert.equal(entry.details.context.filename, '[REDACTED_PATH]');
  assert.equal(entry.details.context.line, 42);
});

test('ロガー内部のstate取得失敗はアプリへ伝播しない', () => {
  const logger = createDiagnosticLogger({
    now: () => { throw new Error('clock failure'); },
    getState: () => { throw new Error('state failure'); }
  });
  assert.doesNotThrow(() => logger.logAction('safe-action', { value: 1 }));
  assert.doesNotThrow(() => logger.exportDiagnosticLog());
  logger.logError(new Error('capture state'));
  assert.equal(logger.exportDiagnosticLog().events.at(-1).state.captureFailed, true);
});

test('消去は新しいセッションとして初期化しsession-startを残す', () => {
  const time = clock();
  let randomValue = 0.1;
  const logger = createDiagnosticLogger({ now: time.now, random: () => randomValue });
  const before = logger.exportDiagnosticLog().metadata.sessionId;
  logger.logAction('before-clear');
  time.advance(1000);
  randomValue = 0.9;
  assert.equal(logger.clearDiagnosticLog(), true);
  const payload = logger.exportDiagnosticLog();
  assert.notEqual(payload.metadata.sessionId, before);
  assert.equal(payload.events.length, 2);
  assert.equal(payload.events[0].event, 'session-start');
  assert.equal(payload.events[0].sequence, 1);
  assert.equal(payload.events[1].event, 'diagnostic-log-cleared');
});

test('書き出しJSONはmetadata・summary・events構造を持つ', () => {
  const logger = createDiagnosticLogger({
    appVersion: '1.1 RC3',
    build: 'abc123',
    environment: { pathname: '/mini4wd-layout-editor/', viewport: { width: 1280, height: 720 } }
  });
  logger.logWarning('mode-conflict', { modes: ['start', 'interference'] }, { category: 'mode' });
  const payload = JSON.parse(JSON.stringify(logger.exportDiagnosticLog()));
  assert.equal(payload.metadata.schemaVersion, SCHEMA_VERSION);
  assert.equal(payload.metadata.appVersion, '1.1 RC3');
  assert.equal(payload.summary.warningCount, 1);
  assert.equal(payload.events.length, 2);
});

test('秘密情報・完全URL・IPアドレス・Windows絶対パスを記録しない', () => {
  const logger = createDiagnosticLogger();
  logger.logAction('privacy-check', {
    authorization: 'Bearer abc', cookie: 'session=abc', token: 'abc',
    localStorage: { layout: 'content' }, clipboard: 'copied',
    path: 'C:\\Users\\private\\layout.json', url: 'https://example.com/path?token=abc', ip: '192.168.0.2'
  });
  const text = JSON.stringify(logger.exportDiagnosticLog());
  for (const secret of ['Bearer abc', 'session=abc', 'https://example.com/path', '192.168.0.2', 'C:\\\\Users']) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.match(text, /\[REDACTED\]/);
});

test('回転ログはbefore・after・inputMethodを保持し高速wheelを集約する', () => {
  const time = clock();
  const logger = createDiagnosticLogger({ now: time.now });
  logger.logAction('unavailable-area-rotated', {
    inputMethod: 'wheel', beforeAngle: 0, afterAngle: 5, step: 5, targetId: 'area-1', targetType: 'unavailable-area'
  }, { category: 'transform', coalesceKey: 'rotate:area-1:wheel', coalesceWindowMs: 200 });
  time.advance(40);
  logger.logAction('unavailable-area-rotated', {
    inputMethod: 'wheel', beforeAngle: 5, afterAngle: 10, step: 5, targetId: 'area-1', targetType: 'unavailable-area'
  }, { category: 'transform', coalesceKey: 'rotate:area-1:wheel', coalesceWindowMs: 200 });
  const rotations = logger.exportDiagnosticLog().events.filter(event => event.event === 'unavailable-area-rotated');
  assert.equal(rotations.length, 1);
  assert.equal(rotations[0].details.beforeAngle, 0);
  assert.equal(rotations[0].details.afterAngle, 10);
  assert.equal(rotations[0].details.inputMethod, 'wheel');
  assert.equal(rotations[0].details.repeatCount, 2);
});

test('pointermove・mousemove・dragover・renderは記録しない', () => {
  const logger = createDiagnosticLogger();
  ['pointermove', 'mousemove', 'dragover', 'render', 'render-frame', 'scroll'].forEach(event => logger.logAction(event));
  assert.deepEqual(logger.exportDiagnosticLog().events.map(event => event.event), ['session-start']);
});

test('明示的logStateは完全state取得ではなく指定した簡易stateだけを記録する', () => {
  const logger = createDiagnosticLogger({ getState: () => ({ shouldNotAppear: true }) });
  logger.logState('mode-state', { currentMainMode: 'start', coursePartCount: 2 });
  const entry = logger.exportDiagnosticLog().events.at(-1);
  assert.deepEqual(entry.state, { currentMainMode: 'start', coursePartCount: 2 });
});

test('診断モジュールと折りたたみUIはapp.jsより前に読み込まれる', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /<details class="panel diagnostic-panel">[\s\S]*id="exportDiagnosticLogBtn"[\s\S]*id="clearDiagnosticLogBtn"/);
  assert.ok(html.indexOf('<script src="diagnostic-logger.js"></script>') < html.indexOf('<script src="app.js"></script>'));
});

test('アプリのwheel・Z・X回転入口がinputMethod付き診断ログへ接続される', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /rotateActiveVenueArea\([^\n]+, 'wheel'\)/);
  assert.match(app, /rotateActiveVenueArea\([^\n]+, 'keyboard-z'\)/);
  assert.match(app, /rotateActiveVenueArea\([^\n]+, 'keyboard-x'\)/);
  assert.match(app, /inputMethod, beforeAngle, afterAngle: rotation, step: Math\.abs\(delta\)/);
});

test('診断ログは既存レイアウト保存スキーマへ混入しない', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const serializeStart = app.indexOf('function serializeState()');
  const serializeEnd = app.indexOf('function migratedPartType', serializeStart);
  assert.ok(serializeStart >= 0 && serializeEnd > serializeStart);
  const serializeBody = app.slice(serializeStart, serializeEnd);
  assert.doesNotMatch(serializeBody, /diagnostic|logEvent|sessionId/i);
  const persistence = fs.readFileSync('persistence.js', 'utf8');
  assert.doesNotMatch(persistence, /diagnostic/i);
});

test('高頻度イベントはアプリ側から直接ロガーへ接続されない', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  for (const eventName of ['pointermove', 'mousemove', 'dragover', 'render-frame']) {
    assert.doesNotMatch(app, new RegExp(`logDiagnostic\\(['\"]${eventName}`));
  }
});
