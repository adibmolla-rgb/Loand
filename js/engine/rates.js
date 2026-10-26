/* ==========================================================
   LoanD – mortgage rate helpers (pure)
   ----------------------------------------------------------
   Filtering, freshness, cost-over-the-deal and sorting for the
   Mortgage_Rates sheet. No page access, so it runs in the browser,
   in the tests (Node) and later in the backend.
   ========================================================== */

// Rates older than this are flagged, as the research README recommends.
const RATE_STALE_AFTER_DAYS = 7;

// Mortgage products only open to specific groups (Premier customers, shared
// ownership, existing borrowers...). Left out of general rate comparisons.
const SPECIAL_PRODUCT = /shared equity|shared ownership|premier|help to buy|right to buy|springboard|joint borrower|retention|existing|further advance|buy to let|btl|offset/i;

// OUTDATED rows are kept in the research for audit only, never shown as facts.
function isDisplayable(row) {
    return (row.status || row.data_status) !== "OUTDATED";
}

// Does a rate row suit this kind of buyer? ("first-time buyer", "home mover" or "remortgage")
function rateMatchesBuyer(row, buyerType) {
    if (buyerType === "remortgage") return row.purpose === "Remortgage" && row.buyer_type === "Remortgage";
    const buyers = buyerType === "first-time buyer"
        ? ["First-time buyer", "Purchase", "Purchase (segment not disambiguated)"]
        : ["Home mover / purchase", "Purchase", "Purchase (segment not disambiguated)"];
    return row.purpose === "Purchase" && buyers.includes(row.buyer_type);
}

// LTV bands: "60-75%" covers above 60% up to 75%. A band starting at 0 includes 0.
function ltvInBand(ltv, min, max) {
    if (max === null || max === undefined) return false;
    return (!min ? ltv >= 0 : ltv > min) && ltv <= max + 1e-9;
}


/* ---------- Freshness ---------- */

// Whole days from an ISO date (YYYY-MM-DD) to `today` (a Date or an ISO date).
function daysBetween(isoDate, today) {
    const parse = value => {
        if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
        const [y, m, d] = String(value).split("-").map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((parse(today) - parse(isoDate)) / 86400000);
}

/* How current a rate row is. The research's Effective date is the date the
   lender's own sheet says the rate applies from; where a lender's page shows
   none (HSBC's rate pages), the date we checked it is used instead and the
   result says so. */
function rateFreshness(row, today) {
    const base = date => ({ date, ageDays: daysBetween(date, today), stale: daysBetween(date, today) > RATE_STALE_AFTER_DAYS });
    if (row.effective_date) return { ...base(row.effective_date), basis: "effective" };
    if (row.date_checked) return { ...base(row.date_checked), basis: "checked" };
    return { date: null, ageDays: null, stale: true, basis: "none" };
}


/* ---------- Cost over the initial deal ---------- */

/* Interest paid during the initial period plus the product fee, for a loan at
   the deal's rate. An estimate: it assumes the fee is paid up front rather than
   added to the loan, the rate stays fixed for the period, and no overpayments,
   valuation or legal costs. Returns null when the rate, period or fee isn't
   known (never a guess or a zero). */
function initialPeriodCost({ loan, ratePercent, months, fee, repaymentType = "capital & interest", termYears }) {
    if (![loan, ratePercent, months, fee, termYears].every(value => typeof value === "number" && Number.isFinite(value))) return null;
    if (loan <= 0 || months <= 0 || termYears <= 0) return null;
    const payments = Math.min(months, termYears * 12);
    const pay = typeof calculateMonthlyPayment === "function" ? calculateMonthlyPayment : require("./calc").calculateMonthlyPayment;
    const monthly = pay(loan, ratePercent, termYears, repaymentType);
    let interest;
    if (repaymentType === "interest-only") {
        interest = monthly * payments;
    } else {
        const r = ratePercent / 100 / 12;
        const balance = r === 0 ? loan - monthly * payments : loan * Math.pow(1 + r, payments) - monthly * (Math.pow(1 + r, payments) - 1) / r;
        interest = monthly * payments - (loan - balance);
    }
    return { monthly, interest, fee, total: interest + fee, months: payments };
}


/* ---------- Filtering and sorting ---------- */

/* filters: { buyerType: "any" | "first-time buyer" | "home mover" | "remortgage",
              ltv: number|null, loan: number|null, months: "all"|number,
              lender: "all"|lender group, rateType: "all"|"Fixed"|"Tracker"|...,
              noFeeOnly: boolean, includeSpecial: boolean }
   Returns the rows to show: never OUTDATED, never without a published rate,
   never reversion/SVR rows or buy-to-let. */
function filterRates(rows, filters = {}) {
    const { buyerType = "any", ltv = null, loan = null, months = "all", lender = "all", rateType = "all", noFeeOnly = false, includeSpecial = false } = filters;
    return rows.filter(row => {
        if (!isDisplayable(row) || typeof row.initial_rate_number !== "number") return false;
        if (row.buyer_type === "Reversion" || row.rate_type === "SVR" || !["Purchase", "Remortgage"].includes(row.purpose)) return false;
        if (buyerType === "any" ? false : !rateMatchesBuyer(row, buyerType)) return false;
        if (!includeSpecial && SPECIAL_PRODUCT.test(row.product)) return false;
        if (lender !== "all" && row.lender_group !== lender) return false;
        if (rateType !== "all" && row.rate_type !== rateType) return false;
        if (months !== "all" && row.initial_period_months !== Number(months)) return false;
        if (noFeeOnly && row.product_fee_number !== 0) return false;
        if (typeof ltv === "number" && !ltvInBand(ltv, row.ltv_min, row.ltv_max)) return false;
        if (typeof loan === "number" && typeof row.max_loan === "number" && row.max_loan < loan) return false;
        return true;
    });
}

/* Sorts by a column the user chose. Rows with no value for the column always
   go last, whichever direction is chosen. `valueOf(row)` supplies the value. */
function sortRates(rows, valueOf, direction = "asc") {
    const sign = direction === "desc" ? -1 : 1;
    return rows.map((row, index) => ({ row, index, value: valueOf(row) })).sort((a, b) => {
        const aMissing = a.value === null || a.value === undefined || a.value === "";
        const bMissing = b.value === null || b.value === undefined || b.value === "";
        if (aMissing || bMissing) return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
        const order = typeof a.value === "string" ? a.value.localeCompare(b.value) : a.value - b.value;
        return order * sign || a.index - b.index;
    }).map(item => item.row);
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = { RATE_STALE_AFTER_DAYS, SPECIAL_PRODUCT, isDisplayable, rateMatchesBuyer, ltvInBand, daysBetween, rateFreshness, initialPeriodCost, filterRates, sortRates };
}
