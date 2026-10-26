const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const loans = require("../js/engine/loans");

const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "json", name + ".json"), "utf8"));
const tiers = load("loan_apr_tiers");
const products = load("personal_loans");
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

test("APR is an effective annual rate: 12% APR is about 0.9489% a month", () => near(loans.aprToMonthlyRate(12) * 100, 0.9489, 0.0001));

test("payment on £10,000 over 36 months at 6.8% APR", () => {
    const monthly = loans.loanMonthlyPayment(10000, 6.8, 36);
    near(monthly, 306.98, 0.5);
    // At 0% the loan simply divides evenly.
    near(loans.loanMonthlyPayment(12000, 0, 24), 500);
    assert.equal(loans.loanMonthlyPayment(0, 5, 24), 0);
});

test("only 'representative' APR types get the representative wording", () => {
    assert.equal(loans.isRepresentativeApr("Illustrative / representative APR"), true);
    assert.equal(loans.isRepresentativeApr("Representative APR (1-5 yrs)"), true);
    assert.equal(loans.isRepresentativeApr("Illustrative APR"), false);
    assert.equal(loans.isRepresentativeApr("APR by amount (as published)"), false);
    assert.equal(loans.isRepresentativeApr(null), false);
});

test("HSBC Personal Loan: £8,000 falls in the £7,500-£20,000 band at 6.8%", () => {
    const hsbc = loans.matchingTiers(tiers, 8000).filter(row => row.lender_group === "HSBC UK" && row.product === "Personal Loan");
    assert.equal(hsbc.length, 1);
    assert.equal(hsbc[0].apr, 6.8);
});

test("a gap between published bands matches nothing for that product", () => {
    const hsbc = loans.matchingTiers(tiers, 2995).filter(row => row.lender_group === "HSBC UK" && row.product === "Personal Loan");
    assert.equal(hsbc.length, 0);
});

test("touching bands can both match (TSB at £25,000)", () => {
    const tsb = loans.matchingTiers(tiers, 25000).filter(row => row.lender_group === "TSB");
    assert.deepEqual(tsb.map(row => row.apr).sort(), [6.4, 7.9]);
});

test("loanOptions combines the tier, the payment and whether the product's own limits cover the request", () => {
    const options = loans.loanOptions({ tiers, products, amount: 8000, termMonths: 36 });
    const hsbc = options.find(option => option.tier.lender_group === "HSBC UK" && option.tier.product === "Personal Loan");
    assert.equal(hsbc.representative, true);
    assert.equal(hsbc.fit.amountOk, true);
    assert.equal(hsbc.fit.termOk, true);
    near(hsbc.monthly, loans.loanMonthlyPayment(8000, 6.8, 36), 0.001);
    near(hsbc.totalRepayable, hsbc.monthly * 36, 0.001);

    // Santander's longest term is 60 months: 72 months is outside the product's published range.
    const santander = loans.loanOptions({ tiers, products, amount: 8000, termMonths: 72 }).find(option => option.tier.lender_group === "Santander UK");
    assert.equal(santander.fit.termOk, false);
});

test("fit is null (unknown), not true, when the product's limits aren't published", () => {
    assert.deepEqual(loans.productFit(undefined, 5000, 24), { amountOk: null, termOk: null });
    assert.deepEqual(loans.productFit({ min_amount_number: null, max_amount_number: null }, 5000, 24).amountOk, null);
});
