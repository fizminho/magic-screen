import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStatus, evaluateShariah, validateInvestingPathsObservation, buildShortlist, renderReportHtml } from "./shariah-screening.mjs";

const NOW = Date.parse("2026-11-24T00:00:00Z");
const chk = (status, checked_at = "2026-11-20") => ({ status, checked_at, reference: "manual source page" });
const ev = (checks, opts = {}) => evaluateShariah("x", checks, { now: NOW, ...opts });

test("status mapping never promotes unknown wording to Halal", () => {
  assert.equal(normalizeStatus(" HALAL "), "halal");
  assert.equal(normalizeStatus("Not Halal"), "not_halal");
  assert.equal(normalizeStatus("No Data"), "no_data");
  for (const v of ["compliant", "", null, "halal?", "mostly halal"]) assert.equal(normalizeStatus(v), "unrecognised");
});

test("No data may be recorded without a source URL but can never pass", () => {
  const r = ev({ musaffa: { status: "No data", checked_at: "2026-11-20", reference: null }, halalscreener: chk("Halal") });
  assert.equal(r.decision, "excluded");
  assert.equal(r.per_source.musaffa.fresh, false);
  assert.match(r.per_source.musaffa.reason, /reference unavailable/);
});

test("only two fresh Halal results pass", () => {
  assert.equal(ev({ musaffa: chk("Halal"), halalscreener: chk("Halal") }).decision, "pass");
});

test("doubtful, not halal, no data and unchecked are excluded", () => {
  for (const s of ["Doubtful", "Not Halal", "No Data"]) assert.equal(ev({ musaffa: chk("Halal"), halalscreener: chk(s) }).decision, s === "No Data" ? "excluded" : "review");
  assert.equal(ev({ musaffa: chk("Doubtful"), halalscreener: chk("Doubtful") }).decision, "excluded");
  assert.equal(ev({ musaffa: chk("Halal") }).decision, "excluded"); // missing source is not Halal
  assert.equal(ev({}).decision, "excluded");
});

test("disagreement between sources goes to manual review, not auto-pass", () => {
  const r = ev({ musaffa: chk("Halal"), halalscreener: chk("Not Halal") });
  assert.equal(r.decision, "review");
  assert.match(r.reasons[0], /disagree/);
});

test("stale, invalid and future dates do not pass", () => {
  assert.equal(ev({ musaffa: chk("Halal", "2026-09-01"), halalscreener: chk("Halal") }).decision, "excluded");
  assert.equal(ev({ musaffa: chk("Halal", "nope"), halalscreener: chk("Halal") }).decision, "excluded");
  assert.equal(ev({ musaffa: chk("Halal", "2027-01-01"), halalscreener: chk("Halal") }).decision, "excluded");
  assert.equal(ev({ musaffa: chk("Halal", "2026-10-30"), halalscreener: chk("Halal") }, { maxAgeDays: 60 }).decision, "pass");
});

const ip = (o = {}) => ({ symbol: "EXA", collection_method: "manual", manually_verified: true, found: true, rank: 5, earnings_yield: 10, return_on_capital: 20, fiscal_year: 2025, checked_at: "2026-11-21", source_reference: "page", ...o });

test("Investing Paths: valid manual observation keeps only visible fields", () => {
  const v = validateInvestingPathsObservation(ip({ earnings_yield: undefined }));
  assert.equal(v.ok, true);
  assert.equal(v.observation.earnings_yield, null);
  assert.equal(v.observation.rank, 5);
});

test("Investing Paths: rejects automated, unverified, undated or unreferenced records", () => {
  for (const bad of [{ collection_method: "scraper" }, { collection_method: "ai" }, { manually_verified: false }, { checked_at: "x" }, { source_reference: "" }, { rank: 0 }, { rank: 1.5 }, { rank: undefined, earnings_yield: undefined, return_on_capital: undefined, fiscal_year: undefined }]) {
    assert.equal(validateInvestingPathsObservation(ip(bad)).ok, false, JSON.stringify(bad));
  }
});

test("Investing Paths: not found records cannot carry an inferred rank", () => {
  assert.equal(validateInvestingPathsObservation(ip({ found: false, rank: undefined, earnings_yield: undefined, return_on_capital: undefined, fiscal_year: undefined })).observation.status, "not_found");
  assert.equal(validateInvestingPathsObservation(ip({ found: false })).ok, false);
});

test("buildShortlist assigns audited states and de-duplicates the universe", () => {
  const universe = { source_url: "u", retrieved_at: "2026-11-24", tickers: ["A", "a", { symbol: "B" }, "C", "D"] };
  const s = (symbol, source, status) => ({ symbol, source, status, checked_at: "2026-11-20", reference: `${source} page checked manually` });
  const r = buildShortlist({
    universe, now: NOW,
    shariahChecks: [s("A", "musaffa", "Halal"), s("A", "halalscreener", "Halal"), s("B", "musaffa", "Halal"), s("B", "halalscreener", "Halal"), s("C", "musaffa", "Halal"), s("C", "halalscreener", "Doubtful")],
    ipObservations: [ip({ symbol: "A" }), ip({ symbol: "B", collection_method: "scraper" })],
  });
  const by = Object.fromEntries(r.rows.map((x) => [x.symbol, x.state]));
  assert.deepEqual(by, { A: "eligible_validated", B: "eligible_unvalidated", C: "needs_review", D: "excluded" });
  assert.equal(r.universe.count, 4);
  assert.equal(r.ignored_invalid_investing_paths_records.length, 1);
  assert.deepEqual(r.summary, { eligible_validated: 1, eligible_unvalidated: 1, needs_review: 1, excluded: 1 });
});

test("report escapes HTML and states personal-use provenance", () => {
  const r = buildShortlist({ universe: { tickers: [{ symbol: "X", name: "<img src=x onerror=1>" }] }, now: NOW });
  const html = renderReportHtml(r);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /Personal-use research record/);
});

test("Investing Paths requires an explicit found boolean", () => {
  assert.equal(validateInvestingPathsObservation(ip({ found: undefined })).ok, false);
});

test("duplicate Shariah source records never auto-pass", () => {
  const row = (source) => ({ symbol: "DUP", source, status: "Halal", checked_at: "2026-11-20" });
  const r = buildShortlist({ universe: { tickers: ["DUP"] }, now: NOW, shariahChecks: [row("musaffa"), row("musaffa"), row("halalscreener")] });
  assert.notEqual(r.rows[0].state, "eligible_validated");
  assert.equal(r.ignored_invalid_shariah_records.length, 1);
});

test("Shariah checks without a manual source reference cannot pass", () => {
  const missing = { status: "Halal", checked_at: "2026-11-20" };
  assert.equal(ev({ musaffa: { ...missing, reference: "Musaffa page" }, halalscreener: missing }).decision, "excluded");
});
