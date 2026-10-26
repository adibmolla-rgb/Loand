const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rates = require("../js/engine/rates");

const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "json", name + ".json"), "utf8"));
const rows = load("mortgage_rates");
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

/* ----- Freshness ----- */

test("daysBetween counts whole calendar days", () => {
    assert.equal(rates.daysBetween("2026-10-19", "2026-10-26"), 7);
    assert.equal(rates.daysBetween("2026-09-24", new Date(2026, 9, 26)), 32);
});

test("a rate is stale only when its Effective date is more than 7 days before today", () => {
    assert.equal(rates.rateFreshness({ effective_date: "2026-10-19" }, "2026-10-26").stale, false);   // exactly 7
    assert.equal(rates.rateFreshness({ effective_date: "2026-10-18" }, "2026-10-26").stale, true);    // 8
    assert.equal(rates.rateFreshness({ effective_date: "2026-10-26" }, "2026-10-26").stale, false);
});

test("without an Effective date, the date checked is used and the basis says so", () => {
    const result = rates.rateFreshness({ effective_date: null, date_checked: "2026-09-27" }, "2026-10-26");
    assert.equal(result.basis, "checked");
    assert.equal(result.stale, true);
    assert.equal(rates.rateFreshness({}, "2026-10-26").stale, true);
});

test("on 2026-10-26 every published rate in the 2026-09-27 release is stale, as expected", () => {
    const shown = rates.filterRates(rows, {});
    assert.ok(shown.length > 100);
    assert.ok(shown.every(row => rates.rateFreshness(row, "2026-10-26").stale));
});

/* ----- Cost over the initial deal ----- */

test("interest over a 2-year fix on £200,000 at 5% over 25 years, plus a £999 fee", () => {
    const cost = rates.initialPeriodCost({ loan: 200000, ratePercent: 5, months: 24, fee: 999, termYears: 25 });
    near(cost.monthly, 1169.18);
    // Independent check: add up each month's interest on the running balance.
    let balance = 200000, interest = 0;
    for (let month = 0; month < 24; month++) {
        const monthlyInterest = balance * 0.05 / 12;
        interest += monthlyInterest;
        balance -= cost.monthly - monthlyInterest;
    }
    near(cost.interest, interest, 0.01);
    near(cost.interest, 19601.71, 0.01);
    near(cost.total, cost.interest + 999, 0.001);
});

test("interest-only cost is the interest for the period", () => {
    const cost = rates.initialPeriodCost({ loan: 200000, ratePercent: 6, months: 24, fee: 0, termYears: 25, repaymentType: "interest-only" });
    near(cost.interest, 24000);
    near(cost.total, 24000);
});

test("a deal longer than the term is capped at the term", () => {
    assert.equal(rates.initialPeriodCost({ loan: 100000, ratePercent: 5, months: 120, fee: 0, termYears: 5 }).months, 60);
});

test("cost is null (not zero) when the rate, period or fee isn't known", () => {
    assert.equal(rates.initialPeriodCost({ loan: 200000, ratePercent: 5, months: null, fee: 0, termYears: 25 }), null);
    assert.equal(rates.initialPeriodCost({ loan: 200000, ratePercent: 5, months: 24, fee: null, termYears: 25 }), null);
    assert.equal(rates.initialPeriodCost({ loan: 0, ratePercent: 5, months: 24, fee: 0, termYears: 25 }), null);
});

/* ----- Filtering ----- */

test("OUTDATED rows, reversion/SVR rows and buy-to-let never appear", () => {
    const shown = rates.filterRates(rows, { includeSpecial: true });
    assert.ok(rows.some(row => row.status === "OUTDATED"), "fixture has OUTDATED rows");
    assert.ok(shown.every(row => row.status !== "OUTDATED" && row.rate_type !== "SVR" && row.buyer_type !== "Reversion" && row.purpose !== "Buy-to-let purchase"));
    assert.ok(shown.every(row => typeof row.initial_rate_number === "number"));
});

test("LTV filter keeps only products whose LTV range contains the user's LTV", () => {
    const shown = rates.filterRates(rows, { ltv: 88 });
    assert.ok(shown.length > 0);
    assert.ok(shown.every(row => row.ltv_max >= 88 && (row.ltv_min || 0) < 88));
});

test("deal length, lender, rate type and no-fee filters narrow the list", () => {
    const shown = rates.filterRates(rows, { months: 60, lender: "Nationwide", rateType: "Fixed", noFeeOnly: true });
    assert.ok(shown.length > 0);
    assert.ok(shown.every(row => row.initial_period_months === 60 && row.lender_group === "Nationwide" && row.rate_type === "Fixed" && row.product_fee_number === 0));
});

test("max loan filter drops products capped below the loan, keeps those with no stated cap", () => {
    const shown = rates.filterRates(rows, { loan: 1500000 });
    assert.ok(shown.every(row => row.max_loan === null || row.max_loan >= 1500000));
});

test("buyer type filter separates remortgage from purchase", () => {
    assert.ok(rates.filterRates(rows, { buyerType: "remortgage" }).every(row => row.purpose === "Remortgage"));
    assert.ok(rates.filterRates(rows, { buyerType: "first-time buyer" }).every(row => row.purpose === "Purchase"));
});

test("special-group products are hidden unless asked for", () => {
    const hidden = rates.filterRates(rows, {}).filter(row => rates.SPECIAL_PRODUCT.test(row.product));
    assert.equal(hidden.length, 0);
    assert.ok(rates.filterRates(rows, { includeSpecial: true }).length >= rates.filterRates(rows, {}).length);
});

/* ----- Sorting ----- */

test("sorting follows the chosen column and direction, with missing values always last", () => {
    const sample = [{ id: "a", v: 3 }, { id: "b", v: null }, { id: "c", v: 1 }, { id: "d", v: 2 }];
    assert.deepEqual(rates.sortRates(sample, row => row.v, "asc").map(row => row.id), ["c", "d", "a", "b"]);
    assert.deepEqual(rates.sortRates(sample, row => row.v, "desc").map(row => row.id), ["a", "d", "c", "b"]);
});

test("sorting text uses locale order and is stable for ties", () => {
    const sample = [{ id: 1, n: "Nationwide" }, { id: 2, n: "Barclays" }, { id: 3, n: "Barclays" }];
    assert.deepEqual(rates.sortRates(sample, row => row.n).map(row => row.id), [2, 3, 1]);
});
