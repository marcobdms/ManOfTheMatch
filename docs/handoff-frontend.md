# Handoff — frontend → backend / infra

Notes from wiring the **En vivo** view (`apps/web`). Nothing here blocks the
frontend build; each item is a backend/infra follow-up. No new shared types or
npm dependencies were required.

## 1. `push_subscriptions` needs a DELETE policy (or accept best-effort)

`0001_init.sql` gives anon only `INSERT` + `UPDATE` on `push_subscriptions`.
The notification bell's **disable** path calls
`supabase.from('push_subscriptions').delete().eq('endpoint', …)`, which RLS
currently blocks silently.

Pick one:
- add `create policy push_delete on push_subscriptions for delete using (true);`, or
- leave it: the browser-side `subscription.unsubscribe()` still stops delivery to
  that device, and `apps/ingest/src/notify.ts` already prunes dead endpoints on
  `410/404`. The client `delete` is written but treated as best-effort (see the
  comment in `apps/web/src/lib/push.ts`).

`upsert` (enable path) works today — it needs `INSERT` + `UPDATE`, both present.
No `SELECT` policy is required because we don't chain `.select()`.

## 2. Realtime publication

`useLiveRealtime()` (`apps/web/src/lib/queries.ts`) subscribes to
`postgres_changes` on `fixtures` and `match_events`. That requires them in the
`supabase_realtime` publication:

```sql
alter publication supabase_realtime add table fixtures, match_events;
```

Without it the app still updates via the 60s poll while a match is LIVE/PAUSED
(`POLL.liveSeconds`); realtime just makes goals appear instantly.

## 3. VAPID keys

Added `VITE_VAPID_PUBLIC_KEY` to `apps/web/.env.example`. It must be the **same**
key as `apps/ingest` `VAPID_PUBLIC_KEY`. Generate a pair with
`npx web-push generate-vapid-keys`.

## 4. Push payload contract

`apps/web/src/sw.ts` `push` handler expects a JSON body:
`{ title: string, body: string, tag?: string, url?: string }` — missing `url`
defaults to `/`. `apps/ingest/src/notify.ts` already sends this shape.

## 5. Column-name assumptions (from `0001_init.sql`)

- `fixtures`: `status`, `minute`, `kickoff_at`, `home_score`, `away_score`,
  `home_team_id`, `away_team_id`, `competition_id`.
- `match_events`: `type`, `minute`, `minute_extra` (used for the `45+2'` label),
  `team_id`, `player_name`, `assist_name`, `detail`, `sort_key`,
  ordered by `minute` then `sort_key`.
- Goal chips filter `type in ('GOAL','OWN_GOAL','PENALTY_GOAL')`.
- `SUB` events are assumed `player_name = entra`, `assist_name = sale`.
  `KEY_PASS` assumed `player_name = pasador`, `assist_name = receptor`.
  Adjust `buildEventText()` in `queries.ts` if ingest maps these differently.
- **Opponent teams are assumed to exist as rows in `teams`** (non-tracked), since
  `fixtures` has FK-only team refs and no team-name text columns. If ingest
  instead leaves the non-tracked side's `*_team_id` NULL, the scoreboard renders
  a `"Rival"` placeholder for that side — please confirm the ingest behaviour.

## 6. Not yet built

`push_subscriptions.prefs` (per-type toggles MATCHDAY / KICKOFF_SOON / GOAL) is
left at its DB default. The MVP bell is all-or-nothing per device. Flag if a
per-type UI is expected for the MVP.
