export interface CommonMedication {
  generic: string;
  brand?: string;
  use: string;
  /** Approximate US cash-retail monthly cost in USD (rough reference). */
  baselineMonthlyUSD: number;
}

export const COMMON_US_MEDICATIONS: CommonMedication[] = [
  { generic: 'Atorvastatin', brand: 'Lipitor', use: 'cholesterol', baselineMonthlyUSD: 10 },
  { generic: 'Levothyroxine', brand: 'Synthroid', use: 'thyroid', baselineMonthlyUSD: 10 },
  { generic: 'Lisinopril', brand: 'Prinivil / Zestril', use: 'blood pressure', baselineMonthlyUSD: 5 },
  { generic: 'Metformin', brand: 'Glucophage', use: 'diabetes', baselineMonthlyUSD: 5 },
  { generic: 'Amlodipine', brand: 'Norvasc', use: 'blood pressure', baselineMonthlyUSD: 8 },
  { generic: 'Metoprolol', brand: 'Lopressor / Toprol XL', use: 'blood pressure / heart', baselineMonthlyUSD: 8 },
  { generic: 'Albuterol', brand: 'ProAir / Ventolin', use: 'asthma / COPD', baselineMonthlyUSD: 35 },
  { generic: 'Omeprazole', brand: 'Prilosec', use: 'acid reflux', baselineMonthlyUSD: 15 },
  { generic: 'Losartan', brand: 'Cozaar', use: 'blood pressure', baselineMonthlyUSD: 10 },
  { generic: 'Gabapentin', brand: 'Neurontin', use: 'nerve pain / seizures', baselineMonthlyUSD: 12 },
  { generic: 'Hydrochlorothiazide', brand: 'HCTZ', use: 'blood pressure', baselineMonthlyUSD: 5 },
  { generic: 'Sertraline', brand: 'Zoloft', use: 'depression / anxiety', baselineMonthlyUSD: 10 },
  { generic: 'Simvastatin', brand: 'Zocor', use: 'cholesterol', baselineMonthlyUSD: 8 },
  { generic: 'Montelukast', brand: 'Singulair', use: 'asthma / allergies', baselineMonthlyUSD: 15 },
  { generic: 'Escitalopram', brand: 'Lexapro', use: 'depression / anxiety', baselineMonthlyUSD: 12 },
  { generic: 'Rosuvastatin', brand: 'Crestor', use: 'cholesterol', baselineMonthlyUSD: 12 },
  { generic: 'Bupropion', brand: 'Wellbutrin', use: 'depression', baselineMonthlyUSD: 25 },
  { generic: 'Furosemide', brand: 'Lasix', use: 'diuretic', baselineMonthlyUSD: 5 },
  { generic: 'Pantoprazole', brand: 'Protonix', use: 'acid reflux', baselineMonthlyUSD: 15 },
  { generic: 'Fluticasone', brand: 'Flonase', use: 'allergies', baselineMonthlyUSD: 20 },
  { generic: 'Tamsulosin', brand: 'Flomax', use: 'prostate', baselineMonthlyUSD: 12 },
  { generic: 'Trazodone', use: 'depression / insomnia', baselineMonthlyUSD: 10 },
  { generic: 'Fluoxetine', brand: 'Prozac', use: 'depression', baselineMonthlyUSD: 10 },
  { generic: 'Amoxicillin', use: 'antibiotic', baselineMonthlyUSD: 15 },
  { generic: 'Duloxetine', brand: 'Cymbalta', use: 'depression / pain', baselineMonthlyUSD: 25 },
  { generic: 'Prednisone', use: 'corticosteroid', baselineMonthlyUSD: 10 },
  { generic: 'Carvedilol', brand: 'Coreg', use: 'heart failure', baselineMonthlyUSD: 10 },
  { generic: 'Meloxicam', brand: 'Mobic', use: 'arthritis / pain', baselineMonthlyUSD: 10 },
  { generic: 'Citalopram', brand: 'Celexa', use: 'depression', baselineMonthlyUSD: 10 },
  { generic: 'Alprazolam', brand: 'Xanax', use: 'anxiety', baselineMonthlyUSD: 15 },
  { generic: 'Ibuprofen', brand: 'Advil / Motrin', use: 'pain / inflammation', baselineMonthlyUSD: 8 },
  { generic: 'Clonazepam', brand: 'Klonopin', use: 'anxiety / seizures', baselineMonthlyUSD: 15 },
  { generic: 'Tramadol', brand: 'Ultram', use: 'pain', baselineMonthlyUSD: 20 },
  { generic: 'Cyclobenzaprine', brand: 'Flexeril', use: 'muscle relaxant', baselineMonthlyUSD: 12 },
  { generic: 'Insulin glargine', brand: 'Lantus', use: 'diabetes', baselineMonthlyUSD: 280 },
  { generic: 'Venlafaxine', brand: 'Effexor', use: 'depression / anxiety', baselineMonthlyUSD: 20 },
  { generic: 'Potassium chloride', use: 'electrolyte', baselineMonthlyUSD: 10 },
  { generic: 'Allopurinol', brand: 'Zyloprim', use: 'gout', baselineMonthlyUSD: 8 },
  { generic: 'Ezetimibe', brand: 'Zetia', use: 'cholesterol', baselineMonthlyUSD: 15 },
  { generic: 'Pravastatin', brand: 'Pravachol', use: 'cholesterol', baselineMonthlyUSD: 10 },
  { generic: 'Warfarin', brand: 'Coumadin', use: 'blood thinner', baselineMonthlyUSD: 10 },
  { generic: 'Apixaban', brand: 'Eliquis', use: 'blood thinner', baselineMonthlyUSD: 530 },
  { generic: 'Rivaroxaban', brand: 'Xarelto', use: 'blood thinner', baselineMonthlyUSD: 540 },
  { generic: 'Clopidogrel', brand: 'Plavix', use: 'blood thinner', baselineMonthlyUSD: 12 },
  { generic: 'Atenolol', brand: 'Tenormin', use: 'blood pressure', baselineMonthlyUSD: 8 },
  { generic: 'Glipizide', brand: 'Glucotrol', use: 'diabetes', baselineMonthlyUSD: 8 },
  { generic: 'Hydrocodone / acetaminophen', brand: 'Norco / Vicodin', use: 'pain', baselineMonthlyUSD: 15 },
  { generic: 'Ondansetron', brand: 'Zofran', use: 'nausea', baselineMonthlyUSD: 15 },
  { generic: 'Doxycycline', use: 'antibiotic', baselineMonthlyUSD: 20 },
  { generic: 'Azithromycin', brand: 'Zithromax', use: 'antibiotic', baselineMonthlyUSD: 15 },
  { generic: 'Semaglutide', brand: 'Ozempic', use: 'type 2 diabetes / weight (GLP-1)', baselineMonthlyUSD: 960 },
  { generic: 'Liraglutide', brand: 'Victoza / Saxenda', use: 'type 2 diabetes / weight (GLP-1)', baselineMonthlyUSD: 830 },
];

/** Sum of all baseline monthly prices — the reference "average-location" total basket cost. */
export const MEDICATION_BASELINE_TOTAL = COMMON_US_MEDICATIONS.reduce(
  (sum, m) => sum + m.baselineMonthlyUSD,
  0,
);
