import test from "node:test";
import assert from "node:assert/strict";
import { dispatchAlert, dispatchFilingAlerts, dispatchHoldingMoveAlerts } from "./lib/alerts.mjs";

function makeDb({ existing = null, subscriptions = [], candidate = null } = {}) {
  const calls = [];
  const DB = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.push({ type: "first", sql, values: this.values });
          if (sql.includes("SELECT dedupe_key FROM alert_log")) return existing;
          if (sql.includes("SELECT value FROM setting WHERE key='max_pushes_per_day'")) return { value: "8" };
          if (sql.includes("SELECT value FROM setting WHERE key='alert_move_pct'")) return { value: "4" };
          if (sql.includes("SELECT i.symbol,q.change_pct")) return candidate;
          return null;
        },
        async all() {
          calls.push({ type: "all", sql, values: this.values });
          if (sql.includes("FROM push_subscription")) return { results: subscriptions };
          return { results: [] };
        },
        async run() {
          calls.push({ type: "run", sql, values: this.values });
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    },
    async batch(statements) {
      calls.push({ type: "batch", count: statements.length });
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, calls };
}

const vapid = {
  VAPID_PUBLIC_KEY: "public",
  VAPID_PRIVATE_KEY: "private",
  VAPID_SUBJECT: "mailto:owner@example.com"
};

test("alert dispatcher rejects unbounded or external notification payloads", async () => {
  const { DB, calls } = makeDb();
  assert.deepEqual(await dispatchAlert({ DB }, {
    dedupeKey: "x", kind: "brief", title: "Title", body: "Body", url: "https://attacker.example"
  }), { status: "invalid_alert", sent: 0 });
  assert.equal(calls.length, 0);
});

test("alert dispatcher checks for a duplicate before consuming daily quota", async () => {
  const { DB, calls } = makeDb({ existing: { dedupe_key: "brief:AAPL" } });
  const result = await dispatchAlert({ DB, ...vapid }, {
    dedupeKey: "brief:AAPL", kind: "brief", title: "Ready", body: "Brief ready", url: "/"
  });
  assert.deepEqual(result, { status: "duplicate", sent: 0 });
  assert.equal(calls.length, 1);
});

test("alert dispatcher does not reserve quota when there are no subscribed devices", async () => {
  const { DB, calls } = makeDb();
  const result = await dispatchAlert({ DB, ...vapid }, {
    dedupeKey: "brief:AAPL", kind: "brief", title: "Ready", body: "Brief ready", url: "/"
  });
  assert.deepEqual(result, { status: "no_subscriptions", sent: 0 });
  assert.equal(calls.some((call) => call.sql?.includes("push_daily_")), false);
});

test("filing and holding alert evaluators fail closed when VAPID is not configured", async () => {
  const { DB, calls } = makeDb();
  assert.deepEqual(await dispatchFilingAlerts({ DB }), { sent: 0, status: "push_not_configured" });
  assert.deepEqual(await dispatchHoldingMoveAlerts({ DB }), { sent: 0, status: "push_not_configured" });
  assert.equal(calls.length, 0);
});
