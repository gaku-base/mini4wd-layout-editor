'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), 'utf8'));
}

test('typed domain tooling stays strict, pinned and isolated from production runtime', () => {
  const pkg = readJson('package.json');
  const tsconfig = readJson('tsconfig.json');
  const buildConfig = readJson('tsconfig.build.json');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');

  assert.equal(pkg.devDependencies.typescript, '5.9.2');
  assert.equal(pkg.scripts.typecheck, 'tsc -p tsconfig.json --pretty false');
  assert.equal(pkg.scripts.build, 'tsc -p tsconfig.build.json --pretty false');
  assert.match(pkg.scripts['check:typed'], /typecheck/);
  assert.match(pkg.scripts['check:typed'], /lint/);
  assert.match(pkg.scripts['check:typed'], /build/);

  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.deepEqual(tsconfig.include, ['src/domain/**/*.ts']);

  assert.equal(buildConfig.extends, './tsconfig.json');
  assert.equal(buildConfig.compilerOptions.rootDir, 'src/domain');
  assert.equal(buildConfig.compilerOptions.outDir, '.build-ts/domain');
  assert.equal(buildConfig.compilerOptions.noEmit, false);

  assert.match(gitignore, /^\.build-ts\/$/m);
  assert.doesNotMatch(indexHtml, /\.build-ts\//);
  assert.doesNotMatch(indexHtml, /src\/domain\//);
});

test('typed domain probe rejects numeric strings rather than coercing dimensions', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/domain/toolchain-probe.ts'), 'utf8');
  assert.match(source, /typeof candidate\.xMm === 'number'/);
  assert.match(source, /typeof candidate\.yMm === 'number'/);
  assert.match(source, /typeof candidate\.zMm === 'number'/);
  assert.doesNotMatch(source, /Number\(candidate\./);
});
