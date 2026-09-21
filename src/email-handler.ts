import PostalMime from 'postal-mime';
import type { D1Database } from '@cloudflare/workers-types';
import { inboxExists, insertMessage } from './db/queries';

export interface EmailHandlerEnv {
  DB: D1Database;
  MAIL_DOMAIN: string;
}

/**
 * Handles inbound email via Cloudflare Email Worker.
 * Called for every email received at any @<MAIL_DOMAIN> address.
 */
export async function handleEmail(message: ForwardableEmailMessage, env: EmailHandlerEnv): Promise<void> {
  const to = message.to.toLowerCase();
  const from = message.from.toLowerCase();

  console.log(`[email] Received from=${from} to=${to}`);

  try {
    // 1. Size check: drop emails over 1,000,000 bytes
    if (message.rawSize > 1_000_000) {
      console.warn(`[email] Dropped oversized email for ${to} (${message.rawSize} bytes > 1,000,000 bytes)`);
      return;
    }

    const db = env.DB;

    // 2. Do not auto-create inbox: if inbox doesn't exist, log and drop
    if (!(await inboxExists(db, to))) {
      console.log(`[email] Dropped email to non-existent inbox: ${to}`);
      return;
    }

    // Read raw email buffer via native Response API
    const rawBuffer = await new Response(message.raw).arrayBuffer();
    const parser = new PostalMime();
    const parsed = await parser.parse(rawBuffer);

    const subject = parsed.subject || '(no subject)';
    let body = parsed.html || parsed.text?.trim() || '';

    // 3. Truncate body if over 100,000 characters
    if (body.length > 100_000) {
      body = body.slice(0, 100_000) + '\n\n[...pesan dipotong karena terlalu panjang]';
    }

    // Store the message
    const msgId = `msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    await insertMessage(db, {
      id: msgId,
      inbox_address: to,
      from_address: from,
      subject,
      body,
    });

    console.log(`[email] Stored message ${msgId} for ${to}`);
  } catch (err) {
    console.error(`[email] Failed to process email for ${to}:`, err);
    // Don't throw — we don't want to bounce; just log
  }
}
