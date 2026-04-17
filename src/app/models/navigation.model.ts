export type NavMode = 'compact' | 'expanded';
export type FontSize = 'normal' | 'large' | 'xlarge';
export type AppPhase = 'onboarding' | 'dashboard';

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
  ]},
  { id: 'income', label: 'Income', icon: '📊', screens: [
    { id: 'ss', label: 'Social Security' },
    { id: 'projections', label: 'Projections' },
    { id: 'taxes', label: 'Taxes' },
    { id: 'withdrawal', label: 'Withdrawal Strategy', badge: 'NEW' },
    { id: 'roth', label: 'Roth Planner', badge: 'NEW' },
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
    { id: 'localinfo', label: 'Local Info' },
  ]},
  { id: 'share', label: 'Share', icon: '📄', screens: [
    { id: 'brochure', label: 'Brochures' },
    { id: 'video', label: 'Video' },
  ]},
];
