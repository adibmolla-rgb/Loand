/* ==========================================================
   LoanD – personal loan helpers (pure)
   ----------------------------------------------------------
   Matches an amount and term against the Loan_APR_Tiers and
   Personal_Loans sheets. No page access. Nothing here predicts
   the APR a person would be offered: the APRs are the lenders'
   published ones, and "representative" has a specific meaning.
   ========================================================== */

// Monthly rate equivalent to an annual percentage rate (APR is an effective annual rate).
function aprToMonthlyRate(aprPercent) {
    return Math.pow(1 + aprPercent / 100, 1 / 12) - 1;
}

// Level monthly payment for a loan at an APR, assuming no fees beyond the interest.
function loanMonthlyPayment(amount, aprPercent, months) {
    if (!(amount > 0) || !(months > 0)) return 0;
    const r = aprToMonthlyRate(aprPercent);
    return r === 0 ? amount / months : amount * r / (1 - Math.pow(1 + r, -months));
}

// "Representative APR" has a legal meaning (the rate at least 51% of accepted
// applicants get). Other labels ("Illustrative APR", "APR by amount") are shown as published.
function isRepresentativeApr(aprType) {
    return /^(illustrative \/ )?representative/i.test(aprType || "");
}

/* Every published tier whose amount range contains the amount. Bands can leave
   gaps (HSBC: £2,990 then £3,000) or touch (TSB: both include £25,000), so zero,
   one or several rows can match. OUTDATED rows never match. */
function matchingTiers(tierRows, amount) {
    return tierRows.filter(row => row.status !== "OUTDATED" && typeof row.amount_from === "number" && typeof row.amount_to === "number"
        && amount >= row.amount_from && amount <= row.amount_to);
}

// Does the product's published amount/term range cover the request? null = not published.
function productFit(product, amount, termMonths) {
    if (!product) return { amountOk: null, termOk: null };
    const within = (value, min, max) => (typeof min === "number" && typeof max === "number") ? value >= min && value <= max : null;
    return {
        amountOk: within(amount, product.min_amount_number, product.max_amount_number),
        termOk: within(termMonths, product.min_term_months, product.max_term_months)
    };
}

/* One entry per matching tier: the lender's published APR, the payment and total
   repayable at that APR over the chosen term, and whether the product's own
   amount and term limits cover the request. */
function loanOptions({ tiers, products, amount, termMonths }) {
    return matchingTiers(tiers, amount).map(tier => {
        const product = products.find(item => item.lender_group === tier.lender_group && item.product === tier.product && item.status !== "OUTDATED");
        const monthly = loanMonthlyPayment(amount, tier.apr, termMonths);
        return {
            tier, product,
            representative: isRepresentativeApr(tier.apr_type),
            monthly,
            totalRepayable: monthly * termMonths,
            fit: productFit(product, amount, termMonths)
        };
    });
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = { aprToMonthlyRate, loanMonthlyPayment, isRepresentativeApr, matchingTiers, productFit, loanOptions };
}
