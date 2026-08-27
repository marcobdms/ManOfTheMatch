import webpush from 'web-push';
import { db } from './db.js';

const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const contact = process.env.VAPID_CONTACT ?? 'mailto:hola@manofthematch.app';

if (pub && priv) webpush.setVapidDetails(contact, pub, priv);

type Payload = { title: string; body: string; tag?: string; url?: string };

/** Send a Web Push to every stored subscription, pruning dead ones (410/404). */
export async function pushToAll(payload: Payload) {
  if (!pub || !priv) {
    console.warn('[notify] sin VAPID keys — push desactivado');
    return;
  }
  const { data: subs } = await db.from('push_subscriptions').select('*');
  await Promise.allSettled(
    (subs ?? []).map((s) =>
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

export async function pushGoal(args: {
  fixtureId: string;
  teamId: string;
  title: string;
  body: string;
}) {
  await db.from('notifications').insert({
    fixture_id: args.fixtureId,
    team_id: args.teamId,
    type: 'GOAL',
    title: args.title,
    body: args.body,
  });
  await pushToAll({ title: args.title, body: args.body, tag: `goal-${args.fixtureId}` });
}
