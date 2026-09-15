/** Limpieza de texto que viene de fuentes externas (RSS, YouTube) antes de
 *  guardarlo. Los vídeos (`syncVideoNews`) publican su título tal cual, sin
 *  pasar por Groq, así que esto es lo único que los filtra antes de llegar a
 *  la app. */

/** Sin emojis en ningún texto que entre a la app: ni en el título de un
 *  vídeo de YouTube ("🌐 Cubo (2)...") ni en un titular de RSS. */
export function stripEmoji(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/️/g, '') // variation selector que a veces queda suelto
    .replace(/\s{2,}/g, ' ')
    .trim();
}
