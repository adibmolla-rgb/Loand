/* ==========================================================
   LoanD – calculators (numbers in, numbers out)
   ----------------------------------------------------------
   Repayments, LTV, purchase taxes, stress-rate payments, LTV
   bands and what-if scenarios. No page access, so it runs in
   the browser, in the tests (Node) and later in the backend.
   Tax bands come from the Property_Taxes sheet, passed in.
   ========================================================== */

// Benchmarks taken from the research (Affordability and Rules_Numeric sheets).
const STANDARD_LTI = 4.49;      // Barclays, Lloyds Banking Group (<£40k), Nationwide and TSB (<=£50k) standard cap
const HIGHEST_LTI = 6.5;        // Highest multiple in the research (HSBC Premier, Coventry FTB, Nationwide like-for-like remortgage)
const DTI_THRESHOLD = 20;       // Barclays: commitments >= 20% of gross monthly income caps LTI at 4.0x
const MAINSTREAM_MAX_LTV = 95;  // Most common maximum in the research


/* ---------- Repayments ---------- */

// Standard repayment (capital and interest) mortgage formula:
// M = P × r / (1 − (1 + r)^−n), with r = monthly rate and n = number of payments.
function calculateMonthlyRepayment(loanAmount, annualRatePercent, termYears) {
    const payments = termYears * 12;
    const monthlyRate = annualRatePercent / 100 / 12;
    if (loanAmount <= 0 || payments <= 0) return 0;
    if (monthlyRate === 0) return loanAmount / payments;
    return loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -payments));
}

// Interest-only: the monthly interest, with none of the loan paid off.
function calculateInterestOnly(loanAmount, annualRatePercent) {
    return loanAmount > 0 ? loanAmount * annualRatePercent / 100 / 12 : 0;
}

function calculateMonthlyPayment(loanAmount, annualRatePercent, termYears, repaymentType) {
    return repaymentType === "interest-only"
        ? calculateInterestOnly(loanAmount, annualRatePercent)
        : calculateMonthlyRepayment(loanAmount, annualRatePercent, termYears);
}

function calculateLtv(loanAmount, propertyPrice) {
    return propertyPrice > 0 ? (loanAmount / propertyPrice) * 100 : 0;
}

function calculateDti(monthlyDebts, annualIncome) {
    const monthlyIncome = annualIncome / 12;
    return monthlyIncome > 0 ? (monthlyDebts / monthlyIncome) * 100 : 0;
}

// Runs every calculation for one set of inputs and returns a plain object.
// For a remortgage, `price` is the property value and `deposit` the equity you keep.
function calculateMortgage({ income, price, deposit, termYears, ratePercent, monthlyDebts, repaymentType }) {
    const loan = Math.max(price - deposit, 0);
    const monthly = calculateMonthlyPayment(loan, ratePercent, termYears, repaymentType);
    return {
        loan,
        monthly,
        // Interest-only: the loan itself is still owed at the end of the term.
        totalInterest: repaymentType === "interest-only" ? monthly * termYears * 12 : monthly * termYears * 12 - loan,
        ltv: calculateLtv(loan, price),
        depositPercent: price > 0 ? (deposit / price) * 100 : 0,
        incomeMultiple: income > 0 ? loan / income : 0,
        dti: calculateDti(monthlyDebts, income),
        borrowingAtStandard: income * STANDARD_LTI,
        borrowingAtHighest: income * HIGHEST_LTI
    };
}


/* ---------- Stress-rate payments ---------- */

/* A lender that publishes its stress rate (TSB) states it as "X% or product
   rate +1% if higher". Returns the rate used and which basis applied, so the
   page can say so rather than showing an unexplained figure. */
function stressRate(publishedRate, productRate, addOn = 1) {
    const withAddOn = productRate + addOn;
    return withAddOn > publishedRate
        ? { rate: withAddOn, basis: "product-rate-plus" }
        : { rate: publishedRate, basis: "published" };
}


/* ---------- Purchase taxes ---------- */

// Tiered purchase tax: each band's rate applies only to the slice of the
// price inside that band. `extraPoints` adds percentage points to every band.
function taxFromBands(price, bands, extraPoints = 0) {
    return bands.reduce((total, band) => {
        const lower = band.band_from === 0 ? 0 : band.band_from - 1;
        const upper = band.band_to === null ? Infinity : band.band_to;
        const slice = Math.max(0, Math.min(price, upper) - lower);
        return total + slice * (band.rate + extraPoints) / 100;
    }, 0);
}

const TAX_BY_NATION = {
    England: { tax: "SDLT", sheetNation: "England & Northern Ireland", name: "Stamp Duty Land Tax" },
    "Northern Ireland": { tax: "SDLT", sheetNation: "England & Northern Ireland", name: "Stamp Duty Land Tax" },
    Scotland: { tax: "LBTT", sheetNation: "Scotland", name: "Land and Buildings Transaction Tax" },
    Wales: { tax: "LTT", sheetNation: "Wales", name: "Land Transaction Tax" }
};

/* Tax on a residential purchase, from the Property_Taxes rows.
   options.additionalProperty: the buyer will own another home afterwards, so
   the higher rates apply (SDLT +5 points on every band, LBTT Additional
   Dwelling Supplement on the whole price, LTT higher residential bands) and
   first-time buyer relief does not. The sheet states no minimum price for the
   surcharges, so none is applied. */
