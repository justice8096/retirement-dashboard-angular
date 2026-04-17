/**
 * Annual S&P 500 total return + US CPI inflation, 1928–2024.
 *
 * Approximate values compiled from commonly-cited historical sources
 * (Damodaran NYU Stern, Robert Shiller, BLS CPI-U). Values may differ by
 * ±0.5% from authoritative sources; replace with a canonical dataset if
 * you need precise backtesting. Used for:
 *   - Historical mean/vol presets
 *   - Bootstrap sampling (random-year resample)
 *   - Historical sequence backtest (sim replays real years forward)
 *
 * Both return and inflation are decimal fractions (0.07 = 7%).
 */
export interface HistoricalYear {
  year: number;
  /** S&P 500 total return (price + dividends), nominal. */
  sp500: number;
  /** US CPI-U year-over-year change. */
  cpi: number;
}

export const HISTORICAL_RETURNS: HistoricalYear[] = [
  { year: 1928, sp500:  0.438, cpi: -0.012 },
  { year: 1929, sp500: -0.083, cpi:  0.000 },
  { year: 1930, sp500: -0.252, cpi: -0.027 },
  { year: 1931, sp500: -0.438, cpi: -0.090 },
  { year: 1932, sp500: -0.086, cpi: -0.103 },
  { year: 1933, sp500:  0.499, cpi: -0.052 },
  { year: 1934, sp500: -0.014, cpi:  0.031 },
  { year: 1935, sp500:  0.476, cpi:  0.022 },
  { year: 1936, sp500:  0.338, cpi:  0.015 },
  { year: 1937, sp500: -0.350, cpi:  0.029 },
  { year: 1938, sp500:  0.313, cpi: -0.028 },
  { year: 1939, sp500: -0.004, cpi: -0.014 },
  { year: 1940, sp500: -0.097, cpi:  0.007 },
  { year: 1941, sp500: -0.116, cpi:  0.052 },
  { year: 1942, sp500:  0.204, cpi:  0.109 },
  { year: 1943, sp500:  0.258, cpi:  0.060 },
  { year: 1944, sp500:  0.196, cpi:  0.017 },
  { year: 1945, sp500:  0.364, cpi:  0.023 },
  { year: 1946, sp500: -0.080, cpi:  0.189 },
  { year: 1947, sp500:  0.057, cpi:  0.088 },
  { year: 1948, sp500:  0.055, cpi:  0.030 },
  { year: 1949, sp500:  0.186, cpi: -0.021 },
  { year: 1950, sp500:  0.308, cpi:  0.059 },
  { year: 1951, sp500:  0.237, cpi:  0.060 },
  { year: 1952, sp500:  0.184, cpi:  0.008 },
  { year: 1953, sp500: -0.010, cpi:  0.006 },
  { year: 1954, sp500:  0.524, cpi: -0.005 },
  { year: 1955, sp500:  0.314, cpi:  0.004 },
  { year: 1956, sp500:  0.066, cpi:  0.029 },
  { year: 1957, sp500: -0.108, cpi:  0.030 },
  { year: 1958, sp500:  0.433, cpi:  0.018 },
  { year: 1959, sp500:  0.120, cpi:  0.015 },
  { year: 1960, sp500:  0.004, cpi:  0.014 },
  { year: 1961, sp500:  0.267, cpi:  0.007 },
  { year: 1962, sp500: -0.087, cpi:  0.013 },
  { year: 1963, sp500:  0.228, cpi:  0.016 },
  { year: 1964, sp500:  0.164, cpi:  0.010 },
  { year: 1965, sp500:  0.124, cpi:  0.019 },
  { year: 1966, sp500: -0.100, cpi:  0.035 },
  { year: 1967, sp500:  0.239, cpi:  0.030 },
  { year: 1968, sp500:  0.110, cpi:  0.047 },
  { year: 1969, sp500: -0.084, cpi:  0.062 },
  { year: 1970, sp500:  0.036, cpi:  0.055 },
  { year: 1971, sp500:  0.142, cpi:  0.033 },
  { year: 1972, sp500:  0.189, cpi:  0.034 },
  { year: 1973, sp500: -0.147, cpi:  0.087 },
  { year: 1974, sp500: -0.265, cpi:  0.124 },
  { year: 1975, sp500:  0.372, cpi:  0.069 },
  { year: 1976, sp500:  0.239, cpi:  0.049 },
  { year: 1977, sp500: -0.072, cpi:  0.067 },
  { year: 1978, sp500:  0.066, cpi:  0.090 },
  { year: 1979, sp500:  0.184, cpi:  0.133 },
  { year: 1980, sp500:  0.323, cpi:  0.125 },
  { year: 1981, sp500: -0.049, cpi:  0.089 },
  { year: 1982, sp500:  0.215, cpi:  0.038 },
  { year: 1983, sp500:  0.226, cpi:  0.038 },
  { year: 1984, sp500:  0.062, cpi:  0.040 },
  { year: 1985, sp500:  0.317, cpi:  0.038 },
  { year: 1986, sp500:  0.186, cpi:  0.011 },
  { year: 1987, sp500:  0.052, cpi:  0.044 },
  { year: 1988, sp500:  0.168, cpi:  0.044 },
  { year: 1989, sp500:  0.315, cpi:  0.046 },
  { year: 1990, sp500: -0.032, cpi:  0.061 },
  { year: 1991, sp500:  0.305, cpi:  0.031 },
  { year: 1992, sp500:  0.076, cpi:  0.029 },
  { year: 1993, sp500:  0.100, cpi:  0.027 },
  { year: 1994, sp500:  0.013, cpi:  0.027 },
  { year: 1995, sp500:  0.376, cpi:  0.025 },
  { year: 1996, sp500:  0.230, cpi:  0.033 },
  { year: 1997, sp500:  0.334, cpi:  0.017 },
  { year: 1998, sp500:  0.286, cpi:  0.016 },
  { year: 1999, sp500:  0.210, cpi:  0.027 },
  { year: 2000, sp500: -0.091, cpi:  0.034 },
  { year: 2001, sp500: -0.119, cpi:  0.016 },
  { year: 2002, sp500: -0.221, cpi:  0.024 },
  { year: 2003, sp500:  0.287, cpi:  0.019 },
  { year: 2004, sp500:  0.109, cpi:  0.033 },
  { year: 2005, sp500:  0.049, cpi:  0.034 },
  { year: 2006, sp500:  0.158, cpi:  0.025 },
  { year: 2007, sp500:  0.055, cpi:  0.041 },
  { year: 2008, sp500: -0.370, cpi:  0.001 },
  { year: 2009, sp500:  0.265, cpi:  0.027 },
  { year: 2010, sp500:  0.151, cpi:  0.015 },
  { year: 2011, sp500:  0.021, cpi:  0.030 },
  { year: 2012, sp500:  0.160, cpi:  0.017 },
  { year: 2013, sp500:  0.324, cpi:  0.015 },
  { year: 2014, sp500:  0.137, cpi:  0.008 },
  { year: 2015, sp500:  0.014, cpi:  0.007 },
  { year: 2016, sp500:  0.120, cpi:  0.021 },
  { year: 2017, sp500:  0.217, cpi:  0.021 },
  { year: 2018, sp500: -0.043, cpi:  0.019 },
  { year: 2019, sp500:  0.315, cpi:  0.023 },
  { year: 2020, sp500:  0.184, cpi:  0.014 },
  { year: 2021, sp500:  0.287, cpi:  0.070 },
  { year: 2022, sp500: -0.181, cpi:  0.065 },
  { year: 2023, sp500:  0.264, cpi:  0.034 },
  { year: 2024, sp500:  0.250, cpi:  0.029 },
];

