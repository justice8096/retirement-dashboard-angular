#!/usr/bin/env tsx
/**
 * Pure-function test runner for `src/app/lib/text-escape.ts`. Uses Node's
 * built-in `node:test` + `node:assert` + tsx for native TS imports.
 * Runs in <1 second; zero browser boot, zero Angular harness.
 *
 * Why tsx + node:test instead of Karma/Jasmine? Karma boots a headless
 * browser per run — overkill for pure functions with no DOM or Angular
 * dependency. This script mirrors `check:readability` in style and
 * doesn't require Angular's TestBed.
 *
 * Usage: `npm run test:pure`
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
// Project root `package.json` has no `"type": "module"`, so tsx compiles
// `.ts` source as CommonJS and named ESM exports collapse into a default
// namespace. Destructure from default to keep the test API clean without
// changing the project-wide module type.
import textEscape from '../src/app/lib/text-escape';
const { escHtml, escYaml, parseSpeedToMbps } = textEscape as unknown as {
  escHtml: (s: string | number | undefined | null) => string;
  escYaml: (s: string) => string;
  parseSpeedToMbps: (raw: string | undefined | null) => number;
};

// ─── escHtml ────────────────────────────────────────────────────────────
test('escHtml: plain string passes through', () => {
  assert.equal(escHtml('Abruzzo, Italy'), 'Abruzzo, Italy');
});

test('escHtml: ampersand encoded', () => {
  assert.equal(escHtml('A & B'), 'A &amp; B');
});

test('escHtml: XSS <script> neutralized', () => {
  assert.equal(
    escHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

test('escHtml: all five entities escaped', () => {
  assert.equal(escHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('escHtml: null/undefined → empty string', () => {
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
});

test('escHtml: number coerced to string', () => {
  assert.equal(escHtml(42), '42');
});

test('escHtml: double-escape behavior documented (not idempotent)', () => {
  // Caller must not escape twice. Documenting expected behavior as a test.
  assert.equal(escHtml('&amp;'), '&amp;amp;');
});

// ─── escYaml ────────────────────────────────────────────────────────────
test('escYaml: simple string unchanged', () => {
  assert.equal(escYaml('Lisbon'), 'Lisbon');
});

test('escYaml: colon triggers quoting', () => {
  assert.equal(escYaml('Time: 12:30'), '"Time: 12:30"');
});

test('escYaml: double-quote escaped inside quoted scalar', () => {
  assert.equal(escYaml('She said "hi"'), '"She said \\"hi\\""');
});

test('escYaml: backslash escaped first (order matters)', () => {
  assert.equal(escYaml('path\\to\\file: x'), '"path\\\\to\\\\file: x"');
});

test('escYaml: embedded newline escaped to \\n', () => {
  assert.equal(escYaml('line1\nline2'), '"line1\\nline2"');
});

test('escYaml: embedded carriage return escaped to \\r', () => {
  assert.equal(escYaml('a\rb'), '"a\\rb"');
});

test('escYaml: leading whitespace triggers quoting', () => {
  assert.equal(escYaml('  indented'), '"  indented"');
});

test('escYaml: trailing whitespace triggers quoting', () => {
  assert.equal(escYaml('trailing   '), '"trailing   "');
});

test('escYaml: brackets trigger quoting', () => {
  assert.equal(escYaml('array[0]'), '"array[0]"');
  assert.equal(escYaml('obj{x}'), '"obj{x}"');
});

test('escYaml: YAML reserved chars trigger quoting', () => {
  for (const c of ['&', '*', '#', '?', '|', '>', '!', '%', '@', '`']) {
    assert.match(escYaml(`x${c}y`), /^".*"$/, `expected quoted for ${c}`);
  }
});

// ─── parseSpeedToMbps ───────────────────────────────────────────────────
test('parseSpeedToMbps: plain Mbps', () => {
  assert.equal(parseSpeedToMbps('100Mbps'), 100);
  assert.equal(parseSpeedToMbps('100 Mbps'), 100);
  assert.equal(parseSpeedToMbps('100Mbps+'), 100);
});

test('parseSpeedToMbps: Gbps multiplied by 1000', () => {
  assert.equal(parseSpeedToMbps('1Gbps'), 1000);
  assert.equal(parseSpeedToMbps('1 Gbps fiber available'), 1000);
  assert.equal(parseSpeedToMbps('1Gbps widely available (Verizon Fios, Cox)'), 1000);
});

test('parseSpeedToMbps: fractional Gbps', () => {
  assert.equal(parseSpeedToMbps('2.5Gbps'), 2500);
});

test('parseSpeedToMbps: bare number defaults to Mbps', () => {
  assert.equal(parseSpeedToMbps('500'), 500);
});

test('parseSpeedToMbps: null / undefined / empty → 10', () => {
  assert.equal(parseSpeedToMbps(null), 10);
  assert.equal(parseSpeedToMbps(undefined), 10);
  assert.equal(parseSpeedToMbps(''), 10);
});

test('parseSpeedToMbps: non-numeric string → 10', () => {
  assert.equal(parseSpeedToMbps('unknown'), 10);
  assert.equal(parseSpeedToMbps('limited'), 10);
});

test('parseSpeedToMbps: no catastrophic backtracking on long input', () => {
  // Regex has no nested quantifiers; very long input should complete in
  // linear time. 10k chars should finish well under 100 ms.
  const longInput = '1Gbps' + ' nested'.repeat(10_000);
  const start = Date.now();
  const result = parseSpeedToMbps(longInput);
  const elapsed = Date.now() - start;
  assert.equal(result, 1000);
  assert.ok(elapsed < 100, `parsing took ${elapsed} ms (expected <100)`);
});
