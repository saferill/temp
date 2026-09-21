import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  getInbox,
  createInbox,
  inboxExists,
  getSessionInboxes,
  getMessages,
  searchMessages,
  getMessage,
  ensureSession,
  linkInboxToSession,
  isInboxInSession,
  inboxHasOwner,
  deleteInboxCompletely,
  deleteMessage,
} from '../db/queries';
import { generateUniqueAddress } from '../utils/random-address';

const BLACKLISTED_LOCAL_PARTS = new Set([
  'admin',
  'administrator',
  'postmaster',
  'abuse',
  'support',
  'noreply',
  'no-reply',
  'root',
  'webmaster',
  'hostmaster',
  'security',
]);

const LOCAL_PART_REGEX = /^[a-z0-9][a-z0-9._-]{2,30}$/;

export interface ApiEnv {
  DB: D1Database;
  APP_NAME: string;
  MAIL_DOMAIN: string;
  WEB_HOST: string;
}

export type ApiVariables = {
  sessionId: string;
};

function getDomains(env: ApiEnv): string[] {
  return env.MAIL_DOMAIN.split(',').map(d => d.trim()).filter(Boolean);
}

function defaultDomain(env: ApiEnv): string {
  return getDomains(env)[0] || 'example.com';
}

const api = new Hono<{ Bindings: ApiEnv; Variables: ApiVariables }>();

// Middleware: Require x-session-id for all /inboxes routes
const requireSession = async (
  c: Context<{ Bindings: ApiEnv; Variables: ApiVariables }>,
  next: Next
) => {
  const sid = (c.req.header('x-session-id') || '').trim();
  if (!sid) {
    return c.json({ error: 'Missing x-session-id' }, 400);
  }
  c.set('sessionId', sid);
  await next();
};

api.use('/inboxes', requireSession);
api.use('/inboxes/*', requireSession);

// ---- GET /api/config ----
api.get('/config', (c) => {
  const domains = getDomains(c.env);
  return c.json({
    appName: c.env.APP_NAME || 'Tempik',
    mailDomain: domains[0] || 'example.com',
    mailDomains: domains,
    webHost: c.env.WEB_HOST || 'tempik.example.com',
  });
});

// ---- GET /api/session ----
api.get('/session', async (c) => {
  let sid = (c.req.header('x-session-id') || '').trim() || null;
  if (!sid) {
    sid = crypto.randomUUID();
  }
  await ensureSession(c.env.DB, sid);
  return c.json({ sessionId: sid });
});

// ---- GET /api/inboxes ----
api.get('/inboxes', async (c) => {
  const sid = c.get('sessionId');
  const inboxes = await getSessionInboxes(c.env.DB, sid);
  return c.json(inboxes);
});

// ---- POST /api/inboxes ----
api.post('/inboxes', async (c) => {
  const sid = c.get('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const domains = getDomains(c.env);
  const requestedDomain: string = (body.domain || '').trim().toLowerCase();
  const domain = requestedDomain && domains.includes(requestedDomain)
    ? requestedDomain
    : defaultDomain(c.env);

  // Validate: reject unknown domains
  if (requestedDomain && !domains.includes(requestedDomain)) {
    return c.json({ error: `Invalid domain: ${requestedDomain}. Allowed: ${domains.join(', ')}` }, 400);
  }

  const requested: string = (body.localPart || '').trim().toLowerCase();

  // Rate limit: max 10 inboxes per session
  const currentInboxes = await getSessionInboxes(c.env.DB, sid);
  if (currentInboxes.length >= 10) {
    const alreadyInSession = requested
      ? currentInboxes.some((i) => i.address === `${requested}@${domain}`)
      : false;

    if (!alreadyInSession) {
      return c.json(
        { error: 'Batas 10 alamat per sesi tercapai. Hapus salah satu alamat dulu.' },
        429
      );
    }
  }

  let address: string;
  if (requested) {
    if (!LOCAL_PART_REGEX.test(requested)) {
      return c.json(
        { error: 'Nama pengguna hanya boleh huruf kecil, angka, titik, minus, underscore (3-31 karakter).' },
        400
      );
    }

    if (BLACKLISTED_LOCAL_PARTS.has(requested)) {
      return c.json({ error: 'Nama pengguna ini tidak diizinkan.' }, 400);
    }

    address = `${requested}@${domain}`;

    if ((await inboxHasOwner(c.env.DB, address)) && !(await isInboxInSession(c.env.DB, sid, address))) {
      return c.json(
        { error: 'Alamat ini sudah dipakai orang lain, silakan pilih nama lain.' },
        409
      );
    }
  } else {
    address = await generateUniqueAddress(
      (addr) => inboxExists(c.env.DB, addr),
      domain
    );
  }

  // Ensure inbox record exists
  await createInbox(c.env.DB, address);

  // Link to session
  await linkInboxToSession(c.env.DB, sid, address);

  const inbox = await getInbox(c.env.DB, address);
  return c.json(inbox!, 201);
});

// ---- DELETE /api/inboxes/:address ----
api.delete('/inboxes/:address', async (c) => {
  const sid = c.get('sessionId');
  const address = decodeURIComponent(c.req.param('address'));

  // Ensure the inbox belongs to this session before allowing deletion
  if (!(await isInboxInSession(c.env.DB, sid, address))) {
    return c.json({ error: 'Inbox not in this session' }, 403);
  }

  await deleteInboxCompletely(c.env.DB, address);
  return c.json({ ok: true });
});

// ---- GET /api/inboxes/:address/messages ----
api.get('/inboxes/:address/messages', async (c) => {
  const sid = c.get('sessionId');
  const address = decodeURIComponent(c.req.param('address'));

  // Must have inbox in session to read messages
  if (!(await isInboxInSession(c.env.DB, sid, address))) {
    return c.json({ error: 'Inbox not in this session' }, 403);
  }

  const q = (c.req.query('q') || '').trim().slice(0, 100);
  const messages = q
    ? await searchMessages(c.env.DB, address, q)
    : await getMessages(c.env.DB, address);

  return c.json(messages);
});

// ---- GET /api/inboxes/:address/messages/:id ----
api.get('/inboxes/:address/messages/:id', async (c) => {
  const sid = c.get('sessionId');
  const address = decodeURIComponent(c.req.param('address'));
  const id = c.req.param('id');

  // Must have inbox in session to read message details
  if (!(await isInboxInSession(c.env.DB, sid, address))) {
    return c.json({ error: 'Inbox not in this session' }, 403);
  }

  const message = await getMessage(c.env.DB, address, id);
  if (!message) {
    return c.json({ error: 'Message not found' }, 404);
  }

  return c.json(message);
});

// ---- DELETE /api/inboxes/:address/messages/:id ----
api.delete('/inboxes/:address/messages/:id', async (c) => {
  const sid = c.get('sessionId');
  const address = decodeURIComponent(c.req.param('address'));
  const id = c.req.param('id');

  // Must have inbox in session to delete messages
  if (!(await isInboxInSession(c.env.DB, sid, address))) {
    return c.json({ error: 'Inbox not in this session' }, 403);
  }

  await deleteMessage(c.env.DB, address, id);
  return c.json({ ok: true });
});

export default api;

