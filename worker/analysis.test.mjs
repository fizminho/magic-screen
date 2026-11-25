import test from "node:test";
import assert from "node:assert/strict";
import { validateResearchBrief } from "./lib/analysis.mjs";

const allowed = new Set(["0000320193-26-000101", "0000320193-26-000102"]);

test("research brief validator enforces required fields and confidence", () => {
  const brief = validateResearchBrief({
    company_summary: "Revenue increased in the reported quarter.",
    financial_strengths: ["Positive operating cash flow."],
    financial_risks: ["Receivables increased."],
    filing_signals: ["A quarterly report was filed."],
    unknowns: ["Future performance is unknown."],
    confidence: "medium",
    source_accessions: ["0000320193-26-000101", "invented-accession"]
  }, allowed, "AAPL");
  assert.equal(brief.symbol, "AAPL");
  assert.equal(brief.confidence, "medium");
  assert.deepEqual(brief.source_accessions, ["0000320193-26-000101"]);
  assert.equal(brief.disclaimer.includes("Not personalized"), true);
});

test("research brief validator rejects missing summary and invalid confidence", () => {
  assert.equal(validateResearchBrief({ confidence: "high" }, allowed, "AAPL"), null);
  assert.equal(validateResearchBrief({
    company_summary: "Summary", confidence: "certain"
  }, allowed, "AAPL"), null);
});

test("research brief validator bounds model-controlled strings and list sizes", () => {
  const brief = validateResearchBrief({
    company_summary: "x".repeat(1000),
    financial_strengths: Array.from({ length: 10 }, () => "y".repeat(1000)),
    financial_risks: [], filing_signals: [], unknowns: [],
    confidence: "low", source_accessions: []
  }, allowed, "AAPL");
  assert.equal(brief.company_summary.length, 700);
  assert.equal(brief.financial_strengths.length, 5);
  assert.equal(brief.financial_strengths[0].length, 400);
});
