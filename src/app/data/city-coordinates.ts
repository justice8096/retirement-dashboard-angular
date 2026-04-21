/**
 * Static city center coordinates for map initialization, ported from the
 * legacy dashboard's `src/data/cityCoordinates.ts`. 20 new entries added for
 * DC-area suburbs, US territories, and NYC (which uses `us-new-york-city`
 * here vs. `us-new-york` in the legacy file). Stale entries for locations
 * no longer in the DB (Madrid, Boston, Houston, etc.) are dropped.
 *
 * Coverage: 158/158 — verify with `listMissingCoords(currentIds)` if new
 * locations are added.
 *
 * Format: `[latitude, longitude]`.
 */
export const CITY_COORDINATES: Record<string, [number, number]> = {
  // ─── Colombia ────────────────────────────────────────
  'colombia-bogota': [4.7110, -74.0721],
  'colombia-cartagena': [10.3910, -75.5144],
  'colombia-medellin': [6.2442, -75.5812],
  'colombia-pereira': [4.8143, -75.6946],
  'colombia-santa-marta': [11.2408, -74.1990],

  // ─── Costa Rica ──────────────────────────────────────
  'costa-rica-arenal': [10.4624, -84.6432],
  'costa-rica-atenas': [9.9756, -84.3784],
  'costa-rica-central-valley': [9.9281, -84.0907],
  'costa-rica-grecia': [10.0727, -84.3136],
  'costa-rica-guanacaste': [10.4737, -85.6840],
  'costa-rica-puerto-viejo': [9.6559, -82.7533],

  // ─── Croatia ─────────────────────────────────────────
  'croatia-dubrovnik': [42.6507, 18.0944],
  'croatia-istria': [45.1317, 13.9042],
  'croatia-split': [43.5081, 16.4402],
  'croatia-zagreb': [45.8150, 15.9819],

  // ─── Cyprus ──────────────────────────────────────────
  'cyprus-larnaca': [34.9003, 33.6232],
  'cyprus-limassol': [34.6786, 33.0413],
  'cyprus-paphos': [34.7720, 32.4297],

  // ─── Ecuador ─────────────────────────────────────────
  'ecuador-cotacachi': [0.3040, -78.2636],
  'ecuador-cuenca': [-2.9001, -79.0059],
  'ecuador-quito': [-0.1807, -78.4678],
  'ecuador-salinas': [-2.2144, -80.9475],
  'ecuador-vilcabamba': [-4.2583, -79.2242],

  // ─── France ──────────────────────────────────────────
  'france-brittany': [48.1173, -1.6778],
  'france-dordogne': [45.1836, 0.7187],
  'france-gascony': [43.6459, 0.5867],
  'france-languedoc': [43.6112, 3.8767],
  'france-lyon': [45.7640, 4.8357],
  'france-montpellier': [43.6108, 3.8767],
  'france-nice': [43.7102, 7.2620],
  'france-paris': [48.8566, 2.3522],
  'france-toulon': [43.1242, 5.9280],
  'france-toulouse': [43.6047, 1.4442],

  // ─── Greece ──────────────────────────────────────────
  'greece-athens': [37.9838, 23.7275],
  'greece-corfu': [39.6243, 19.9217],
  'greece-crete': [35.2401, 24.4709],
  'greece-peloponnese': [37.5079, 22.3738],
  'greece-rhodes': [36.4341, 28.2176],

  // ─── Ireland ─────────────────────────────────────────
  'ireland-cork': [51.8985, -8.4756],
  'ireland-galway': [53.2707, -9.0568],
  'ireland-limerick': [52.6638, -8.6267],
  'ireland-waterford': [52.2593, -7.1101],
  'ireland-wexford': [52.3369, -6.4633],

  // ─── Italy ───────────────────────────────────────────
  'italy-abruzzo': [42.3498, 13.3995],
  'italy-lake-region': [45.8853, 8.9459],
  'italy-puglia': [41.1257, 16.8666],
  'italy-sardinia': [39.2238, 9.1217],
  'italy-sicily': [37.5994, 14.0154],
  'italy-tuscany': [43.7711, 11.2486],

  // ─── Malta ───────────────────────────────────────────
  'malta-gozo': [36.0440, 14.2528],
  'malta-sliema': [35.9122, 14.5026],
  'malta-valletta': [35.8989, 14.5146],

  // ─── Mexico ──────────────────────────────────────────
  'mexico-lake-chapala': [20.2958, -103.1906],
  'mexico-mazatlan': [23.2494, -106.4111],
  'mexico-merida': [20.9674, -89.5926],
  'mexico-oaxaca': [17.0732, -96.7266],
  'mexico-playa-del-carmen': [20.6296, -87.0739],
  'mexico-puerto-vallarta': [20.6534, -105.2253],
  'mexico-queretaro': [20.5888, -100.3899],
  'mexico-san-miguel-de-allende': [20.9144, -100.7452],

  // ─── Panama ──────────────────────────────────────────
  'panama-bocas-del-toro': [9.3402, -82.2413],
  'panama-boquete': [8.7812, -82.4356],
  'panama-chitre': [7.9659, -80.4275],
  'panama-city': [8.9824, -79.5199],
  'panama-city-bella-vista': [8.9824, -79.5270],
  'panama-city-casco-viejo': [8.9515, -79.5345],
  'panama-city-costa-del-este': [9.0060, -79.4750],
  'panama-city-el-cangrejo': [8.9860, -79.5310],
  'panama-city-punta-pacifica': [8.9770, -79.5170],
  'panama-coronado': [8.5368, -79.8823],
  'panama-david': [8.4270, -82.4309],
  'panama-el-valle': [8.6042, -80.1261],
  'panama-pedasi': [7.5313, -80.0253],
  'panama-puerto-armuelles': [8.2784, -82.8618],
  'panama-volcan': [8.7705, -82.6369],

  // ─── Portugal ────────────────────────────────────────
  'portugal-algarve': [37.0179, -7.9307],
  'portugal-cascais': [38.6979, -9.4215],
  'portugal-lisbon': [38.7223, -9.1393],
  'portugal-porto': [41.1579, -8.6291],
  'portugal-silver-coast': [39.3607, -9.3815],

  // ─── Spain ───────────────────────────────────────────
  'spain-alicante': [38.3452, -0.4810],
  'spain-barcelona': [41.3874, 2.1686],
  'spain-canary-islands': [28.1235, -15.4363],
  'spain-costa-del-sol': [36.7213, -4.4214],
  'spain-valencia': [39.4699, -0.3763],

  // ─── Uruguay ─────────────────────────────────────────
  'uruguay-colonia': [-34.4626, -57.8400],
  'uruguay-montevideo': [-34.9011, -56.1645],
  'uruguay-punta-del-este': [-34.9667, -54.9500],

  // ─── United States (existing) ────────────────────────
  'us-albuquerque-nm': [35.0844, -106.6504],
  'us-armstrong-county-pa': [40.8125, -79.4670],
  'us-asheville-nc': [35.5951, -82.5515],
  'us-atlanta': [33.7490, -84.3880],
  'us-austin': [30.2672, -97.7431],
  'us-baltimore-md': [39.2904, -76.6122],
  'us-birmingham-al': [33.5186, -86.8104],
  'us-cherry-hill': [39.9346, -74.9940],
  'us-chesapeake-va': [36.7682, -76.2875],
  'us-chicago-il': [41.8781, -87.6298],
  'us-cleveland-oh': [41.4993, -81.6944],
  'us-dallas-tx': [32.7767, -96.7970],
  'us-denver-co': [39.7392, -104.9903],
  'us-florida': [27.6648, -81.5158],
  'us-fort-lauderdale-fl': [26.1224, -80.1373],
  'us-fort-wayne-in': [41.0793, -85.1394],
  'us-fort-worth-tx': [32.7555, -97.3308],
  'us-grand-forks-nd': [47.9253, -97.0329],
  'us-killeen-tx': [31.1171, -97.7278],
  'us-lapeer-mi': [43.0514, -83.3189],
  'us-little-rock-ar': [34.7465, -92.2896],
  'us-lorain-oh': [41.4528, -82.1824],
  'us-lynchburg-va': [37.4138, -79.1422],
  'us-miami-fl': [25.7617, -80.1918],
  'us-milwaukee-wi': [43.0389, -87.9065],
  'us-minneapolis-mn': [44.9778, -93.2650],
  'us-nashville-tn': [36.1627, -86.7816],
  'us-norfolk-va': [36.8508, -76.2859],
  'us-oakland-county-mi': [42.6233, -83.3677],
  'us-palm-bay-fl': [28.0345, -80.5887],
  'us-philadelphia': [39.9526, -75.1652],
  'us-pittsburgh-pa': [40.4406, -79.9959],
  'us-port-huron-mi': [42.9709, -82.4249],
  'us-portsmouth-va': [36.8354, -76.2983],
  'us-quincy-fl': [30.5871, -84.5832],
  'us-raleigh': [35.7796, -78.6382],
  'us-richmond': [37.5407, -77.4360],
  'us-saint-paul-mn': [44.9537, -93.0900],
  'us-san-marcos-tx': [29.8833, -97.9414],
  'us-savannah': [32.0809, -81.0912],
  'us-skowhegan-me': [44.7654, -69.7193],
  'us-st-augustine-fl': [29.8943, -81.3145],
  'us-st-petersburg-fl': [27.7676, -82.6403],
  'us-summerville': [33.0185, -80.1757],
  'us-tampa-fl': [27.9506, -82.4572],
  'us-virginia': [37.4316, -78.6569],
  'us-virginia-beach-va': [36.8529, -75.9780],
  'us-williamsport-pa': [41.2412, -77.0011],
  'us-yulee-fl': [30.6321, -81.6065],

  // ─── United States (added) ───────────────────────────
  //   DC-area suburbs
  'us-annandale-va': [38.8303, -77.1964],
  'us-annapolis-md': [38.9784, -76.4922],
  'us-bowie-md': [39.0068, -76.7791],
  'us-camden-nj': [39.9259, -75.1196],
  'us-catonsville-md': [39.2720, -76.7319],
  'us-elkridge-md': [39.2115, -76.7141],
  'us-gainesville-va': [38.7940, -77.6150],
  'us-glen-burnie-md': [39.1626, -76.6247],
  'us-lorton-va': [38.6981, -77.2225],
  'us-manassas-va': [38.7509, -77.4753],
  //   Large metros
  'us-new-york-city': [40.7128, -74.0060],
  //   US territories — unincorporated territories and commonwealths
  'us-charlotte-amalie-vi': [18.3419, -64.9307],
  'us-christiansted-vi': [17.7342, -64.7000],
  'us-dededo-gu': [13.5147, 144.8371],
  'us-hagatna-gu': [13.4745, 144.7504],
  'us-pago-pago-as': [-14.2756, -170.7020],
  'us-ponce-pr': [18.0111, -66.6141],
  'us-saipan-mp': [15.1850, 145.7467],
  'us-san-juan-pr': [18.4655, -66.1057],
  'us-tafuna-as': [-14.3366, -170.7366],
  'us-tinian-mp': [14.9537, 145.6438],
};

/** Get the center coordinates for a location ID. Returns `null` when the id
 *  isn't mapped — callers should skip such locations rather than placing a
 *  marker at [0, 0]. */
export function getCityCenter(locId: string): [number, number] | null {
  return CITY_COORDINATES[locId] ?? null;
}

/** Diagnostic helper — returns ids in the input list that have no coords. */
export function listMissingCoords(ids: readonly string[]): string[] {
  return ids.filter(id => !(id in CITY_COORDINATES));
}