export interface HistoricalPreset {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  description: string;
}

export const HISTORICAL_PRESETS: HistoricalPreset[] = [
  { id: 'full',         label: 'Full history (1928–2024)', startYear: 1928, endYear: 2024, description: 'Long-run averages across booms, depressions, and everything between.' },
  { id: 'modern',       label: 'Modern era (1950–2024)',   startYear: 1950, endYear: 2024, description: 'Post-WWII, post-gold-standard economy — excludes the unusual pre-war period.' },
  { id: 'depression',   label: 'Great Depression (1929–1939)', startYear: 1929, endYear: 1939, description: 'Severe deflationary crash and slow recovery — extreme downside case.' },
  { id: 'stagflation',  label: '1970s Stagflation (1968–1982)', startYear: 1968, endYear: 1982, description: 'High inflation with weak real returns — the classic retirement nightmare.' },
  { id: 'boom90s',      label: '1990s Boom (1990–1999)', startYear: 1990, endYear: 1999, description: 'Best decade for US equities on record.' },
  { id: 'lost',         label: 'Lost Decade (2000–2009)', startYear: 2000, endYear: 2009, description: 'Two recessions bookending a decade — flat nominal, negative real.' },
  { id: 'postGFC',      label: 'Post-GFC Bull (2010–2020)', startYear: 2010, endYear: 2020, description: 'Low-rate recovery, smooth bull market with brief pandemic shock.' },
];

/** Compute mean and std-dev of annual returns + inflation over a year range. */
export function statsForRange(startYear: number, endYear: number): {
  meanReturn: number; volReturn: number;
  meanInflation: number; volInflation: number;
  yearsIncluded: number;
} {
  const rows = HISTORICAL_RETURNS.filter(r => r.year >= startYear && r.year <= endYear);
  if (!rows.length) return { meanReturn: 0.07, volReturn: 0.15, meanInflation: 0.025, volInflation: 0.02, yearsIncluded: 0 };
  const n = rows.length;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = (xs: number[], m: number) => Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
  const rets = rows.map(r => r.sp500);
  const infs = rows.map(r => r.cpi);
  const mR = avg(rets);
  const mI = avg(infs);
  return {
    meanReturn: mR, volReturn: std(rets, mR),
    meanInflation: mI, volInflation: std(infs, mI),
    yearsIncluded: n,
  };
}

/**
 * Bootstrap-sample a single year's (return, inflation) from history. Keeps the
 * two series paired so return/inflation correlation is preserved.
 */
export function bootstrapYear(): { ret: number; inf: number } {
  const row = HISTORICAL_RETURNS[Math.floor(Math.random() * HISTORICAL_RETURNS.length)];
  return { ret: row.sp500, inf: row.cpi };
}
