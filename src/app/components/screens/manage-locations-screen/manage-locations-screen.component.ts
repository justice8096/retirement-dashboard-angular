import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { COST_CATEGORIES, LocationSummary } from '@models/api.model';
import type { AdminLocationHistoryEntry } from '@models/api.model';

/** Screen-level admin-access state. `checking` while the probe request is
 *  in flight; the others are terminal until the user retries. */
type GateState = 'checking' | 'admin' | 'unauthenticated' | 'forbidden' | 'error';

interface CostFormRow {
  typical: number;
  min: number;
  max: number;
  /** Displayed/edited as a whole percent (e.g. 3 for 3%); converted to the
   *  stored 0..1 fraction (0.03) in `buildLocationDataPatch`. */
  annualInflationPct: number;
}

/** Flat, ngModel-friendly draft shape for the create/edit form — mirrors
 *  the retired React `LocationForm.tsx` field set 1:1 (same labels, same
 *  grouping), adapted to this app's current `LocationFull` schema
 *  (`subregion` added, `COST_CATEGORIES` is the current 18-category list
 *  rather than React's smaller set, rate fields stored as 0..1 fractions
 *  per this API's numeric convention rather than React's raw 0..100). */
interface LocationFormModel {
  id: string;
  name: string;
  country: string;
  region: string;
  subregion: string;
  cities: string; // comma-separated
  currency: string;
  exchangeRate: number;
  visaType: string;
  visaIncome: number;
  visaIncomeCurr: string;
  visaNotes: string;
  winterLow: number;
  summerHigh: number;
  rainyDays: number;
  healthSystem: string;
  healthQuality: number;
  dentalIncluded: boolean;
  waitTimes: string;
  rxCoverage: string;
  internet: string;
  dogFriendly: number;
  expatComm: number;
  english: number;
  safety: number;
  pros: string; // one per line
  cons: string; // one per line
  taxNotes: string;
  vatPct: number;    // 0..100 for display; stored as vatRate 0..1
  socialPct: number; // 0..100 for display; stored as socialChargesRate 0..1
  costs: Record<string, CostFormRow>;
}

/** Top-level keys on the object returned by `GET /api/locations/:id` that
 *  are purely computed at read time (never part of the stored JSONB) —
 *  stripped before merging form edits back in, so they don't get baked
 *  into storage. Nested injected fields (e.g. `taxes.sources`,
 *  `healthcare.acaMarketplace._units`) are left alone: the API's own
 *  injection is idempotent/additive on those, matching the retired React
 *  AdminPanel's accepted fetch-edit-save round-trip. */
const SYNTHETIC_TOP_LEVEL_KEYS = ['_version', 'updatedAt', '_a11y', 'acaBridgeSavingsDraw', 'monthlyCostTotal'];

function emptyCosts(): Record<string, CostFormRow> {
  const costs: Record<string, CostFormRow> = {};
  for (const cat of COST_CATEGORIES) {
    costs[cat.key] = { typical: 0, min: 0, max: 0, annualInflationPct: 3 };
  }
  return costs;
}

function emptyForm(): LocationFormModel {
  return {
    id: '', name: '', country: '', region: '', subregion: '', cities: '',
    currency: 'USD', exchangeRate: 1,
    visaType: '', visaIncome: 0, visaIncomeCurr: '', visaNotes: '',
    winterLow: 40, summerHigh: 85, rainyDays: 100,
    healthSystem: '', healthQuality: 7, dentalIncluded: false, waitTimes: '', rxCoverage: '',
    internet: '', dogFriendly: 5, expatComm: 5, english: 5, safety: 5,
    pros: '', cons: '',
    taxNotes: '', vatPct: 0, socialPct: 0,
    costs: emptyCosts(),
  };
}

/** Slugify a display name into a location id candidate — matches the
 *  retired React `buildLocationFromForm`'s id derivation exactly. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function asNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merges `patch` onto `original`, recursing into matching plain
 *  objects at any depth (e.g. `taxes`, `healthcare`, each
 *  `monthlyCosts.<category>`) so fields the form doesn't expose —
 *  `taxes.federalIncomeTax`, `monthlyCosts.rent.sources`,
 *  `healthcare.acaMarketplace`, ... — survive a save untouched. Arrays
 *  (`pros`, `cons`, `cities`) are full replacements, not merged element-
 *  wise, matching the form's "one per line" / "comma-separated" editors. */
