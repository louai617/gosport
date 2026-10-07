import type { Competition, Country, Sport, SportKey, Team } from "@/types";
import { hashString } from "./rng";

/**
 * The static catalogue: sports, countries, competitions and their rosters.
 *
 * Hand-authored on purpose. Competition and club names are factual
 * identifiers, so they are stored as proper nouns and rendered as-is — never
 * through `t()`. No crest artwork is referenced anywhere: `Team.crestUrl` is
 * left undefined so the generated placeholder is used, which keeps the build
 * clear of third-party marks.
 *
 * Event and live counts are not part of the catalogue — they are properties of
 * a generated fixture list, so the seed types omit them and `dataset.ts` fills
 * them in once the fixtures exist.
 */

export type SportSeed = Omit<Sport, "eventCount" | "liveEventCount">;

export type CompetitionSeed = Omit<Competition, "eventCount" | "liveEventCount">;

/** Landing sport when no other is selected. */
export const DEFAULT_SPORT_KEY: SportKey = "football";

/* -------------------------------------------------------------- derivations */

/** Hue is derived from the id so a crest keeps its colour across rebuilds. */
function hueOf(id: string): number {
  return hashString(id) % 360;
}

const DIACRITICS = /\p{Diacritic}/gu;

/** Latinises accented initials so "Étoile" and "Espérance" both monogram to E. */
function asciiFold(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "");
}

/** Words that carry no identity and would make a poor monogram initial. */
const PARTICLES = new Set(["de", "du", "des", "la", "le", "les", "el", "of", "and", "et", "da", "di"]);

/**
 * Two-letter monogram for the placeholder crest: initials of the first two
 * meaningful words, or the first two characters of a single-word name.
 */
