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
  assert.match(svg, /x1="0" y1="0" x2="1" y2="0"/);
  assert.match(svg, /stop-color="#000000" stop-opacity="0\.30"/);
  assert.match(svg, /stop-color="#ffffff" stop-opacity="0\.26"/);
  assert.match(svg, /href="slope\.png"/);
  assert.doesNotMatch(svg, /<text\b/i);
}

console.log('slope-gradient-visual tests: PASS');
