const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = 'https://mini4wd-track-editor.pimentoso.com';
const CODE = 'TPB7W4';

function snippets(text, needle, radius = 180) {
  const out = [];
  let from = 0;
  while (out.length < 20) {
    const i = text.indexOf(needle, from);
    if (i < 0) break;
    out.push(text.slice(Math.max(0, i - radius), Math.min(text.length, i + needle.length + radius)).replace(/\s+/g, ' '));
    from = i + needle.length;
  }
  return out;
}

test('probe Pimentoso TPB7W4 public layout endpoints', async () => {
  const pageRes = await fetch(`${BASE}/${CODE}`, { redirect: 'follow' });
  console.log('PAGE', pageRes.status, pageRes.url);
  const html = await pageRes.text();
  console.log('HTML_LEN', html.length);
  console.log('HTML_CODE_SNIPS', snippets(html, CODE, 220));

  const pageCookie = pageRes.headers.get('set-cookie') || '';
  const loadRes = await fetch(`${BASE}/load/${CODE}.js`, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01',
      'Referer': `${BASE}/${CODE}`,
      ...(pageCookie ? { 'Cookie': pageCookie.split(';')[0] } : {})
    }
  });
  console.log('LOAD_STATUS', loadRes.status);
  const loadText = await loadRes.text();
  console.log('LOAD_BODY', loadText.slice(0, 50000));

  const apiRes = await fetch(`${BASE}/api/track/${CODE}`);
  console.log('API_STATUS', apiRes.status);
  const apiText = await apiRes.text();
  console.log('API_BODY', apiText.slice(0, 5000));

  const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  console.log('SCRIPTS', scriptSrcs);

  for (const src of scriptSrcs) {
    const url = new URL(src, BASE).href;
    if (!url.startsWith(BASE)) continue;
    const res = await fetch(url);
    const text = await res.text();
    const hits = [
      ...snippets(text, '/api/', 240),
      ...snippets(text, 'track_data', 240),
      ...snippets(text, 'trackData', 240),
      ...snippets(text, 'loadTrack', 240),
      ...snippets(text, 'pieces', 240),
      ...snippets(text, 'fabric', 240),
      ...snippets(text, 'canvas', 240),
      ...snippets(text, 'Str1', 1000),
      ...snippets(text, 'Cor1', 1000),
      ...snippets(text, 'Chi1', 1000),
      ...snippets(text, 'Lan1', 1000),
      ...snippets(text, 'Ban1', 1000),
      ...snippets(text, 'parseTrack', 1400),
      ...snippets(text, 'Sprite.extend', 1000)
    ];
    if (hits.length) {
      console.log('SCRIPT_HITS', url, hits.slice(0, 30));
    }
  }

  assert.equal(pageRes.ok, true);
  assert.equal(apiRes.ok, true);
});
