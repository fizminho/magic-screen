// Minimal static-asset Worker. API routes are added with the authenticated
// Magic Folio backend; no legacy MFI endpoints or runtime DDL remain.
// @ts-ignore The JavaScript helper is covered by its Node regression tests.
import { withSecurityHeaders } from "./security.mjs";

interface Env { ASSETS: Fetcher; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return withSecurityHeaders(new Response(JSON.stringify({
        ok: true,
        service: "magic-folio",
        mode: "portfolio-shell"
      }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      }));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
