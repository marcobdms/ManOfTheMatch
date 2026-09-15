/** Mismo filtro que `backend/src/lib/text.ts` (duplicado a mano, ver
 *  CLAUDE.md). Red de seguridad para filas ya guardadas ANTES de que ese
 *  filtro existiera — los vídeos no se reescriben nunca, así que sin esto
 *  seguirían enseñando el emoji del título original para siempre. */
export function stripEmoji(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/️/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
