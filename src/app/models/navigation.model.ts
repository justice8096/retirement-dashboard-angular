export type NavMode = 'compact' | 'expanded';
export type FontSize = 'normal' | 'large' | 'xlarge';
export type AppPhase = 'auth' | 'onboarding' | 'dashboard';

export interface Screen {
  id: string;
  label: string;
  badge?: string;
  tier?: 'free' | 'premium';
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  screens: Screen[];
}

export interface FontSizeConfig {
  label: string;
  base: number;
}

export const FONT_SIZES: Record<FontSize, FontSizeConfig> = {
  normal: { label: 'Standard', base: 13 },
  large: { label: 'Large', base: 16 },
  xlarge: { label: 'Extra Large', base: 19 },
};

export const CATEGORIES: Category[] = [
  { id: 'setup', label: 'Setup', icon: '⚙️', screens: [
    { id: 'assumptions', label: 'Assumptions' },
    { id: 'settings', label: 'Settings' },
    { id: 'items', label: 'Items', badge: 'NEW' },
    { id: 'fire-setup', label: 'FIRE Setup', badge: 'NEW' },
  ]},
  { id: 'locations', label: 'Locations', icon: '📍', screens: [
    { id: 'overview', label: 'Overview' },
    { id: 'compare', label: 'Compare' },
    { id: 'map', label: 'Map', badge: 'NEW' },
    { id: 'climate', label: 'Climate', badge: 'NEW' },
    { id: 'visa', label: 'Visa & Residency', badge: 'NEW' },
    { id: 'qol', label: 'Quality of Life', badge: 'NEW' },
    { id: 'manage', label: 'Manage', tier: 'premium' },
  ]},
  { id: 'costs', label: 'Costs', icon: '💰', screens: [
    { id: 'housing', label: 'Housing' },
    { id: 'groceries', label: 'Groceries' },
    { id: 'medicine', label: 'Medicine' },
    { id: 'vision', label: 'Vision & Dental' },
    { id: 'entertainment', label: 'Entertainment' },
    { id: 'transport', label: 'Transportation' },
    { id: 'cellphones', label: 'Cell Phones' },
    { id: 'personalcare', label: 'Personal Care' },
    { id: 'healthcare-compare', label: 'Healthcare Comparison', badge: 'NEW' },
  ]},
  { id: 'income', label: 'Income', icon: '📊', screens: [
    { id: 'ss', label: 'Social Security' },
    { id: 'projections', label: 'Projections' },
    { id: 'sankey', label: 'Cash Flow', badge: 'NEW' },
    { id: 'taxes', label: 'Taxes' },
    { id: 'withdrawal', label: 'Withdrawal Strategy', badge: 'NEW' },
    { id: 'guardrails', label: 'Spending Guardrails', badge: 'NEW' },
    { id: 'roth', label: 'Roth Planner', badge: 'NEW' },
    { id: 'medicare-irmaa', label: 'Medicare IRMAA', badge: 'NEW' },
    { id: 'estate', label: 'Estate Planning', badge: 'NEW' },
    { id: 'fees', label: 'Fees & Currency', badge: 'NEW' },
  ]},
  { id: 'simulate', label: 'Simulate', icon: '🎲', screens: [
    { id: 'montecarlo', label: 'Monte Carlo' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'fire-calc', label: 'FIRE Calculator', badge: 'NEW' },
  ]},
  { id: 'community', label: 'Community', icon: '🏘️', screens: [
    { id: 'neighborhoods', label: 'Neighborhoods' },
    { id: 'services', label: 'Local Services' },
    { id: 'livability', label: 'Livability Index' },
    { id: 'inclusion', label: 'Welcome and Safety' },
    { id: 'localinfo', label: 'Local Info' },
  ]},
  { id: 'share', label: 'Share', icon: '📄', screens: [
    { id: 'brochure', label: 'Brochures' },
    { id: 'video', label: 'Video' },
    { id: 'report', label: 'Narrative Report', badge: 'NEW' },
  ]},
];
