// Magic Folio Worker: authenticated API routes plus static assets.
// @ts-ignore JavaScript security helper is covered by its Node regression tests.
import { withSecurityHeaders } from "./security.mjs";
// @ts-ignore The JavaScript auth module is exercised by Node regression tests.
import { handleAuthRequest } from "./lib/auth.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_ENV?: string;
  RP_ID?: string;
  RP_NAME?: string;
  RP_ORIGIN?: string;
  SETUP_TOKEN?: string;
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
