(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_DIAGNOSTIC_LOGGER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = '1.0';
  const DEFAULT_MAX_EVENTS = 1000;
  const MAX_STRING_LENGTH = 500;
  const MAX_STACK_LENGTH = 4000;
  const MAX_ARRAY_LENGTH = 30;
  const MAX_OBJECT_KEYS = 50;
  const MAX_DEPTH = 5;
  const NOISY_EVENTS = new Set(['pointermove', 'mousemove', 'dragover', 'render', 'render-frame', 'scroll']);
  const SECRET_KEY = /(authorization|cookie|token|secret|password|passwd|credential|localstorage|sessionstorage|clipboard|filecontent|filecontents|query|hash)/i;
  const WINDOWS_PATH = /\b[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g;
  const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const FULL_URL = /\bhttps?:\/\/[^\s]+/gi;

  function truncate(value, limit = MAX_STRING_LENGTH) {
    const text = String(value ?? '');
    return text.length <= limit ? text : `${text.slice(0, limit)}…[truncated]`;
  }

  function sanitizeString(value, key = '') {
    const limit = /stack/i.test(key) ? MAX_STACK_LENGTH : MAX_STRING_LENGTH;
    return truncate(value, limit)
      .replace(WINDOWS_PATH, '[REDACTED_PATH]')
      .replace(FULL_URL, '[REDACTED_URL]')
      .replace(IPV4, '[REDACTED_IP]');
  }

  function sanitizeValue(value, options = {}, seen = new WeakSet(), depth = 0, key = '') {
    try {
      if (SECRET_KEY.test(key)) return '[REDACTED]';
      if (value == null || typeof value === 'boolean') return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
      if (typeof value === 'bigint') return String(value);
      if (typeof value === 'string') return sanitizeString(value, key);
      if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
      if (depth >= (options.maxDepth || MAX_DEPTH)) return '[MaxDepth]';
      if (typeof value !== 'object') return sanitizeString(value, key);
      if (seen.has(value)) return '[Circular]';
      seen.add(value);

      if (value instanceof Error || Object.prototype.toString.call(value) === '[object DOMException]') {
        return {
          name: sanitizeString(value.name || 'Error', 'name'),
          message: sanitizeString(value.message || String(value), 'message'),
          stack: sanitizeString(value.stack || '', 'stack')
        };
      }

      if (Array.isArray(value)) {
        const limit = Math.min(options.maxArrayLength || MAX_ARRAY_LENGTH, value.length);
        const result = value.slice(0, limit).map(item => sanitizeValue(item, options, seen, depth + 1));
        if (value.length > limit) result.push(`[${value.length - limit} more items]`);
        return result;
      }

      const result = {};
      const keys = Object.keys(value).slice(0, options.maxObjectKeys || MAX_OBJECT_KEYS);
      keys.forEach(property => {
        result[property] = sanitizeValue(value[property], options, seen, depth + 1, property);
      });
      if (Object.keys(value).length > keys.length) result._truncatedKeys = Object.keys(value).length - keys.length;
      return result;
    } catch (_) {
      return '[Unserializable]';
    }
  }

  function safeClone(value, options) {
    try {
      return sanitizeValue(value, options);
    } catch (_) {
      return '[Unserializable]';
    }
  }

  function safeIso(nowValue) {
    try {
      return new Date(nowValue).toISOString();
    } catch (_) {
      return new Date(0).toISOString();
    }
  }

  function makeSessionId(random = Math.random, nowValue = Date.now()) {
    try {
      return `diag-${Number(nowValue).toString(36)}-${Math.floor(random() * 0x100000000).toString(36)}`;
    } catch (_) {
      return `diag-${Number(nowValue).toString(36)}`;
    }
  }

  function createDiagnosticLogger(options = {}) {
    let events = [];
    let sequence = 0;
    let lastAction = null;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const maxEvents = Math.max(10, Math.min(10000, Number(options.maxEvents) || DEFAULT_MAX_EVENTS));
    let sessionStartedMs = safeNow();
    let sessionStartedAt = safeIso(sessionStartedMs);
    let sessionId = makeSessionId(random, sessionStartedMs);

    function safeNow() {
      try {
        const value = Number(now());
        return Number.isFinite(value) ? value : Date.now();
      } catch (_) {
        return Date.now();
      }
    }

    function stateSnapshot(context = {}) {
      try {
        if (typeof options.getState !== 'function') return null;
        return safeClone(options.getState(context));
      } catch (_) {
        return { captureFailed: true };
      }
    }

    function prune() {
      while (events.length > maxEvents) {
        let index = events.findIndex(entry => entry.level === 'info');
        if (index < 0) index = events.findIndex(entry => entry.level === 'warning');
        if (index < 0) index = 0;
        events.splice(index, 1);
      }
    }

    function record(level, category, eventName, details = {}, recordOptions = {}) {
      try {
        const normalizedEvent = truncate(eventName || 'unknown-event', 100).toLowerCase();
        if (NOISY_EVENTS.has(normalizedEvent)) return null;
        const timestampMs = safeNow();
        const coalesceKey = recordOptions.coalesceKey ? truncate(recordOptions.coalesceKey, 120) : null;
        const previous = coalesceKey ? events[events.length - 1] : null;
        const windowMs = Math.max(0, Number(recordOptions.coalesceWindowMs) || 180);
        if (previous?.coalesceKey === coalesceKey && timestampMs - previous._timestampMs <= windowMs) {
          previous.timestamp = safeIso(timestampMs);
          previous.elapsedMs = Math.max(0, timestampMs - sessionStartedMs);
          const mergedDetails = { ...previous.details, ...details };
          if (Object.prototype.hasOwnProperty.call(previous.details || {}, 'beforeAngle')) mergedDetails.beforeAngle = previous.details.beforeAngle;
          previous.details = safeClone({ ...mergedDetails, repeatCount: Number(previous.details?.repeatCount || 1) + 1 });
          previous.state = recordOptions.state === false
            ? null
            : Object.prototype.hasOwnProperty.call(recordOptions, 'stateValue')
              ? safeClone(recordOptions.stateValue)
              : recordOptions.captureState
                ? stateSnapshot(recordOptions.stateContext || {})
                : null;
          previous._timestampMs = timestampMs;
          lastAction = { event: previous.event, category: previous.category, timestamp: previous.timestamp };
          return publicEntry(previous);
        }
        const entry = {
          sequence: ++sequence,
          timestamp: safeIso(timestampMs),
          elapsedMs: Math.max(0, timestampMs - sessionStartedMs),
          level: ['info', 'warning', 'error'].includes(level) ? level : 'info',
          category: truncate(category || 'ui', 60),
          event: truncate(eventName || 'unknown-event', 100),
          details: safeClone(details),
          state: recordOptions.state === false
            ? null
            : Object.prototype.hasOwnProperty.call(recordOptions, 'stateValue')
              ? safeClone(recordOptions.stateValue)
              : recordOptions.captureState
                ? stateSnapshot(recordOptions.stateContext || {})
                : null,
          coalesceKey,
          _timestampMs: timestampMs
        };
        events.push(entry);
        prune();
        lastAction = { event: entry.event, category: entry.category, timestamp: entry.timestamp };
        return publicEntry(entry);
      } catch (_) {
        return null;
      }
    }

    function publicEntry(entry) {
      if (!entry) return null;
      const { _timestampMs, coalesceKey, ...result } = entry;
      return safeClone(result);
    }

    function logAction(eventName, details = {}, recordOptions = {}) {
      return record('info', recordOptions.category || 'ui', eventName, details, recordOptions);
    }

    function logWarning(eventName, details = {}, recordOptions = {}) {
      return record('warning', recordOptions.category || 'runtime', eventName, details, recordOptions);
    }

    function logError(error, context = {}, recordOptions = {}) {
      return record('error', recordOptions.category || 'runtime', recordOptions.eventName || 'runtime-error', {
        error: safeClone(error),
        context: safeClone(context),
        previousAction: safeClone(lastAction)
      }, { ...recordOptions, captureState: true, stateContext: { includeParts: true } });
    }

    function getDiagnosticLogSummary() {
      try {
        const visible = events.map(publicEntry);
        const infoCount = visible.filter(entry => entry.level === 'info').length;
        const warningCount = visible.filter(entry => entry.level === 'warning').length;
        const errorCount = visible.filter(entry => entry.level === 'error').length;
        const last = visible[visible.length - 1];
        return {
          totalEvents: visible.length,
          infoCount,
          warningCount,
          errorCount,
          firstEventAt: visible[0]?.timestamp || null,
          lastEventAt: last?.timestamp || null,
          durationMs: last?.elapsedMs || 0,
          recentActions: visible.filter(entry => entry.level === 'info').slice(-12).map(entry => ({
            sequence: entry.sequence, timestamp: entry.timestamp, category: entry.category, event: entry.event
          })),
          currentState: stateSnapshot({})
        };
      } catch (_) {
        return { totalEvents: 0, infoCount: 0, warningCount: 0, errorCount: 0, recentActions: [], currentState: null };
      }
    }

    function metadata(summary) {
      const environment = safeClone(options.environment || {});
      return safeClone({
        schemaVersion: SCHEMA_VERSION,
        appVersion: options.appVersion || 'unknown',
        build: options.build || null,
        sessionId,
        sessionStartedAt,
        userAgent: environment.userAgent || null,
        language: environment.language || null,
        viewport: environment.viewport || null,
        devicePixelRatio: environment.devicePixelRatio || null,
        pathname: environment.pathname || null,
        logLimit: maxEvents,
        eventCount: summary.totalEvents,
        errorCount: summary.errorCount,
        warningCount: summary.warningCount
      });
    }

    function exportDiagnosticLog() {
      try {
        const summary = getDiagnosticLogSummary();
        return { metadata: metadata(summary), summary, events: events.map(publicEntry) };
      } catch (error) {
        return {
          metadata: { schemaVersion: SCHEMA_VERSION, sessionId, exportFailed: true },
          summary: { totalEvents: 0, errorCount: 1 },
          events: [{ level: 'error', category: 'export', event: 'diagnostic-export-fallback', details: safeClone(error), state: null }]
        };
      }
    }

    function clearDiagnosticLog() {
      try {
        events = [];
        sequence = 0;
        lastAction = null;
        sessionStartedMs = safeNow();
        sessionStartedAt = safeIso(sessionStartedMs);
        sessionId = makeSessionId(random, sessionStartedMs);
        record('info', 'session', 'session-start', { reason: 'log-cleared' }, { state: false });
        record('info', 'export', 'diagnostic-log-cleared', {}, { state: false });
        return true;
      } catch (_) {
        return false;
      }
    }

    function attachGlobalErrorHandlers(target) {
      try {
        if (!target?.addEventListener) return function () {};
        const onError = event => logError(event?.error || event?.message || 'window error', {
          filename: event?.filename || null,
          line: event?.lineno || null,
          column: event?.colno || null,
          eventContext: 'window.error'
        }, { eventName: 'window-error' });
        const onRejection = event => logError(event?.reason ?? 'unhandled rejection', {
          eventContext: 'window.unhandledrejection'
        }, { eventName: 'unhandled-rejection' });
        target.addEventListener('error', onError);
        target.addEventListener('unhandledrejection', onRejection);
        return function detach() {
          try {
            target.removeEventListener?.('error', onError);
            target.removeEventListener?.('unhandledrejection', onRejection);
          } catch (_) {}
        };
      } catch (_) {
        return function () {};
      }
    }

    record('info', 'session', 'session-start', { schemaVersion: SCHEMA_VERSION }, { state: false });

    return Object.freeze({
      logAction,
      logState(eventName, suppliedState, recordOptions = {}) {
        try {
          return record('info', recordOptions.category || 'state', eventName, {}, { ...recordOptions, stateValue: suppliedState });
        } catch (_) { return null; }
      },
      logWarning,
      logError,
      exportDiagnosticLog,
      clearDiagnosticLog,
      getDiagnosticLogSummary,
      attachGlobalErrorHandlers
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    DEFAULT_MAX_EVENTS,
    createDiagnosticLogger,
    safeClone
  });
});
