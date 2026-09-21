import api from './api/routes';
import { handleEmail } from './email-handler';
import { purgeOldMessages } from './db/queries';
import type { EmailHandlerEnv } from './email-handler';
import type { ApiEnv } from './api/routes';

/**
 * Tempik - Disposable Temp Mail on Cloudflare Workers
 *
 * Handles:
 * - fetch()     → API routes (static files served via Cloudflare Assets)
 * - email()     → inbound email processing via Cloudflare Email Worker
 * - scheduled() → cron trigger for 24h data retention purge
 */

// Combined env bindings
export interface Env extends ApiEnv, EmailHandlerEnv {}

export default {
  /**
   * HTTP fetch handler - serves API routes.
   * Static files (src/web/) are served via Cloudflare [assets].
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Enforce HTTPS redirect
    if (url.protocol === 'http:' && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // Route /api/* to Hono router (strip /api prefix)
    if (url.pathname.startsWith('/api/')) {
      const apiUrl = new URL(request.url);
      apiUrl.pathname = url.pathname.slice(4); // strip '/api'
      const apiRequest = new Request(apiUrl, request);
      return api.fetch(apiRequest, env, ctx);
    }

    // Fallback: should not happen when [assets] is configured properly
    return new Response('Not found', { status: 404 });
  },

  /**
   * Email handler - called by Cloudflare for every inbound email
   * at any @<MAIL_DOMAIN> address.
   */
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleEmail(message, env);
  },

  /**
   * Scheduled cron handler - automatically purges emails older than 24h
   */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeOldMessages(env.DB));
  },
};
