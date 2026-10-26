/* ==========================================================
   LoanD – personal loans (loans.html)
   Published APR bands from Loan_APR_Tiers for an amount and term.
   Logic is in js/engine/loans.js. Not an offer, and no ranking:
   lenders appear in the order of the research.
   ========================================================== */

const loansBody = document.getElementById("loans-body");

if (loansBody && RESEARCH) {
    const form = document.getElementById("loan-form");
    const today = new Date();
    const tiers = RESEARCH.loan_apr_tiers.filter(isDisplayable);
    const products = RESEARCH.personal_loans.filter(isDisplayable);

    const notPublished = `<span class="muted">Not published</span>`;

    function aprCell(option) {
        const { tier } = option;
        const wording = option.representative
            ? `<strong>${tier.apr}%</strong> <span class="term" data-term="Representative APR">representative APR</span>`
            : `<strong>${tier.apr}%</strong> APR`;
        return `${wording}<span class="est-note">${escapeHtml(tier.apr_type)}; for £${tier.amount_from.toLocaleString("en-GB")} to £${tier.amount_to.toLocaleString("en-GB")}</span>`
            + (option.representative ? `<span class="est-note">At least 51% of accepted applicants get this rate or better. You could be offered a higher rate.</span>` : "");
    }

    function fitCell(option, amount, termMonths) {
        const { product, fit } = option;
        if (!product) return notPublished;
        const parts = [];
        const range = (min, max, format) => (typeof min === "number" && typeof max === "number" ? `${format(min)} to ${format(max)}` : null);
        const amountRange = range(product.min_amount_number, product.max_amount_number, formatPounds);
        const termRange = range(product.min_term_months, product.max_term_months, value => `${value}`);
        parts.push(amountRange ? `Amounts ${amountRange}${fit.amountOk === false ? ` <span class="loan-fit-no">(£${amount.toLocaleString("en-GB")} is outside)</span>` : ""}` : "Amounts not published");
        parts.push(termRange ? `Terms ${termRange} months${fit.termOk === false ? ` <span class="loan-fit-no">(${termMonths} is outside)</span>` : ""}` : "Terms not published");
        if (product.amount_qualifier && !/^not verified$/i.test(product.amount_qualifier)) parts.push(escapeHtml(product.amount_qualifier));
        if (product.customer_requirement) parts.push(escapeHtml(product.customer_requirement));
        return parts.map(part => `<span class="est-note" style="display:block">${part}</span>`).join("");
    }

    function dateBadge(row) {
        const date = row.last_verified;
        if (!date) return "";
        const age = daysBetween(date, today);
        return `Verified ${escapeHtml(formatDate(date))}<br>${age > RATE_STALE_AFTER_DAYS
            ? `<span class="badge badge-stale" title="${age} days ago. Rates may have changed.">May be out of date</span>`
            : `<span class="muted">${age} days ago</span>`}`;
    }

    function rowHtml(option, amount, termMonths) {
        const { tier, product } = option;
        const eligibility = tier.soft_search_eligibility_checker && !/^not verified$/i.test(tier.soft_search_eligibility_checker)
            ? escapeHtml(tier.soft_search_eligibility_checker) : `<span class="muted">Not verified</span>`;
        return `<tr>
            <th scope="row" class="cell-wrap">${escapeHtml(tier.lender_group)}<span class="est-note">${escapeHtml(tier.product)}</span></th>
            <td class="cell-wrap">${aprCell(option)}</td>
            <td class="num">${typeof tier.max_apr === "number" ? tier.max_apr + "%" : notPublished}</td>
            <td class="num">${formatPounds(option.monthly)}<span class="est-note">estimate</span></td>
            <td class="num">${formatPounds(option.totalRepayable)}<span class="est-note">estimate</span></td>
            <td class="cell-wrap">${fitCell(option, amount, termMonths)}</td>
            <td class="cell-wrap">${eligibility}</td>
            <td>${sourceKind(tier.source_id)} ${sourceLinks(tier.source_id)} ${statusBadge(tier.status)}<br>${dateBadge(tier)}</td>
        </tr>`;
    }

    // Products with no matching APR band, so the page says what it couldn't find
    // rather than leaving a lender out silently.
    function otherProducts(options) {
        const matched = new Set(options.map(option => `${option.tier.lender_group}|${option.tier.product}`));
        const unmatched = products.filter(product => !matched.has(`${product.lender_group}|${product.product}`));
        if (!unmatched.length) return "";
        return `<h2 class="section-title">No published APR for this amount</h2>
            <ul class="plain-list">${unmatched.map(product => {
                const hasTiers = tiers.some(tier => tier.lender_group === product.lender_group && tier.product === product.product);
                const reason = product.status === "NOT VERIFIED" ? "Figures not verified in our research."
                    : hasTiers ? "The lender's published APR bands don't cover this amount."
                    : "The lender doesn't publish APR by amount.";
                return `<li><strong>${escapeHtml(product.lender_group)}, ${escapeHtml(product.product)}:</strong> ${reason} ${statusBadge(product.status)} ${sourceLinks(product.source_id)}</li>`;
            }).join("")}</ul>`;
    }

    function render() {
        const amount = form.querySelector("#l-amount").value.trim() === "" ? NaN : Number(form.querySelector("#l-amount").value);
        const termMonths = form.querySelector("#l-term").value.trim() === "" ? NaN : Number(form.querySelector("#l-term").value);
        const problem = document.getElementById("l-problem");
        const count = document.getElementById("loans-count");
        const other = document.getElementById("loans-other");

        if (!(amount > 0) || !(termMonths >= 1 && termMonths <= 120)) {
            problem.textContent = !(amount > 0) ? "Enter the amount you want to borrow." : "Enter a term between 1 and 120 months.";
            loansBody.innerHTML = ""; count.textContent = ""; other.innerHTML = "";
            return;
        }
        problem.textContent = "";

        const options = loanOptions({ tiers, products, amount, termMonths });
        loansBody.innerHTML = options.map(option => rowHtml(option, amount, termMonths)).join("");
        count.textContent = options.length
            ? `${options.length} published APR band${options.length === 1 ? "" : "s"} cover${options.length === 1 ? "s" : ""} ${formatPounds(amount)}.`
            : `No lender in our research publishes an APR band covering ${formatPounds(amount)}.`;
        other.innerHTML = otherProducts(options);
    }

    form.addEventListener("input", render);
    form.addEventListener("submit", event => event.preventDefault());
    render();
} else if (loansBody) {
    loansBody.innerHTML = `<tr><td colspan="8">The research data couldn't be loaded.</td></tr>`;
}
