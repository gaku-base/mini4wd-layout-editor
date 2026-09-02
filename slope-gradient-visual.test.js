const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const visual = require('./slope-gradient-visual.js');

{
  const catalog = Object.freeze({
    PARTS: {
      slope: {
        visual: { file: 'assets/parts/slope.png' }
      }
    }
  });
  const result = visual.applySlopeGradientVisual(catalog);
  assert.equal(result.applied, true);
  assert.equal(result.reason, 'applied');
  assert.equal(catalog.PARTS.slope.visual.file, visual.TARGET_FILE);
}

{
  const catalog = Object.freeze({
    PARTS: {
      slope: {
        visual: Object.freeze({ file: 'assets/parts/slope.png' })
      }
    }
  });
  const result = visual.applySlopeGradientVisual(catalog);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'slope-visual-readonly');
  assert.equal(catalog.PARTS.slope.visual.file, 'assets/parts/slope.png');
}

{
  const result = visual.applySlopeGradientVisual(null);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'slope-visual-unavailable');
}

{
  const svg = fs.readFileSync(path.join(__dirname, 'assets/parts/slope-gradient.svg'), 'utf8');
  assert.match(svg, /linearGradient id="heightGradient"/);
  assert.match(svg, /gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="54" y2="0"/);
  assert.match(svg, /stop offset="0" stop-color="#1b7a5c"/);
  assert.match(svg, /stop offset="1" stop-color="#82ddb9"/);
  assert.match(svg, /<rect\b[^>]*fill="url\(#heightGradient\)"/);
  assert.match(svg, /M0 12H54M0 24H54/);
  assert.doesNotMatch(svg, /<image\b/i, 'gradient asset must be self-contained; nested raster images can disappear when drawn to Canvas');
  assert.doesNotMatch(svg, /\bhref=/i, 'gradient asset must not depend on an external image href');
  assert.doesNotMatch(svg, /<text\b/i);
}

console.log('slope-gradient-visual tests: PASS');
