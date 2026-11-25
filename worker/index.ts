// Magic Folio Worker: authenticated API routes plus static assets.
// @ts-ignore JavaScript security helper is covered by its Node regression tests.
import { withSecurityHeaders } from "./security.mjs";
// @ts-ignore The JavaScript auth module is exercised by Node regression tests.
import { handleAuthRequest } from "./lib/auth.mjs";
// @ts-ignore The JavaScript quote module is exercised by Node regression tests.
import { handleQuoteRequest } from "./lib/quotes.mjs";
// @ts-ignore The JavaScript portfolio module is exercised by Node regression tests.
import { handlePortfolioRequest } from "./lib/portfolio.mjs";
// @ts-ignore The JavaScript dashboard module is exercised by Node regression tests.
import { handleDashboardRequest } from "./lib/dashboard.mjs";
// @ts-ignore The JavaScript SEC module is exercised by Node regression tests.
import { handleSecRequest } from "./lib/sec.mjs";
// @ts-ignore SEC company-facts parser and route are covered by Node regression tests.
import { handleSecCompanyFactsRequest } from "./lib/sec-companyfacts.mjs";
// @ts-ignore The JavaScript settings module is exercised by Node regression tests.
import { handleSettingsRequest } from "./lib/settings.mjs";
// @ts-ignore The JavaScript export module is exercised by Node regression tests.
import { handleExportRequest } from "./lib/export.mjs";
// @ts-ignore Scheduled job modules are covered by Node regression tests.
import { runSecRefresh, runWeeklyHousekeeping } from "./jobs/refresh.mjs";
// @ts-ignore AI analysis route is covered by Node regression tests.
import { handleAnalysisRequest, runScheduledResearchBrief } from "./lib/analysis.mjs";
// @ts-ignore Web Push cryptography and routes are covered by Node regression tests.
import { handlePushRequest } from "./lib/push.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AI: Ai;
  APP_ENV?: string;
  RP_ID?: string;
  RP_NAME?: string;
  RP_ORIGIN?: string;
  SETUP_TOKEN?: string;
  SEC_USER_AGENT?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;

    if (url.pathname === "/api/health" && request.method === "GET") {
      response = new Response(JSON.stringify({
        ok: true,
        service: "magic-folio",
        mode: "passkey-auth"
      }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } else if (url.pathname.startsWith("/api/auth/")) {
      response = await handleAuthRequest(request, env, url.pathname);
    } else if (url.pathname.startsWith("/api/quotes/")) {
      response = await handleQuoteRequest(request, env, url.pathname);
    } else if (url.pathname === "/api/sec/filings") {
      response = await handleSecRequest(request, env, url);
    } else if (url.pathname === "/api/sec/companyfacts") {
      response = await handleSecCompanyFactsRequest(request, env, url);
    } else if (url.pathname === "/api/analysis/latest" || url.pathname === "/api/analysis/briefs" || url.pathname === "/api/analysis/run" || url.pathname === "/api/analysis/inbox") {
      response = await handleAnalysisRequest(request, env, url);
    } else if (url.pathname.startsWith("/api/push/")) {
      response = await handlePushRequest(request, env, url);
    } else if (url.pathname === "/api/settings") {
      response = await handleSettingsRequest(request, env, url.pathname);
    } else if (url.pathname === "/api/export") {
      response = await handleExportRequest(request, env, url);
    } else if (url.pathname === "/api/dashboard") {
      response = await handleDashboardRequest(request, env, url.pathname);
    } else if (url.pathname === "/api/holdings" || url.pathname.startsWith("/api/holdings/") || url.pathname === "/api/watchlist" || url.pathname.startsWith("/api/watchlist/")) {
      response = await handlePortfolioRequest(request, env, url.pathname);
    } else if (url.pathname.startsWith("/api/")) {
      response = new Response(JSON.stringify({ error: "Not found." }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } else {
      response = await env.ASSETS.fetch(request);
    }

    return withSecurityHeaders(response);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const task = controller.cron === "0 1 * * 2-6"
      ? runSecRefresh(env).then(async (refreshResult: unknown) => {
          // Generate briefs only after fresh SEC data has been persisted.
          const briefResult = await runScheduledResearchBrief(env);
          return { refresh: refreshResult, brief: briefResult };
        })
      : controller.cron === "0 2 * * 6"
        ? runWeeklyHousekeeping(env)
        : Promise.resolve({ status: "ignored_unknown_cron" });
    ctx.waitUntil(task.catch((error: unknown) => {
      const code = error instanceof Error ? error.message : "unknown";
      console.error("Scheduled task failed:", controller.cron, code.slice(0, 120));
    }));
  }
};
