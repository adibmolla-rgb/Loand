/* ==========================================================
   LoanD – mortgage rates table (rates.html)
   Filter, sort and cost estimate over the Mortgage_Rates sheet.
   The logic is in js/engine/rates.js; this file reads the form and
   draws the table. No ranking: the order is the one the user picks.
   ========================================================== */

const ratesBody = document.getElementById("rates-body");

if (ratesBody && RESEARCH) {
    const form = document.getElementById("rates-form");
    const input = id => document.getElementById(id);
    const PAGE_SIZE = 100;
    let shown = PAGE_SIZE;
    let sort = { key: "lender", direction: "asc" };

    // Today as an ISO date in the visitor's own time zone.
    const today = new Date();

    /* ----- Reading the form ----- */

    function readFigures() {
        const number = id => (input(id).value.trim() === "" ? null : Number(input(id).value));
        const price = number("f-price"), loan = number("f-loan");
        return {
            price, loan,
            ltv: price > 0 && loan !== null && loan >= 0 && loan <= price ? (loan / price) * 100 : null,
            termYears: number("f-term") ?? 25,
            repaymentType: input("f-repayment").value
        };
    }

    function readFilters(figures) {
        return {
            buyerType: input("f-buyer").value, months: input("f-months").value, rateType: input("f-rate-type").value,
            lender: input("f-lender").value, noFeeOnly: input("f-nofee").checked, includeSpecial: input("f-special").checked,
            ltv: figures.ltv, loan: figures.loan
        };
    }

    /* ----- Values used for sorting and display ----- */

    const parsedAprc = row => (typeof row.aprc_number === "number" ? row.aprc_number : null);

    function decorate(row, figures) {
        const cost = figures.loan > 0 ? initialPeriodCost({
            loan: figures.loan, ratePercent: row.initial_rate_number, months: row.initial_period_months,
            fee: row.product_fee_number, repaymentType: figures.repaymentType, termYears: figures.termYears
        }) : null;
        return { row, fresh: rateFreshness(row, today), cost };
    }

    const SORT_VALUES = {
        lender: item => `${item.row.lender_group} ${item.row.product}`,
        rate: item => item.row.initial_rate_number,
        aprc: item => parsedAprc(item.row),
        fee: item => item.row.product_fee_number,
        maxloan: item => item.row.max_loan,
        cost: item => (item.cost ? item.cost.total : null),
        date: item => (item.fresh.date ? new Date(item.fresh.date).getTime() : null)
    };

    /* ----- Drawing ----- */

    const text = value => (value === null || value === undefined || value === "" ? null : String(value));
    const notPublished = `<span class="muted">Not published</span>`;

    function dateCell(item) {
        const { fresh } = item;
        if (!fresh.date) return `<span class="badge badge-stale">No date</span>`;
        const label = fresh.basis === "effective"
            ? `From ${escapeHtml(formatDate(fresh.date))}`
            : `Checked ${escapeHtml(formatDate(fresh.date))}<span class="est-note">The lender's page shows no effective date</span>`;
        return `${label}<br>${fresh.stale
            ? `<span class="badge badge-stale" title="This date is ${fresh.ageDays} days ago. Rates may have changed.">May be out of date</span>`
            : `<span class="muted">${fresh.ageDays} days ago</span>`}`;
    }

    function rowHtml(item) {
        const row = item.row;
        const anomalous = isRateAnomalous(row);
        return `<tr>
            <th scope="row" class="cell-wrap">${escapeHtml(row.lender_group)}<span class="est-note">${escapeHtml(row.product)}${row.initial_period ? " · " + escapeHtml(row.initial_period) : ""}</span>
                <span class="est-note">${escapeHtml(row.rate_type)}, LTV ${escapeHtml(row.ltv_band)}</span></th>
            <td class="num">${escapeHtml(row.initial_rate)}${anomalous ? `<span class="flag" title="${escapeHtml(RATE_ANOMALY_NOTE)}" tabindex="0">check</span>` : ""}</td>
            <td class="num">${text(row.aprc) ? escapeHtml(row.aprc) : notPublished}</td>
            <td class="num">${text(row.product_fee) ? escapeHtml(row.product_fee) : notPublished}</td>
            <td class="num">${typeof row.max_loan === "number" ? formatPounds(row.max_loan) : (text(row.loan_size) ? escapeHtml(row.loan_size) : notPublished)}</td>
            <td class="cell-wrap">${text(row.early_repayment_charge) && !/^(n\/a|not stated|not on rate page)$/i.test(row.early_repayment_charge) ? glossarize(row.early_repayment_charge) : notPublished}</td>
            <td class="cell-wrap">${text(row.incentives) && !/^not stated$/i.test(row.incentives) ? escapeHtml(row.incentives) : notPublished}</td>
            <td class="num">${item.cost ? `${formatPounds(item.cost.total)}<span class="est-note">${formatPounds(item.cost.interest)} interest + ${formatPounds(item.cost.fee)} fee, ${item.cost.months / 12} yrs · estimate</span>` : `<span class="muted">Can't estimate</span>`}</td>
            <td>${dateCell(item)}</td>
            <td>${sourceKind(row.source_id)} ${sourceLinks(row.source_id)} ${statusBadge(row.status)}</td>
        </tr>`;
    }

    function render() {
        const figures = readFigures();
        const filters = readFilters(figures);
        const note = input("f-ltv-note");
        note.textContent = figures.ltv === null
            ? "No loan-to-value filter: enter a property value and a mortgage amount that is no more than it."
            : `Your loan-to-value is ${formatPercent(figures.ltv)}; only products whose range includes it are shown.`;

        const items = filterRates(RESEARCH.mortgage_rates, filters).map(row => decorate(row, figures));
        const sorted = sortRates(items, SORT_VALUES[sort.key], sort.direction);
        const visible = sorted.slice(0, shown);

        ratesBody.innerHTML = visible.map(rowHtml).join("");
        input("rates-count").textContent = items.length
            ? `${items.length} product${items.length === 1 ? "" : "s"} match${items.length === 1 ? "es" : ""}${items.length > visible.length ? `, showing ${visible.length}` : ""}.`
            : "No products in our research match these filters. Try widening them.";
        const more = input("rates-more");
        more.hidden = items.length <= visible.length;
        more.textContent = `Show ${Math.min(PAGE_SIZE, items.length - visible.length)} more`;

        document.querySelectorAll("#rates-table thead th[data-sort]").forEach(th =>
            th.setAttribute("aria-sort", th.dataset.sort === sort.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"));

        const stale = items.filter(item => item.fresh.stale).length;
        input("rates-freshness").textContent = items.length && stale
            ? `${stale} of these ${items.length} rates are more than ${RATE_STALE_AFTER_DAYS} days past the date their lender's sheet shows (today is ${formatDate(today.toISOString().slice(0, 10))}). The research was gathered on ${formatDate(RESEARCH.meta.data_as_at)}, so check each lender's current sheet before relying on a rate.`
            : "";
        input("rates-freshness").hidden = !input("rates-freshness").textContent;
    }

    /* ----- Wiring ----- */

    const lenders = [...new Set(RESEARCH.mortgage_rates.filter(isDisplayable).map(row => row.lender_group))].sort();
    input("f-lender").insertAdjacentHTML("beforeend", lenders.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(""));

    form.addEventListener("input", () => { shown = PAGE_SIZE; render(); });
    form.addEventListener("submit", event => event.preventDefault());
    input("rates-more").addEventListener("click", () => { shown += PAGE_SIZE; render(); });
    document.querySelectorAll("#rates-table thead th[data-sort] .sort-button").forEach(button => {
        button.addEventListener("click", () => {
            const key = button.closest("th").dataset.sort;
            sort = { key, direction: sort.key === key && sort.direction === "asc" ? "desc" : "asc" };
            render();
        });
    });

    render();
} else if (ratesBody) {
    ratesBody.innerHTML = `<tr><td colspan="10">The research data couldn't be loaded.</td></tr>`;
}
