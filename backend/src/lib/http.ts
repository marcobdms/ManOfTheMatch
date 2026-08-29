import { createHash } from 'node:crypto';
import { db } from '../db.js';

type FetchOpts = {
  headers?: Record<string, string>;
  /** Serve from cache while younger than this. */
  ttlSeconds?: number;
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

  const fresh = cached?.expires_at && new Date(cached.expires_at) > new Date();
  if (fresh) return cached.body as T;

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
