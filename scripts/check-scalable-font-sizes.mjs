#!/usr/bin/env node
// Guardrail against fixed-pixel `font-size` declarations in stylesheets —
// .scss files AND the inline `styles:`/template strings in .ts/.html.
// The Display → Font Size accessibility setting scales the app through the
// `--font-scale` root variable (NavigationService), so every stylesheet
// font-size must be written as `calc(<n>px * var(--font-scale, 1))` —
// a bare `font-size: 12px` is invisible to the setting (the 2026-08-22
// "inner cards don't grow" bug). Scaled declarations don't match the
// pattern below because `calc(` sits between the colon and the px value.
//
// Exits 0 when the tree is clean, 1 when any unscaled px font-size is
// found. Wired into .github/workflows/ci.yml after the numeric-input check.
//
// Usage: node scripts/check-scalable-font-sizes.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const SRC = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'), 'src');

const RAW_PX = /font-size:\s*[0-9.]+px/;
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path); continue; }
    if (!['.scss', '.ts', '.html'].includes(extname(entry.name))) continue;
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      if (RAW_PX.test(line)) {
        hits.push(`${path.replace(SRC, 'src')}:${i + 1}  ${line.trim()}`);
      }
    });
  }
}

walk(SRC);

if (hits.length) {
  console.error(`FAIL ${hits.length} fixed-px font-size declaration(s) ignore the --font-scale setting:`);
  for (const h of hits) console.error('  ' + h);
  console.error('Write them as: font-size: calc(<n>px * var(--font-scale, 1));');
  process.exit(1);
}
console.log('OK All stylesheet font-size declarations scale with --font-scale.');
