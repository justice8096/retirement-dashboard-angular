import { Injectable, signal, computed } from '@angular/core';
import {
  NavMode,
  FontSize,
  AppPhase,
  Category,
  CATEGORIES,
  FONT_SIZES,
} from '@models/navigation.model';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  readonly phase = signal<AppPhase>('onboarding');
  readonly navMode = signal<NavMode>('expanded');
  readonly fontSize = signal<FontSize>('normal');
  readonly activeCatId = signal<string>('locations');
  readonly activeScreenId = signal<string>('overview');
  readonly focusedCatId = signal<string | null>(null);
  readonly showA11yPanel = signal<boolean>(false);
  readonly a11yTab = signal<'display' | 'dyscalculia'>('display');

  readonly categories = signal<Category[]>(CATEGORIES);

  readonly activeCat = computed(() =>
    this.categories().find(c => c.id === this.activeCatId()) ?? null
  );

  readonly fontSizeBase = computed(() => FONT_SIZES[this.fontSize()].base);

  readonly railWidth = computed(() =>
    this.navMode() === 'compact' ? 52 : 180
  );

  // ─── Actions ────────────────────────────────────────────────────────

  completeOnboarding(mode: NavMode, fontSize: FontSize): void {
    this.navMode.set(mode);
    this.fontSize.set(fontSize);
    this.phase.set('dashboard');
  }

  selectCategory(catId: string): void {
    this.activeCatId.set(catId);
    const cat = this.categories().find(c => c.id === catId);
    if (cat?.screens.length) {
      this.activeScreenId.set(cat.screens[0].id);
    }
  }

  selectScreen(screenId: string): void {
    this.activeScreenId.set(screenId);
  }

  toggleNavMode(): void {
    this.navMode.update(m => m === 'compact' ? 'expanded' : 'compact');
  }

  toggleA11yPanel(): void {
    this.showA11yPanel.update(v => !v);
  }

  setA11yTab(tab: 'display' | 'dyscalculia'): void {
    this.a11yTab.set(tab);
  }

  cycleFontSize(): void {
    const order: FontSize[] = ['normal', 'large', 'xlarge'];
    const current = order.indexOf(this.fontSize());
    this.fontSize.set(order[(current + 1) % order.length]);
  }
}
