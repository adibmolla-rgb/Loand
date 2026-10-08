/* ==========================================================
   LoanD – published limits check (used by mortgage.html)
   ----------------------------------------------------------
   Compares a user's figures with each lender's published
   numeric rules (Rules_Numeric sheet). Pure functions only:
   no page access, so this can move to the backend unchanged.

   What this is NOT: an eligibility or approval decision.
   Lenders also score credit, check spending and value the
   property using models they don't publish.

   Safety rules built in:
   1. Only CONFIRMED rules decide whether figures fit.
      SUPPORTED/UNCONFIRMED rules are listed as "check with lender".
   2. A rule with an "Other condition" is treated as a special
      route (e.g. Family Springboard) unless it's on the reviewed
      list below. Special routes are shown, never used to judge.
      So a new, unreviewed condition can only make the check more
      cautious, never less.
   ========================================================== */


/* Rules whose "Other condition" only describes or refines the standard
   case this calculator models: a UK-resident, employed buyer on a
   capital-and-interest mortgage, not using a special scheme.
   Reviewed against the release dated 2026-09-27. Re-check this list
   whenever a new research release arrives. */
const GENERAL_CONDITION_RULES = new Set([
    "R0014", "R0015",         // HSBC: first-time buyer max loan, from the rate table
    "R0044",                  // Barclays: default income multiple
    "R0045",                  // Barclays: debt-to-income threshold (paired with R0046)
    "R0076", "R0077", "R0080",// Lloyds Banking Group: note on loans over £750k
    "R0078", "R0081",         // Lloyds Banking Group: loan up to £500k (also in the loan columns)
    "R0083",                  // Lloyds Banking Group: First-Time Buyer Boost (purchase, not self-employed)
    "R0098",                  // NatWest: product-level minimum loan
    "R0113",                  // TSB: 90–95% LTV for houses and bungalows only
    "R0125", "R0126", "R0130",// TSB: income multiple bands for mainstream applicants
    "R0142",                  // Nationwide: minimum loan for new customers
    "R0173", "R0174", "R0175", "R0176", // Virgin Money: LTV by property value (checked below)
    "R0181"                   // Virgin Money: 4.49x above 85% LTV
]);

const DTI_TRIGGER_TEXT = "dti_threshold triggered";


/* ---------- Matching one rule to one user ---------- */

function inRange(value, min, max) {
    if (min !== null && min !== undefined && value < min) return false;
    if (max !== null && max !== undefined && value > max) return false;
    return true;
}

// "Property value £600,001-£750,000" or "£1,250,001-above": a condition the
// research wrote as text because the sheet has no property-value columns.
function propertyValueCondition(rule) {
    const match = /Property value £([\d,]+)-(?:£([\d,]+)|above)/i.exec(rule.other_condition || "");
    if (!match) return null;
    const toNumber = text => Number(text.replace(/,/g, ""));
    return { min: toNumber(match[1]), max: match[2] ? toNumber(match[2]) : null };
}

// Does this rule's written scope cover this user?
// `ignoreLtv` is used for max-loan bands, where the LTV column means
// "this band's ceiling" rather than a condition.
function ruleApplies(rule, user, { ignoreLtv = false } = {}) {
    if (!inRange(user.income, rule.min_income, rule.max_income)) return false;
    if (!ignoreLtv && !inRange(user.ltv, rule.min_ltv, rule.max_ltv)) return false;
    if (!inRange(user.loan, rule.min_loan, rule.max_loan)) return false;
    if (rule.property_type && rule.property_type !== "any" && rule.property_type !== user.propertyType) return false;
    if (rule.buyer_type && rule.buyer_type !== "any") {
        const buyers = rule.buyer_type.split("/").map(part => part.trim());
        if (!buyers.includes(user.buyerType)) return false;
    }
    if (rule.applicants && rule.applicants !== "any" && rule.applicants !== user.applicants) return false;
    if (rule.repayment_type && rule.repayment_type !== "any" && rule.repayment_type !== "capital & interest") return false;
    const byValue = propertyValueCondition(rule);
    if (byValue && !inRange(user.price, byValue.min, byValue.max)) return false;
    return true;
}

