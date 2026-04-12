import { Component, inject, computed } from '@angular/core';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationService } from '@services/location.service';

/* ─── Location screens ──────────────────────────────────────────── */
import { LocationOverviewComponent } from '@components/screens/location-overview/location-overview.component';
import { LocationDetailComponent } from '@components/screens/location-detail/location-detail.component';
import { PlaceholderScreenComponent } from '@components/screens/placeholder-screen/placeholder-screen.component';

/* ─── Cost screens ──────────────────────────────────────────────── */
import { HousingScreenComponent } from '@components/screens/housing-screen/housing-screen.component';
import { GroceriesScreenComponent } from '@components/screens/groceries-screen/groceries-screen.component';
import { MedicineScreenComponent } from '@components/screens/medicine-screen/medicine-screen.component';
import { VisionScreenComponent } from '@components/screens/vision-screen/vision-screen.component';
import { EntertainmentScreenComponent } from '@components/screens/entertainment-screen/entertainment-screen.component';
import { TransportScreenComponent } from '@components/screens/transport-screen/transport-screen.component';
import { CellphonesScreenComponent } from '@components/screens/cellphones-screen/cellphones-screen.component';
import { PersonalcareScreenComponent } from '@components/screens/personalcare-screen/personalcare-screen.component';

/* ─── Income screens ────────────────────────────────────────────── */
import { SsScreenComponent } from '@components/screens/ss-screen/ss-screen.component';
import { ProjectionsScreenComponent } from '@components/screens/projections-screen/projections-screen.component';
import { TaxesScreenComponent } from '@components/screens/taxes-screen/taxes-screen.component';
import { WithdrawalScreenComponent } from '@components/screens/withdrawal-screen/withdrawal-screen.component';
import { RothScreenComponent } from '@components/screens/roth-screen/roth-screen.component';

/* ─── Setup screens ─────────────────────────────────────────────── */
import { AssumptionsScreenComponent } from '@components/screens/assumptions-screen/assumptions-screen.component';
import { SettingsScreenComponent } from '@components/screens/settings-screen/settings-screen.component';
import { FireSetupScreenComponent } from '@components/screens/fire-setup-screen/fire-setup-screen.component';

/* ─── Simulate screens ──────────────────────────────────────────── */
import { MontecarloScreenComponent } from '@components/screens/montecarlo-screen/montecarlo-screen.component';
import { ScenariosScreenComponent } from '@components/screens/scenarios-screen/scenarios-screen.component';
import { FireCalcScreenComponent } from '@components/screens/fire-calc-screen/fire-calc-screen.component';

/* ─── Community screens ─────────────────────────────────────────── */
import { NeighborhoodsScreenComponent } from '@components/screens/neighborhoods-screen/neighborhoods-screen.component';
import { ServicesScreenComponent } from '@components/screens/services-screen/services-screen.component';
import { LivabilityScreenComponent } from '@components/screens/livability-screen/livability-screen.component';
import { LocalinfoScreenComponent } from '@components/screens/localinfo-screen/localinfo-screen.component';

import { LocationCompareComponent } from '@components/screens/location-compare/location-compare.component';

/* ─── Share screens ─────────────────────────────────────────────── */
import { BrochureScreenComponent } from '@components/screens/brochure-screen/brochure-screen.component';
import { VideoScreenComponent } from '@components/screens/video-screen/video-screen.component';

