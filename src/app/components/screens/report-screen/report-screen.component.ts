import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import {
  FinancialSettings, HouseholdProfile, HouseholdMember, LocationFull,
  NeighborhoodsSupplement, InclusionSupplement, InclusionCategory,
  LocalInfoSupplement, Scenario, bulletText,
} from '@models/api.model';
import { escYaml as yamlStr } from '@app/lib/text-escape';
import { estimateBenefitAtClaim } from '@app/lib/social-security';
import {
  FIRE_WITHDRAWAL_RATE,
  GUARDRAIL_FLOOR_RATE as GUARDRAIL_FLOOR,
  GUARDRAIL_CEILING_RATE as GUARDRAIL_CEILING,
} from '@app/lib/fire-math';

type NeighborhoodsBag = Record<string, NeighborhoodsSupplement | null>;
type InclusionBag = Record<string, InclusionSupplement | null>;
type LocalInfoBag = Record<string, LocalInfoSupplement | null>;

/** Shape of the services supplement JSON — kept local since no shared model
 *  covers the category-level fields the report surfaces. */
interface ServicesBagEntry {
  distanceUnit?: 'mi' | 'km';
  services?: Array<{
    categoryId?: string;
    name?: string;
    distanceMi?: number;
    distanceKm?: number;
    notes?: string;
  }>;
}
type ServicesBag = Record<string, ServicesBagEntry | null>;


@Component({
  selector: 'app-report-screen',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './report-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./report-screen.component.scss'],
})
export class ReportScreenComponent {
  readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastDownloaded = signal<{ filename: string; bytes: number; sections: number; locations: number } | null>(null);

  readonly selectedCount = computed(() => this.loc.selectedIds().size);
  readonly selectedNamesPreview = computed(() => {
    const ids = this.loc.selectedIds();
    const full = this.loc.fullLocations();
    const names = full.filter(l => ids.has(l.id)).map(l => l.name);
    if (names.length <= 5) return names.join(', ');
    return names.slice(0, 5).join(', ') + ` + ${names.length - 5} more`;
  });

