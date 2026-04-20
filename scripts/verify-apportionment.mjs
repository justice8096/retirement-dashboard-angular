#!/usr/bin/env node
// Apportionment verification — walks every strategy × input case and
// asserts the expected output. Emits a markdown report that gets
// committed next to the audits so anyone reviewing the withdrawal-math
// FU can diff expected vs actual in one file.
//
// Logic is copied verbatim from src/app/lib/apportion.ts so the script
// runs with zero build deps. Keep this in sync — when apportion.ts
// changes, update the `apportion()` below and rerun.
//
// Usage: node scripts/verify-apportionment.mjs
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** @param {number} residual @param {string} strategy @param {{traditional:number, roth:number, taxable:number}} balances @param {{magiCeiling?:number, magiBuffer?:number, magiBaseline?:number}=} opts */
function apportion(residual, strategy, balances, opts = {}) {
  if (residual <= 0) return { trad: 0, roth: 0, tax: 0 };
  const { traditional, roth: rothBal, taxable } = balances;
  const total = traditional + rothBal + taxable;
  if (strategy === 'tax-efficient' || strategy === 'magi-targeted') {
    let left = residual;
    let tax = Math.min(left, Math.max(0, taxable));
    left -= tax;
    let trad = Math.min(left, Math.max(0, traditional));
    left -= trad;
    if (strategy === 'magi-targeted' && opts.magiCeiling != null) {
      const buffer = opts.magiBuffer ?? 5000;
      const baseline = opts.magiBaseline ?? 0;
      const magiBudget = Math.max(0, opts.magiCeiling - buffer - baseline);
      const magiDraw = tax + trad;
      if (magiDraw > magiBudget) {
        const overshoot = magiDraw - magiBudget;
        const tradPullback = Math.min(overshoot, trad);
        trad -= tradPullback;
        left += tradPullback;
        const stillOver = overshoot - tradPullback;
        if (stillOver > 0) {
          const taxPullback = Math.min(stillOver, tax);
          tax -= taxPullback;
          left += taxPullback;
        }
      }
    }
    const rothDraw = Math.min(left, Math.max(0, rothBal));
    left -= rothDraw;
    return { trad: trad + left, roth: rothDraw, tax };
  }
  if (total <= 0) return { trad: residual, roth: 0, tax: 0 };
  return {
    trad: residual * (traditional / total),
    roth: residual * (rothBal / total),
    tax:  residual * (taxable / total),
  };
}

const near = (a, b) => Math.abs(a - b) < 0.01;
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

const CASES = [
  {
    name: 'Healthy retiree, modest residual',
    residual: 60_000,
    balances: { taxable: 500_000, traditional: 800_000, roth: 300_000 },
    expect: {
      proportional: { tax: 18_750, trad: 30_000, roth: 11_250 },
      'tax-efficient': { tax: 60_000, trad: 0, roth: 0 },
    },
  },
  {
    name: 'Taxable runway mostly exhausted',
    residual: 60_000,
    balances: { taxable: 50_000, traditional: 800_000, roth: 300_000 },
    expect: {
      proportional: { tax: 60_000 * 50 / 1150, trad: 60_000 * 800 / 1150, roth: 60_000 * 300 / 1150 },
      'tax-efficient': { tax: 50_000, trad: 10_000, roth: 0 },
    },
  },
  {
    name: 'Empty taxable — fall to traditional',
    residual: 60_000,
    balances: { taxable: 0, traditional: 800_000, roth: 300_000 },
    expect: {
      proportional: { tax: 0, trad: 60_000 * 800 / 1100, roth: 60_000 * 300 / 1100 },
      'tax-efficient': { tax: 0, trad: 60_000, roth: 0 },
    },
  },
  {
    name: 'Only Roth left — draw Roth as last resort',
    residual: 40_000,
    balances: { taxable: 0, traditional: 0, roth: 300_000 },
    expect: {
      proportional: { tax: 0, trad: 0, roth: 40_000 },
      'tax-efficient': { tax: 0, trad: 0, roth: 40_000 },
    },
  },
  {
    name: 'All balances zero — fallback to traditional',
    residual: 60_000,
    balances: { taxable: 0, traditional: 0, roth: 0 },
    expect: {
      proportional: { tax: 0, trad: 60_000, roth: 0 },
      'tax-efficient': { tax: 0, trad: 60_000, roth: 0 },
    },
  },
  {
    name: 'Zero residual — all zero output',
    residual: 0,
    balances: { taxable: 500_000, traditional: 800_000, roth: 300_000 },
    expect: {
      proportional: { tax: 0, trad: 0, roth: 0 },
      'tax-efficient': { tax: 0, trad: 0, roth: 0 },
    },
  },
  {
    name: 'Residual exceeds every account — overflow to Traditional',
    residual: 1_500_000,
    balances: { taxable: 100_000, traditional: 200_000, roth: 50_000 },
    expect: {
      proportional: {
        tax: 1_500_000 * 100 / 350,
        trad: 1_500_000 * 200 / 350,
        roth: 1_500_000 * 50 / 350,
      },
      // taxable(100k) + traditional(200k) + roth(50k) = 350k covered;
      // remaining 1.15M has nowhere to go → overflow to traditional
      // (matches proportional fallback semantics).
      'tax-efficient': { tax: 100_000, trad: 200_000 + 1_150_000, roth: 50_000 },
    },
  },
];