function deepMergeLocationData(original: unknown, patch: unknown): unknown {
  if (patch === undefined) return original;
  if (isPlainObject(patch) && isPlainObject(original)) {
    const merged: Record<string, unknown> = { ...original };
    for (const [key, val] of Object.entries(patch)) {
      merged[key] = deepMergeLocationData(original[key], val);
    }
    return merged;
  }
  return patch;
}

/** Reverse-map a raw `locationData` blob (from `GET /api/locations/:id`,
 *  or nothing for the create path) into the flat form model. Missing /
 *  malformed fields fall back to sane defaults — admin-authored JSON in
 *  the wild is not guaranteed to carry every optional field. */
function formFromLocationData(id: string, data: Record<string, unknown>): LocationFormModel {
  const visa = (data['visa'] ?? {}) as Record<string, unknown>;
  const incomeReq = (visa['incomeRequirement'] ?? {}) as Record<string, unknown>;
  const climate = (data['climate'] ?? {}) as Record<string, unknown>;
  const healthcare = (data['healthcare'] ?? {}) as Record<string, unknown>;
  const lifestyle = (data['lifestyle'] ?? {}) as Record<string, unknown>;
  const taxes = (data['taxes'] ?? {}) as Record<string, unknown>;
  const monthlyCosts = (data['monthlyCosts'] ?? {}) as Record<string, Record<string, unknown>>;

  const costs: Record<string, CostFormRow> = {};
  for (const cat of COST_CATEGORIES) {
    const mc = monthlyCosts[cat.key] ?? {};
    costs[cat.key] = {
      typical: asNum(mc['typical']),
      min: asNum(mc['min']),
      max: asNum(mc['max']),
      annualInflationPct: mc['annualInflation'] !== undefined ? asNum(mc['annualInflation']) * 100 : 3,
    };
  }

  const pros = Array.isArray(data['pros']) ? (data['pros'] as unknown[]) : [];
  const cons = Array.isArray(data['cons']) ? (data['cons'] as unknown[]) : [];
  const bulletText = (b: unknown): string => (typeof b === 'string' ? b : asStr((b as Record<string, unknown>)?.['text']));

  return {
    id,
    name: asStr(data['name']),
    country: asStr(data['country']),
    region: asStr(data['region']),
    subregion: asStr(data['subregion']),
    cities: Array.isArray(data['cities']) ? (data['cities'] as unknown[]).join(', ') : '',
    currency: asStr(data['currency']) || 'USD',
    exchangeRate: data['exchangeRate'] !== undefined ? asNum(data['exchangeRate'], 1) : 1,
    visaType: asStr(visa['type']),
    visaIncome: asNum(incomeReq['monthly']),
    visaIncomeCurr: asStr(incomeReq['currency']),
    visaNotes: asStr(visa['notes']),
    winterLow: climate['winterLowF'] !== undefined ? asNum(climate['winterLowF'], 40) : 40,
    summerHigh: climate['summerHighF'] !== undefined ? asNum(climate['summerHighF'], 85) : 85,
    rainyDays: climate['rainyDaysPerYear'] !== undefined ? asNum(climate['rainyDaysPerYear'], 100) : 100,
    healthSystem: asStr(healthcare['system']),
    healthQuality: healthcare['qualityRating'] !== undefined ? asNum(healthcare['qualityRating'], 7) : 7,
    dentalIncluded: healthcare['dentalIncluded'] === true,
    waitTimes: asStr(healthcare['waitTimes']),
    rxCoverage: asStr(healthcare['prescriptionCoverage']),
    internet: asStr(lifestyle['internetSpeed']),
    dogFriendly: lifestyle['dogFriendly'] !== undefined ? asNum(lifestyle['dogFriendly'], 5) : 5,
    expatComm: lifestyle['expatCommunity'] !== undefined ? asNum(lifestyle['expatCommunity'], 5) : 5,
    english: lifestyle['englishPrevalence'] !== undefined ? asNum(lifestyle['englishPrevalence'], 5) : 5,
    safety: lifestyle['safetyRating'] !== undefined ? asNum(lifestyle['safetyRating'], 5) : 5,
    pros: pros.map(bulletText).join('\n'),
    cons: cons.map(bulletText).join('\n'),
    taxNotes: asStr(taxes['notes']),
    vatPct: asNum(taxes['vatRate']) * 100,
    socialPct: asNum(taxes['socialChargesRate']) * 100,
    costs,
  };
}

