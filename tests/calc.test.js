const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const calc = require("../js/engine/calc");

const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "json", name + ".json"), "utf8"));
const taxRows = load("property_taxes");
const tax = (price, nation, ftb, options) => calc.calculatePropertyTax(price, nation, ftb, taxRows, options).amount;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.005, `${message || ""} expected ${expected}, got ${actual}`);

/* ----- Official worked examples ----- */

test("SDLT: £295,000 standard purchase is £4,750", () => near(tax(295000, "England", false), 4750));
test("SDLT: £500,000 first-time buyer is £10,000", () => near(tax(500000, "England", true), 10000));
test("SDLT: first-time buyer relief is lost above £500,000", () => {
    const result = calc.calculatePropertyTax(600000, "England", true, taxRows);
    near(result.amount, tax(600000, "England", false));
    assert.match(result.relief, /isn't available above/);
});
test("LBTT: £235,000 is £1,800", () => near(tax(235000, "Scotland", false), 1800));
test("LBTT: £875,000 is £63,350", () => near(tax(875000, "Scotland", false), 63350));
test("LTT: £280,000 is £3,300", () => near(tax(280000, "Wales", false), 3300));
test("Northern Ireland uses the SDLT bands", () => near(tax(295000, "Northern Ireland", false), 4750));

/* ----- First-time buyer and surcharges (rates from the Property_Taxes sheet) ----- */

test("LBTT first-time buyer: nil band rises to £175,000 (£200,000 -> £500)", () => near(tax(200000, "Scotland", true), 500));
test("Wales has no first-time buyer relief", () => near(tax(280000, "Wales", true), 3300));
test("SDLT additional property adds 5 points to every band", () => near(tax(295000, "England", false, { additionalProperty: true }), 4750 + 295000 * 0.05));
test("SDLT additional property ignores first-time buyer relief", () => near(tax(300000, "England", true, { additionalProperty: true }), tax(300000, "England", false) + 15000));
test("LBTT Additional Dwelling Supplement is 8% of the whole price", () => near(tax(235000, "Scotland", false, { additionalProperty: true }), 1800 + 235000 * 0.08));
test("LTT higher residential rates: £280,000 is £17,950", () => near(tax(280000, "Wales", false, { additionalProperty: true }), 17950));
test("surcharge is explained to the user", () => {
    assert.match(calc.calculatePropertyTax(300000, "England", false, taxRows, { additionalProperty: true }).surcharge, /5 percentage points/);
});

/* ----- Repayments ----- */

test("capital & interest: £200,000 at 5% over 25 years is £1,169.18 a month", () => near(calc.calculateMonthlyRepayment(200000, 5, 25), 1169.18));
test("zero rate divides evenly", () => near(calc.calculateMonthlyRepayment(120000, 0, 10), 1000));
test("interest-only: £200,000 at 6% is £1,000 a month", () => near(calc.calculateInterestOnly(200000, 6), 1000));
test("calculateMortgage handles interest-only: loan is still owed, interest is the whole cost", () => {
    const result = calc.calculateMortgage({ income: 60000, price: 300000, deposit: 100000, termYears: 25, ratePercent: 6, monthlyDebts: 0, repaymentType: "interest-only" });
    near(result.monthly, 1000);
    near(result.totalInterest, 300000);
    near(result.ltv, (200000 / 300000) * 100);
});
test("calculateMortgage derives LTV, income multiple and DTI", () => {
    const result = calc.calculateMortgage({ income: 50000, price: 250000, deposit: 25000, termYears: 25, ratePercent: 5, monthlyDebts: 500 });
    near(result.loan, 225000);
    near(result.ltv, 90);
    near(result.incomeMultiple, 4.5);
    near(result.dti, 12);
});

/* ----- Stress rate (TSB: "6.25% or product rate +1% if higher") ----- */

test("stress rate uses the published rate when product rate +1 is lower", () => {
    assert.deepEqual(calc.stressRate(6.25, 4.5), { rate: 6.25, basis: "published" });
});
test("stress rate uses product rate +1 when that is higher, and says so", () => {
    assert.deepEqual(calc.stressRate(6.25, 5.5), { rate: 6.5, basis: "product-rate-plus" });
});

/* ----- LTV bands and deposits ----- */

test("LTV ceilings come from the rate rows and are sorted", () => {
    const ceilings = calc.ltvCeilings(load("mortgage_rates"));
    assert.ok(ceilings.length >= 4);
    assert.deepEqual(ceilings, [...ceilings].sort((a, b) => a - b));
    assert.ok(ceilings.every(value => value > 0 && value <= 100));
});
test("ltvBandFor finds the band and the deposit for the next one down", () => {
    const result = calc.ltvBandFor(88, 300000, [60, 75, 80, 85, 90, 95]);
    assert.equal(result.band, 90);
    assert.equal(result.next.ceiling, 85);
    assert.equal(result.next.deposit, 45000);
    assert.equal(result.next.extraDeposit, 9000);
});
test("ltvBandFor has no lower band at the lowest ceiling, and no band above the top", () => {
    assert.equal(calc.ltvBandFor(55, 300000, [60, 75]).next, null);
    assert.equal(calc.ltvBandFor(97, 300000, [60, 75]).band, null);
});
test("depositForLtv", () => near(calc.depositForLtv(300000, 90), 30000));

/* ----- What-if scenarios ----- */

test("what-if includes more deposit, +1 point, a different term, and the user's own rate", () => {
    const inputs = { income: 50000, price: 250000, deposit: 25000, termYears: 25, ratePercent: 5, monthlyDebts: 0 };
    const labels = calc.whatIfScenarios(inputs, { customRate: 7 }).map(item => item.label);
    assert.equal(labels.length, 5);
    assert.match(labels[3], /7\.00%/);
    assert.equal(calc.whatIfScenarios(inputs).length, 4);
    assert.equal(calc.whatIfScenarios({ ...inputs, termYears: 35 })[3].inputs.termYears, 25);
});
