/* Fixtures are real rows from Rules_Numeric (data/json/rules_numeric.json). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { checkLender, indicativeMaxBorrowing, ruleApplies } = require("../js/engine/rules");

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "json", "rules_numeric.json"), "utf8"));
const forLender = (group, scope) => rules.filter(rule => rule.lender_group === group && (!scope || rule.brand_scope === scope));
const barclays = forLender("Barclays");
const nationwide = forLender("Nationwide", "Nationwide");   // Virgin Money keeps its own criteria
const lloyds = forLender("Lloyds Banking Group");
const hsbc = forLender("HSBC UK");

function userWith(overrides) {
    const base = { income: 60000, price: 300000, loan: 240000, termYears: 25, propertyType: "house", buyerType: "home mover",
        applicants: "sole", repaymentType: "capital & interest", age: 35, selfEmployed: false, yearsTrading: null, dti: 0 };
    const user = { ...base, ...overrides };
    user.ltv = (user.loan / user.price) * 100;
    user.incomeMultiple = user.loan / user.income;
    return user;
}
const check = (result, key) => result.checks.find(item => item.key === key);

test("Barclays: debt-to-income at or above 20% caps the income multiple at 4.0x", () => {
    const below = checkLender(barclays, userWith({ dti: 19.9 }));
    assert.equal(check(below, "lti").limit, 5.5);

    const at = checkLender(barclays, userWith({ dti: 20 }));
    assert.equal(check(at, "lti").limit, 4);
    assert.deepEqual(check(at, "lti").rules.map(rule => rule.rule_id), ["R0045", "R0046"]);
    assert.match(check(at, "lti").note, /20% threshold/);
    // Exactly 4.0x is within the cap; above it is outside.
    assert.equal(check(checkLender(barclays, userWith({ dti: 25, loan: 240000 })), "lti").pass, true);
    assert.equal(check(checkLender(barclays, userWith({ dti: 25, loan: 250000 })), "lti").pass, false);
    assert.equal(check(checkLender(barclays, userWith({ dti: 15, loan: 250000 })), "lti").pass, true);
});

test("Nationwide: 95% LTV maximum loan is £750,000", () => {
    const user = userWith({ income: 200000, price: 850000, loan: 807500 });   // 95% LTV
    const result = checkLender(nationwide, user, { productMaxLtv: 95 });
    const loan = check(result, "loan");
    assert.equal(loan.limit, 750000);
    assert.equal(loan.pass, false);
    assert.equal(result.verdict, "outside");
    assert.equal(loan.rules[0].rule_id, "R0149");

    const smaller = checkLender(nationwide, userWith({ income: 200000, price: 700000, loan: 665000 }), { productMaxLtv: 95 });
    assert.equal(check(smaller, "loan").pass, true);
});

test("interest-only: Barclays' 75% LTV cap applies, and not to a repayment mortgage", () => {
    const repayment = checkLender(barclays, userWith({ loan: 240000 }));   // 80% LTV
    assert.equal(check(repayment, "ltv").limit, 95);
    assert.equal(check(repayment, "ltv").pass, true);

    const interestOnly = checkLender(barclays, userWith({ loan: 240000, repaymentType: "interest-only" }));
    assert.equal(check(interestOnly, "ltv").limit, 75);
    assert.equal(check(interestOnly, "ltv").pass, false);
    assert.equal(check(interestOnly, "term").limit, 25);
});

test("interest-only: Lloyds Banking Group's £50,000 minimum income applies only to interest-only", () => {
    assert.equal(check(checkLender(lloyds, userWith({ income: 45000, loan: 150000 })), "minincome"), undefined);
    const interestOnly = check(checkLender(lloyds, userWith({ income: 45000, loan: 150000, repaymentType: "interest-only" })), "minincome");
    assert.equal(interestOnly.limit, 50000);
    assert.equal(interestOnly.pass, false);
});

test("self-employed: minimum years trading is checked only for the self-employed", () => {
    assert.equal(check(checkLender(barclays, userWith({})), "trading"), undefined);
    const short = check(checkLender(barclays, userWith({ selfEmployed: true, yearsTrading: 1 })), "trading");
    assert.equal(short.limit, 2);
    assert.equal(short.pass, false);
    assert.equal(check(checkLender(barclays, userWith({ selfEmployed: true, yearsTrading: 3 })), "trading").pass, true);
    // Years not given: no check is made rather than guessing.
    assert.equal(check(checkLender(barclays, userWith({ selfEmployed: true, yearsTrading: null })), "trading"), undefined);
});

test("a 'not self-employed' condition does not apply to a self-employed user", () => {
    const boost = lloyds.find(rule => rule.rule_id === "R0083");
    assert.match(boost.other_condition, /not SE/);
    const user = userWith({ buyerType: "first-time buyer", income: 30000, loan: 100000, price: 110000 });
    assert.equal(ruleApplies(boost, { ...user, selfEmployed: true }), false);
});

test("SUPPORTED rules are never used to decide: HSBC's minimum age is not checked", () => {
    const minAge = hsbc.find(rule => rule.rule_type === "min_age");
    assert.equal(minAge.status, "SUPPORTED");
    assert.equal(check(checkLender(hsbc, userWith({ age: 17 })), "minage"), undefined);
    assert.equal(check(checkLender(barclays, userWith({ age: 17 })), "minage").pass, false);
});

test("remortgage rules apply to a remortgage user, and not to a home mover", () => {
    const user = userWith({ buyerType: "remortgage", income: 100000, loan: 450000, price: 500000 });   // 90% LTV
    const nw = checkLender(nationwide, user, { productMaxLtv: 95 });
    assert.equal(check(nw, "lti").limit, 6.5);          // R0163 remortgage, capital & interest
    const mover = checkLender(nationwide, { ...user, buyerType: "home mover" }, { productMaxLtv: 95 });
    assert.notEqual(check(mover, "lti").limit, 6.5);
});

test("indicative maximum borrowing is the lowest of the published caps", () => {
    // 80% LTV, £40,000 income: Barclays 5.0x for incomes of £35,000+ below 85% LTV -> £200,000,
    // which is lower than 95% of the £300,000 price.
    const lowIncome = userWith({ income: 40000, loan: 240000 });
    const result = indicativeMaxBorrowing(checkLender(barclays, lowIncome), lowIncome);
    assert.equal(result.amount, 200000);
    assert.equal(result.limitedBy, "income multiple");
    assert.equal(result.multiple, 5);

    const highIncome = userWith({ income: 100000, loan: 240000 });
    const capped = indicativeMaxBorrowing(checkLender(barclays, highIncome), highIncome);
    assert.equal(capped.limitedBy, "maximum LTV");
    assert.equal(capped.amount, 285000);       // 95% of £300,000
});

test("indicative maximum borrowing is null when the income multiple isn't published", () => {
    assert.equal(indicativeMaxBorrowing({ checks: [{ key: "lti", unknown: true }] }, userWith({})), null);
});
