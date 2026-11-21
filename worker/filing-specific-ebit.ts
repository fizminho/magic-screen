/**
 * Accepts only a manually reviewed, accession- and period-matched EBIT reconstruction.
 * This is a shadow candidate, never production-approved accounting.
 */
export function resolveFilingSpecificEbitCandidate(
  company: any,
  expectedAccession: string,
  expectedPeriod: string,
  directRowCount: number,
): { value: number; method: "filing_specific_statement_subtotal_reconstruction" } | null {
  if (directRowCount !== 0 || !expectedAccession || !expectedPeriod) return null;
  const filing = company?.filing ?? {};
  const review = company?.filing_specific_review ?? {};
  const accession = String(filing.accession_number ?? filing.accession ?? "");
  const period = String(filing.period_of_report ?? filing.period ?? "");
  if (accession !== expectedAccession || period !== expectedPeriod) return null;
  if (!["10-K", "20-F", "40-F"].includes(String(filing.form ?? ""))) return null;
  if (review.status !== "review_only"
    || review.method !== "statement_subtotal_reconstructed"
    || review.automation_status !== "manual_review_only"
    || String(review.filing_accession ?? "") !== expectedAccession
    || String(review.fiscal_period ?? "") !== expectedPeriod
    || review.cross_checks?.reconciles_within_1 !== true) return null;

  const values = [
    review.reported_revenue,
    review.reported_total_operating_expenses,
    review.reported_pretax_income,
    review.reported_other_income_expense_net,
    review.reported_interest_expense_signed,
    review.ebit_candidate,
    review.cross_checks?.difference_between_methods,
  ];
  if (!values.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) return null;
  const [revenue, operatingExpenses, pretax, otherIncome, signedInterest, candidate, difference] = values as number[];
  const fromOperatingSubtotal = revenue - operatingExpenses;
  const fromPretaxBridge = pretax - otherIncome - signedInterest;
  if (candidate <= 0 || Math.abs(fromOperatingSubtotal - candidate) > 1
    || Math.abs(fromPretaxBridge - candidate) > 1 || Math.abs(difference) > 1) return null;

  return { value: candidate, method: "filing_specific_statement_subtotal_reconstruction" };
}
