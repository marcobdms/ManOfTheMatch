// Bandera del país del jugador para el reverso de la carta. Fotmob da un
// código de 3 letras propio (tipo COI: ESP, GER, NED, ENG…), no ISO. Aquí se
// traduce a ISO-3166 alpha-2 y se sirve el SVG circular vendorizado en
// assets/flags/ (fuente: paquete `circle-flags`, solo devDep). Sin bandera
// para ese código -> null y la carta cae al nombre del país.

const files = import.meta.glob('../assets/flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** iso2 (nombre de archivo) -> url */
const FLAGS: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) {
  const key = path.split('/').pop()!.replace(/\.svg$/, '')
  FLAGS[key] = url
}

/** Código Fotmob (3 letras) -> ISO-3166 alpha-2 usado como nombre de archivo. */
const CC_TO_ISO2: Record<string, string> = {
  ALB: 'al', ALG: 'dz', AND: 'ad', ANG: 'ao', ARG: 'ar', ARM: 'am', AUS: 'au',
  AUT: 'at', AZE: 'az', BEL: 'be', BEN: 'bj', BFA: 'bf', BIH: 'ba', BOL: 'bo',
  BRA: 'br', BUL: 'bg', CAN: 'ca', CHI: 'cl', CHN: 'cn', CIV: 'ci', CMR: 'cm',
  COD: 'cd', COG: 'cg', COL: 'co', CPV: 'cv', CRC: 'cr', CRO: 'hr', CTA: 'cf',
  CUW: 'cw', CYP: 'cy', CZE: 'cz', DEN: 'dk', DOM: 'do', ECU: 'ec', EGY: 'eg',
  ENG: 'gb-eng', ESP: 'es', EST: 'ee', FIN: 'fi', FRA: 'fr', GAB: 'ga',
  GAM: 'gm', GEO: 'ge', GER: 'de', GHA: 'gh', GLP: 'gp', GNB: 'gw', GRE: 'gr',
  GUI: 'gn', HAI: 'ht', HON: 'hn', HUN: 'hu', IDN: 'id', IND: 'in', IRL: 'ie',
  IRN: 'ir', IRQ: 'iq', ISL: 'is', ISR: 'il', ITA: 'it', JAM: 'jm', JPN: 'jp',
  KAZ: 'kz', KEN: 'ke', KOR: 'kr', KOS: 'xk', KVX: 'xk', KSA: 'sa', LTU: 'lt',
  LUX: 'lu', LVA: 'lv', MAD: 'mg', MAR: 'ma', MEX: 'mx', MKD: 'mk', MLI: 'ml',
  MNE: 'me', MOZ: 'mz', MTN: 'mr', NED: 'nl', NGA: 'ng', NIR: 'gb-nir',
  NOR: 'no', NZL: 'nz', PAN: 'pa', PAR: 'py', PER: 'pe', PHI: 'ph', POL: 'pl',
  POR: 'pt', RSA: 'za', ROU: 'ro', RUS: 'ru', RWA: 'rw', SCO: 'gb-sct',
  SEN: 'sn', SRB: 'rs', SVK: 'sk', SVN: 'si', SUI: 'ch', SUR: 'sr', SWE: 'se',
  SYR: 'sy', TAN: 'tz', THA: 'th', TOG: 'tg', TRI: 'tt', TUN: 'tn', TUR: 'tr',
  UAE: 'ae', UGA: 'ug', UKR: 'ua', URU: 'uy', USA: 'us', UZB: 'uz', VEN: 've',
  WAL: 'gb-wls', ZAM: 'zm', ZIM: 'zw',
}

/** URL de la bandera para un código Fotmob, o null si no la tenemos. */
export function flagFor(code: string | null | undefined): string | null {
  if (!code) return null
  const iso2 = CC_TO_ISO2[code.toUpperCase()]
  return (iso2 && FLAGS[iso2]) ?? null
}