// MAGI-targeted cases are checked separately because they require opts.
// Shape: { name, residual, balances, opts, expect }
const MAGI_CASES = [
  {
    name: 'MAGI budget covers entire residual — draws same as tax-efficient',
    residual: 40_000,
    balances: { taxable: 500_000, traditional: 800_000, roth: 300_000 },
    opts: { magiCeiling: 86_240, magiBuffer: 5000, magiBaseline: 0 }, // budget 81,240
    expect: { tax: 40_000, trad: 0, roth: 0 },
  },
  {
    name: 'Residual overshoots MAGI budget — excess flows to Roth via trad pullback',
    residual: 100_000,
    balances: { taxable: 500_000, traditional: 800_000, roth: 300_000 },
    opts: { magiCeiling: 86_240, magiBuffer: 5000, magiBaseline: 0 }, // budget 81,240
    // tax=100k, trad=0 (nothing to pull from yet — taxable filled first)
    // Wait: tax-efficient fills tax first (100k from tax). That's already over
    // the 81,240 MAGI budget. overshoot = 18,760. tradPullback = 0 (trad is 0).
    // taxPullback = 18,760. Final: tax = 81,240, trad = 0, roth = 18,760.
    expect: { tax: 81_240, trad: 0, roth: 18_760 },
  },
  {
    name: 'Traditional pullback absorbs overshoot before touching taxable',
    residual: 100_000,
    balances: { taxable: 50_000, traditional: 800_000, roth: 300_000 },
    opts: { magiCeiling: 86_240, magiBuffer: 5000, magiBaseline: 0 }, // budget 81,240
    // tax=50k (exhausted), trad=50k, magi=100k, overshoot=18,760. trad pullback 18,760 → trad=31,240.
    // left=18,760 → roth=18,760.
    expect: { tax: 50_000, trad: 31_240, roth: 18_760 },
  },
  {
    name: 'Baseline eats entire budget — everything drawable goes to Roth',
    residual: 30_000,
    balances: { taxable: 500_000, traditional: 800_000, roth: 300_000 },
    opts: { magiCeiling: 86_240, magiBuffer: 5000, magiBaseline: 86_240 }, // budget 0
    expect: { tax: 0, trad: 0, roth: 30_000 },
  },
];

let failed = 0;
const rows = [];

for (const c of CASES) {
  for (const strat of ['proportional', 'tax-efficient']) {
    const actual = apportion(c.residual, strat, c.balances);
    const expected = c.expect[strat];
    const ok = near(actual.tax, expected.tax)
      && near(actual.trad, expected.trad)
      && near(actual.roth, expected.roth);
    if (!ok) failed++;
    rows.push({
      name: c.name,
      strategy: strat,
      residual: c.residual,
      balances: c.balances,
      expected,
      actual,
      ok,
    });
  }
}