@Component({
  selector: 'app-mock-content',
  standalone: true,
  imports: [
    /* Location */
    LocationOverviewComponent, LocationDetailComponent, PlaceholderScreenComponent,
    /* Costs */
    HousingScreenComponent, GroceriesScreenComponent, MedicineScreenComponent,
    VisionScreenComponent, EntertainmentScreenComponent, TransportScreenComponent,
    CellphonesScreenComponent, PersonalcareScreenComponent,
    /* Income */
    SsScreenComponent, ProjectionsScreenComponent, TaxesScreenComponent,
    WithdrawalScreenComponent, RothScreenComponent,
    /* Setup */
    AssumptionsScreenComponent, SettingsScreenComponent, FireSetupScreenComponent,
    /* Simulate */
    MontecarloScreenComponent, ScenariosScreenComponent, FireCalcScreenComponent,
    /* Location compare */
    LocationCompareComponent,
    /* Community */
    NeighborhoodsScreenComponent, ServicesScreenComponent,
    LivabilityScreenComponent, LocalinfoScreenComponent,
    /* Share */
    BrochureScreenComponent, VideoScreenComponent,
  ],
  template: `
    <div role="tabpanel" class="content-pane">

      @if (dyscalculia.isEnabled()) {
        <div class="dyscalculia-indicator">
          <span class="indicator-icon">🧠</span>
          <span class="indicator-text">
            Dyscalculia support active — numbers adapted for readability
          </span>
          <span class="indicator-detail">
            Format: {{ dyscalculia.settings().numberFormat }}
            · Percentages: {{ dyscalculia.settings().percentageDisplay }}
          </span>
        </div>
      }

      <!-- Screen content router -->
      @switch (screenKey()) {

        <!-- Locations -->
        @case ('locations/overview') {
          @if (loc.selectedLocation()) {
            <app-location-detail />
          } @else {
            <app-location-overview />
          }
        }
        @case ('locations/compare') {
          <app-location-compare />
        }

        <!-- Costs -->
        @case ('costs/housing')       { <app-housing-screen /> }
        @case ('costs/groceries')     { <app-groceries-screen /> }
        @case ('costs/medicine')      { <app-medicine-screen /> }
        @case ('costs/vision')        { <app-vision-screen /> }
        @case ('costs/entertainment') { <app-entertainment-screen /> }
        @case ('costs/transport')     { <app-transport-screen /> }
        @case ('costs/cellphones')    { <app-cellphones-screen /> }
        @case ('costs/personalcare')  { <app-personalcare-screen /> }

        <!-- Income -->
        @case ('income/ss')           { <app-ss-screen /> }
        @case ('income/projections')  { <app-projections-screen /> }
        @case ('income/taxes')        { <app-taxes-screen /> }
        @case ('income/withdrawal')   { <app-withdrawal-screen /> }
        @case ('income/roth')         { <app-roth-screen /> }

        <!-- Setup -->
        @case ('setup/assumptions')   { <app-assumptions-screen /> }
        @case ('setup/settings')      { <app-settings-screen /> }
        @case ('setup/fire-setup')    { <app-fire-setup-screen /> }

        <!-- Simulate -->
        @case ('simulate/montecarlo') { <app-montecarlo-screen /> }
        @case ('simulate/scenarios')  { <app-scenarios-screen /> }
        @case ('simulate/fire-calc')  { <app-fire-calc-screen /> }

        <!-- Community -->
        @case ('community/neighborhoods') { <app-neighborhoods-screen /> }
        @case ('community/services')      { <app-services-screen /> }
        @case ('community/livability')     { <app-livability-screen /> }
        @case ('community/localinfo')     { <app-localinfo-screen /> }

        <!-- Share -->
        @case ('share/brochure')      { <app-brochure-screen /> }
        @case ('share/video')         { <app-video-screen /> }

        @default {
          <app-placeholder-screen />
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .content-pane {
      flex: 1;
      padding: 24px 16px 24px 24px;
      overflow-y: scroll;
      min-height: 0;
    }
    .dyscalculia-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 6px 12px;
      background: rgba(76, 175, 80, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(76, 175, 80, 0.15);
    }
    .indicator-icon { font-size: 14px; }
    .indicator-text {
      font-size: 11px;
      color: var(--dark-green);
    }
    .indicator-detail {
      font-size: 10px;
      color: var(--dark-text-muted);
      margin-left: auto;
    }
  `],
})
export class MockContentComponent {
  readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loc = inject(LocationService);

  readonly screenKey = computed(() =>
    `${this.nav.activeCatId()}/${this.nav.activeScreenId()}`
  );
}
