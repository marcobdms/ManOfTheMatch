import webpush from 'web-push';
import type { NotificationType, PushPrefKey } from './lib/shared.js';
import { db } from './db.js';

const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const contact = process.env.VAPID_CONTACT ?? 'mailto:hola@manofthematch.app';

if (pub && priv) webpush.setVapidDetails(contact, pub, priv);

type Payload = { title: string; body: string; tag?: string; url?: string };

type PushSub = { endpoint: string; p256dh: string; auth: string };

/** Send a Web Push to a set of subscription rows, pruning dead ones (410/404). */
async function sendToSubs(subs: PushSub[], payload: Payload): Promise<void> {
  if (!pub || !priv) {
    console.warn('[notify] sin VAPID keys — push desactivado');
    return;
  }
  await Promise.allSettled(
    subs.map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        )
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          }
        }),
    ),
  );
}

/**
 * Push to every device whose favorite team is `teamId`, gated by that team's
 * per-type preference (`prefs.<prefKey>`). Replaces the old "broadcast to
 * every subscription" behaviour now that favorites exist
 * (docs/handoff-schema-notify.md §3-4).
 *
 * Two sources of "favorite team" now coexist (docs/plan-2026-08-29.md §B3):
 *  - `push_subscriptions.favorite_team_id` — the original per-device value,
 *    still written for anonymous (signed-out) subscriptions.
 *  - `profiles.favorite_team_id` — the signed-in source of truth, joined
 *    through `push_subscriptions.user_id` when present. This can differ from
 *    the row's own `favorite_team_id` if the user changed their favorite on
 *    another device; the profile wins for any row that has a `user_id`.
 * `prefs` still lives on `push_subscriptions` either way — the profile only
 * supplies the favorite team, not notification prefs.
 */
async function pushToTeamFollowers(teamId: string, prefKey: PushPrefKey, payload: Payload): Promise<void> {
  const prefFilter = `prefs->>${prefKey}`;

  // 1) Anonymous / legacy path: favorite recorded directly on the subscription.
  const byDevice = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('favorite_team_id', teamId)
    .eq(prefFilter, 'true');

  // 2) Signed-in path: favorite comes from the user's profile. Subscriptions
  //    without a user_id are irrelevant here regardless of what their own
  //    favorite_team_id says (case 1 already covers the anonymous ones).
  const byProfile = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id, profiles!inner(favorite_team_id)')
    .not('user_id', 'is', null)
    .eq('profiles.favorite_team_id', teamId)
    .eq(prefFilter, 'true');

  const seen = new Set<string>();
  const subs: PushSub[] = [];
  for (const row of [...(byDevice.data ?? []), ...(byProfile.data ?? [])] as PushSub[]) {
    if (seen.has(row.endpoint)) continue;
    seen.add(row.endpoint);
    subs.push(row);
  }
  await sendToSubs(subs, payload);
}

async function logNotification(args: {
  fixtureId: string;
  teamId: string;
  type: NotificationType;
  title: string;
  body: string;
}): Promise<void> {
  await db.from('notifications').insert({
    fixture_id: args.fixtureId,
    team_id: args.teamId,
    type: args.type,
    title: args.title,
    body: args.body,
  });
}

export async function pushGoal(args: {
  fixtureId: string;
  teamId: string;
  title: string;
  body: string;
}): Promise<void> {
  await logNotification({ ...args, type: 'GOAL' });
  await pushToTeamFollowers(args.teamId, 'goals', {
    title: args.title,
    body: args.body,
    tag: `goal-${args.fixtureId}`,
  });
}

export async function pushLineup(args: {
  fixtureId: string;
  teamId: string;
  title: string;
  body: string;
}): Promise<void> {
  await logNotification({ ...args, type: 'LINEUP' });
  await pushToTeamFollowers(args.teamId, 'lineup', {
    title: args.title,
    body: args.body,
    tag: `lineup-${args.fixtureId}`,
  });
}

export async function pushMatchday(args: {
  fixtureId: string;
  teamId: string;
  title: string;
  body: string;
}): Promise<void> {
  await logNotification({ ...args, type: 'MATCHDAY' });
  await pushToTeamFollowers(args.teamId, 'matchday', {
    title: args.title,
    body: args.body,
    tag: `matchday-${args.fixtureId}`,
  });
}

export async function pushKickoff(args: {
  fixtureId: string;
  teamId: string;
  title: string;
  body: string;
}): Promise<void> {
  await logNotification({ ...args, type: 'KICKOFF_SOON' });
  await pushToTeamFollowers(args.teamId, 'kickoff', {
    title: args.title,
    body: args.body,
    tag: `kickoff-${args.fixtureId}`,
  });
}
