#!/usr/bin/env node
// Guardrail against raw `<input type="number">` elements that bypass the
// NumericInputDirective (appNumeric). After the 2026-04-20 dyscalculia
// sweep (FU-002/004/007/011/013/019), every numeric input carries
// `appNumeric="<kind>"`. This script blocks regressions at CI time.
//
// Exits 0 when the tree is clean, 1 when any raw type=number input is
// found. Wired into .github/workflows/ci.yml after the readability lint.
//
// Usage: node scripts/check-raw-numeric-inputs.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'), 'src', 'app');

/** Files to scan — component templates live in `.ts` `template:` strings plus
 *  occasional `.html` standalone files. The NumericInputDirective source
 *  itself is excluded by filename below. */
const SCAN_EXTS = new Set(['.ts', '.html']);
const EXCLUDE = ['numeric-input.directive.ts', 'warn-raw-numeric-input.directive.ts'];

const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path); continue; }
    if (!SCAN_EXTS.has(extname(entry.name))) continue;
    const text = readFileSync(path, 'utf8');
    // Match `type="number"` / `type='number'` on an <input> that does NOT
    // carry `appNumeric` on the same opening tag.
    const pattern = /<input\b[^>]*type\s*=\s*["']number["'][^>]*>/g;
    for (const m of text.matchAll(pattern)) {
      const tag = m[0];
      if (/\bappNumeric\b/.test(tag)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      hits.push({ path: path.slice(ROOT.length + 1), line, tag: tag.slice(0, 120) });
    }
  }
}

walk(ROOT);

if (hits.length === 0) {
  console.log('OK No raw <input type="number"> elements found. NumericInputDirective coverage is complete.');
  process.exit(0);
}

console.error(`FAIL ${hits.length} raw <input type="number"> element(s) found without appNumeric:\n`);
for (const h of hits) {
  console.error(`  ${h.path}:${h.line}`);
  console.error(`    ${h.tag}`);
}
console.error('');
console.error('Apply appNumeric="currency|percent|age|year|rate|fx" to each. See');
console.error('src/app/directives/numeric-input.directive.ts for kind semantics.');
process.exit(1);
