import { createHash } from 'node:crypto';
import { db } from '../db.js';

type FetchOpts = {
  headers?: Record<string, string>;
  /** Serve from cache while younger than this. */
  ttlSeconds?: number;
  /**
   * Edad máxima aceptable de una entrada YA guardada, en segundos. Sirve para
   * que un llamador que necesita datos frescos no quede atrapado tras el TTL
   * largo que dejó otro llamador sobre la misma URL (misma `cache_key`).
   *
   * Caso real que esto arregla: `syncLineups` pedía el `matchDetails` de un
   * partido aún no empezado con TTL de 6 h; cuando el partido arrancaba, el
   * `liveTicker` (TTL 10 s) encontraba esa entrada de 6 h "fresca" y nunca
   * hacía un fetch real, así que el histórico se quedaba congelado en el
   * estado previo al partido.
   */
  maxAgeSeconds?: number;
  /**
   * Optional guard run on a freshly fetched body *before* it is cached. Throw to
   * reject the response — nothing is written to `http_cache` and the error
   * propagates to the caller. Needed for API-Football, which returns quota / param
   * failures as HTTP 200 with a populated `errors` object (see api-research.md §3.2).
   */
  assertOk?: (body: unknown) => void;
  /**
   * Optional hook awaited immediately before the real network `fetch` — never on
   * a cache hit or a 304 revalidation. Used by `sources/fotmob.ts` to serialize +
   * throttle + circuit-break requests to a host with no published rate limit
   * (api-research.md / docs/plan-2026-08-29.md §A2). Throwing here aborts the
   * request before any network call and propagates to the caller, same as a
   * fetch failure.
   */
  beforeFetch?: () => Promise<void>;
};

/**
 * GET JSON through a Postgres-backed cache (ETag + TTL). Keeps us well inside
 * the free API tiers: repeated calls within `ttlSeconds` never hit the network,
 * and after that we revalidate with If-None-Match.
 */
export async function cachedJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const ttl = opts.ttlSeconds ?? 300;
  const key = createHash('sha1')
    .update(url + '|' + JSON.stringify(opts.headers ?? {}))
    .digest('hex');

  const { data: cached } = await db
    .from('http_cache')
    .select('*')
    .eq('cache_key', key)
    .maybeSingle();

  const notExpired = Boolean(cached?.expires_at && new Date(cached.expires_at) > new Date());
  // `maxAgeSeconds` manda sobre el `expires_at` guardado: aunque la entrada no
  // haya expirado, si es más vieja de lo que este llamador tolera se refresca.
  const withinMaxAge =
    opts.maxAgeSeconds == null ||
    (cached?.fetched_at != null &&
      Date.now() - new Date(cached.fetched_at).getTime() <= opts.maxAgeSeconds * 1000);

  if (notExpired && withinMaxAge) return cached.body as T;

  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  await opts.beforeFetch?.();
  const res = await fetch(url, { headers });

  if (res.status === 304 && cached) {
    await db
      .from('http_cache')
      .update({ expires_at: iso(ttl), fetched_at: new Date().toISOString() })
      .eq('cache_key', key);
    return cached.body as T;
  }

  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);

  const body = (await res.json()) as T;
  // Let the caller veto caching (e.g. API-Football 200-with-errors). Throwing here
  // skips the cache write and propagates.
  opts.assertOk?.(body);
  await db.from('http_cache').upsert({
    cache_key: key,
    etag: res.headers.get('etag'),
    last_modified: res.headers.get('last-modified'),
    body,
    fetched_at: new Date().toISOString(),
    expires_at: iso(ttl),
  });
  return body;
}

const iso = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