  generateAndDownload(): void {
    this.error.set(null);
    if (this.selectedCount() === 0) {
      this.error.set('No locations selected.');
      return;
    }
    this.loading.set(true);

    // Fetch fresh household + financial, and batch-load neighborhoods + inclusion
    // for all selected locations. Fresh fetch so the report reflects the latest
    // DB state, not whatever was cached at page load.
    const ids = [...this.loc.selectedIds()];
    forkJoin({
      household: this.api.getHousehold().pipe(catchError(() => of(null))),
      financial: this.api.getFinancial().pipe(catchError(() => of(null))),
      neighborhoods: this.api.batchLoadSupplements(ids, 'neighborhoods').pipe(catchError(() => of({} as Record<string, unknown>))),
      inclusion: this.api.batchLoadSupplements(ids, 'inclusion').pipe(catchError(() => of({} as Record<string, unknown>))),
      services: this.api.batchLoadSupplements(ids, 'services').pipe(catchError(() => of({} as Record<string, unknown>))),
      localInfo: this.api.batchLoadSupplements(ids, 'local-info').pipe(catchError(() => of({} as Record<string, unknown>))),
      // Saved MC scenarios — empty list on fetch failure so the report still
      // generates. Users who've never saved a scenario will just get the
      // "no scenarios saved yet" note in that section.
      scenarios: this.api.getScenarios().pipe(catchError(() => of([] as Scenario[]))),
    }).subscribe({
      next: ({ household, financial, neighborhoods, inclusion, services, localInfo, scenarios }) => {
        try {
          const full = this.loc.fullLocations();
          const selected = full.filter(l => this.loc.selectedIds().has(l.id));
          if (!selected.length) {
            throw new Error('Selected locations aren\'t loaded yet — refresh Overview and try again.');
          }
          const md = buildReportMarkdown({
            household,
            financial,
            selected,
            neighborhoodsBag: neighborhoods as unknown as NeighborhoodsBag,
            inclusionBag: inclusion as unknown as InclusionBag,
            servicesBag: services as unknown as ServicesBag,
            localInfoBag: localInfo as unknown as LocalInfoBag,
            scenarios,
            tax: this.tax,
          });
          const filename = `retirement-report-${new Date().toISOString().slice(0, 10)}.md`;
          downloadText(filename, md);
          this.lastDownloaded.set({
            filename,
            bytes: md.length,
            sections: (md.match(/^##\s/gm) || []).length,
            locations: selected.length,
          });
        } catch (e) {
          this.error.set((e as Error).message || 'Unknown error while building the report.');
        } finally {
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.message ?? 'Fetch failed.');
      },
    });
  }
}

/** Trigger a browser download of a text blob. Uses an anchor with `download`
 *  attribute — no deps. Revokes the object URL on next tick. */
function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

/** Assembles the full Markdown document. Pure function — no side effects,
 *  no DI. Easy to unit test or run from a CLI script later. */
function buildReportMarkdown(args: {
  household: HouseholdProfile | null;
  financial: FinancialSettings | null;
  selected: LocationFull[];
  neighborhoodsBag: NeighborhoodsBag;
  inclusionBag: InclusionBag;
  servicesBag: ServicesBag;
  localInfoBag: LocalInfoBag;
  scenarios: Scenario[];
  tax: TaxService;
}): string {
  const { household, financial, selected, neighborhoodsBag, inclusionBag, servicesBag, localInfoBag, scenarios, tax } = args;
  const gen = new Date();
  const genIso = gen.toISOString();
  const genHuman = gen.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const primary = household?.members.find(m => m.role === 'primary') ?? null;
  const spouse = household?.members.find(m => m.role === 'spouse') ?? null;
  const startYear = household?.planningStartYear ?? gen.getFullYear();
  const primaryAge = primary ? startYear - primary.birthYear : null;
  const spouseAge = spouse ? startYear - spouse.birthYear : null;

  const portfolio = Number(financial?.portfolioBalance) || 0;
  const targetIncome = Number(household?.targetAnnualIncome) || 0;
  const expectedReturn = Number(financial?.expectedReturn) || 0;
  const fireNumber = targetIncome > 0 ? targetIncome / FIRE_WITHDRAWAL_RATE : 0;
  const fireProgress = fireNumber > 0 ? (portfolio / fireNumber) : 0;
  const annualSavings = Number(financial?.annualSavings) || 0;

  // Intentionally use role labels (not names) throughout the narrative.
  // Reports feed back into video generation — stable role words scale across
  // households, whereas hardcoded names tie a template to one person.
  const ss = (household?.members ?? [])
    .filter(m => m.role === 'primary' || m.role === 'spouse')
    .map(m => ({ label: roleLabel(m.role), monthly: estimateBenefitAtClaim(m) }));
  const ssAnnual = ss.reduce((s, m) => s + m.monthly, 0) * 12;
  const withdrawalAnnual = portfolio * FIRE_WITHDRAWAL_RATE;

  const lines: string[] = [];

  // ─── Front matter ─────────────────────────────────────────────
  lines.push('---');
  lines.push(`generatedAt: ${genIso}`);
  lines.push(`schemaVersion: 1`);
  lines.push(`household:`);
  lines.push(`  primaryAge: ${primaryAge ?? 'null'}`);
  lines.push(`  spouseAge: ${spouseAge ?? 'null'}`);
  lines.push(`  planningStartYear: ${startYear}`);
  lines.push(`  planningYears: ${household?.planningYears ?? 'null'}`);
  lines.push(`  targetAnnualIncome: ${targetIncome}`);
  lines.push(`  adultsCount: ${household?.adultsCount ?? 'null'}`);
  lines.push(`financial:`);
  lines.push(`  portfolioBalance: ${portfolio}`);
  lines.push(`  expectedReturn: ${expectedReturn}`);
  lines.push(`  expectedInflation: ${financial?.expectedInflation ?? 'null'}`);
  lines.push(`  retirementPath: ${financial?.retirementPath ?? 'null'}`);
  lines.push(`  annualSavings: ${annualSavings}`);
  lines.push(`fireMath:`);
  lines.push(`  fireNumber: ${Math.round(fireNumber)}`);
  lines.push(`  progressPct: ${Math.round(fireProgress * 100)}`);
  lines.push(`cashflow:`);
  lines.push(`  ssAnnual: ${Math.round(ssAnnual)}`);
  lines.push(`  withdrawalAnnual: ${Math.round(withdrawalAnnual)}`);
  lines.push(`locations:`);
  for (const l of selected) {
    lines.push(`  - id: ${l.id}`);
    lines.push(`    name: ${yamlStr(l.name)}`);
    lines.push(`    country: ${yamlStr(l.country)}`);
    lines.push(`    monthlyCostTotal: ${l.monthlyCostTotal ?? 0}`);
  }
  lines.push('---');
  lines.push('');

  // ─── Title ────────────────────────────────────────────────────
  lines.push(`# Retirement Plan Report`);
  lines.push('');
  lines.push(`*Generated ${genHuman}.*`);
  lines.push('');

  // ─── Who You Are ──────────────────────────────────────────────
  lines.push(`## Who You Are`);
  lines.push('');
  if (primary) {
    const who: string[] = [];
    who.push(`The primary retiree${primaryAge !== null ? ` is ${primaryAge} years old` : ''}`);
    if (spouse) {
      who.push(`and is planning alongside a spouse${spouseAge !== null ? `, age ${spouseAge}` : ''}`);
    }
    who.push('.');
    lines.push(who.join(' ').replace(' .', '.'));
    lines.push('');
  } else {
    lines.push(`The household profile hasn't been filled in yet. Several narrative sections below will be thin until the Assumptions screen is populated.`);
    lines.push('');
  }
  lines.push(`The planning window starts in ${startYear}${household?.planningYears ? ` and spans ${household.planningYears} years` : ''}. The retirement path chosen is **${prettyPath(financial?.retirementPath)}**. Target annual income in retirement is ${fmtUsdOrNA(targetIncome)}.`);
  lines.push('');

  // ─── Where You Stand ──────────────────────────────────────────
  lines.push(`## Where You Stand`);
  lines.push('');
  if (portfolio > 0) {
    lines.push(`The portfolio currently holds **${fmtUsd(portfolio)}**, with an expected annual return of ${expectedReturn}% and an inflation assumption of ${financial?.expectedInflation ?? '—'}%.`);
    if (annualSavings > 0) {
      lines.push('');
      lines.push(`At the current savings rate of ${fmtUsd(annualSavings)}/year, this portfolio continues to grow before drawdown begins.`);
    }
  } else {
    lines.push(`No portfolio balance is recorded yet. Fill in FIRE Setup or Settings to anchor the math.`);
  }
  lines.push('');

  // ─── FIRE Math ────────────────────────────────────────────────
  lines.push(`## The FIRE Math`);
  lines.push('');
  if (fireNumber > 0) {
    lines.push(`Using the 4% rule against a target income of ${fmtUsd(targetIncome)}/year, the FIRE number is **${fmtUsd(fireNumber)}**.`);
    lines.push('');
    const pct = Math.round(fireProgress * 100);
    if (pct >= 100) {
      lines.push(`The current portfolio of ${fmtUsd(portfolio)} is **${pct}% of the FIRE number** — target already reached.`);
    } else if (pct >= 70) {
      lines.push(`Progress sits at **${pct}%** — within striking distance of the FIRE target.`);
    } else if (pct >= 30) {
      lines.push(`Progress sits at **${pct}%** — a meaningful stake, with runway still ahead.`);
    } else if (pct > 0) {
      lines.push(`Progress sits at **${pct}%** — the accumulation phase is still the main event.`);
    } else {
      lines.push(`No portfolio data yet, so progress can't be computed.`);
    }
    if (annualSavings > 0 && expectedReturn > 0 && portfolio < fireNumber) {
      const years = yearsToFire(portfolio, fireNumber, annualSavings, expectedReturn / 100);
      lines.push('');
      lines.push(`At ${fmtUsd(annualSavings)}/year in savings and a ${expectedReturn}% return, the FIRE number is reached in approximately **${years} years**.`);
    }
  } else {
    lines.push(`FIRE number can't be computed — a target annual income hasn't been set on the household profile.`);
  }
  lines.push('');

  // ─── Cash Flow ────────────────────────────────────────────────
  lines.push(`## Cash Flow At A Glance`);
  lines.push('');
  const cashParts: string[] = [];
  if (ssAnnual > 0) {
    const breakdown = ss
      .filter(m => m.monthly > 0)
      .map(m => `${m.label} at ${fmtUsd(m.monthly)}/mo`)
      .join(' + ');
    cashParts.push(`Social Security is projected to contribute **${fmtUsd(ssAnnual)}/year** (${breakdown}).`);
  }
  if (withdrawalAnnual > 0) {
    cashParts.push(`A 4% portfolio withdrawal adds **${fmtUsd(withdrawalAnnual)}/year**.`);
  }
  const totalIncome = ssAnnual + withdrawalAnnual;
  if (totalIncome > 0) {
    cashParts.push(`Combined baseline income: **${fmtUsd(totalIncome)}/year** before taxes, pensions, or part-time work.`);
  }
  if (!cashParts.length) {
    cashParts.push(`Cash-flow modeling is thin because Social Security and portfolio data haven't been set.`);
  }
  lines.push(cashParts.join(' '));
  lines.push('');

  // ─── Guardrails ───────────────────────────────────────────────
  if (portfolio > 0) {
    lines.push(`## The Safe Spending Corridor`);
    lines.push('');
    const floor = portfolio * GUARDRAIL_FLOOR;
    const base = portfolio * FIRE_WITHDRAWAL_RATE;
    const ceiling = portfolio * GUARDRAIL_CEILING;
    lines.push(`The Guyton-Klinger guardrails define a safe withdrawal band for this portfolio:`);
    lines.push('');
    lines.push(`- **Floor (3%):** ${fmtUsd(floor)}/year — minimum to preserve purchasing power.`);
    lines.push(`- **Base (4%):** ${fmtUsd(base)}/year — the starting point.`);
    lines.push(`- **Ceiling (5.5%):** ${fmtUsd(ceiling)}/year — maximum to preserve capital.`);
    lines.push('');
    if (targetIncome > 0) {
      if (targetIncome < floor) {
        lines.push(`Target spending of ${fmtUsd(targetIncome)}/year is **below the floor** — the plan is conservatively funded.`);
      } else if (targetIncome <= ceiling) {
        lines.push(`Target spending of ${fmtUsd(targetIncome)}/year falls **inside the corridor** — sustainable if returns hold.`);
      } else {
        lines.push(`Target spending of ${fmtUsd(targetIncome)}/year **exceeds the ceiling** — current portfolio does not support this indefinitely.`);
      }
      lines.push('');
    }
  }

  // ─── Per-location chapters ────────────────────────────────────
  lines.push(`## Where You're Considering`);
  lines.push('');
  lines.push(`${selected.length === 1 ? 'One location is' : `${selected.length} locations are`} under active consideration. Each gets a full chapter below covering costs, climate, healthcare, visa, inclusion, and neighborhood texture.`);
  lines.push('');

  for (const l of selected) {
    lines.push(...buildLocationChapter(l, neighborhoodsBag, inclusionBag, servicesBag, localInfoBag, tax, targetIncome));
  }

  // ─── Saved Scenarios ──────────────────────────────────────────
  lines.push(...buildScenariosSection(scenarios));

  // ─── What To Watch ────────────────────────────────────────────
  lines.push(`## What To Watch`);
  lines.push('');
  const warnings = collectWarnings(selected, financial);
  if (warnings.length) {
    for (const w of warnings) lines.push(`- ${w}`);
  } else {
    lines.push(`No major data gaps flagged across the selected set.`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(`*End of report.*`);

  return lines.join('\n') + '\n';
}

function buildLocationChapter(
  l: LocationFull,
  nb: NeighborhoodsBag,
  inc: InclusionBag,
  svc: ServicesBag,
  li: LocalInfoBag,
  tax: TaxService,
  targetIncome: number,
): string[] {
  const out: string[] = [];
  out.push(`### ${l.name}`);
  out.push('');

  // Opening paragraph — the "feel" of the place
  const opener = openingParagraph(l);
  out.push(opener);
  out.push('');

  // Pros / cons, if the location has them. Pros remain legacy strings;
  // cons are now {text, sources?} objects — use bulletText so both render.
  if (l.pros?.length || l.cons?.length) {
    const prosJoined = (l.pros ?? []).map(bulletText).join('; ') || '—';
    const consJoined = (l.cons ?? []).map(bulletText).join('; ') || '—';
    out.push(`**What works here:** ${prosJoined}.`);
    out.push('');
    out.push(`**What to think twice about:** ${consJoined}.`);
    out.push('');
  }

  // Money
  out.push(`#### The money side`);
  out.push('');
  out.push(moneyParagraph(l, tax, targetIncome));
  out.push('');

  // Climate
  if (l.climate) {
    out.push(`#### Climate & feel`);
    out.push('');
    out.push(climateParagraph(l));
    out.push('');
  }

  // Healthcare
  if (l.healthcare) {
    out.push(`#### Healthcare`);
    out.push('');
    out.push(healthcareParagraph(l));
    out.push('');
  }

  // Visa
  if (l.visa) {
    out.push(`#### Visa & residency`);
    out.push('');
    out.push(visaParagraph(l));
    out.push('');
  }

  // Inclusion
  const incData = inc[l.id];
  if (incData) {
    out.push(`#### Inclusion`);
    out.push('');
    out.push(inclusionParagraph(incData));
    out.push('');
  }

  // Neighborhoods
  const nbData = nb[l.id];
  if (nbData?.neighborhoods?.length) {
    out.push(`#### Neighborhood texture`);
    out.push('');
    out.push(neighborhoodsParagraph(nbData));
    out.push('');
  }

  // Community & services (category coverage, not individual listings)
  const svcData = svc[l.id];
  if (svcData?.services?.length) {
    const p = servicesParagraph(svcData);
    if (p) {
      out.push(`#### Community & services`);
      out.push('');
      out.push(p);
      out.push('');
    }
  }

  // Local info / resources (webcams, blogs, YouTube, official sites)
  const liData = li[l.id];
  if (liData) {
    const p = localInfoParagraph(liData);
    if (p) {
      out.push(`#### Local info & resources`);
      out.push('');
      out.push(p);
      out.push('');
    }
  }

  return out;
}

function openingParagraph(l: LocationFull): string {
  const subregion = l.subregion ? `${l.subregion}, ` : '';
  const region = l.region ? ` in the ${l.region}` : '';
  const pieces: string[] = [];
  pieces.push(`${l.name} sits in ${subregion}${l.country}${region}.`);
  const rent = l.monthlyCosts?.rent?.typical ?? 0;
  const total = l.monthlyCostTotal ?? 0;
  if (total > 0) {
    pieces.push(`The all-in monthly cost of living runs about **${fmtUsd(total)}/mo** at typical rates, of which rent is around ${fmtUsd(rent)}.`);
  }
  const currency = l.currency && l.currency !== 'USD' ? ` Local currency is ${l.currency}.` : '';
  pieces.push(currency.trim() || `Prices are quoted in USD.`);
  return pieces.join(' ');
}

function moneyParagraph(l: LocationFull, tax: TaxService, targetIncome: number): string {
  const pieces: string[] = [];
  const mc = l.monthlyCosts ?? {};
  const rent = mc.rent?.typical ?? 0;
  const groceries = mc.groceries?.typical ?? 0;
  const health = mc.healthcare?.typical ?? 0;
  const transport = mc.transportation?.typical ?? 0;
  const utils = mc.utilities?.typical ?? 0;
  const other = (l.monthlyCostTotal ?? 0) - rent - groceries - health - transport - utils;

  const parts: string[] = [];
  if (rent) parts.push(`rent ${fmtUsd(rent)}`);
  if (groceries) parts.push(`groceries ${fmtUsd(groceries)}`);
  if (health) parts.push(`healthcare ${fmtUsd(health)}`);
  if (transport) parts.push(`transportation ${fmtUsd(transport)}`);
  if (utils) parts.push(`utilities ${fmtUsd(utils)}`);
  if (other > 0) parts.push(`everything else ${fmtUsd(other)}`);

  if (parts.length) {
    pieces.push(`On a monthly basis: ${parts.join(', ')}.`);
  }

  if (targetIncome > 0) {
    try {
      const inc = tax.computeIncomeTax(l, targetIncome);
      if (inc.monthlyTax > 0) {
        pieces.push(`At a ${fmtUsd(targetIncome)}/year income level, estimated income tax runs **${fmtUsd(inc.monthlyTax)}/mo** (${fmtUsd(inc.monthlyTax * 12)}/yr, source: ${inc.source}).`);
      } else if (inc.source === 'none') {
        pieces.push(`No income-tax estimate available for this location's tax profile.`);
      }
    } catch { /* tax calc failure shouldn't break the report */ }
  }
  return pieces.join(' ');
}

function climateParagraph(l: LocationFull): string {
  const c = l.climate!;
  const summer = c.summerHighF ?? 0;
  const winter = c.winterLowF ?? 0;
  const rainy = c.rainyDaysPerYear ?? 0;
  const avg = (summer + winter) / 2;
  let comfortWord = 'moderate';
  if (Math.abs(avg - 75) < 8) comfortWord = 'comfortable';
  else if (avg < 50) comfortWord = 'cold-leaning';
  else if (avg > 85) comfortWord = 'hot';
  return `Winters bottom out around **${winter}°F**, summers peak near **${summer}°F**, for a ${comfortWord} annual average. Expect roughly **${rainy} rainy days** per year.`;
}

function healthcareParagraph(l: LocationFull): string {
  const hc = l.healthcare!;
  const monthly = l.monthlyCosts?.healthcare?.typical ?? 0;
  const qWord = hc.qualityRating >= 8 ? 'strong' : hc.qualityRating >= 6 ? 'solid' : hc.qualityRating >= 4 ? 'mixed' : 'weak';
  const parts: string[] = [];
  parts.push(`The healthcare system is **${qWord}** (${hc.qualityRating.toFixed(1)}/10). System type: ${hc.system || 'n/a'}.`);
  if (monthly) parts.push(`Typical out-of-pocket healthcare cost runs about ${fmtUsd(monthly)}/mo.`);
  if (hc.dentalIncluded) parts.push(`Dental is typically included.`);
  if (hc.notes) parts.push(hc.notes);
  if (l.country !== 'United States') {
    parts.push(`Medicare does not cover care abroad — private or local insurance is required.`);
  }
  return parts.join(' ');
}

function visaParagraph(l: LocationFull): string {
  const v = l.visa!;
  const parts: string[] = [];
  if (v.type) parts.push(`The relevant visa here is **${v.type}**.`);
  if (v.incomeRequirement?.monthly) {
    const cur = v.incomeRequirement.currency ?? l.currency ?? 'USD';
    parts.push(`The income requirement is about **${cur} ${Math.round(v.incomeRequirement.monthly).toLocaleString()}/mo**.`);
  }
  if (v.duration) parts.push(`Validity: ${v.duration}.`);
  if (v.renewalProcess) parts.push(`Renewal: ${v.renewalProcess}.`);
  if (v.notes) parts.push(v.notes);
  if (!parts.length) parts.push(`Visa information is not populated for this location.`);
  return parts.join(' ');
}

function inclusionParagraph(data: InclusionSupplement): string {
  const categoriesBag = (data as unknown as { categories?: Record<string, InclusionCategory> }).categories
    ?? (data as unknown as Record<string, InclusionCategory>);
  const overall = (data as unknown as { overallInclusionScore?: number; overall?: { score: number } })
    .overallInclusionScore ?? (data as unknown as { overall?: { score: number } }).overall?.score;
  const rows: string[] = [];
  const labels: Record<string, string> = {
    racial: 'Racial',
    religious: 'Religious',
    countryOfOrigin: 'Country-of-origin (xenophobia)',
    language: 'Language',
    lgbtq: 'LGBTQ+',
    disability: 'Disability',
    age: 'Age',
  };
  for (const [key, label] of Object.entries(labels)) {
    const c = categoriesBag[key];
    if (!c || typeof c !== 'object' || (c as InclusionCategory).score === undefined) continue;
    rows.push(`${label} ${(c as InclusionCategory).score}/10`);
  }
  const header = overall !== undefined
    ? `The overall inclusion score is **${overall}/10**.`
    : `No overall inclusion score is recorded.`;
  const breakdown = rows.length ? ` Category breakdown: ${rows.join(', ')}.` : '';
  // Pull out the racial + xenophobia summaries in full if available — these
  // are what the user most cared about.
  const racial = categoriesBag['racial'] as InclusionCategory | undefined;
  const xeno = categoriesBag['countryOfOrigin'] as InclusionCategory | undefined;
  const extras: string[] = [];
  if (racial?.summary) extras.push(`On racial inclusion: ${racial.summary}`);
  if (xeno?.summary) extras.push(`On country-of-origin inclusion: ${xeno.summary}`);
  return [header + breakdown, ...extras].join(' ');
}

/** Summarise the services supplement — focuses on category coverage, not
 *  individual listings, so the narrative stays scannable. Highlights the
 *  community/cultural categories added in the 2026-04 sweep. */
function servicesParagraph(data: ServicesBagEntry): string {
  const services = data.services ?? [];
  if (!services.length) return '';
  const catSet = new Set<string>();
  for (const s of services) if (s.categoryId) catSet.add(s.categoryId);

  // Flag community / cultural categories the user has specifically asked about.
  const communityMap: Record<string, string> = {
    religious_mosque: 'mosque',
    religious_synagogue: 'synagogue',
    grocery_halal: 'halal grocer',
    grocery_kosher: 'kosher grocer',
    hair_care_african: 'Black/African hair care',
    restaurant_local: 'local cuisine',
    clothing_womens: "women's clothing",
    clothing_mens: "men's clothing",
    clothing_childrens: "children's clothing",
    clothing_bigtall: 'big & tall clothing',
  };
  const present: string[] = [];
  for (const [key, label] of Object.entries(communityMap)) {
    if (catSet.has(key)) present.push(label);
  }
  const essentialCats = ['hospital', 'pharmacy', 'grocery', 'bank', 'public_transit', 'airport'];
  const missingEssential = essentialCats.filter(c => !catSet.has(c));

  const parts: string[] = [];
  parts.push(`Covers ${catSet.size} service categor${catSet.size === 1 ? 'y' : 'ies'} across ${services.length} listing${services.length === 1 ? '' : 's'}.`);
  if (present.length) {
    parts.push(`Community coverage includes ${present.join(', ')}.`);
  }
  if (missingEssential.length) {
    parts.push(`Missing essential categories: ${missingEssential.join(', ')}.`);
  }
  return parts.join(' ');
}

/** Summarise the local-info supplement — counts per resource group and
 *  whether an official city/government site exists. */
function localInfoParagraph(data: LocalInfoSupplement): string {
  const w = data.webcams?.length ?? 0;
  const y = data.youtubeChannels?.length ?? 0;
  const b = data.bloggers?.length ?? 0;
  const o = data.officialSites?.length ?? 0;
  if (w + y + b + o === 0) return '';
  const parts: string[] = [];
  const counts: string[] = [];
  if (o) counts.push(`${o} official site${o === 1 ? '' : 's'}`);
  if (w) counts.push(`${w} webcam${w === 1 ? '' : 's'}`);
  if (y) counts.push(`${y} YouTube channel${y === 1 ? '' : 's'}`);
  if (b) counts.push(`${b} blog${b === 1 ? '' : 's'}`);
  parts.push(`Resources linked: ${counts.join(', ')}.`);
  // Name the top official site if any — that's what most users will click first.
  const topOfficial = data.officialSites?.[0];
  if (topOfficial?.name && topOfficial.url) {
    parts.push(`Primary government reference: [${topOfficial.name}](${topOfficial.url}).`);
  }
  return parts.join(' ');
}

function neighborhoodsParagraph(data: NeighborhoodsSupplement): string {
  const ns = data.neighborhoods.slice(0, 4);
  const bullets = ns.map(n => {
    const rent = (n.housing as Record<string, unknown>)?.['avgRentOneBedroomUSD']
      ?? (n.housing as Record<string, unknown>)?.['avgRentOneBedroomEUR']
      ?? (n.housing as Record<string, unknown>)?.['avgRentTwoBedroomUSD']
      ?? (n.housing as Record<string, unknown>)?.['avgRentTwoBedroomEUR'];
    const safety = n.safetyRating ? `, safety ${n.safetyRating}` : '';
    const expats = n.expats?.communitySize ? `, expat presence ${n.expats.communitySize}` : '';
    const rentStr = rent ? ` (rent ~${rent})` : '';
    return `**${n.name}** — ${n.character}${rentStr}${safety}${expats}.`;
  });
  return `Neighborhood options include: ${bullets.join(' ')}`;
}

/** Narrate saved Monte Carlo scenarios. Each `scenarioData` is a JSON blob
 *  saved from the MC screen with shape `{ kind: 'monte_carlo_v1', successRate,
 *  percentiles, runs, years, params }`. Unknown-shape scenarios (kind
 *  missing or different) get a minimal one-line mention so nothing is hidden. */
function buildScenariosSection(scenarios: Scenario[]): string[] {
  const out: string[] = [];
  out.push(`## Saved Monte Carlo Scenarios`);
  out.push('');
  if (!scenarios?.length) {
    out.push(`No Monte Carlo scenarios have been saved yet. Run a simulation on the Simulate → Monte Carlo screen and click "Save this scenario" to capture one.`);
    out.push('');
    return out;
  }
  // Favorites first, then newest.
  const ordered = [...scenarios].sort((a, b) => {
    if ((b.isFavorite ? 1 : 0) !== (a.isFavorite ? 1 : 0)) return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
  });
  out.push(`${ordered.length} ${ordered.length === 1 ? 'scenario is' : 'scenarios are'} on file.${ordered.some(s => s.isFavorite) ? ' Favorites are listed first.' : ''}`);
  out.push('');

  for (const s of ordered) {
    const d = (s.scenarioData ?? {}) as Record<string, unknown>;
    const kind = d['kind'];
    const star = s.isFavorite ? ' ⭐' : '';
    out.push(`### ${s.name}${star}`);
    out.push('');
    if (kind !== 'monte_carlo_v1') {
      out.push(`_Unknown scenario shape (kind: ${kind ?? 'n/a'})_ — saved ${s.updatedAt ?? 'recently'}.`);
      out.push('');
      continue;
    }

    const sr = d['successRate'] as { value?: number; naturalFrequency?: string } | undefined;
    const pct = d['percentiles'] as Record<string, { value?: number }> | undefined;
    const runs = Number(d['runs']) || 0;
    const years = Number(d['years']) || 0;
    const params = (d['params'] ?? {}) as Record<string, unknown>;
    const loc = (params['location'] ?? {}) as { name?: string; id?: string };
    const portfolio = Number(params['portfolio']) || 0;
    const ssMonthly = Number(params['ssMonthly']) || 0;
    const monthlyIncome = Number(params['monthlyIncome']) || 0;
    const meanReturn = Number(params['meanReturn']) || 0;
    const volatility = Number(params['volatility']) || 0;
    const returnMode = params['returnMode'] as string | undefined;

    const successPct = sr?.value !== undefined ? Math.round(sr.value * 100) : null;
    const outcome = successPct === null ? 'unrecorded'
      : successPct >= 85 ? `strong — ${successPct}% success rate`
      : successPct >= 65 ? `workable — ${successPct}% success rate`
      : successPct >= 40 ? `contested — ${successPct}% success rate`
      : `thin — only ${successPct}% of futures sustained the plan`;

    const locLine = loc.name ? ` in **${loc.name}**` : '';
    out.push(`Anchor location: ${loc.name ?? 'not recorded'}. ${runs.toLocaleString()} runs over ${years} years. Outcome is ${outcome}${locLine && successPct !== null ? '' : ''}.`);
    out.push('');

    if (pct) {
      const parts: string[] = [];
      const fmtP = (k: string) => pct[k]?.value !== undefined ? fmtUsd(pct[k]!.value!) : null;
      const p5 = fmtP('p5'); const p25 = fmtP('p25'); const p50 = fmtP('p50'); const p75 = fmtP('p75'); const p95 = fmtP('p95');
      if (p50) parts.push(`median end balance **${p50}**`);
      if (p5 && p95) parts.push(`5th–95th percentile band from ${p5} to ${p95}`);
      if (p25 && p75) parts.push(`interquartile ${p25}–${p75}`);
      if (parts.length) {
        out.push(`Distribution: ${parts.join('; ')}.`);
        out.push('');
      }
    }

    const assumptionParts: string[] = [];
    if (portfolio > 0) assumptionParts.push(`starting portfolio ${fmtUsd(portfolio)}`);
    if (ssMonthly > 0) assumptionParts.push(`Social Security ${fmtUsd(ssMonthly)}/mo`);
    if (monthlyIncome > 0) assumptionParts.push(`other monthly income ${fmtUsd(monthlyIncome)}/mo`);
    if (meanReturn > 0) assumptionParts.push(`${meanReturn}% mean return`);
    if (volatility > 0) assumptionParts.push(`${volatility}% volatility`);
    if (returnMode) assumptionParts.push(`return model: ${returnMode}`);
    if (assumptionParts.length) {
      out.push(`Key assumptions: ${assumptionParts.join(', ')}.`);
      out.push('');
    }
    if (s.updatedAt) {
      out.push(`_Saved ${new Date(s.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}._`);
      out.push('');
    }
  }
  return out;
}

function collectWarnings(selected: LocationFull[], financial: FinancialSettings | null): string[] {
  const warnings: string[] = [];
  if (!financial?.portfolioBalance) {
    warnings.push(`No portfolio balance on file — most projections are unanchored until FIRE Setup / Settings is filled in.`);
  }
  const missingVisaIncome = selected.filter(l => !l.visa?.incomeRequirement?.monthly && l.country !== 'United States');
  if (missingVisaIncome.length) {
    warnings.push(`Visa income requirements are missing for: ${missingVisaIncome.map(l => l.name).join(', ')}. Verify directly with the local consulate before relying on any assumptions.`);
  }
  const abroad = selected.filter(l => l.country !== 'United States');
  if (abroad.length) {
    warnings.push(`${abroad.length} of the selected locations are outside the US — Medicare does not cover care abroad, so a private-insurance plan or a return-to-US emergency strategy needs to be part of the plan.`);
  }
  const highTax = selected.filter(l => (l.taxes?.vatRate ?? 0) >= 0.18);
  if (highTax.length) {
    warnings.push(`High VAT (≥18%) applies in: ${highTax.map(l => l.name).join(', ')}. VAT quietly pads the real cost of most taxable categories on top of the sticker numbers.`);
  }
  return warnings;
}


function yearsToFire(current: number, target: number, savings: number, rate: number): number {
  if (current >= target) return 0;
  if (savings <= 0 && rate <= 0) return 99;
  let bal = current;
  let years = 0;
  while (bal < target && years < 99) {
    bal = bal * (1 + rate) + savings;
    years++;
  }
  return years;
}

function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

function fmtUsdOrNA(n: number): string {
  return n > 0 ? fmtUsd(n) : 'not set';
}

/** Narrative-friendly label for a household role. Keeps reports generic
 *  across households — using actual member names hardcodes a template to
 *  one person and doesn't scale for batch video generation. */
function roleLabel(role: string): string {
  if (role === 'primary') return 'Primary retiree';
  if (role === 'spouse')  return 'Spouse';
  if (role === 'dependent') return 'Dependent';
  return role[0]!.toUpperCase() + role.slice(1);
}

function prettyPath(path: string | null | undefined): string {
  if (!path) return 'not set';
  return path.split('-').map(s => s[0]!.toUpperCase() + s.slice(1)).join(' ');
}

/* yamlStr moved to @app/lib/text-escape.escYaml — imported at top and
 * aliased to keep the diff minimal. */