for (const c of MAGI_CASES) {
  const actual = apportion(c.residual, 'magi-targeted', c.balances, c.opts);
  const ok = near(actual.tax, c.expect.tax)
    && near(actual.trad, c.expect.trad)
    && near(actual.roth, c.expect.roth);
  if (!ok) failed++;
  rows.push({
    name: c.name,
    strategy: 'magi-targeted',
    residual: c.residual,
    balances: c.balances,
    expected: c.expect,
    actual,
    ok,
  });
}

// Console summary
console.log(`\nApportionment verification — ${rows.length} cases`);
console.log(`Passed: ${rows.length - failed} · Failed: ${failed}`);
for (const r of rows) {
  const status = r.ok ? '✓' : '✗';
  console.log(`  ${status} ${r.strategy.padEnd(14)} ${r.name}`);
  if (!r.ok) {
    console.log(`    expected  ${fmt(r.expected.tax)} / ${fmt(r.expected.trad)} / ${fmt(r.expected.roth)}`);
    console.log(`    actual    ${fmt(r.actual.tax)} / ${fmt(r.actual.trad)} / ${fmt(r.actual.roth)}`);
  }
}

// Markdown report
const today = new Date().toISOString().slice(0, 10);
const AUDITS = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'), 'audits');
if (!existsSync(AUDITS)) mkdirSync(AUDITS, { recursive: true });
const reportPath = resolve(AUDITS, `withdrawal-apportionment-verification-${today}.md`);

const lines = [];
lines.push(`# Withdrawal Apportionment Verification — ${today}`);
lines.push('');
lines.push(`Generated by \`scripts/verify-apportionment.mjs\`. The script copies the`);
lines.push(`\`apportion()\` logic from \`src/app/lib/apportion.ts\` verbatim and runs`);
lines.push(`each strategy × input case, asserting the expected output.`);
lines.push('');
lines.push(`**Total cases:** ${rows.length}  ·  **Passed:** ${rows.length - failed}  ·  **Failed:** ${failed}`);
lines.push('');
lines.push('## Cases');
lines.push('');
lines.push('| Status | Strategy | Case | Residual | Balances (tax / trad / roth) | Expected (tax / trad / roth) | Actual (tax / trad / roth) |');
lines.push('|---|---|---|---:|---|---|---|');
for (const r of rows) {
  const status = r.ok ? '✓' : '✗';
  const bal = `${fmt(r.balances.taxable)} / ${fmt(r.balances.traditional)} / ${fmt(r.balances.roth)}`;
  const exp = `${fmt(r.expected.tax)} / ${fmt(r.expected.trad)} / ${fmt(r.expected.roth)}`;
  const act = `${fmt(r.actual.tax)} / ${fmt(r.actual.trad)} / ${fmt(r.actual.roth)}`;
  lines.push(`| ${status} | ${r.strategy} | ${r.name} | ${fmt(r.residual)} | ${bal} | ${exp} | ${act} |`);
}
lines.push('');
lines.push('## Proportional — math reference');
lines.push('');
lines.push('```');
lines.push('draw[account] = residual × balance[account] / Σ balances');
lines.push('```');
lines.push('Preserves current account-mix ratio. Fallback when every balance is 0: full residual from Traditional.');
lines.push('');
lines.push('## Tax-efficient — math reference');
lines.push('');
lines.push('```');
lines.push('Draw order: Taxable → Traditional → Roth (cap each at its balance).');
lines.push('Any residual still uncovered overflows to Traditional.');
lines.push('```');
lines.push('Classic retirement advice — preserve Roth last (tax-free growth, no RMDs).');
lines.push('');
lines.push('## Behavior changed vs 2026-04-19 implementation');
lines.push('');
lines.push('- **Removed 4%-of-balance cap** on taxable and traditional in the tax-efficient path. Caused anti-tax-efficient draws that over-used Roth whenever residual exceeded 4% of taxable.');
lines.push('- **Fixed all-zero fallback asymmetry** — tax-efficient used to dump residual in Roth, proportional in Traditional. Now both fall back to Traditional.');
lines.push('- **Removed unreachable leftover branch** in the old tax-efficient implementation.');

writeFileSync(reportPath, lines.join('\n') + '\n');
console.log(`\nReport: ${reportPath}\n`);
process.exit(failed > 0 ? 1 : 0);
