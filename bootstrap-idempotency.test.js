'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const WHEEL_SOURCE = fs.readFileSync('wheel-rotation.js', 'utf8');
const BOOTSTRAP_SOURCE = fs.readFileSync('editor-extensions-bootstrap.js', 'utf8');
const BASE_URI = 'https://example.test/editor/index.html';

class FakeElement {
  constructor(tagName, src = '') {
    this.tagName = String(tagName || '').toUpperCase();
    this.dataset = {};
    this.id = '';
    this.rel = '';
    this.href = '';
    this.hidden = false;
    this.textContent = '';
    this.async = true;
    this._src = src;
    this._listeners = new Map();
    this._attributes = new Map();
  }

  set src(value) {
    this._src = String(value || '');
  }

  get src() {
    return this._src;
  }

  getAttribute(name) {
    if (name === 'src') return this._src || null;
    return this._attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value));
  }

  addEventListener(type, handler, options = {}) {
    const entries = this._listeners.get(type) || [];
    entries.push({ handler, once: Boolean(options?.once) });
    this._listeners.set(type, entries);
  }

  dispatch(type) {
    const entries = [...(this._listeners.get(type) || [])];
    for (const entry of entries) {
      entry.handler({ type, target: this });
      if (entry.once) {
        const remaining = (this._listeners.get(type) || []).filter(item => item !== entry);
        this._listeners.set(type, remaining);
      }
    }
  }
}

function createDom(initialScriptSources = []) {
  const scripts = initialScriptSources.map(src => new FakeElement('script', src));
  const ids = new Map();
  const documentListeners = new Map();

  const appendChild = element => {
    if (element.tagName === 'SCRIPT' && !scripts.includes(element)) scripts.push(element);
    if (element.id) ids.set(element.id, element);
    return element;
  };

  const document = {
    baseURI: BASE_URI,
    readyState: 'loading',
    head: { appendChild },
    body: { appendChild },
    documentElement: { appendChild },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return ids.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === 'script[src]') return scripts.filter(script => Boolean(script.getAttribute('src')));
      return [];
    },
    querySelector(selector) {
      if (selector === 'script[src]') return scripts.find(script => Boolean(script.getAttribute('src'))) || null;
      return null;
    },
    addEventListener(type, handler, options = {}) {
      const entries = documentListeners.get(type) || [];
      entries.push({ handler, once: Boolean(options?.once) });
      documentListeners.set(type, entries);
    }
  };

  function fireDocument(type) {
    const entries = [...(documentListeners.get(type) || [])];
    for (const entry of entries) {
      entry.handler({ type, target: document });
      if (entry.once) {
        const remaining = (documentListeners.get(type) || []).filter(item => item !== entry);
        documentListeners.set(type, remaining);
      }
    }
  }

  function canonical(src) {
    const url = new URL(src, BASE_URI);
    return `${url.origin}${url.pathname}`;
  }

  function matching(src) {
    const target = canonical(src);
    return scripts.filter(script => canonical(script.getAttribute('src')) === target);
  }

  return { document, scripts, fireDocument, matching };
}

function createContext(dom) {
  return {
    document: dom.document,
    URL,
    location: { href: BASE_URI },
    console,
    setTimeout,
    clearTimeout
  };
}

function runBootstrap(dom, context = createContext(dom)) {
  vm.runInNewContext(BOOTSTRAP_SOURCE, context, { filename: 'editor-extensions-bootstrap.js' });
  return context;
}

function loadAllPendingScripts(dom, limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    const pending = dom.scripts.find(script => script.dataset.m4wdLoadState === 'loading');
    if (!pending) return;
    pending.dispatch('load');
  }
  throw new Error('script loading chain did not settle');
}

test('wheel bridge reuses an existing bootstrap script even when cache query and hash differ', () => {
  const dom = createDom(['editor-extensions-bootstrap.js?v=old-cache#legacy']);
  const context = createContext(dom);

  vm.runInNewContext(WHEEL_SOURCE, context, { filename: 'wheel-rotation.js' });

  assert.equal(dom.matching('editor-extensions-bootstrap.js?v=new-cache').length, 1);
  assert.equal(dom.matching('editor-extensions-bootstrap.js')[0].dataset.m4wdEditorExtensionsBootstrap, '1');
});

test('extension bootstrap reuses a statically loaded child script without a loader data marker', () => {
  const dom = createDom(['start-replacement-snap.js?v=older#cached']);
  runBootstrap(dom);
  dom.fireDocument('DOMContentLoaded');

  assert.equal(dom.matching('start-replacement-snap.js?v=v1.1-rc6-health1').length, 1);
  assert.equal(dom.matching('start-replacement-snap.js')[0].dataset.m4wdStartReplacementSnap, '1');
  assert.equal(dom.matching('marquee-target-preview.js').length, 1, 'boot should advance after an already-loaded static child');
});

test('two bootstrap evaluations before DOMContentLoaded append only one loading chain', () => {
  const dom = createDom();
  const context = createContext(dom);

  runBootstrap(dom, context);
  runBootstrap(dom, context);
  dom.fireDocument('DOMContentLoaded');

  const startScripts = dom.matching('start-replacement-snap.js');
  assert.equal(startScripts.length, 1);
  assert.equal(startScripts[0].dataset.m4wdLoadState, 'loading');

  startScripts[0].dispatch('load');
  startScripts[0].dispatch('load');
  assert.equal(dom.matching('marquee-target-preview.js').length, 1, 'load completion must advance exactly once');
});

test('bootstrap does not duplicate a static simple-ui script and load errors still advance the chain', () => {
  const dom = createDom(['simple-ui.js?v=previous-release#cached']);
  runBootstrap(dom);
  dom.fireDocument('DOMContentLoaded');

  const first = dom.matching('start-replacement-snap.js')[0];
  assert.ok(first, 'first dynamic extension should be requested');
  first.dispatch('error');
  assert.equal(dom.matching('marquee-target-preview.js').length, 1, 'an extension load error must not deadlock bootstrap');

  loadAllPendingScripts(dom);
  assert.equal(dom.matching('simple-ui.js?v=v1.1-rc6-health1').length, 1, 'static simple-ui must be reused across cache keys');
  assert.equal(dom.matching('ui-controls-cleanup.js').length, 1, 'boot should reach cleanup after reusing simple-ui');
});