/** Forward-map the flat form model into the `locationData` patch this
 *  screen owns. Only these top-level keys are touched; callers overlay
 *  this onto the previously-fetched raw object (edit) or use it as-is
 *  (create) so fields the form doesn't expose (federal/state tax
 *  brackets, ACA marketplace data, source citations, ...) survive a save
 *  untouched. */
function buildLocationDataPatch(form: LocationFormModel): Record<string, unknown> {
  const monthlyCosts: Record<string, unknown> = {};
  for (const cat of COST_CATEGORIES) {
    const row = form.costs[cat.key] ?? { typical: 0, min: 0, max: 0, annualInflationPct: 3 };
    monthlyCosts[cat.key] = {
      typical: asNum(row.typical),
      min: asNum(row.min),
      max: asNum(row.max),
      annualInflation: asNum(row.annualInflationPct, 3) / 100,
    };
  }

  return {
    id: form.id,
    name: form.name.trim(),
    country: form.country.trim(),
    region: form.region.trim(),
    subregion: form.subregion.trim() || undefined,
    cities: form.cities.split(',').map(s => s.trim()).filter(Boolean),
    currency: form.currency.trim() || 'USD',
    exchangeRate: asNum(form.exchangeRate, 1),
    visa: {
      type: form.visaType,
      incomeRequirement: form.visaIncome
        ? { monthly: asNum(form.visaIncome), currency: form.visaIncomeCurr || form.currency }
        : null,
      notes: form.visaNotes,
    },
    climate: {
      winterLowF: asNum(form.winterLow, 40),
      summerHighF: asNum(form.summerHigh, 85),
      rainyDaysPerYear: asNum(form.rainyDays, 100),
      meetsWarmWinterReq: asNum(form.winterLow, 40) >= 50,
    },
    monthlyCosts,
    healthcare: {
      system: form.healthSystem,
      qualityRating: asNum(form.healthQuality, 7),
      dentalIncluded: form.dentalIncluded,
      waitTimes: form.waitTimes,
      prescriptionCoverage: form.rxCoverage,
    },
    lifestyle: {
      internetSpeed: form.internet,
      dogFriendly: asNum(form.dogFriendly, 5),
      expatCommunity: asNum(form.expatComm, 5),
      englishPrevalence: asNum(form.english, 5),
      safetyRating: asNum(form.safety, 5),
    },
    pros: form.pros.split('\n').map(s => s.trim()).filter(Boolean),
    cons: form.cons.split('\n').map(s => s.trim()).filter(Boolean),
    taxes: {
      notes: form.taxNotes,
      vatRate: asNum(form.vatPct) / 100,
      socialChargesRate: asNum(form.socialPct) / 100,
    },
  };
}

/**
 * Manage Locations — admin screen (A4 parity port #6, the final port on
 * the approved list). Ports the retired React `AdminPanel.tsx` (the
 * `/api/admin/locations` surface embedded at the bottom of
 * `ManageLocationsTab.tsx`) as its own full screen: catalog list, create/
 * edit/delete, per-location version history, and a catalog-wide reindex.
 *
 * The React tab also had a separate "add my own custom location" flow
 * (`useLocationSync` + `/api/me/locations`, a *different*, non-admin,
 * basic+-tier route) — that's a distinct, not-yet-ported feature and is
 * intentionally out of scope here; this screen is the admin-only catalog
 * surface the A4 audit names.
 *
 * Access gating: unlike most `tier: 'premium'` screens, this one is
 * enforced by the *server's* `requireAdmin` check (tier === 'admin'), not
 * a client-side tier gate — this app has no admin-role concept of its
 * own (see AuthService). `ngOnInit` probes with a read-only admin-gated
 * call and renders a clean state for `unauthenticated` / `forbidden`
 * instead of leaking raw HTTP errors into the CRUD UI.
 */
