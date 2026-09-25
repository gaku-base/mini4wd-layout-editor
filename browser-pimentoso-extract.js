'use strict';

const fs = require('node:fs');
const { chromium } = require('playwright-core');

const CHROME_BIN = process.env.CHROME_BIN;
const TARGET = 'https://mini4wd-track-editor.pimentoso.com/TPB7W4';
const ARTIFACT_DIR = process.env.BROWSER_SMOKE_ARTIFACT_DIR || 'artifacts/browser-smoke';

async function main() {
  if (!CHROME_BIN) throw new Error('CHROME_BIN is required');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  const network = [];

  page.on('response', async response => {
    const url = response.url();
    const type = response.request().resourceType();
    if (/TPB7W4|\/api\/|track/i.test(url) || ['xhr','fetch'].includes(type)) {
      let text = '';
      try {
        const ct = response.headers()['content-type'] || '';
        if (/json|text|javascript/.test(ct)) text = (await response.text()).slice(0, 20000);
      } catch (_) {}
      network.push({ status: response.status(), type, url, text });
    }
  });

  try {
    const response = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('TARGET_STATUS', response?.status(), response?.url());

    await page.waitForTimeout(12000);

    for (const selector of ['button:has-text("Accept")', 'button:has-text("I agree")', '#onetrust-accept-btn-handler']) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.count() && await locator.isVisible()) await locator.click({ timeout: 1000 });
      } catch (_) {}
    }

    await page.waitForTimeout(1500);

    const direct = await page.evaluate(async () => {
      const urls = [
        '/api/track/TPB7W4',
        '/api/tracks/TPB7W4',
        '/tracks/TPB7W4.json',
        '/TPB7W4.json'
      ];
      const out = [];
      for (const url of urls) {
        try {
          const r = await fetch(url, { credentials: 'include' });
          out.push({ url, status: r.status, contentType: r.headers.get('content-type'), text: (await r.text()).slice(0, 30000) });
        } catch (error) {
          out.push({ url, error: String(error) });
        }
      }
      return out;
    });
    console.log('DIRECT_FETCH', JSON.stringify(direct));

    const inspect = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource').map(entry => entry.name);
      const scripts = [...document.scripts].map(script => script.src || '[inline]');
      const storage = {
        local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
        session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)]))
      };
      const globals = {};
      for (const key of Object.keys(window)) {
        if (!/(track|piece|layout|editor|course|circuit|canvas|paper|stage|layer|konva|fabric)/i.test(key)) continue;
        try {
          const value = window[key];
          let summary = { type: typeof value };
          if (Array.isArray(value)) summary = { type: 'array', length: value.length, sample: value.slice(0, 5) };
          else if (value && typeof value === 'object') summary = { type: 'object', keys: Object.keys(value).slice(0, 80) };
          else if (['string','number','boolean'].includes(typeof value)) summary.value = value;
          globals[key] = summary;
        } catch (_) {}
      }
      const html = document.documentElement.innerHTML;
      const idx = html.indexOf('TPB7W4');
      return {
        title: document.title,
        href: location.href,
        scripts,
        resources: resources.filter(url => /track|api|json|js/i.test(url)),
        storage,
        globals,
        htmlSnippet: idx >= 0 ? html.slice(Math.max(0, idx - 4000), idx + 10000) : html.slice(0, 12000),
        canvasCount: document.querySelectorAll('canvas').length,
        svgCount: document.querySelectorAll('svg').length,
        bodyText: document.body?.innerText?.slice(0, 12000) || ''
      };
    });

    console.log('INSPECT', JSON.stringify(inspect));
    console.log('NETWORK', JSON.stringify(network));

    await page.screenshot({ path: `${ARTIFACT_DIR}/pimentoso-TPB7W4.png`, fullPage: true });
    console.log('PIMENTOSO_EXTRACTION_DONE');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
