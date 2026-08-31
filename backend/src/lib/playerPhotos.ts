import { db } from '../db.js';

/**
 * Caché en memoria de las fotos recortadas (tabla `player_photos`, poblada
 * por scripts/resolvePlayerPhotos.ts). Se busca SIEMPRE dentro del equipo:
 * por nombre normalizado y, si falla, por apellido. Nunca por nombre suelto
 * contra una fuente externa — eso devuelve jugadores equivocados.
 */
type Row = { team_id: string; name_key: string; last_key: string; photo_url: string };

let byName = new Map<string, string>(); // `${team}|${nameKey}` -> url
let byLast = new Map<string, string>(); // `${team}|${lastKey}` -> url

/** minúsculas, sin acentos ni puntuación: "J. Koundé" -> "j kounde" */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** solo el último token: "Jules Koundé" -> "kounde" */
export function lastKey(name: string): string {
  const parts = nameKey(name).split(' ').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export async function refreshPhotoCache(): Promise<number> {
  const { data, error } = await db.from('player_photos').select('team_id, name_key, last_key, photo_url');
  if (error) {
    // Tabla aún sin migrar: el resto del job sigue funcionando sin fotos.
    console.warn('[playerPhotos] no se pudo leer player_photos', error.message);
    return 0;
  }
  const n = new Map<string, string>();
  const l = new Map<string, string>();
  for (const r of (data ?? []) as Row[]) {
    n.set(`${r.team_id}|${r.name_key}`, r.photo_url);
    // Si dos jugadores del mismo equipo comparten apellido, el índice por
    // apellido queda ambiguo: se descarta para no arriesgar una cara errónea.
    const lk = `${r.team_id}|${r.last_key}`;
    l.set(lk, l.has(lk) ? '' : r.photo_url);
  }
  byName = n;
  byLast = l;
  return byName.size;
}

export function photoFor(teamId: string | null | undefined, playerName: string): string | null {
  if (!teamId) return null;
  const exact = byName.get(`${teamId}|${nameKey(playerName)}`);
  if (exact) return exact;
  const byApellido = byLast.get(`${teamId}|${lastKey(playerName)}`);
  return byApellido || null;
}
