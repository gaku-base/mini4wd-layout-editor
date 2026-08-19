const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('generate focused part-shaped guide app blob', () => {
  let source = fs.readFileSync('app.js', 'utf8');

  const insertionMarker = '\n  function drawPartSelectionEffect(c, type, stroke, fill, dashed = false, resolvedDef = PARTS[type]) {';
  const helper = `

  function drawPartDashedOutline(c, part, stroke, options = {}) {
    if (!part || !PARTS[part.type]) return false;
    const unit = Math.max(state.view.scale, .15);
    const lineWidthPx = Number.isFinite(Number(options.lineWidthPx)) ? Number(options.lineWidthPx) : 2;
    const dashPx = Number.isFinite(Number(options.dashPx)) ? Number(options.dashPx) : 6;
    const gapPx = Number.isFinite(Number(options.gapPx)) ? Number(options.gapPx) : 4;
    c.save();
    c.translate(part.x, part.y);
    c.rotate((Number(part.rotation) || 0) * Math.PI / 180);
    const traced = tracePartShapePath(c, part.type);
    if (traced) {
      c.strokeStyle = stroke;
      c.lineWidth = lineWidthPx / unit;
      c.lineJoin = 'round';
      c.setLineDash([dashPx / unit, gapPx / unit]);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();
    return traced;
  }
`;
  assert.equal(source.includes('function drawPartDashedOutline('), false);
  assert.equal(source.includes(insertionMarker), true);
  source = source.replace(insertionMarker, helper + insertionMarker);

  const startEnd = `    c.restore();
    drawPartConnectionFaces(c, { ...start, id: 'start', type: 'start' }, { ...options, exportMode });
`;
  const startEndReplacement = `    if (options.selected && !exportMode) {
      drawPartSelectionEffect(c, 'start', '#46bfff', 'rgba(70,191,255,.10)', true, START_DEF);
    }
    c.restore();
    drawPartConnectionFaces(c, { ...start, id: 'start', type: 'start' }, { ...options, exportMode });
`;
  assert.equal(source.split(startEnd).length - 1, 1);
  source = source.replace(startEnd, startEndReplacement);

  const startAabbGuide = `      const bounds = startBounds(candidate);
      c.save();
      c.strokeStyle = validity.valid ? '#249b74' : '#de3445';
      c.lineWidth = 2 / state.view.scale;
      c.setLineDash([6 / state.view.scale, 4 / state.view.scale]);
      c.strokeRect(bounds.minX, bounds.minY, bounds.w, bounds.h);
      c.setLineDash([]);
      c.restore();
`;
  const startShapeGuide = `      drawPartDashedOutline(
        c,
        { ...candidate, type: 'start' },
        validity.valid ? '#249b74' : '#de3445'
      );
`;
  assert.equal(source.split(startAabbGuide).length - 1, 1);
  source = source.replace(startAabbGuide, startShapeGuide);

  const normalGhost = `        drawPart(c, ghostPart);
        c.restore();
        drawConnectionGuide(c, proposal);
`;
  const normalGhostReplacement = `        drawPart(c, ghostPart);
        c.restore();
        drawPartDashedOutline(
          c,
          ghostPart,
          proposal.outOfBounds ? '#f07818' : (proposal.valid ? '#249b74' : '#de4b5b')
        );
        drawConnectionGuide(c, proposal);
`;
  assert.equal(source.split(normalGhost).length - 1, 1);
  source = source.replace(normalGhost, normalGhostReplacement);

  assert.equal(source.includes('const bounds = startBounds(candidate);'), false);
  assert.match(source, /drawPartDashedOutline\(\s*c,\s*\{ \.\.\.candidate, type: 'start' \}/s);
  assert.match(source, /drawPartDashedOutline\(\s*c,\s*ghostPart,/s);

  const temp = path.join(os.tmpdir(), 'mini4wd-part-guide-patched-app.js');
  fs.writeFileSync(temp, source, 'utf8');
  execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' });

  const encoded = Buffer.from(source, 'utf8').toString('base64');
  const chunkSize = 10000;
  const chunks = Math.ceil(encoded.length / chunkSize);
  console.log(`PATCHED_APP_BASE64_META bytes=${Buffer.byteLength(source)} chars=${encoded.length} chunks=${chunks}`);
  for (let index = 0; index < chunks; index += 1) {
    const chunk = encoded.slice(index * chunkSize, (index + 1) * chunkSize);
    console.log(`PATCHED_APP_BASE64_${String(index).padStart(3, '0')}=${chunk}`);
  }
  console.log('PATCHED_APP_BASE64_END');
});