function hasStructuredConditions(rule) {
    return [rule.min_income, rule.max_income, rule.min_ltv, rule.max_ltv, rule.min_loan, rule.max_loan]
        .some(value => value !== null && value !== undefined)
        || [rule.property_type, rule.buyer_type, rule.applicants].some(value => value && value !== "any");
}

function isGeneralRule(rule) {
    if ((rule.other_condition || "").includes(DTI_TRIGGER_TEXT)) return false; // handled with the DTI check
    return !rule.other_condition || GENERAL_CONDITION_RULES.has(rule.rule_id);
}


/* ---------- Checking all rules for one lender ---------- */

function checkLender(rules, user, { productMaxLtv = null } = {}) {
    const confirmed = rules.filter(rule => rule.status === "CONFIRMED");
    const general = confirmed.filter(isGeneralRule);
    const of = type => general.filter(rule => rule.rule_type === type);
    const checks = [];

    // 1. Maximum LTV: every applicable limit must hold, so the lowest wins.
    const ltvRules = of("max_ltv").filter(rule => ruleApplies(rule, user));
    if (ltvRules.length) {
        const limit = Math.min(...ltvRules.map(rule => rule.value_numeric));
        checks.push({ key: "ltv", label: "Maximum LTV", limit, yours: user.ltv, unit: "%", pass: user.ltv <= limit + 1e-9, rules: ltvRules });
    } else if (productMaxLtv !== null) {
        checks.push({ key: "ltv", label: "Maximum LTV (from current products)", limit: productMaxLtv, yours: user.ltv, unit: "%", pass: user.ltv <= productMaxLtv + 1e-9, rules: [], fromProducts: true });
    } else {
        checks.push({ key: "ltv", label: "Maximum LTV", unknown: true });
    }

    // 2. Maximum income multiple. Income/LTV band tables are written so the
    //    applicable conditioned rows describe your band; the highest of those
    //    applies. Unconditioned rows are the lender's fallback default.
    const ltiRules = of("max_lti").filter(rule => ruleApplies(rule, user));
    const conditioned = ltiRules.filter(hasStructuredConditions);
    const ltiBasis = conditioned.length ? conditioned : ltiRules;
    if (ltiBasis.length) {
        let limit = Math.max(...ltiBasis.map(rule => rule.value_numeric));
        let usedRules = ltiBasis.filter(rule => rule.value_numeric === limit);
        let note = "";

        // Debt-to-income: above the threshold, a lower multiple applies.
        const dtiRule = of("dti_threshold").find(rule => ruleApplies(rule, user));
        if (dtiRule && user.dti >= dtiRule.value_numeric) {
            const capped = confirmed.find(rule => rule.rule_type === "max_lti" && (rule.other_condition || "").includes(DTI_TRIGGER_TEXT));
            if (capped && capped.value_numeric < limit) {
                limit = capped.value_numeric;
                usedRules = [dtiRule, capped];
                note = `Your credit repayments are ${user.dti.toFixed(1)}% of monthly income, at or above this lender's ${dtiRule.value_numeric}% threshold.`;
            }
        }
        checks.push({ key: "lti", label: "Maximum income multiple", limit, yours: user.incomeMultiple, unit: "×", pass: user.incomeMultiple <= limit + 1e-9, rules: usedRules, note });
    } else {
        checks.push({ key: "lti", label: "Maximum income multiple", unknown: true });
    }

    // 3. Maximum loan. Rows with an LTV value are bands ("up to 90% LTV:
    //    £1m"): your band is the smallest ceiling at or above your LTV.
    const loanLimits = [];
    const plainLoan = of("max_loan").filter(rule => rule.max_ltv == null && ruleApplies(rule, user));
    plainLoan.forEach(rule => loanLimits.push({ value: rule.value_numeric, rule }));
    const bands = of("max_loan")
        .filter(rule => rule.max_ltv != null && ruleApplies(rule, user, { ignoreLtv: true }) && rule.max_ltv >= user.ltv)
        .sort((a, b) => a.max_ltv - b.max_ltv);
    if (bands.length) loanLimits.push({ value: bands[0].value_numeric, rule: bands[0] });
    if (loanLimits.length) {
        const lowest = loanLimits.reduce((a, b) => (b.value < a.value ? b : a));
        checks.push({ key: "loan", label: "Maximum loan", limit: lowest.value, yours: user.loan, unit: "£", pass: user.loan <= lowest.value, rules: [lowest.rule] });
    }

    // 4. Minimum loan (only rules that apply to everyone).
    const minLoan = of("min_loan").filter(rule => ruleApplies(rule, user));
    if (minLoan.length) {
        const limit = Math.max(...minLoan.map(rule => rule.value_numeric));
        checks.push({ key: "minloan", label: "Minimum loan", limit, yours: user.loan, unit: "£", pass: user.loan >= limit, rules: minLoan, isMinimum: true });
    }

    // 5. Term and age (age is optional).
    const termRules = of("max_term_years").filter(rule => ruleApplies(rule, user));
    if (termRules.length) {
        const limit = Math.min(...termRules.map(rule => rule.value_numeric));
        checks.push({ key: "term", label: "Maximum term", limit, yours: user.termYears, unit: "years", pass: user.termYears <= limit, rules: termRules });
    }
    if (user.age) {
        const ageRules = of("max_age_end_of_term").filter(rule => ruleApplies(rule, user));
        if (ageRules.length) {
            const limit = Math.min(...ageRules.map(rule => rule.value_numeric));
            const ageAtEnd = user.age + user.termYears;
            checks.push({ key: "age", label: "Maximum age at end of term", limit, yours: ageAtEnd, unit: "years", pass: ageAtEnd <= limit, rules: ageRules });
        }
        const minAge = of("min_age").filter(rule => ruleApplies(rule, user));
        if (minAge.length) {
            const limit = Math.max(...minAge.map(rule => rule.value_numeric));
            checks.push({ key: "minage", label: "Minimum age", limit, yours: user.age, unit: "years", pass: user.age >= limit, rules: minAge, isMinimum: true });
        }
    }

    // Special routes (e.g. Family Springboard, Helping Hand). Only shown for
    // a limit you didn't meet, or one that couldn't be checked, and only if
    // the route's limit would cover your figures.
    const specials = confirmed
        .filter(rule => !isGeneralRule(rule) && ["max_ltv", "max_lti"].includes(rule.rule_type) && ruleApplies(rule, user))
        .filter(rule => !(rule.other_condition || "").includes(DTI_TRIGGER_TEXT))
        .filter(rule => {
            const key = rule.rule_type === "max_ltv" ? "ltv" : "lti";
            const check = checks.find(item => item.key === key);
            const yours = key === "ltv" ? user.ltv : user.incomeMultiple;
            const needed = !check || check.unknown || !check.pass;
            return needed && rule.value_numeric >= yours - 1e-9;
        });

    // Rules that would matter but aren't confirmed yet.
    const unverified = rules.filter(rule =>
        rule.status !== "CONFIRMED" &&
        ["max_ltv", "max_lti", "max_age_end_of_term", "max_term_years", "max_loan"].includes(rule.rule_type) &&
        ruleApplies(rule, user));

    const known = checks.filter(check => !check.unknown);
    const failed = known.filter(check => !check.pass);
    const coreKnown = ["ltv", "lti"].every(key => checks.some(check => check.key === key && !check.unknown));
    const verdict = failed.length ? "outside" : coreKnown ? "within" : "partial";

    return { verdict, checks, failed, specials, unverified };
}
