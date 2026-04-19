#!/usr/bin/env node
// Dashboard Dyslexia DFA-2026-04-19-004 — reading-age lint.
//
// Scans prose sources for grade-level readability using a zero-dependency
// Flesch-Kincaid implementation. Reports any block above `--max-grade`
// (default 9) as a warning. Start as warn-only; promote to a blocker in CI
// once the baseline passes.
//
// Usage:
//   node scripts/check-readability.mjs            # default max grade 9
//   node scripts/check-readability.mjs --max-grade 8
//   node scripts/check-readability.mjs --fail-on-exceed
//
// Sources scanned:
//   - src/app/content/help-content.ts      (HELP_CONTENT prose)
//   - src/app/components/**/*.component.ts inline-template prose blocks
//     (heuristically -- strings matching common prose tags/selectors)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'));
const args = process.argv.slice(2);
const MAX_GRADE = Number(valueFlag('--max-grade') ?? 9);
const FAIL_ON_EXCEED = args.includes('--fail-on-exceed');

function valueFlag(name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
}

// Flesch-Kincaid Grade Level
// Grade = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
function syllableCount(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function fkGrade(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { grade: 0, words: 0, sentences: 0 };
  const sentences = clean.split(/[.!?]+\s+|\n{2,}/).filter(Boolean).length || 1;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { grade: 0, words: 0, sentences };
  const syllables = words.reduce((sum, w) => sum + syllableCount(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return { grade: Math.round(grade * 10) / 10, words: words.length, sentences };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (entry.endsWith('.component.ts') || entry === 'help-content.ts') out.push(p);
  }
  return out;
}

// Extract prose blocks from TS source using matchAll (no regex.exec).
// Heuristic: real prose is a complete sentence of running English. We want to
// avoid template-syntax crumbs, CSS blocks, event handlers, file paths, etc.
function extractProse(src) {
  const blocks = [];
  const stringRe = /(["'`])((?:\\.|(?!\1)[\s\S]){60,}?)\1/g;
  for (const match of src.matchAll(stringRe)) {
    const raw = match[2]
      .replace(/\\n/g, ' ')
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (raw.length < 60) continue;
    // Skip obvious non-prose.
    if (/^https?:/.test(raw)) continue;
    if (/^[@./]/.test(raw)) continue;
    if (/[`${}]/.test(raw)) continue;                // template literals / interpolation leftovers
    if (/\bng[A-Z]|\(click\)|\(change\)|\(input\)|\[attr\.|\[class\.|\[style\./.test(raw)) continue;
    if (/\bfunction\b|=>|\breturn\b|\bconst\b|\blet\b/.test(raw)) continue;
    if (/;[^ ]|::before|::after|\{|\}/.test(raw)) continue; // css-ish
    if (/^[a-z][\w-]*:\s*\S+/i.test(raw)) continue;  // `key: value` style entries
    // Require at least 8 words and a decent word character ratio.
    const words = raw.split(/\s+/);
    if (words.length < 8) continue;
    const alpha = (raw.match(/[a-zA-Z]/g) ?? []).length;
    if (alpha / raw.length < 0.65) continue;
    // Must begin with a letter (real sentence start) and contain a period.
    if (!/^[A-Za-z]/.test(raw)) continue;
    if (!/[.!?]/.test(raw)) continue;
    blocks.push(raw);
  }
  return blocks;
}

const targets = [];
try { targets.push(...walk(join(ROOT, 'src', 'app', 'content'))); } catch { /* missing */ }
try { targets.push(...walk(join(ROOT, 'src', 'app', 'components'))); } catch { /* missing */ }

let exceedCount = 0;
let totalBlocks = 0;
const offenders = [];

for (const file of targets) {
  const src = readFileSync(file, 'utf8');
  const blocks = extractProse(src);
  for (const block of blocks) {
    const { grade, words, sentences } = fkGrade(block);
    totalBlocks++;
    if (grade > MAX_GRADE) {
      exceedCount++;
      offenders.push({
        file: relative(ROOT, file),
        grade, words, sentences,
        preview: block.slice(0, 120) + (block.length > 120 ? '...' : ''),
      });
    }
  }
}

offenders.sort((a, b) => b.grade - a.grade);

console.log(`Readability scan -- Flesch-Kincaid Grade, max ${MAX_GRADE}`);
console.log(`Scanned ${targets.length} files, ${totalBlocks} prose blocks`);
console.log(`Over threshold: ${exceedCount}\n`);

for (const o of offenders.slice(0, 20)) {
  console.log(`  grade ${o.grade.toFixed(1)}  (${o.words} words, ${o.sentences} sentences)  ${o.file}`);
  console.log(`    "${o.preview}"`);
}
if (offenders.length > 20) {
  console.log(`  ... and ${offenders.length - 20} more.`);
}

if (FAIL_ON_EXCEED && exceedCount > 0) {
  console.error(`\nFAIL: ${exceedCount} blocks above grade ${MAX_GRADE}.`);
  process.exit(1);
}
