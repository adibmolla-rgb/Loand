/* ==========================================================
   LoanD – compare lenders (compare.html)
   Up to three lenders side by side. Facts only: no scores,
   no "best", and gaps are shown as "Not verified", never
   as "not offered".
   ========================================================== */

const compareRoot = document.getElementById("compare");

if (compareRoot && RESEARCH) {
    const LENDER_LIST = window.LOAND_LENDERS || [];
    const MAX_SELECTED = 3;
    const picker = document.getElementById("lender-picker");
    const ltvSelect = document.getElementById("compare-ltv");
    const buyerSelect = document.getElementById("compare-buyer");
    let selected = ["hsbc", "barclays", "nationwide"];

    /* ----- One cell: value, status badge and sources ----- */

    function cell(value, { status, sources, note } = {}) {
        if (value === null || value === undefined || value === "" || status === "NOT VERIFIED") {
            return `<span class="muted">Not verified</span>`;
        }
        return `${glossarize(String(value))} ${statusBadge(status)} ${sourceLinks(sources || [])}`
            + (note ? `<span class="cell-note">${glossarize(note)}</span>` : "");
    }

    function cells(rows) {
        if (!rows.length) return `<span class="muted">Not verified</span>`;
        return rows.map(row => `<div class="cell-line">${cell(row.value, row)}</div>`).join("");
    }

    /* ----- Where each row's facts come from ----- */

    function comparison(lender, fieldNames) {
        return RESEARCH.comparison_fields
            .filter(row => (row.lender_group === lender.researchGroup || row.lender_group.startsWith(lender.researchGroup + " ("))
                && fieldNames.includes(row.field) && isDisplayable(row) && row.status !== "NOT VERIFIED")
            .map(row => ({ value: row.value, status: row.status, sources: row.source_id }));
    }

    // Sub-brands with their own criteria (Virgin Money under Nationwide)
    // are left out, so a lender's column only shows its own rules.
    function confirmedRules(lender, type) {
        const subScopes = (lender.subBrands || []).map(sub => sub.brandScope);
        return RESEARCH.rules_numeric.filter(rule =>
            rule.lender_group === lender.researchGroup && rule.rule_type === type && rule.status === "CONFIRMED" &&
            !subScopes.includes(rule.brand_scope));
    }

    // Income multiples: the range across standard rules, plus the highest
    // special route with its condition spelled out.
    function incomeMultiples(lender) {
        const rules = confirmedRules(lender, "max_lti");
        const standard = rules.filter(isGeneralRule);
        const special = rules.filter(rule => !isGeneralRule(rule));
        const lines = [];
        if (standard.length) {
            const values = standard.map(rule => rule.value_numeric);
            const low = Math.min(...values), high = Math.max(...values);
            lines.push({ value: low === high ? `${low}×` : `${low}× to ${high}×, depending on income, LTV and whether you’re buying or remortgaging`, status: "CONFIRMED",
                sources: [...new Set(standard.flatMap(rule => parseSourceIds(rule.source_id)))] });
        }
        const top = special.sort((a, b) => b.value_numeric - a.value_numeric)[0];
        if (top && (!standard.length || top.value_numeric > Math.max(...standard.map(rule => rule.value_numeric)))) {
            lines.push({ value: `Up to ${top.value_numeric}× with conditions: ${top.other_condition}`, status: "CONFIRMED", sources: top.source_id });
        }
        return lines;
    }

    function ruleValue(lender, type, unit) {
        const rules = confirmedRules(lender, type).filter(rule =>
            isGeneralRule(rule) && (rule.repayment_type === "any" || rule.repayment_type === "capital & interest") && (rule.buyer_type === "any" || !rule.buyer_type));
        if (!rules.length) return [];
        const value = type.startsWith("min") ? Math.max(...rules.map(rule => rule.value_numeric)) : Math.min(...rules.map(rule => rule.value_numeric));
        return [{ value: `${value} ${unit}`, status: "CONFIRMED", sources: [...new Set(rules.flatMap(rule => parseSourceIds(rule.source_id)))] }];
    }

    function lowestRate(lender, months) {
        const ltv = Number(ltvSelect.value);
        const buyer = buyerSelect.value;
        const rows = RESEARCH.mortgage_rates.filter(row =>
            (row.lender_group === lender.researchGroup ||
             (lender.rateFilter && row.lender_group === lender.rateFilter.group && row.product.includes(lender.rateFilter.productIncludes))) &&
            isDisplayable(row) && row.status !== "NOT VERIFIED" && row.rate_type === "Fixed" &&
            rateMatchesBuyer(row, buyer) && !SPECIAL_PRODUCT.test(row.product) &&
            row.initial_period_months === months && ltvInBand(ltv, row.ltv_min, row.ltv_max) &&
            !(lender.subBrands || []).some(sub => row.product.startsWith(sub.productPrefix)))
            .sort((a, b) =>
                (isRateAnomalous(a) ? 1 : 0) - (isRateAnomalous(b) ? 1 : 0) ||
                a.initial_rate_number - b.initial_rate_number);
        if (!rows.length) return [];
        const row = rows[0];
        const flagged = isRateAnomalous(row);
        return [{ value: `${row.initial_rate} (${row.product_fee_number === 0 ? "no fee" : row.product_fee + " fee"})`,
            status: row.status, sources: row.source_id,
            note: flagged ? RATE_ANOMALY_NOTE : `Checked ${formatDate(row.date_checked)}` }];
    }

    function personalLoan(lender) {
        const rows = RESEARCH.personal_loans.filter(row => row.lender_group === lender.researchGroup && isDisplayable(row) && row.status !== "NOT VERIFIED");
        return rows.filter(row => row.representative_apr && row.representative_apr !== "Not captured").map(row => ({
            value: `${row.product}: ${row.representative_apr} representative APR (on ${row.rep_apr_band})`, status: row.status, sources: row.source_id
        }));
    }

    /* ----- The rows of the table, in groups ----- */

    const GROUPS = [
        { title: "Borrowing limits", rows: [
            { label: "Maximum LTV", get: lender => [{ value: lender.summary.maxLtv.value, note: lender.summary.maxLtv.detail, sources: lender.summary.maxLtv.sources }], term: "LTV" },
            { label: "Income multiples", get: incomeMultiples, term: "LTI" },
            { label: "Maximum age at end of term", get: lender => ruleValue(lender, "max_age_end_of_term", "years") },
            { label: "Maximum term", get: lender => ruleValue(lender, "max_term_years", "years") },
            { label: "Self-employed: minimum trading", get: lender => comparison(lender, ["Minimum self-employed trading years"]) },
            { label: "Credit history looked at", get: lender => comparison(lender, ["Credit history lookback (max)"]) }
        ]},
        { title: "Rates", dynamic: true, rows: [
            { label: "Lowest 2-year fixed", get: lender => lowestRate(lender, 24) },
            { label: "Lowest 5-year fixed", get: lender => lowestRate(lender, 60) }
        ]},
        { title: "Costs and flexibility", rows: [
            { label: "Product fees", get: lender => comparison(lender, ["Product fee range"]) },
            { label: "Valuation fee", get: lender => comparison(lender, ["Valuation fee"]) },
            { label: "Early repayment charges, 2-year fix", get: lender => comparison(lender, ["ERC structure 2-year fix"]), term: "ERC" },
            { label: "Early repayment charges, 5-year fix", get: lender => comparison(lender, ["ERC structure 5-year fix"]), term: "ERC" },
            { label: "Overpayments each year", get: lender => comparison(lender, ["Overpayment allowance per year", "Overpayment allowance per year (Clydesdale brand)"]) },
            { label: "Can move the deal to a new home", get: lender => comparison(lender, ["Products portable"]), term: "Porting" },
            { label: "Remortgage incentives", get: lender => comparison(lender, ["Remortgage incentives"]) },
            { label: "First-time buyer definition", get: lender => comparison(lender, ["First-time buyer definition"]) }
        ]},
        { title: "Personal loans", rows: [
            { label: "Amounts", get: lender => [{ value: lender.summary.loans.value, note: lender.summary.loans.detail, sources: lender.summary.loans.sources }] },
            { label: "Representative APR", get: personalLoan, term: "Representative APR" }
        ]},
        { title: "Approval", rows: [
            { label: "Approval or acceptance rate", get: () => [{ value: "Not publicly disclosed" }] }
        ]}
    ];

    /* ----- Rendering ----- */

    function renderPicker() {
        picker.innerHTML = LENDER_LIST.map(lender => {
            const checked = selected.includes(lender.id);
            const disabled = !checked && selected.length >= MAX_SELECTED;
            return `<label class="chip${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}">
                <input type="checkbox" value="${lender.id}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
                ${escapeHtml(lender.name)}</label>`;
        }).join("");
        document.getElementById("picker-status").textContent =
            `${selected.length} of ${MAX_SELECTED} selected${selected.length >= MAX_SELECTED ? ". Untick one to choose another." : "."}`;
    }

    function renderTable() {
        const lenders = selected.map(id => LENDER_LIST.find(lender => lender.id === id)).filter(Boolean);
        if (!lenders.length) {
            compareRoot.innerHTML = `<p class="empty">Choose at least one lender to compare.</p>`;
            return;
        }
        const label = row => row.term ? `<span class="term" data-term="${row.term}">${escapeHtml(row.label)}</span>` : escapeHtml(row.label);

        compareRoot.innerHTML = `
            <div class="table-scroll">
                <table class="data-table compare-table">
                    <thead><tr><th scope="col"><span class="visually-hidden">Fact</span></th>
                        ${lenders.map(lender => `<th scope="col"><a href="lender.html?id=${lender.id}">${escapeHtml(lender.name)}</a></th>`).join("")}</tr></thead>
                    ${GROUPS.map(group => `
                        <tbody>
                            <tr class="group-row"><th scope="rowgroup" colspan="${lenders.length + 1}">${escapeHtml(group.title)}${group.dynamic ? ` <span class="group-hint">at up to ${ltvSelect.value}% LTV, ${buyerSelect.value === "first-time buyer" ? "first-time buyers" : "moving home"}</span>` : ""}</th></tr>
                            ${group.rows.map(row => `
                                <tr><th scope="row">${label(row)}</th>
                                    ${lenders.map(lender => `<td>${cells(row.get(lender))}</td>`).join("")}</tr>`).join("")}
                        </tbody>`).join("")}
                </table>
            </div>
            <p class="table-note">"Not verified" means our research couldn't confirm it yet, not that the lender doesn't offer it. Lenders are shown in the order you picked them; nothing is ranked.</p>`;
    }

    picker.addEventListener("change", event => {
        const id = event.target.value;
        selected = event.target.checked ? [...selected, id] : selected.filter(item => item !== id);
        renderPicker();
        renderTable();
    });
    [ltvSelect, buyerSelect].forEach(select => select.addEventListener("change", renderTable));

    renderPicker();
    renderTable();
}
