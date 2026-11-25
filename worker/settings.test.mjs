import test from "node:test";
import assert from "node:assert/strict";
import { handleSettingsRequest } from "./lib/settings.mjs";

const origin = "https://folio.example";
const cookie = `__Host-session=${"s".repeat(43)}`;
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };

function fakeDb({ authenticated = true, rows = [] } = {}) {
  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const calls = { batch: 0, statements: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("FROM session WHERE token_hash")) {
            return authenticated ? {
              token_hash: "session-hash",
              credential_id: "credential-1",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_seen_at: new Date().toISOString()
            } : null;
          }
          return null;
        },
        async all() {
          return { results: [...settings.entries()].map(([key, value]) => ({ key, value })) };
        }
      };
      return statement;
    },
    async batch(statements) {
      calls.batch++;
      calls.statements.push(...statements);
      for (const statement of statements) settings.set(statement.values[0], statement.values[1]);
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, calls, settings };
}

test("settings cannot be read without an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handleSettingsRequest(
    new Request(`${origin}/api/settings`), { ...envConfig, DB }, "/api/settings"
  );
  assert.equal(response.status, 401);
});

test("settings endpoint returns safe defaults when no settings rows exist", async () => {
  const { DB } = fakeDb();
  const response = await handleSettingsRequest(
    new Request(`${origin}/api/settings`, { headers: { cookie } }),
    { ...envConfig, DB }, "/api/settings"
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    settings: { alertMovePct: 4, maxPositionPct: 25 }
  });
});

test("settings endpoint reads persisted values", async () => {
  const { DB } = fakeDb({ rows: [
    { key: "alert_move_pct", value: "5.5" },
    { key: "max_position_pct", value: "30" }
  ] });
  const response = await handleSettingsRequest(
    new Request(`${origin}/api/settings`, { headers: { cookie } }),
    { ...envConfig, DB }, "/api/settings"
  );
  assert.deepEqual(await response.json(), {
    settings: { alertMovePct: 5.5, maxPositionPct: 30 }
  });
});

test("settings writes require exact Origin and an owner session", async () => {
  const { DB, calls } = fakeDb();
  const response = await handleSettingsRequest(new Request(`${origin}/api/settings`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ alertMovePct: 5 })
  }), { ...envConfig, DB }, "/api/settings");
  assert.equal(response.status, 403);
  assert.equal(calls.batch, 0);
});

test("settings update validates bounds and rejects unknown keys before writing", async () => {
  const { DB, calls } = fakeDb();
  for (const payload of [
    { alertMovePct: 0 },
    { alertMovePct: 21 },
    { maxPositionPct: 4 },
    { maxPositionPct: 51 },
    { apiKey: "not-allowed" }
  ]) {
    const response = await handleSettingsRequest(new Request(`${origin}/api/settings`, {
      method: "PUT",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify(payload)
    }), { ...envConfig, DB }, "/api/settings");
    assert.equal(response.status, 400);
  }
  assert.equal(calls.batch, 0);
});

test("settings update persists both thresholds in one D1 batch", async () => {
  const { DB, calls } = fakeDb();
  const response = await handleSettingsRequest(new Request(`${origin}/api/settings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ alertMovePct: 6, maxPositionPct: 28 })
  }), { ...envConfig, DB }, "/api/settings");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    settings: { alertMovePct: 6, maxPositionPct: 28 }
  });
  assert.equal(calls.batch, 1);
  assert.deepEqual(calls.statements.map((item) => item.values), [
    ["alert_move_pct", "6"], ["max_position_pct", "28"]
  ]);
});

test("settings reject inherited object property names", async () => {
  const { DB, calls } = fakeDb();
  const response = await handleSettingsRequest(new Request(`${origin}/api/settings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: '{"__proto__":5}'
  }), { ...envConfig, DB }, "/api/settings");
  assert.equal(response.status, 400);
  assert.equal(calls.batch, 0);
});
