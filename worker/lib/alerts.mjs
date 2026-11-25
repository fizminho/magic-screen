import { sendPushToSubscription } from "./push.mjs";

const MAX_ALERTS_PER_RUN = 2;

function validAlert(alert) {
  return alert && typeof alert.dedupeKey === "string" && alert.dedupeKey.length > 0 &&
    alert.dedupeKey.length <= 160 && typeof alert.kind === "string" &&
    /^[a-z_]{1,32}$/.test(alert.kind) && typeof alert.title === "string" &&
    alert.title.length > 0 && alert.title.length <= 80 &&
    typeof alert.body === "string" && alert.body.length > 0 && alert.body.length <= 180 &&
    typeof alert.url === "string" && alert.url.startsWith("/") &&
    !alert.url.startsWith("//") && !/[\r\n]/.test(alert.url);
}

async function releaseQuota(env, quotaKey) {
  await env.DB.prepare(
    "UPDATE setting SET value=CAST(value AS INTEGER)-1 WHERE key=? AND CAST(value AS INTEGER)>0"
  ).bind(quotaKey).run();
}

export async function dispatchAlert(env, alert, fetcher = fetch) {
  if (!validAlert(alert)) return { status: "invalid_alert", sent: 0 };
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
    return { status: "push_not_configured", sent: 0 };
  }

  const existing = await env.DB.prepare(
    "SELECT dedupe_key FROM alert_log WHERE dedupe_key=?"
  ).bind(alert.dedupeKey).first();
  if (existing) return { status: "duplicate", sent: 0 };

  const subscriptions = await env.DB.prepare(
    "SELECT endpoint,p256dh,auth FROM push_subscription ORDER BY created_at DESC LIMIT 5"
  ).all();
  if (!(subscriptions.results || []).length) return { status: "no_subscriptions", sent: 0 };

  const setting = await env.DB.prepare(
    "SELECT value FROM setting WHERE key='max_pushes_per_day'"
  ).first();
  const dailyLimit = Math.max(1, Math.min(20, Number(setting?.value) || 8));
  const quotaKey = `push_daily_${new Date().toISOString().slice(0, 10)}`;
  const reservation = await env.DB.prepare(
    "INSERT INTO setting(key,value) VALUES(?, '1') " +
    "ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 " +
    "WHERE CAST(value AS INTEGER) < ? RETURNING value"
  ).bind(quotaKey, dailyLimit).first();
  if (!reservation) return { status: "daily_limit", sent: 0 };

  const log = await env.DB.prepare(
    "INSERT OR IGNORE INTO alert_log(dedupe_key,kind,sent_at) VALUES(?,?,?)"
  ).bind(alert.dedupeKey, alert.kind, new Date().toISOString()).run();
  if (Number(log.meta?.changes || 0) === 0) {
    await releaseQuota(env, quotaKey);
    return { status: "duplicate", sent: 0 };
  }

  let sent = 0;
  const statements = [];
  for (const subscription of subscriptions.results || []) {
    try {
      const response = await sendPushToSubscription(env, subscription, {
        title: alert.title,
        body: alert.body,
        url: alert.url
      }, fetcher);
      if (response.status === 404 || response.status === 410) {
        statements.push(env.DB.prepare("DELETE FROM push_subscription WHERE endpoint=?").bind(subscription.endpoint));
      } else if (response.ok) {
        sent++;
        statements.push(env.DB.prepare(
          "UPDATE push_subscription SET last_success_at=? WHERE endpoint=?"
        ).bind(new Date().toISOString(), subscription.endpoint));
      }
    } catch {
      // A single invalid or unavailable push service must not stop other devices.
    }
  }

  try {
    if (statements.length) await env.DB.batch(statements);
  } catch {
    await env.DB.prepare("DELETE FROM alert_log WHERE dedupe_key=?").bind(alert.dedupeKey).run();
    await releaseQuota(env, quotaKey);
    return { status: "delivery_failed", sent: 0 };
  }
  if (!sent) {
    await env.DB.prepare("DELETE FROM alert_log WHERE dedupe_key=?").bind(alert.dedupeKey).run();
    await releaseQuota(env, quotaKey);
    return { status: "delivery_failed", sent: 0 };
  }
  return { status: "sent", sent };
}

export async function dispatchFilingAlerts(env, fetcher = fetch) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
    return { sent: 0, status: "push_not_configured" };
  }
  const candidates = await env.DB.prepare(
    "SELECT accession_number AS accessionNumber,symbol,form FROM sec_filing sf " +
    "JOIN instrument i ON i.id=sf.instrument_id " +
    "WHERE sf.form IN ('8-K','SC 13D','SC 13D/A') AND sf.filing_date>=date('now','-30 days') " +
    "AND NOT EXISTS (SELECT 1 FROM alert_log al WHERE al.dedupe_key='filing:'||sf.accession_number) " +
    "ORDER BY sf.filing_date DESC LIMIT ?"
  ).bind(MAX_ALERTS_PER_RUN).all();
  let sent = 0;
  let processed = 0;
  for (const filing of candidates.results || []) {
    const result = await dispatchAlert(env, {
      dedupeKey: `filing:${filing.accessionNumber}`,
      kind: "filing",
      title: `${filing.symbol} SEC filing`,
      body: `${filing.form} filed. Open the official SEC filing.`,
      url: `/#/holding/${encodeURIComponent(filing.symbol)}`
    }, fetcher);
    if (result.status === "sent") sent++;
    if (result.status === "sent" || result.status === "duplicate") processed++;
    if (result.status === "daily_limit") break;
  }
  return { sent, processed, candidates: candidates.results?.length || 0 };
}