function monogramOf(shortName: string): string {
  const words = asciiFold(shortName)
    .split(/[\s'’-]+/)
    .filter((word) => word.length > 0 && !PARTICLES.has(word.toLowerCase()));

  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? shortName).slice(0, 2).toUpperCase();
}

const countryId = (code: string) => `country-${code}`;

/* ----------------------------------------------------------------- countries */

/**
 * Scoped to the markets this build actually shows. Anything outside the list —
 * a Senegalese international, a Lithuanian basketball club — is filed under
 * "WW", because inventing a country entry with no `countries.<code>`
 * translation would render a raw key on screen.
 *
 * England sits beside the United Kingdom rather than replacing it: football is
 * organised by the English FA, so its leagues and clubs belong to England,
 * while a British driver or boxer — and the nationality picker — stay "GB".
 */
export const COUNTRIES: Country[] = [
  { id: countryId("TN"), code: "TN", nameKey: "countries.TN", flag: "🇹🇳" },
  { id: countryId("MA"), code: "MA", nameKey: "countries.MA", flag: "🇲🇦" },
  { id: countryId("DZ"), code: "DZ", nameKey: "countries.DZ", flag: "🇩🇿" },
  { id: countryId("EG"), code: "EG", nameKey: "countries.EG", flag: "🇪🇬" },
  { id: countryId("GB"), code: "GB", nameKey: "countries.GB", flag: "🇬🇧" },
  {
    id: countryId("GB-ENG"),
    code: "GB-ENG",
    nameKey: "countries.GB-ENG",
    // Black flag + the invisible tag letters "gbeng" — spelled out because the
    // tags do not survive most editors.
    flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  },
  { id: countryId("ES"), code: "ES", nameKey: "countries.ES", flag: "🇪🇸" },
  { id: countryId("FR"), code: "FR", nameKey: "countries.FR", flag: "🇫🇷" },
  { id: countryId("IT"), code: "IT", nameKey: "countries.IT", flag: "🇮🇹" },
  { id: countryId("DE"), code: "DE", nameKey: "countries.DE", flag: "🇩🇪" },
  { id: countryId("PT"), code: "PT", nameKey: "countries.PT", flag: "🇵🇹" },
  { id: countryId("NL"), code: "NL", nameKey: "countries.NL", flag: "🇳🇱" },
  { id: countryId("TR"), code: "TR", nameKey: "countries.TR", flag: "🇹🇷" },
  { id: countryId("SA"), code: "SA", nameKey: "countries.SA", flag: "🇸🇦" },
  { id: countryId("QA"), code: "QA", nameKey: "countries.QA", flag: "🇶🇦" },
  { id: countryId("US"), code: "US", nameKey: "countries.US", flag: "🇺🇸" },
  { id: countryId("WW"), code: "WW", nameKey: "countries.WW", flag: "🌍" },
];

/* -------------------------------------------------------------------- sports */

const sportId = (key: SportKey) => `sport-${key}`;

export const SPORTS: SportSeed[] = [
  { id: sportId("football"), key: "football", nameKey: "sports.football", icon: "football", order: 1 },
  { id: sportId("basketball"), key: "basketball", nameKey: "sports.basketball", icon: "basketball", order: 2 },
  { id: sportId("tennis"), key: "tennis", nameKey: "sports.tennis", icon: "tennis", order: 3 },
  { id: sportId("handball"), key: "handball", nameKey: "sports.handball", icon: "handball", order: 4 },
  { id: sportId("volleyball"), key: "volleyball", nameKey: "sports.volleyball", icon: "volleyball", order: 5 },
  { id: sportId("rugby"), key: "rugby", nameKey: "sports.rugby", icon: "rugby", order: 6 },
  { id: sportId("boxing"), key: "boxing", nameKey: "sports.boxing", icon: "boxing", order: 7 },
  { id: sportId("formula1"), key: "formula1", nameKey: "sports.formula1", icon: "formula1", order: 8 },
];

/* --------------------------------------------------------------------- teams */

/**
 * Team ids are namespaced by sport because the same club fields several sides:
 * Espérance's footballers and its handball squad are different entities that
 * happen to share a name, exactly as they do in reality.
 */
type SportPrefix = "fb" | "bk" | "tn" | "hb" | "vb" | "rg" | "bx" | "f1";

/** `[code, name, shortName, countryCode?]` — country falls back to the roster's. */
type TeamRow = readonly [string, string, string, string?];

interface RosterSpec {
  prefix: SportPrefix;
  country: string;
  /**
   * Strength band, strongest first. Rows are authored in ranking order and
   * interpolated across the band, which is what makes generated prices
   * credible: Espérance at home to EGS Gafsa has to be short.
   */
  band: readonly [number, number];
  rows: readonly TeamRow[];
}

const strengthById = new Map<string, number>();

function defineRoster({ prefix, country, band, rows }: RosterSpec): Team[] {
  const [top, bottom] = band;
  const step = rows.length > 1 ? (top - bottom) / (rows.length - 1) : 0;

  return rows.map(([code, name, shortName, rowCountry], index) => {
    const id = `team-${prefix}-${code.toLowerCase()}`;
    // ±0.02 of noise so two equally-ranked sides never price at a flat 50/50.
    const jitter = ((hashString(`${id}:strength`) % 41) - 20) / 1000;
    strengthById.set(id, Math.min(0.97, Math.max(0.2, top - step * index + jitter)));

    return {
      id,
      name,
      shortName,
      code,
      countryId: countryId(rowCountry ?? country),
      monogram: monogramOf(shortName),
      hue: hueOf(id),
    };
  });
}

const ids = (teams: Team[]): string[] => teams.map((team) => team.id);

/* ------------------------------------------------------------ football clubs */

const TN_LIGUE_1 = defineRoster({
  prefix: "fb",
  country: "TN",
  band: [0.82, 0.42],
  rows: [
    ["EST", "Espérance Sportive de Tunis", "Espérance"],
    ["CLA", "Club Africain", "Club Africain"],
    ["ESS", "Étoile Sportive du Sahel", "Étoile du Sahel"],
    ["CSS", "Club Sportif Sfaxien", "CS Sfaxien"],
    ["USM", "Union Sportive Monastirienne", "US Monastir"],
    ["STU", "Stade Tunisien", "Stade Tunisien"],
    ["CAB", "Club Athlétique Bizertin", "CA Bizertin"],
    ["OBE", "Olympique de Béja", "Olympique Béja"],
    ["USB", "Union Sportive de Ben Guerdane", "US Ben Guerdane"],
    ["ESZ", "Étoile Sportive de Zarzis", "ES Zarzis"],
    ["ESM", "Étoile Sportive de Métlaoui", "ES Métlaoui"],
    ["ASM", "Avenir Sportif de La Marsa", "AS Marsa"],
    ["EGS", "El Gawafel Sportives de Gafsa", "EGS Gafsa"],
    ["JSO", "Jeunesse Sportive Omranienne", "JS Omrane"],
  ],
});

const TN_LIGUE_2 = defineRoster({
  prefix: "fb",
  country: "TN",
  band: [0.52, 0.3],
  rows: [
    ["SGA", "Stade Gabésien", "Stade Gabésien"],
    ["CHL", "Club Sportif de Hammam-Lif", "CS Hammam-Lif"],
    ["ASS", "Association Sportive de Soliman", "AS Soliman"],
    ["EHS", "Espoir Sportif de Hammam Sousse", "ES Hammam Sousse"],
    ["SRS", "Sfax Railway Sport", "SR Sfax"],
    ["UST", "Union Sportive de Tataouine", "US Tataouine"],
    ["ASG", "Avenir Sportif de Gabès", "AS Gabès"],
    ["CSC", "Croissant Sportif Chebbien", "CS Chebba"],
  ],
});

/** Shared pool for the two CAF club competitions and the North African leagues. */
const AFRICA_CLUBS = defineRoster({
  prefix: "fb",
  country: "WW",
  band: [0.86, 0.55],
  rows: [
    ["AHL", "Al Ahly SC", "Al Ahly", "EG"],
    ["WAC", "Wydad Athletic Club", "Wydad AC", "MA"],
    ["RCA", "Raja Club Athletic", "Raja CA", "MA"],
    ["ZAM", "Zamalek SC", "Zamalek", "EG"],
    ["PYR", "Pyramids FC", "Pyramids", "EG"],
    ["CRB", "Chabab Riadhi de Belouizdad", "CR Belouizdad", "DZ"],
    ["MCA", "Mouloudia Club d'Alger", "MC Alger", "DZ"],
    ["RSB", "Renaissance Sportive de Berkane", "RS Berkane", "MA"],
    ["UMA", "Union Sportive de la Médina d'Alger", "USM Alger", "DZ"],
    ["JSK", "Jeunesse Sportive de Kabylie", "JS Kabylie", "DZ"],
    ["AMA", "Al Masry SC", "Al Masry", "EG"],
    ["MCO", "Mouloudia Club d'Oran", "MC Oran", "DZ"],
    ["FUT", "Future FC", "Future FC", "EG"],
  ],
});

const MA_CLUBS = defineRoster({
  prefix: "fb",
  country: "MA",
  band: [0.62, 0.42],
  rows: [
    ["FAR", "AS FAR", "AS FAR"],
    ["MAS", "Maghreb Association Sportive de Fès", "Maghreb Fès"],
    ["FUS", "Fath Union Sport", "FUS Rabat"],
    ["HUS", "Hassania Union Sport d'Agadir", "HUS Agadir"],
    ["MCJ", "Mouloudia Club d'Oujda", "MC Oujda"],
    ["DHJ", "Difaâ Hassani El Jadidi", "DHJ El Jadida"],
    ["OCS", "Olympique Club de Safi", "OC Safi"],
  ],
});

const DZ_CLUBS = defineRoster({
  prefix: "fb",
  country: "DZ",
  band: [0.58, 0.4],
  rows: [
    ["ESE", "Entente Sportive de Sétif", "ES Sétif"],
    ["CSN", "Club Sportif Constantinois", "CS Constantine"],
    ["PAC", "Paradou Athletic Club", "Paradou AC"],
    ["ASO", "Association Sportive Olympique de Chlef", "ASO Chlef"],
  ],
});

const EG_CLUBS = defineRoster({
  prefix: "fb",
  country: "EG",
  band: [0.58, 0.38],
  rows: [
    ["ISM", "Ismaily SC", "Ismaily"],
    ["CER", "Ceramica Cleopatra FC", "Ceramica"],
    ["SMO", "Smouha SC", "Smouha"],
    ["ENP", "ENPPI Club", "ENPPI"],
  ],
});

/**
 * National sides. Their names are country names, which the app renders as
 * plain proper nouns — the flag and country grouping come from `countryId`.
 */
const AFRICA_NATIONS = defineRoster({
  prefix: "fb",
  country: "WW",
  band: [0.85, 0.6],
  rows: [
    ["MAR", "Morocco", "Morocco", "MA"],
    ["SEN", "Senegal", "Senegal"],
    ["EGY", "Egypt", "Egypt", "EG"],
    ["CIV", "Côte d'Ivoire", "Côte d'Ivoire"],
    ["ALG", "Algeria", "Algeria", "DZ"],
    ["TUN", "Tunisia", "Tunisia", "TN"],
    ["NGA", "Nigeria", "Nigeria"],
    ["CMR", "Cameroon", "Cameroon"],
  ],
});

const EN_CLUBS = defineRoster({
  prefix: "fb",
  country: "GB-ENG",
  band: [0.93, 0.62],
  rows: [
    ["MCI", "Manchester City", "Man City"],
    ["ARS", "Arsenal", "Arsenal"],
    ["LIV", "Liverpool", "Liverpool"],
    ["CHE", "Chelsea", "Chelsea"],
    ["TOT", "Tottenham Hotspur", "Tottenham"],
    ["MUN", "Manchester United", "Man United"],
    ["NEW", "Newcastle United", "Newcastle"],
    ["AVL", "Aston Villa", "Aston Villa"],
    ["BHA", "Brighton & Hove Albion", "Brighton"],
    ["WHU", "West Ham United", "West Ham"],
  ],
});

const ES_CLUBS = defineRoster({
  prefix: "fb",
  country: "ES",
  band: [0.93, 0.6],
  rows: [
    ["RMA", "Real Madrid", "Real Madrid"],
    ["FCB", "FC Barcelona", "Barcelona"],
    ["ATM", "Atlético de Madrid", "Atlético"],
    ["ATH", "Athletic Club", "Athletic"],
    ["RSO", "Real Sociedad", "Real Sociedad"],
    ["VIL", "Villarreal CF", "Villarreal"],
    ["BET", "Real Betis", "Betis"],
    ["SEV", "Sevilla FC", "Sevilla"],
  ],
});

const FR_CLUBS = defineRoster({
  prefix: "fb",
  country: "FR",
  band: [0.92, 0.58],
  rows: [
    ["PSG", "Paris Saint-Germain", "PSG"],
    ["OLM", "Olympique de Marseille", "Marseille"],
    ["MON", "AS Monaco", "Monaco"],
    ["LIL", "LOSC Lille", "Lille"],
    ["OLY", "Olympique Lyonnais", "Lyon"],
    ["NIC", "OGC Nice", "Nice"],
    ["LEN", "Racing Club de Lens", "Lens"],
    ["SRE", "Stade Rennais FC", "Rennes"],
  ],
});

const IT_CLUBS = defineRoster({
  prefix: "fb",
  country: "IT",
  band: [0.92, 0.58],
  rows: [
    ["INT", "Inter Milan", "Inter"],
    ["MIL", "AC Milan", "Milan"],
    ["JUV", "Juventus", "Juventus"],
    ["NAP", "SSC Napoli", "Napoli"],
    ["ROM", "AS Roma", "Roma"],
    ["ATA", "Atalanta BC", "Atalanta"],
    ["LAZ", "SS Lazio", "Lazio"],
    ["FIO", "ACF Fiorentina", "Fiorentina"],
  ],
});

const DE_CLUBS = defineRoster({
  prefix: "fb",
  country: "DE",
  band: [0.93, 0.57],
  rows: [
    ["BAY", "FC Bayern München", "Bayern"],
    ["BVB", "Borussia Dortmund", "Dortmund"],
    ["LEV", "Bayer 04 Leverkusen", "Leverkusen"],
    ["RBL", "RB Leipzig", "Leipzig"],
    ["SGE", "Eintracht Frankfurt", "Frankfurt"],
    ["VFB", "VfB Stuttgart", "Stuttgart"],
    ["WOB", "VfL Wolfsburg", "Wolfsburg"],
    ["SCF", "SC Freiburg", "Freiburg"],
  ],
});

/*
 * Second tiers and the sides that only meet the elite in the cups. Eight a
 * division is enough for a round of fixtures; the ranking order still drives
 * prices, so a Championship side is short against League Two opposition.
 */

const EN_CHAMPIONSHIP = defineRoster({
  prefix: "fb",
  country: "GB-ENG",
  band: [0.66, 0.5],
  rows: [
    ["LEI", "Leicester City", "Leicester"],
    ["SOU", "Southampton", "Southampton"],
    ["IPS", "Ipswich Town", "Ipswich"],
    ["SHU", "Sheffield United", "Sheffield Utd"],
    ["MID", "Middlesbrough", "Middlesbrough"],
    ["WBA", "West Bromwich Albion", "West Brom"],
    ["NOR", "Norwich City", "Norwich"],
    ["COV", "Coventry City", "Coventry"],
  ],
});

const EN_LEAGUE_ONE = defineRoster({
  prefix: "fb",
  country: "GB-ENG",
  band: [0.52, 0.4],
  rows: [
    ["WIG", "Wigan Athletic", "Wigan"],
    ["BOL", "Bolton Wanderers", "Bolton"],
    ["HUD", "Huddersfield Town", "Huddersfield"],
    ["REA", "Reading", "Reading"],
    ["BRN", "Barnsley", "Barnsley"],
    ["STO", "Stockport County", "Stockport"],
    ["PET", "Peterborough United", "Peterborough"],
    ["WYC", "Wycombe Wanderers", "Wycombe"],
  ],
});

const EN_LEAGUE_TWO = defineRoster({
  prefix: "fb",
  country: "GB-ENG",
  band: [0.42, 0.3],
  rows: [
    ["BRA", "Bradford City", "Bradford"],
    ["NOT", "Notts County", "Notts County"],
    ["GIL", "Gillingham", "Gillingham"],
    ["SWI", "Swindon Town", "Swindon"],
    ["CHF", "Chesterfield", "Chesterfield"],
    ["WAL", "Walsall", "Walsall"],
    ["GRI", "Grimsby Town", "Grimsby"],
    ["SAL", "Salford City", "Salford"],
  ],
});

const ES_SEGUNDA = defineRoster({
  prefix: "fb",
  country: "ES",
  band: [0.6, 0.45],
  rows: [
    ["ZAR", "Real Zaragoza", "Zaragoza"],
    ["SPG", "Real Sporting de Gijón", "Sporting Gijón"],
    ["RAC", "Real Racing Club de Santander", "Racing"],
    ["DEP", "RC Deportivo de La Coruña", "Deportivo"],
    ["MAL", "Málaga CF", "Málaga"],
    ["GRA", "Granada CF", "Granada"],
    ["CAD", "Cádiz CF", "Cádiz"],
    ["ALM", "UD Almería", "Almería"],
  ],
});

const IT_SERIE_B = defineRoster({
  prefix: "fb",
  country: "IT",
  band: [0.6, 0.45],
  rows: [
    ["SAM", "UC Sampdoria", "Sampdoria"],
    ["PAL", "Palermo FC", "Palermo"],
    ["BRI", "SSC Bari", "Bari"],
    ["SPE", "Spezia Calcio", "Spezia"],
    ["MOD", "Modena FC", "Modena"],
    ["VEN", "Venezia FC", "Venezia"],
    ["CTZ", "US Catanzaro", "Catanzaro"],
    ["FRO", "Frosinone Calcio", "Frosinone"],
  ],
});

const DE_BUNDESLIGA_2 = defineRoster({
  prefix: "fb",
  country: "DE",
  band: [0.62, 0.45],
  rows: [
    ["S04", "FC Schalke 04", "Schalke"],
    ["BSC", "Hertha BSC", "Hertha"],
    ["F95", "Fortuna Düsseldorf", "Düsseldorf"],
    ["H96", "Hannover 96", "Hannover"],
    ["FCN", "1. FC Nürnberg", "Nürnberg"],
    ["KSC", "Karlsruher SC", "Karlsruhe"],
    ["PAD", "SC Paderborn 07", "Paderborn"],
    ["FCK", "1. FC Kaiserslautern", "Kaiserslautern"],
  ],
});

const FR_LIGUE_2 = defineRoster({
  prefix: "fb",
  country: "FR",
  band: [0.58, 0.44],
  rows: [
    ["ASE", "AS Saint-Étienne", "Saint-Étienne"],
    ["MHS", "Montpellier HSC", "Montpellier"],
    ["REI", "Stade de Reims", "Reims"],
    ["EAG", "En Avant Guingamp", "Guingamp"],
    ["BAS", "SC Bastia", "Bastia"],
    ["GRE", "Grenoble Foot 38", "Grenoble"],
    ["AMI", "Amiens SC", "Amiens"],
    ["RSF", "Red Star FC", "Red Star"],
  ],
});

const SA_CLUBS = defineRoster({
  prefix: "fb",
  country: "SA",
  band: [0.8, 0.55],
  rows: [
    ["HIL", "Al Hilal SFC", "Al Hilal"],
    ["NAS", "Al Nassr FC", "Al Nassr"],
    ["ITT", "Al Ittihad Club", "Al Ittihad"],
    ["AHS", "Al Ahli Saudi FC", "Al Ahli"],
    ["QAD", "Al Qadsiah FC", "Al Qadsiah"],
    ["SHB", "Al Shabab FC", "Al Shabab"],
    ["ETT", "Al Ettifaq FC", "Al Ettifaq"],
    ["TAA", "Al Taawoun FC", "Al Taawoun"],
  ],
});

const QA_CLUBS = defineRoster({
  prefix: "fb",
  country: "QA",
  band: [0.7, 0.48],
  rows: [
    ["SAD", "Al Sadd SC", "Al Sadd"],
    ["DUH", "Al Duhail SC", "Al Duhail"],
    ["RAY", "Al Rayyan SC", "Al Rayyan"],
    ["GHA", "Al Gharafa SC", "Al Gharafa"],
    ["ARB", "Al Arabi SC", "Al Arabi"],
    ["WAK", "Al Wakrah SC", "Al Wakrah"],
    ["QSC", "Qatar SC", "Qatar SC"],
    ["UMS", "Umm Salal SC", "Umm Salal"],
  ],
});

const EU_CLUBS = defineRoster({
  prefix: "fb",
  country: "WW",
  band: [0.88, 0.62],
  rows: [
    ["SLB", "SL Benfica", "Benfica", "PT"],
    ["FCP", "FC Porto", "Porto", "PT"],
    ["SCP", "Sporting CP", "Sporting", "PT"],
    ["AJA", "AFC Ajax", "Ajax", "NL"],
    ["PSV", "PSV Eindhoven", "PSV", "NL"],
    ["FEY", "Feyenoord", "Feyenoord", "NL"],
    ["GAL", "Galatasaray", "Galatasaray", "TR"],
    ["FEN", "Fenerbahçe", "Fenerbahçe", "TR"],
  ],
});

/* ---------------------------------------------------------------- basketball */

const NBA_TEAMS = defineRoster({
  prefix: "bk",
  country: "US",
  band: [0.9, 0.6],
  rows: [
    ["BOS", "Boston Celtics", "Celtics"],
    ["DEN", "Denver Nuggets", "Nuggets"],
    ["MIL", "Milwaukee Bucks", "Bucks"],
    ["LAL", "Los Angeles Lakers", "Lakers"],
    ["GSW", "Golden State Warriors", "Warriors"],
    ["PHX", "Phoenix Suns", "Suns"],
    ["NYK", "New York Knicks", "Knicks"],
    ["MIA", "Miami Heat", "Heat"],
  ],
});

const EUROLEAGUE_TEAMS = defineRoster({
  prefix: "bk",
  country: "WW",
  band: [0.88, 0.6],
  rows: [
    ["RMB", "Real Madrid Baloncesto", "Real Madrid", "ES"],
    ["FCB", "FC Barcelona Bàsquet", "Barça", "ES"],
    ["PAO", "Panathinaikos AKTOR", "Panathinaikos"],
    ["OLY", "Olympiacos Piraeus", "Olympiacos"],
    ["EFE", "Anadolu Efes", "Anadolu Efes", "TR"],
    ["FEN", "Fenerbahçe Beko", "Fenerbahçe", "TR"],
    ["VIR", "Virtus Bologna", "Virtus", "IT"],
    ["MON", "AS Monaco Basket", "Monaco", "FR"],
  ],
});

const TN_BASKET = defineRoster({
  prefix: "bk",
  country: "TN",
  band: [0.78, 0.45],
  rows: [
    ["USM", "Union Sportive Monastirienne", "US Monastir"],
    ["EST", "Espérance Sportive de Tunis", "Espérance"],
    ["ESS", "Étoile Sportive du Sahel", "Étoile du Sahel"],
    ["CLA", "Club Africain", "Club Africain"],
    ["EZZ", "Ezzahra Sports", "Ezzahra Sports"],
    ["SNA", "Stade Nabeulien", "Stade Nabeulien"],
    ["DSG", "Dalia Sport de Grombalia", "Dalia Grombalia"],
    ["JSK", "Jeunesse Sportive Kairouanaise", "JS Kairouan"],
  ],
});

/* -------------------------------------------------------------------- tennis */

/** Individual sports reuse `Team` — a competitor is a one-person side. */
const ATP_PLAYERS = defineRoster({
  prefix: "tn",
  country: "WW",
  band: [0.9, 0.62],
  rows: [
    ["SIN", "Jannik Sinner", "Sinner", "IT"],
    ["ALC", "Carlos Alcaraz", "Alcaraz", "ES"],
    ["DJO", "Novak Djokovic", "Djokovic"],
    ["ZVE", "Alexander Zverev", "Zverev", "DE"],
    ["MED", "Daniil Medvedev", "Medvedev"],
    ["RUB", "Andrey Rublev", "Rublev"],
    ["FRI", "Taylor Fritz", "Fritz", "US"],
    ["RUU", "Casper Ruud", "Ruud"],
  ],
});

const WTA_PLAYERS = defineRoster({
  prefix: "tn",
  country: "WW",
  band: [0.9, 0.6],
  rows: [
    ["SWI", "Iga Świątek", "Świątek"],
    ["SAB", "Aryna Sabalenka", "Sabalenka"],
    ["GAU", "Coco Gauff", "Gauff", "US"],
    ["RYB", "Elena Rybakina", "Rybakina"],
    ["ZHE", "Zheng Qinwen", "Zheng"],
    ["JAB", "Ons Jabeur", "Jabeur", "TN"],
    ["PEG", "Jessica Pegula", "Pegula", "US"],
    ["VON", "Markéta Vondroušová", "Vondroušová"],
  ],
});

/* ------------------------------------------------------------------ handball */

const EHF_TEAMS = defineRoster({
  prefix: "hb",
  country: "WW",
  band: [0.9, 0.62],
  rows: [
    ["BAR", "Barça Handbol", "Barça", "ES"],
    ["VES", "Telekom Veszprém", "Veszprém"],
    ["KIE", "THW Kiel", "Kiel", "DE"],
    ["PSG", "Paris Saint-Germain Handball", "PSG", "FR"],
    ["KIL", "Industria Kielce", "Kielce"],
    ["AAL", "Aalborg Håndbold", "Aalborg"],
    ["FLE", "SG Flensburg-Handewitt", "Flensburg", "DE"],
    ["NAN", "HBC Nantes", "Nantes", "FR"],
  ],
});

const TN_HANDBALL = defineRoster({
  prefix: "hb",
  country: "TN",
  band: [0.8, 0.45],
  rows: [
    ["EST", "Espérance Sportive de Tunis", "Espérance"],
    ["CLA", "Club Africain", "Club Africain"],
    ["ESS", "Étoile Sportive du Sahel", "Étoile du Sahel"],
    ["SAK", "Club Sportif de Sakiet Ezzit", "CS Sakiet Ezzit"],
    ["CSS", "Club Sportif Sfaxien", "CS Sfaxien"],
    ["EMM", "Espérance de Mahdia", "ES Mahdia"],
    ["ASH", "Association Sportive de Hammamet", "AS Hammamet"],
    ["ESR", "Étoile Sportive de Radès", "ES Radès"],
  ],
});

/* ---------------------------------------------------------------- volleyball */

const CEV_TEAMS = defineRoster({
  prefix: "vb",
  country: "WW",
  band: [0.88, 0.6],
  rows: [
    ["PER", "Sir Susa Vim Perugia", "Perugia", "IT"],
    ["TRE", "Itas Trentino", "Trentino", "IT"],
    ["ZAK", "ZAKSA Kędzierzyn-Koźle", "ZAKSA"],
    ["JAS", "Jastrzębski Węgiel", "Jastrzębski"],
    ["LUB", "Cucine Lube Civitanova", "Lube", "IT"],
    ["HAL", "Halkbank Ankara", "Halkbank", "TR"],
    ["BER", "Berlin Recycling Volleys", "Berlin", "DE"],
    ["TOU", "Tours Volley-Ball", "Tours", "FR"],
  ],
});

const TN_VOLLEY = defineRoster({
  prefix: "vb",
  country: "TN",
  band: [0.8, 0.45],
  rows: [
    ["EST", "Espérance Sportive de Tunis", "Espérance"],
    ["CLA", "Club Africain", "Club Africain"],
    ["ESS", "Étoile Sportive du Sahel", "Étoile du Sahel"],
    ["KEL", "Club Olympique de Kélibia", "CO Kélibia"],
    ["SAY", "Saydia Sports", "Saydia Sports"],
    ["CSS", "Club Sportif Sfaxien", "CS Sfaxien"],
    ["SNA", "Stade Nabeulien", "Stade Nabeulien"],
    ["EHS", "Espoir Sportif de Hammam Sousse", "ES Hammam Sousse"],
  ],
});

/* --------------------------------------------------------------------- rugby */

const SIX_NATIONS_TEAMS = defineRoster({
  prefix: "rg",
  country: "WW",
  band: [0.88, 0.6],
  rows: [
    ["IRE", "Ireland", "Ireland"],
    ["FRA", "France", "France", "FR"],
    ["ENG", "England", "England", "GB-ENG"],
    ["SCO", "Scotland", "Scotland"],
    ["ITA", "Italy", "Italy", "IT"],
    ["WAL", "Wales", "Wales"],
  ],
});

const RUGBY_AFRICA_TEAMS = defineRoster({
  prefix: "rg",
  country: "WW",
  band: [0.75, 0.45],
  rows: [
    ["NAM", "Namibia", "Namibia"],
    ["ZIM", "Zimbabwe", "Zimbabwe"],
    ["ALG", "Algeria", "Algeria", "DZ"],
    ["KEN", "Kenya", "Kenya"],
    ["TUN", "Tunisia", "Tunisia", "TN"],
    ["MAR", "Morocco", "Morocco", "MA"],
    ["UGA", "Uganda", "Uganda"],
    ["SEN", "Senegal", "Senegal"],
  ],
});

/* -------------------------------------------------------------------- boxing */

const BOXERS = defineRoster({
  prefix: "bx",
  country: "WW",
  band: [0.85, 0.6],
  rows: [
    ["USY", "Oleksandr Usyk", "Usyk"],
    ["INO", "Naoya Inoue", "Inoue"],
    ["CRA", "Terence Crawford", "Crawford", "US"],
    ["CAN", "Canelo Álvarez", "Canelo"],
    ["BET", "Artur Beterbiev", "Beterbiev"],
    ["BIV", "Dmitry Bivol", "Bivol"],
    ["FUR", "Tyson Fury", "Fury", "GB"],
    ["JOS", "Anthony Joshua", "Joshua", "GB"],
  ],
});

/* ----------------------------------------------------------------- formula 1 */

const F1_DRIVERS = defineRoster({
  prefix: "f1",
  country: "WW",
  band: [0.92, 0.55],
  rows: [
    ["VER", "Max Verstappen", "Verstappen", "NL"],
    ["NOR", "Lando Norris", "Norris", "GB"],
    ["LEC", "Charles Leclerc", "Leclerc"],
    ["PIA", "Oscar Piastri", "Piastri"],
    ["RUS", "George Russell", "Russell", "GB"],
    ["HAM", "Lewis Hamilton", "Hamilton", "GB"],
    ["SAI", "Carlos Sainz", "Sainz", "ES"],
    ["ALO", "Fernando Alonso", "Alonso", "ES"],
  ],
});

export const TEAMS: Team[] = [
  ...TN_LIGUE_1,
  ...TN_LIGUE_2,
  ...AFRICA_CLUBS,
  ...MA_CLUBS,
  ...DZ_CLUBS,
  ...EG_CLUBS,
  ...AFRICA_NATIONS,
  ...EN_CLUBS,
  ...ES_CLUBS,
  ...FR_CLUBS,
  ...IT_CLUBS,
  ...DE_CLUBS,
  ...EN_CHAMPIONSHIP,
  ...EN_LEAGUE_ONE,
  ...EN_LEAGUE_TWO,
  ...ES_SEGUNDA,
  ...IT_SERIE_B,
  ...DE_BUNDESLIGA_2,
  ...FR_LIGUE_2,
  ...SA_CLUBS,
  ...QA_CLUBS,
  ...EU_CLUBS,
  ...NBA_TEAMS,
  ...EUROLEAGUE_TEAMS,
  ...TN_BASKET,
  ...ATP_PLAYERS,
  ...WTA_PLAYERS,
  ...EHF_TEAMS,
  ...TN_HANDBALL,
  ...CEV_TEAMS,
  ...TN_VOLLEY,
  ...SIX_NATIONS_TEAMS,
  ...RUGBY_AFRICA_TEAMS,
  ...BOXERS,
  ...F1_DRIVERS,
];

/* -------------------------------------------------------------- competitions */

function competition(
  id: string,
  sport: SportKey,
  country: string,
  name: string,
  shortName: string,
  popular = false,
): Omit<CompetitionSeed, "order"> {
  return {
    id,
    sportId: sportId(sport),
    countryId: countryId(country),
    name,
    shortName,
    popular,
    monogram: monogramOf(shortName),
    hue: hueOf(id),
  };
}

/**
 * Authored in navigation order: within a country the top flight comes first,
 * then the lower divisions, then the cups. `order` is stamped from the position
 * below, so reordering the list is the only way to reorder the sidebar.
 */
export const COMPETITIONS: CompetitionSeed[] = [
  // Tunisia leads the list — it is the market this product is built for.
  competition("comp-tn-lp1", "football", "TN", "Ligue Professionnelle 1", "Ligue 1", true),
  competition("comp-tn-lp2", "football", "TN", "Ligue Professionnelle 2", "Ligue 2"),
  competition("comp-tn-cup", "football", "TN", "Coupe de Tunisie", "Coupe TN", true),
  competition("comp-tn-supercup", "football", "TN", "Super Coupe de Tunisie", "Super Coupe"),

  // Africa.
  competition("comp-caf-cl", "football", "WW", "CAF Champions League", "CAF CL", true),
  competition("comp-caf-cc", "football", "WW", "CAF Confederation Cup", "CAF CC"),
  competition("comp-afcon", "football", "WW", "Africa Cup of Nations", "AFCON"),
  competition("comp-ma-botola", "football", "MA", "Botola Pro", "Botola Pro"),
  competition("comp-dz-l1", "football", "DZ", "Ligue 1 Professionnelle", "Ligue 1 DZ"),
  competition("comp-eg-pl", "football", "EG", "Egyptian Premier League", "Egypt PL"),

  // Europe.
  competition("comp-en-pl", "football", "GB-ENG", "Premier League", "Premier League", true),
  competition("comp-en-championship", "football", "GB-ENG", "Championship", "Championship"),
  competition("comp-en-league-one", "football", "GB-ENG", "League One", "League One"),
  competition("comp-en-league-two", "football", "GB-ENG", "League Two", "League Two"),
  competition("comp-en-fa-cup", "football", "GB-ENG", "FA Cup", "FA Cup"),
  competition("comp-en-efl-cup", "football", "GB-ENG", "EFL Cup", "EFL Cup"),
  competition("comp-es-laliga", "football", "ES", "LaLiga", "LaLiga", true),
  competition("comp-es-segunda", "football", "ES", "Segunda División", "Segunda"),
  competition("comp-es-copa", "football", "ES", "Copa del Rey", "Copa del Rey"),
  competition("comp-it-seriea", "football", "IT", "Serie A", "Serie A", true),
  competition("comp-it-serieb", "football", "IT", "Serie B", "Serie B"),
  competition("comp-it-coppa", "football", "IT", "Coppa Italia", "Coppa Italia"),
  competition("comp-de-bundesliga", "football", "DE", "Bundesliga", "Bundesliga", true),
  competition("comp-de-bundesliga2", "football", "DE", "2. Bundesliga", "2. Bundesliga"),
  competition("comp-de-pokal", "football", "DE", "DFB-Pokal", "DFB-Pokal"),
  competition("comp-fr-l1", "football", "FR", "Ligue 1", "Ligue 1 FR", true),
  competition("comp-fr-l2", "football", "FR", "Ligue 2", "Ligue 2 FR"),
  competition("comp-fr-coupe", "football", "FR", "Coupe de France", "Coupe de France"),
  competition("comp-uefa-ucl", "football", "WW", "UEFA Champions League", "Champions League", true),
  competition("comp-uefa-uel", "football", "WW", "UEFA Europa League", "Europa League"),

  // Gulf.
  competition("comp-sa-spl", "football", "SA", "Saudi Pro League", "Saudi Pro League"),
  competition("comp-qa-qsl", "football", "QA", "Qatar Stars League", "Stars League"),

  // Basketball.
  competition("comp-nba", "basketball", "US", "NBA", "NBA", true),
  competition("comp-euroleague", "basketball", "WW", "EuroLeague", "EuroLeague"),
  competition("comp-tn-basket", "basketball", "TN", "Championnat National A", "Nationale A"),

  // Tennis.
  competition("comp-atp", "tennis", "WW", "ATP Tour", "ATP"),
  competition("comp-wta", "tennis", "WW", "WTA Tour", "WTA"),
  competition("comp-grand-slam", "tennis", "WW", "Grand Slam", "Grand Slam"),

  // Handball.
  competition("comp-ehf-cl", "handball", "WW", "EHF Champions League", "EHF CL"),
  competition("comp-tn-handball", "handball", "TN", "Championnat de Tunisie de Handball", "Handball TN"),

  // Volleyball.
  competition("comp-cev-cl", "volleyball", "WW", "CEV Champions League", "CEV CL"),
  competition("comp-tn-volley", "volleyball", "TN", "Championnat de Tunisie de Volley-ball", "Volley TN"),

  // Rugby.
  competition("comp-six-nations", "rugby", "WW", "Six Nations", "Six Nations"),
  competition("comp-rugby-africa", "rugby", "WW", "Rugby Africa Cup", "Rugby Africa"),

  // Individual sports.
  competition("comp-boxing-world", "boxing", "WW", "World Title Fights", "World Titles"),
  competition("comp-f1", "formula1", "WW", "Formula 1 World Championship", "Formula 1"),
].map((seed, index) => ({ ...seed, order: index + 1 }));

/**
 * Who can be drawn against whom. A club appears in every competition it would
 * realistically enter, so the same Espérance side turns up in Ligue 1, the cup
 * and the CAF Champions League.
 */
export const COMPETITION_ROSTERS: Readonly<Record<string, readonly string[]>> = {
  "comp-tn-lp1": ids(TN_LIGUE_1),
  "comp-tn-lp2": ids(TN_LIGUE_2),
  "comp-tn-cup": [...ids(TN_LIGUE_1), ...ids(TN_LIGUE_2)],
  "comp-tn-supercup": ids(TN_LIGUE_1).slice(0, 4),

  "comp-caf-cl": [
    ...ids(TN_LIGUE_1).slice(0, 3),
    "team-fb-ahl",
    "team-fb-wac",
    "team-fb-rca",
    "team-fb-pyr",
    "team-fb-crb",
    "team-fb-mca",
    "team-fb-jsk",
  ],
  "comp-caf-cc": [
    "team-fb-cla",
    "team-fb-css",
    "team-fb-zam",
    "team-fb-ama",
    "team-fb-rsb",
    "team-fb-uma",
    "team-fb-mco",
    "team-fb-fut",
  ],
  "comp-afcon": ids(AFRICA_NATIONS),
  "comp-ma-botola": ["team-fb-wac", "team-fb-rca", "team-fb-rsb", ...ids(MA_CLUBS)],
  "comp-dz-l1": [
    "team-fb-crb",
    "team-fb-mca",
    "team-fb-uma",
    "team-fb-jsk",
    "team-fb-mco",
    ...ids(DZ_CLUBS),
  ],
  "comp-eg-pl": [
    "team-fb-ahl",
    "team-fb-zam",
    "team-fb-pyr",
    "team-fb-ama",
    "team-fb-fut",
    ...ids(EG_CLUBS),
  ],

  "comp-en-pl": ids(EN_CLUBS),
  "comp-en-championship": ids(EN_CHAMPIONSHIP),
  "comp-en-league-one": ids(EN_LEAGUE_ONE),
  "comp-en-league-two": ids(EN_LEAGUE_TWO),
  "comp-en-fa-cup": [
    ...ids(EN_CLUBS).slice(0, 6),
    ...ids(EN_CHAMPIONSHIP).slice(0, 4),
    ...ids(EN_LEAGUE_ONE).slice(0, 2),
    ...ids(EN_LEAGUE_TWO).slice(0, 2),
  ],
  "comp-en-efl-cup": [
    ...ids(EN_CLUBS).slice(4),
    ...ids(EN_CHAMPIONSHIP),
    ...ids(EN_LEAGUE_ONE).slice(0, 2),
  ],
  "comp-es-laliga": ids(ES_CLUBS),
  "comp-es-segunda": ids(ES_SEGUNDA),
  "comp-es-copa": [...ids(ES_CLUBS), ...ids(ES_SEGUNDA).slice(0, 4)],
  "comp-it-seriea": ids(IT_CLUBS),
  "comp-it-serieb": ids(IT_SERIE_B),
  "comp-it-coppa": [...ids(IT_CLUBS), ...ids(IT_SERIE_B).slice(0, 4)],
  "comp-de-bundesliga": ids(DE_CLUBS),
  "comp-de-bundesliga2": ids(DE_BUNDESLIGA_2),
  "comp-de-pokal": [...ids(DE_CLUBS), ...ids(DE_BUNDESLIGA_2).slice(0, 4)],
  "comp-fr-l1": ids(FR_CLUBS),
  "comp-fr-l2": ids(FR_LIGUE_2),
  "comp-fr-coupe": [...ids(FR_CLUBS), ...ids(FR_LIGUE_2).slice(0, 4)],
  "comp-sa-spl": ids(SA_CLUBS),
  "comp-qa-qsl": ids(QA_CLUBS),
  "comp-uefa-ucl": [
    ...ids(EN_CLUBS).slice(0, 4),
    ...ids(ES_CLUBS).slice(0, 3),
    ...ids(FR_CLUBS).slice(0, 3),
    ...ids(IT_CLUBS).slice(0, 3),
    ...ids(DE_CLUBS).slice(0, 3),
    ...ids(EU_CLUBS).slice(0, 5),
  ],
  "comp-uefa-uel": [
    ...ids(EN_CLUBS).slice(4),
    ...ids(ES_CLUBS).slice(3),
    ...ids(FR_CLUBS).slice(3),
    ...ids(IT_CLUBS).slice(3),
    ...ids(DE_CLUBS).slice(3),
    ...ids(EU_CLUBS).slice(3),
  ],

  "comp-nba": ids(NBA_TEAMS),
  "comp-euroleague": ids(EUROLEAGUE_TEAMS),
  "comp-tn-basket": ids(TN_BASKET),

  "comp-atp": ids(ATP_PLAYERS),
  "comp-wta": ids(WTA_PLAYERS),
  "comp-grand-slam": [...ids(ATP_PLAYERS), ...ids(WTA_PLAYERS)],

  "comp-ehf-cl": ids(EHF_TEAMS),
  "comp-tn-handball": ids(TN_HANDBALL),

  "comp-cev-cl": ids(CEV_TEAMS),
  "comp-tn-volley": ids(TN_VOLLEY),

  "comp-six-nations": ids(SIX_NATIONS_TEAMS),
  "comp-rugby-africa": ids(RUGBY_AFRICA_TEAMS),

  "comp-boxing-world": ids(BOXERS),
  "comp-f1": ids(F1_DRIVERS),
};

/** The marquee Tunisian derby, used for the homepage hero fixture. */
export const HERO_FIXTURE = {
  competitionId: "comp-tn-lp1",
  homeTeamId: "team-fb-est",
  awayTeamId: "team-fb-cla",
} as const;

/* ------------------------------------------------------------------- indexes */

export const SPORT_BY_ID: ReadonlyMap<string, SportSeed> = new Map(
  SPORTS.map((sport) => [sport.id, sport]),
);

export const SPORT_BY_KEY: ReadonlyMap<SportKey, SportSeed> = new Map(
  SPORTS.map((sport) => [sport.key, sport]),
);

export const COUNTRY_BY_ID: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map((country) => [country.id, country]),
);

export const COMPETITION_BY_ID: ReadonlyMap<string, CompetitionSeed> = new Map(
  COMPETITIONS.map((entry) => [entry.id, entry]),
);

export const TEAM_BY_ID: ReadonlyMap<string, Team> = new Map(TEAMS.map((team) => [team.id, team]));

/**
 * 0-1 rating per team, interpolated from each roster's ranking order. The odds
 * model in `fixtures.ts` reads nothing else about a side, so this map is the
 * single lever for how a fixture prices.
 */
export const TEAM_STRENGTH: Readonly<Record<string, number>> = Object.fromEntries(strengthById);
