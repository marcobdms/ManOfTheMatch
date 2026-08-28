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
 */
async function pushToTeamFollowers(teamId: string, prefKey: PushPrefKey, payload: Payload): Promise<void> {
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('favorite_team_id', teamId)
    .eq(`prefs->>${prefKey}`, 'true');
  await sendToSubs((subs ?? []) as PushSub[], payload);
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
