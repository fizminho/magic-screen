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
// @ts-ignore The JavaScript settings module is exercised by Node regression tests.
import { handleSettingsRequest } from "./lib/settings.mjs";
// @ts-ignore The JavaScript export module is exercised by Node regression tests.
import { handleExportRequest } from "./lib/export.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_ENV?: string;
  RP_ID?: string;
  RP_NAME?: string;
  RP_ORIGIN?: string;
  SETUP_TOKEN?: string;
  SEC_USER_AGENT?: string;
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
  }
};