@Component({
  selector: 'app-manage-locations-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, DatePipe],
  templateUrl: './manage-locations-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./manage-locations-screen.component.scss'],
})
export class ManageLocationsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly currency = inject(CurrencyFormatService);

  readonly costCategories = COST_CATEGORIES;

  /* ─── Access gate ─────────────────────────────────────────────── */
  readonly gate = signal<GateState>('checking');

  /* ─── Catalog list ────────────────────────────────────────────── */
  readonly locations = signal<LocationSummary[]>([]);
  readonly loadingList = signal(false);
  readonly listError = signal<string | null>(null);
  readonly searchTerm = signal('');

  readonly filteredLocations = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const all = this.locations();
    if (!q) return all;
    return all.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.country?.toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q));
  });

  /* ─── Create / edit form ──────────────────────────────────────── */
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly form = signal<LocationFormModel>(emptyForm());
  private originalRaw: Record<string, unknown> | null = null;
  readonly formLoading = signal(false);
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);

  /* ─── Delete (two-step confirm — no existing confirm() pattern in
   *  this app to follow, so an inline arm/disarm is used, matching the
   *  reindex confirm below for consistency). ─────────────────────── */
  readonly pendingDeleteId = signal<string | null>(null);
  readonly deleting = signal(false);

  /* ─── Version history ─────────────────────────────────────────── */
  readonly historyForId = signal<string | null>(null);
  readonly history = signal<AdminLocationHistoryEntry[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);

  /* ─── Reindex ─────────────────────────────────────────────────── */
  readonly reindexArmed = signal(false);
  readonly reindexRunning = signal(false);
  readonly reindexMessage = signal<string | null>(null);

  /* ─── Update log — mirrors the retired React tab's session log ──── */
  readonly log = signal<string[]>([]);

  ngOnInit(): void {
    this.loadList(() => this.probeAdminAccess());
  }

  /** Loads the public catalog list (always visible — `GET /api/locations`
   *  has no auth gate), then invokes `after()` once it settles. */
  private loadList(after?: () => void): void {
    this.loadingList.set(true);
    this.listError.set(null);
    this.api.getLocations({ fields: 'summary', limit: 500, sortBy: 'name', sortDir: 'asc' }).subscribe({
      next: (page) => {
        this.locations.set(page.data as LocationSummary[]);
        this.loadingList.set(false);
        after?.();
      },
      error: () => {
        this.loadingList.set(false);
        this.listError.set("Couldn't load the location catalog — check your connection and try again.");
        after?.();
      },
    });
  }

  /** Read-only, side-effect-free probe: history lookup for a real
   *  location id (falls back to a harmless placeholder id if the catalog
   *  is somehow empty). 200 => admin; 401 => not signed in; 403 => signed
   *  in but not admin; anything else => generic error state. */
  private probeAdminAccess(): void {
    this.gate.set('checking');
    const probeId = this.locations()[0]?.id ?? '__admin_access_probe__';
    this.api.getAdminLocationHistory(probeId, 1, 1).subscribe({
      next: () => this.gate.set('admin'),
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) this.gate.set('unauthenticated');
        else if (err.status === 403) this.gate.set('forbidden');
        else this.gate.set('error');
      },
    });
  }

  retryGate(): void {
    this.loadList(() => this.probeAdminAccess());
  }

  private pushLog(msg: string): void {
    this.log.update(prev => [...prev.slice(-50), new Date().toLocaleTimeString() + ' — ' + msg]);
  }

  fmtCost(amount: number): string { return this.currency.currencyMonthly(amount); }

  /* ─── Create / edit ───────────────────────────────────────────── */

  startCreate(): void {
    this.editingId.set(null);
    this.originalRaw = null;
    this.form.set(emptyForm());
    this.formError.set(null);
    this.formOpen.set(true);
  }

  startEdit(id: string): void {
    this.editingId.set(id);
    this.formOpen.set(true);
    this.formError.set(null);
    this.formLoading.set(true);
    this.form.set(emptyForm());
    this.api.getLocation(id).subscribe({
      next: (data) => {
        const raw = { ...(data as unknown as Record<string, unknown>) };
        for (const key of SYNTHETIC_TOP_LEVEL_KEYS) delete raw[key];
        this.originalRaw = raw;
        this.form.set(formFromLocationData(id, raw));
        this.formLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.formLoading.set(false);
        this.formError.set(this.describeError(err, 'Failed to load location'));
      },
    });
  }

  /** Auto-fills the id field from the name while creating — matches the
   *  retired React form's live "ID (auto-generated)" preview, but editable
   *  here since the server requires the client to supply it on create. */
  onNameChange(name: string): void {
    this.form.update(f => {
      const shouldAutoSlug = !this.editingId() && (f.id === '' || f.id === slugify(f.name));
      return { ...f, name, id: shouldAutoSlug ? slugify(name) : f.id };
    });
  }

  patchForm(partial: Partial<LocationFormModel>): void {
    this.form.update(f => ({ ...f, ...partial }));
  }

  patchCost(catKey: string, field: keyof CostFormRow, value: number): void {
    this.form.update(f => ({
      ...f,
      costs: { ...f.costs, [catKey]: { ...f.costs[catKey], [field]: value } },
    }));
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.originalRaw = null;
    this.formError.set(null);
  }

  save(): void {
    const f = this.form();
    if (!f.name.trim()) { this.formError.set('Location name is required.'); return; }
    if (!f.country.trim()) { this.formError.set('Country is required.'); return; }
    const editingId = this.editingId();
    if (!editingId && !/^[a-z0-9-]+$/.test(f.id)) {
      this.formError.set('Location ID must be lowercase letters, numbers, and hyphens only.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const patch = buildLocationDataPatch(f);

    if (editingId) {
      const merged = deepMergeLocationData(this.originalRaw ?? {}, patch) as Record<string, unknown>;
      this.api.updateAdminLocation(editingId, merged).subscribe({
        next: () => {
          this.saving.set(false);
          this.pushLog(`Updated location: ${f.name}`);
          this.formOpen.set(false);
          this.editingId.set(null);
          this.originalRaw = null;
          this.loadList();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.formError.set(this.describeError(err, 'Save failed'));
        },
      });
    } else {
      this.api.createAdminLocation(f.id, patch).subscribe({
        next: () => {
          this.saving.set(false);
          this.pushLog(`Added location: ${f.name}`);
          this.formOpen.set(false);
          this.loadList();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.formError.set(this.describeError(err, 'Save failed'));
        },
      });
    }
  }

  /* ─── Delete ──────────────────────────────────────────────────── */

  armDelete(id: string): void { this.pendingDeleteId.set(id); }
  cancelDelete(): void { this.pendingDeleteId.set(null); }

  confirmDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) return;
    this.deleting.set(true);
    this.api.deleteAdminLocation(id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDeleteId.set(null);
        this.pushLog(`Deleted location: ${id}`);
        if (this.editingId() === id) this.cancelForm();
        if (this.historyForId() === id) this.closeHistory();
        this.loadList();
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.pendingDeleteId.set(null);
        this.pushLog(`Error deleting ${id}: ${this.describeError(err, 'delete failed')}`);
      },
    });
  }

  /* ─── History ─────────────────────────────────────────────────── */

  showHistory(id: string): void {
    this.historyForId.set(id);
    this.historyLoading.set(true);
    this.historyError.set(null);
    this.history.set([]);
    this.api.getAdminLocationHistory(id, 1, 20).subscribe({
      next: (page) => {
        this.history.set(page.data);
        this.historyLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.historyLoading.set(false);
        this.historyError.set(this.describeError(err, 'Failed to load history'));
      },
    });
  }

  closeHistory(): void {
    this.historyForId.set(null);
    this.history.set([]);
    this.historyError.set(null);
  }

  /* ─── Reindex ─────────────────────────────────────────────────── */

  armReindex(): void { this.reindexArmed.set(true); }
  cancelReindex(): void { this.reindexArmed.set(false); }

  confirmReindex(): void {
    this.reindexArmed.set(false);
    this.reindexRunning.set(true);
    this.reindexMessage.set(null);
    this.api.reindexAdminLocations().subscribe({
      next: (res) => {
        this.reindexRunning.set(false);
        this.reindexMessage.set(res.message);
        this.pushLog(res.message);
        this.loadList();
      },
      error: (err: HttpErrorResponse) => {
        this.reindexRunning.set(false);
        const msg = this.describeError(err, 'Reindex failed');
        this.reindexMessage.set(msg);
        this.pushLog(`Reindex error: ${msg}`);
      },
    });
  }

  /** Plain-language error text — prefers the validation envelope's first
   *  field message (`{ error, details: [{ message }] }`), falls back to
   *  the flat `{ error }` shape, then a generic fallback. */
  private describeError(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as { error?: string; details?: { message?: string }[] } | undefined;
    return body?.details?.[0]?.message ?? body?.error ?? fallback;
  }
}
