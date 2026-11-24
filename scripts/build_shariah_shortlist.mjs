#!/usr/bin/env node
// Offline builder: reads three manually maintained JSON files, writes shortlist.json + shortlist.html.
// Usage: node scripts/build_shariah_shortlist.mjs [dataDir=data] [outDir=dist-reports] [maxAgeDays=30]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildShortlist, renderReportHtml, DEFAULT_MAX_AGE_DAYS } from "../worker/shariah-screening.mjs";

const [dataDir = "data", outDir = "dist-reports", age] = process.argv.slice(2);
const maxAgeDays = age ? Number(age) : DEFAULT_MAX_AGE_DAYS;
const read = (name, required) => {
  const p = join(dataDir, name);
  if (!existsSync(p)) { if (required) { console.error(`Missing ${p}`); process.exit(1); } return []; }
  return JSON.parse(readFileSync(p, "utf8"));
};
const universe = read("mfi-universe.json", true);
const result = buildShortlist({ universe, shariahChecks: read("shariah-checks.json"), ipObservations: read("investing-paths-observations.json"), maxAgeDays });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "shortlist.json"), JSON.stringify(result, null, 2));
writeFileSync(join(outDir, "shortlist.html"), renderReportHtml(result));
console.log(JSON.stringify(result.summary), `invalid IP records ignored: ${result.ignored_invalid_investing_paths_records.length}`);