function calculatePropertyTax(price, nation, isFirstTimeBuyer, taxRows, { additionalProperty = false } = {}) {
    const info = TAX_BY_NATION[nation];
    const rows = taxRows.filter(row => row.tax === info.tax && row.nation === info.sheetNation && row.status === "CONFIRMED");
    const standard = rows.filter(row => /^(Standard residential|Main residential rates)$/.test(row.band_relief));
    const result = { ...info, amount: taxFromBands(price, standard), relief: null, surcharge: null, sources: [...new Set(rows.map(row => row.source_id))] };

    if (additionalProperty) {
        if (info.tax === "SDLT") {
            const row = rows.find(item => item.band_relief === "Higher rates for additional dwellings");
            if (row) {
                result.amount = taxFromBands(price, standard, row.rate);
                result.surcharge = `Higher rates for additional dwellings: ${row.rate} percentage points added to every band.`;
            }
        } else if (info.tax === "LBTT") {
            const row = rows.find(item => item.band_relief === "Additional Dwelling Supplement");
            if (row) {
                result.amount += price * row.rate / 100;
                result.surcharge = `Additional Dwelling Supplement: ${row.rate}% of the whole price.`;
            }
        } else {
            const higher = rows.filter(item => item.band_relief === "Higher residential rates");
            if (higher.length) {
                result.amount = taxFromBands(price, higher);
                result.surcharge = "Higher residential rates for additional homes.";
            }
        }
        return result;
    }

    if (!isFirstTimeBuyer) return result;

    if (info.tax === "SDLT") {
        // First-time buyer relief applies only up to a £500,000 price.
        const reliefBands = rows.filter(row => row.band_relief === "First-time buyer relief");
        const cap = Math.max(...reliefBands.map(row => row.band_to || 0));
        if (price <= cap) {
            result.amount = taxFromBands(price, reliefBands);
            result.relief = "First-time buyer relief applied.";
        } else {
            result.relief = `First-time buyer relief isn't available above £${cap.toLocaleString("en-GB")}.`;
        }
    } else if (info.tax === "LBTT") {
        // The nil-rate band rises for first-time buyers; the other bands stay.
        const nilBand = rows.find(row => row.band_relief.startsWith("First-time buyer relief"));
        if (nilBand) {
            const raised = standard.map(row => ({ ...row }));
            raised[0].band_to = nilBand.band_to;
            raised[1].band_from = Math.max(raised[1].band_from, nilBand.band_to + 1);
            result.amount = taxFromBands(price, raised.filter(row => row.band_to === null || row.band_from <= row.band_to));
            result.relief = "First-time buyer relief applied.";
        }
    } else {
        result.relief = "Wales has no first-time buyer relief on its official rates page.";
    }
    return result;
}


/* ---------- LTV bands and deposits ---------- */

// The LTV ceilings lenders price in, from the rate rows (e.g. 60, 75, 80, 85, 90, 95).
function ltvCeilings(rateRows) {
    return [...new Set(rateRows
        .filter(row => typeof row.ltv_max === "number" && row.ltv_max > 0 && row.ltv_max <= 100)
        .map(row => row.ltv_max))].sort((a, b) => a - b);
}

// Which band the LTV falls in, and the deposit needed to reach the next band down.
function ltvBandFor(ltv, price, ceilings) {
    const band = ceilings.find(ceiling => ltv <= ceiling + 1e-9) ?? null;
    const lower = ceilings.filter(ceiling => ceiling < (band ?? Infinity) && ceiling < ltv).pop();
    // Round to pence before taking the ceiling: 300000 × (1 − 0.85) is 45000.00000000001 in floating point.
    const wholePounds = amount => Math.ceil(Math.round(amount * 100) / 100);
    const next = lower === undefined ? null
        : { ceiling: lower, deposit: wholePounds(price * (1 - lower / 100)), extraDeposit: wholePounds(price * (1 - lower / 100) - price * (1 - ltv / 100)) };
    return { band, next };
}

function depositForLtv(price, ltvPercent) {
    return price * (1 - ltvPercent / 100);
}


/* ---------- What-if scenarios ---------- */

// Each scenario is a label plus a full set of inputs, so the page can run
// calculateMortgage() on it. `customRate` is the user's own "rates rise to" figure.
function whatIfScenarios(inputs, { customRate = null } = {}) {
    const altTerm = inputs.termYears === 35 ? 25 : 35;
    const scenarios = [
        { label: "Your figures", inputs },
        { label: "£10,000 more deposit", inputs: { ...inputs, deposit: inputs.deposit + 10000 } },
        { label: `Rate 1 point higher (${(inputs.ratePercent + 1).toFixed(2)}%)`, inputs: { ...inputs, ratePercent: inputs.ratePercent + 1 } }
    ];
    if (typeof customRate === "number" && Number.isFinite(customRate) && customRate !== inputs.ratePercent + 1) {
        scenarios.push({ label: `Rate at your chosen ${customRate.toFixed(2)}%`, inputs: { ...inputs, ratePercent: customRate } });
    }
    scenarios.push({ label: `${altTerm}-year term`, inputs: { ...inputs, termYears: altTerm } });
    return scenarios;
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        STANDARD_LTI, HIGHEST_LTI, DTI_THRESHOLD, MAINSTREAM_MAX_LTV,
        calculateMonthlyRepayment, calculateInterestOnly, calculateMonthlyPayment, calculateLtv, calculateDti, calculateMortgage,
        stressRate, taxFromBands, calculatePropertyTax, TAX_BY_NATION, ltvCeilings, ltvBandFor, depositForLtv, whatIfScenarios
    };
}
