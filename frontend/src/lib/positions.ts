// Códigos que devuelve backend/src/lib/map.ts `fotmobPositionLabel` — lista
// cerrada, no hay más valores posibles que estos 12.
const POSITION_LABEL: Record<string, string> = {
  POR: 'Portero',
  LI: 'Lateral izquierdo',
  LD: 'Lateral derecho',
  DFC: 'Defensa central',
  CI: 'Carrilero izquierdo',
  CD: 'Carrilero derecho',
  MCD: 'Mediocentro defensivo',
  MC: 'Mediocentro',
  MCO: 'Mediapunta',
  EI: 'Extremo izquierdo',
  ED: 'Extremo derecho',
  DC: 'Delantero centro',
}

export function fullPositionLabel(code: string | null): string | null {
  if (!code) return null
  return POSITION_LABEL[code] ?? code
}
