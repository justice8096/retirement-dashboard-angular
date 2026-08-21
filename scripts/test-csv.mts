#!/usr/bin/env tsx
/**
 * Pure-function test runner for `src/app/lib/csv.ts`. Uses Node's built-in
 * `node:test` + `node:assert` + tsx for native TS imports. Mirrors
 * `scripts/test-text-escape.mts` in style and rationale — CSV escaping has
 * no DOM/Angular dependency, so Karma/TestBed would be overkill.
 *
 * Usage: `npm run test:pure`
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
// Project root `package.json` has no `"type": "module"`, so tsx compiles
// `.ts` source as CommonJS and named ESM exports collapse into a default
// namespace — same pattern as test-text-escape.mts.
import csvLib from '../src/app/lib/csv';
const { csvCell, toCsv } = csvLib as unknown as {
  csvCell: (value: string | number | boolean | null | undefined) => string;
  toCsv: (headers: string[], rows: (string | number | boolean | null | undefined)[][]) => string;
};

// ─── csvCell ────────────────────────────────────────────────────────────
test('csvCell: plain string passes through unquoted', () => {
  assert.equal(csvCell('Lisbon'), 'Lisbon');
});

test('csvCell: comma triggers quoting', () => {
  assert.equal(csvCell('Salt Lake City, UT'), '"Salt Lake City, UT"');
});

test('csvCell: embedded double-quote is doubled and the field is quoted', () => {
  assert.equal(csvCell('She said "hi"'), '"She said ""hi"""');
});

test('csvCell: embedded newline triggers quoting', () => {
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
});

test('csvCell: embedded carriage return triggers quoting', () => {
  assert.equal(csvCell('a\rb'), '"a\rb"');
});

test('csvCell: null/undefined render as empty field', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('csvCell: number coerced to string, no quoting', () => {
  assert.equal(csvCell(1234), '1234');
  assert.equal(csvCell(0), '0');
});

test('csvCell: boolean coerced to string', () => {
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(false), 'false');
});

test('csvCell: value with only a quote character is quoted and doubled', () => {
  assert.equal(csvCell('"'), '""""');
});

test('csvCell: plain string with no special chars is never quoted', () => {
  assert.equal(csvCell('Panama City'), 'Panama City');
});

// ─── toCsv ──────────────────────────────────────────────────────────────
test('toCsv: header + rows joined with LF, no trailing newline', () => {
  const csv = toCsv(['Name', 'Value'], [['a', 1], ['b', 2]]);
  assert.equal(csv, 'Name,Value\na,1\nb,2');
});

test('toCsv: escapes a comma-containing field within a full document', () => {
  const csv = toCsv(['Name', 'Country'], [['Springfield, IL', 'USA']]);
  assert.equal(csv, 'Name,Country\n"Springfield, IL",USA');
});

test('toCsv: empty rows array produces header-only document', () => {
  const csv = toCsv(['A', 'B'], []);
  assert.equal(csv, 'A,B');
});

test('toCsv: mixed types (string, number, null) in one row', () => {
  const csv = toCsv(['Name', 'Rent', 'Notes'], [['Lisbon', 1200, null]]);
  assert.equal(csv, 'Name,Rent,Notes\nLisbon,1200,');
});
