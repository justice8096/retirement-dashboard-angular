import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NavigationService } from './navigation.service';

/**
 * The Display → Font Size setting must scale ALL app text, not just the nav
 * chrome. The service publishes `--font-scale` on the document root
 * (normal 13px base → 1; large 16px → ~1.231; xlarge 19px → ~1.462) and
 * screen styles multiply their px sizes by it via calc().
 */
describe('NavigationService font scale', () => {
  let nav: NavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    nav = TestBed.inject(NavigationService);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--font-scale');
  });

  function scale(): number {
    TestBed.tick();
    return Number(document.documentElement.style.getPropertyValue('--font-scale'));
  }

  it('publishes --font-scale 1 for the normal size', () => {
    nav.fontSize.set('normal');
    expect(scale()).toBe(1);
  });

  it('publishes 16/13 for large', () => {
    nav.fontSize.set('large');
    expect(scale()).toBeCloseTo(16 / 13, 3);
  });

  it('publishes 19/13 for xlarge', () => {
    nav.fontSize.set('xlarge');
    expect(scale()).toBeCloseTo(19 / 13, 3);
  });
});
