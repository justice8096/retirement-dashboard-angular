import { HelpEntry } from '@models/help.model';

/**
 * Per-screen help content. Plain-language, grade-8 readability target,
 * short sentences, short paragraphs — designed for read-aloud and Bionic
 * bolding to work cleanly.
 *
 * Financial terms surface as chips that link to /api/glossary.
 */
export const HELP_CONTENT: Record<string, HelpEntry> = {
  // ─── Setup ──────────────────────────────────────────────────────
  assumptions: {
    screenId: 'assumptions',
    title: 'Assumptions',
    summary:
      'Set the baseline numbers used everywhere else in the app.',
    sections: [
      {
        heading: 'What you set here',
        body: [
          'Your expected investment return, inflation, and how long retirement might last.',
          'These values flow into the FIRE Calculator, Monte Carlo, and Projections screens.',
        ],
      },
      {
        heading: 'How to pick good values',
        body: [
          'For returns, a 5–7% yearly average is a common starting point for a stock-heavy portfolio.',
          'For inflation, 2–3% per year is typical in the United States over the past decade.',
          'Change them anytime. The rest of the app updates in real time.',
        ],
      },
    ],
    glossaryKeys: ['expected_return', 'expected_inflation', 'cagr'],
    related: ['settings', 'fire-setup', 'projections'],
    tips: [
      'Too-optimistic returns lead to false confidence. Try a lower return and see how Monte Carlo reacts.',
    ],
  },

  settings: {
    screenId: 'settings',
    title: 'Financial Settings',
    summary:
      'Your portfolio balance, asset mix, and how Social Security is handled.',
    sections: [
      {
        heading: 'Portfolio',
        body: [
          'Enter your total savings across all retirement accounts.',
          'Balances are encrypted before being stored. Only you can read them.',
        ],
      },
      {
        heading: 'Asset allocation',
        body: [
          'Split your money across stocks, bonds, cash, and international.',
          'The four shares should add up to 100%.',
        ],
      },
      {
        heading: 'Social Security',
        body: [
          'Set when you expect benefits to start and whether to model a benefits cut.',
          'A cut scenario helps you plan for a more conservative future.',
        ],
      },
    ],
    glossaryKeys: ['expected_return', 'expected_inflation'],
    related: ['assumptions', 'ss', 'taxes'],
  },

  'fire-setup': {
    screenId: 'fire-setup',
    title: 'FIRE Setup',
    summary:
      'Choose a FIRE path and set your target retirement age.',
    sections: [
      {
        heading: 'Paths you can pick',
        body: [
          'Traditional: retire in your 60s with full savings.',
          'FIRE: retire early with 25× annual spending saved.',
          'Coast FIRE: stop saving now and let compound growth reach the target.',
          'Barista FIRE: retire mostly, cover the gap with light part-time work.',
        ],
      },
      {
        heading: 'What the multiplier means',
        body: [
          'A 25× multiplier comes from the 4% rule. Multiply your yearly spending by 25 to get your FIRE Number.',
          'A lower rate (say 3.5%) means a bigger multiplier and a larger target.',
        ],
      },
    ],
    glossaryKeys: ['fire_number', 'coast_fire', 'barista_fire', 'safe_withdrawal_rate'],
    related: ['fire-calc', 'montecarlo'],
    tips: [
      'Coast FIRE is great if you like your job but want the freedom to stop saving.',
    ],
  },

  // ─── Locations ──────────────────────────────────────────────────
  overview: {
    screenId: 'overview',
    title: 'Locations Overview',
    summary:
      'Pick the cities you want to compare and keep track of your favorites.',
    sections: [
      {
        heading: 'What this screen does',
        body: [
          'Lets you browse available cities and mark the ones you are considering.',
          'Your selected cities drive the Compare, Local Info, and Neighborhoods screens.',
        ],
      },
    ],
    related: ['compare', 'neighborhoods', 'localinfo'],
  },

  compare: {
    screenId: 'compare',
    title: 'Compare Cities',
    summary:
      'Side-by-side view of the cities you marked, across cost, safety, and livability.',
    sections: [
      {
        heading: 'How to read the cells',
        body: [
          'Each cell shows the metric name above the value.',
          'Bars are drawn from 0 to 10. Longer is better except where noted.',
          'Tag rows list amenities or traits, one per chip.',
        ],
      },
    ],
    related: ['overview', 'livability', 'neighborhoods'],
    tips: [
      'If a city is missing data, that cell says "—" rather than showing a misleading zero.',
    ],
  },

  manage: {
    screenId: 'manage',
    title: 'Manage Custom Locations',
    summary:
      'Add your own cities or override costs for built-in ones.',
    sections: [
      {
        heading: 'When to use this',
        body: [
          'Add a city we do not have yet, or adjust built-in costs using local knowledge.',
          'Your overrides stay private and only affect your projections.',
        ],
      },
    ],
    related: ['overview'],
  },

  // ─── Costs (shared-ish content; each screen has its own nuance) ─────
  housing: costsScreen('Housing', 'rent or mortgage, plus utilities and basic repairs'),
  groceries: costsScreen('Groceries', 'food bought at supermarkets and local shops'),
  medicine: costsScreen('Medicine', 'insurance premiums, copays, and regular prescriptions'),
  vision: costsScreen('Vision & Dental', 'eye exams, glasses, and routine dental care'),
  entertainment: costsScreen('Entertainment', 'streaming, dining out, and leisure activities'),
  transport: costsScreen('Transportation', 'gas, public transit, rideshares, and insurance'),
  cellphones: costsScreen('Cell Phones', 'monthly plans and device purchases'),
  personalcare: costsScreen('Personal Care', 'haircuts, toiletries, and grooming'),

  // ─── Income ─────────────────────────────────────────────────────
  ss: {
    screenId: 'ss',
    title: 'Social Security',
    summary:
      'Plan your Social Security benefit and model future changes.',
    sections: [
      {
        heading: 'What matters',
        body: [
          'Your Primary Insurance Amount (PIA) is the benefit at full retirement age.',
          'Claiming earlier reduces the amount; claiming later increases it.',
        ],
      },
      {
        heading: 'Benefit cut scenarios',
        body: [
          'The Social Security trust fund is projected to fall short around 2033.',
          'You can model a cut by setting a year and a new percentage.',
        ],
      },
    ],
    related: ['settings', 'projections'],
  },

  projections: {
    screenId: 'projections',
    title: 'Projections',
    summary:
      'A year-by-year view of your portfolio, income, and spending.',
    sections: [
      {
        heading: 'How to read the chart',
        body: [
          'The line shows your portfolio balance over time.',
          'Colored bands below show spending categories.',
          'Inflation and returns compound each year, using the values from Assumptions.',
        ],
      },
    ],
    glossaryKeys: ['expected_return', 'expected_inflation', 'cagr'],
    related: ['assumptions', 'montecarlo', 'fire-calc'],
  },

  taxes: {
    screenId: 'taxes',
    title: 'Taxes',
    summary:
      'Estimate US federal and state taxes on your retirement income.',
    sections: [
      {
        heading: 'What is modeled',
        body: [
          'Federal income tax brackets, Social Security taxation, and state income tax if applicable.',
          'Roth withdrawals are tax-free in the US; Traditional withdrawals are taxed as income.',
        ],
      },
    ],
    related: ['projections', 'withdrawal', 'roth'],
  },

  withdrawal: {
    screenId: 'withdrawal',
    title: 'Withdrawal Strategy',
    summary:
      'Pick how you take money out of your portfolio each year.',
    sections: [
      {
        heading: 'The six strategies',
        body: [
          'Fixed percent: same share every year. Simple.',
          'Constant dollar: same amount every year, inflation-adjusted.',
          'Guardrails: adjust spending when markets push you too high or too low.',
          'VPW: divide by an age-based number — spend more as you age.',
          'Bucket: short-term cash, mid-term bonds, long-term stocks.',
          'Floor-Ceiling: essentials from guaranteed income, discretionary flexes.',
        ],
      },
    ],
    glossaryKeys: ['safe_withdrawal_rate', 'vpw', 'guardrails', 'bucket_strategy', 'floor_ceiling'],
    related: ['taxes', 'roth', 'montecarlo'],
    tips: [
      'Guardrails and VPW tend to hold up better than fixed-percent in Monte Carlo simulations.',
    ],
  },

  roth: {
    screenId: 'roth',
    title: 'Roth Planner',
    summary:
      'Plan Roth conversions to reduce future required distributions.',
    sections: [
      {
        heading: 'What a Roth conversion does',
        body: [
          'You move money from a Traditional IRA to a Roth IRA and pay income tax on it now.',
          'Future growth and withdrawals from the Roth are tax-free in the US.',
          'Best done in low-income years (early retirement, before Social Security starts).',
        ],
      },
    ],
    glossaryKeys: ['roth_conversion', 'rmd'],
    related: ['withdrawal', 'taxes'],
  },

  fees: {
    screenId: 'fees',
    title: 'Fees & Currency',
    summary:
      'Account for advisor fees, fund expense ratios, and currency conversion costs.',
    sections: [
      {
        heading: 'Why fees matter',
        body: [
          'A 1% yearly fee on $1,000,000 costs $10,000 per year. Over 30 years that adds up.',
          'Small differences compound into large amounts.',
        ],
      },
      {
        heading: 'Foreign currency',
        body: [
          'If you plan to live abroad, exchange rates move year to year.',
          'FX drift models a steady trend; currency volatility models random year-to-year changes.',
        ],
      },
    ],
    glossaryKeys: ['expense_ratio', 'brokerage_fee', 'fx_drift'],
    related: ['settings', 'montecarlo'],
  },

  // ─── Simulate ───────────────────────────────────────────────────
  montecarlo: {
    screenId: 'montecarlo',
    title: 'Monte Carlo Simulation',
    summary:
      'Test your plan against thousands of random futures to see how often it works.',
    sections: [
      {
        heading: 'What the success rate means',
        body: [
          'A 70% success rate means "7 out of 10 simulated futures left you above $0".',
          'Not every failure is catastrophic — some end with just a small shortfall.',
        ],
      },
      {
        heading: 'How to use the results',
        body: [
          'If your success rate is low, try cutting discretionary spending, saving more, or delaying retirement.',
          'Re-run the simulation. Compare the new success rate to the old one.',
        ],
      },
    ],
    glossaryKeys: ['monte_carlo', 'success_rate', 'sequence_risk'],
    related: ['assumptions', 'scenarios', 'withdrawal'],
    tips: [
      'The 5th percentile "worst case" is what to plan for. Not the average.',
    ],
  },

  scenarios: {
    screenId: 'scenarios',
    title: 'Scenarios',
    summary:
      'Save and compare different sets of inputs.',
    sections: [
      {
        heading: 'What you can save',
        body: [
          'Any combination of assumptions, portfolio, and withdrawal choices.',
          'Name each scenario so you can tell them apart (for example, "Retire at 55" vs "Retire at 60").',
        ],
      },
    ],
    related: ['montecarlo', 'fire-calc'],
    tips: [
      'Keep scenarios focused. Change one thing at a time to see what matters most.',
    ],
  },

  'fire-calc': {
    screenId: 'fire-calc',
    title: 'FIRE Calculator',
    summary:
      'Work out your FIRE Number and how long until you reach it.',
    sections: [
      {
        heading: 'The numbers explained',
        body: [
          'FIRE Number: what you need saved.',
          'Years to FIRE: how long at your current savings rate.',
          'FIRE Age: your age when you reach the target.',
          'Savings Rate: what share of your take-home you save each year.',
        ],
      },
      {
        heading: 'The step ladder',
        body: [
          'The "How the FIRE Number is calculated" list breaks the formula into three plain-language steps.',
          'Spend → multiply by 25× → equals target.',
        ],
      },
    ],
    glossaryKeys: ['fire_number', 'safe_withdrawal_rate', 'cagr'],
    related: ['fire-setup', 'montecarlo', 'projections'],
    tips: [
      'Small increases in savings rate shave off years. Try raising it by 5% and see what changes.',
    ],
  },

  // ─── Community ──────────────────────────────────────────────────
  neighborhoods: {
    screenId: 'neighborhoods',
    title: 'Neighborhoods',
    summary:
      'Explore the parts of each selected city — cost, safety, vibe.',
    sections: [
      {
        heading: 'What the scores mean',
        body: [
          'Bars are 0 to 10.',
          'Safety, Walkability, and Vibrancy come from public data sources.',
        ],
      },
    ],
    related: ['overview', 'compare', 'services'],
  },

  services: {
    screenId: 'services',
    title: 'Local Services',
    summary:
      'Hospitals, pharmacies, and other services near each selected city.',
    sections: [
      {
        heading: 'Why it matters',
        body: [
          'Access to good healthcare is a major retirement consideration.',
          'Pharmacy availability and specialist counts are included.',
        ],
      },
    ],
    related: ['neighborhoods', 'medicine'],
  },

  livability: {
    screenId: 'livability',
    title: 'Livability Index',
    summary:
      'A single rolled-up score combining cost, safety, services, and climate.',
    sections: [
      {
        heading: 'How the score is built',
        body: [
          'Each dimension is weighted. You can see the breakdown per city.',
          'Use it as a starting point — your own priorities may differ from the default weights.',
        ],
      },
    ],
    related: ['compare', 'neighborhoods'],
  },

  localinfo: {
    screenId: 'localinfo',
    title: 'Local Info',
    summary:
      'Practical details for living in each selected city.',
    sections: [
      {
        heading: 'What you find here',
        body: [
          'Language, visa or residency notes, typical climate, and cultural tips.',
          'Aimed at someone relocating, not just visiting.',
        ],
      },
    ],
    related: ['overview', 'neighborhoods'],
  },

  // ─── Share ──────────────────────────────────────────────────────
  brochure: {
    screenId: 'brochure',
    title: 'Brochures',
    summary:
      'Export a city page as a printable one-sheet.',
    sections: [
      {
        heading: 'What gets exported',
        body: [
          'Summary stats, the cost breakdown chart, and the plain-language text summary.',
          'PDF is generated in your browser — nothing is uploaded.',
        ],
      },
    ],
    related: ['overview', 'compare'],
  },

  video: {
    screenId: 'video',
    title: 'Video',
    summary:
      'Turn a city page into a short narrated video clip.',
    sections: [
      {
        heading: 'What gets rendered',
        body: [
          'Key stats, a chart animation, and the plain-language summary read aloud.',
          'Uses the same voice settings as the dyslexia read-aloud feature.',
        ],
      },
    ],
    related: ['brochure', 'overview'],
  },
};

/** Shared template for the eight cost-category screens. */
function costsScreen(category: string, description: string): HelpEntry {
  return {
    screenId: category.toLowerCase(),
    title: category,
    summary: `Yearly ${category.toLowerCase()} costs by city — ${description}.`,
    sections: [
      {
        heading: 'What is included',
        body: [
          `Average ${description}.`,
          'Values come from public cost-of-living data and contributions from other users.',
        ],
      },
      {
        heading: 'How to customize',
        body: [
          'Use Manage Custom Locations to override the default for any city.',
          'Your overrides only affect your own projections.',
        ],
      },
    ],
    related: ['overview', 'compare', 'manage'],
  };
}

/** Fallback entry when a screen has no specific help written yet. */
export const HELP_FALLBACK: HelpEntry = {
  screenId: '__fallback',
  title: 'Help',
  summary: 'No screen-specific help yet for this page.',
  sections: [
    {
      heading: 'General tips',
      body: [
        'Open the accessibility panel (Ctrl+Shift+A) to adjust fonts, contrast, and number display.',
        'Press ? for the keyboard shortcut list.',
      ],
    },
  ],
};
