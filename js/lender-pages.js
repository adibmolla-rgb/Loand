/* ==========================================================
   LoanD – lenders (lenders.html and lender.html)
   Every profile is built from the same template, so all
   lenders share one layout and the same section order.
   ========================================================== */

const LENDERS = window.LOAND_LENDERS || [];
const NOT_CAPTURED = "Not captured in this research pass.";


/* ---------- Finding a lender's research rows ---------- */

function rowsFor(sheet, lender) {
    if (!RESEARCH) return [];
    return RESEARCH[sheet].filter(row => row.lender_group === lender.researchGroup && isDisplayable(row));
}

function ratesFor(lender) {
    return RESEARCH.mortgage_rates.filter(row =>
        row.lender_group === lender.researchGroup ||
        (lender.rateFilter && row.lender_group === lender.rateFilter.group &&
         row.product.includes(lender.rateFilter.productIncludes)));
}

function overviewRowsFor(lender) {
    return RESEARCH.lender_overview.filter(row => lender.brands.includes(row.lender));
}

// Brand rows like "Yes - Family Springboard, 95% LTV (S10)" become
// { value: "Available", detail: "Family Springboard, 95% LTV", sources: ["S10"] }.
function parseOverviewField(text) {
    const raw = String(text || "Not verified");
    const sources = raw.match(/\bS\d+\b/g) || [];
    let clean = raw.replace(/,?\s*\bS\d+\b/g, "").replace(/\(\s*\)/g, "").trim();
    if (!/^Yes\b/.test(clean)) return { value: clean, detail: "", sources };
    let detail = clean.replace(/^Yes\s*(-\s*)?/, "").replace(/^\((.*)\)$/, "$1").trim();
    if (detail) detail = detail.charAt(0).toUpperCase() + detail.slice(1);
    return { value: "Available", detail, sources };
}

// For multi-brand groups, prefer the brand row with the most detail.
function overviewField(lender, field) {
    const rows = overviewRowsFor(lender);
    const detailed = rows.find(row => /^Yes\s*-/.test(row[field] || ""));
    return parseOverviewField((detailed || rows[0] || {})[field]);
}


/* ---------- Small rendering helpers ---------- */

function tile(label, fact) {
    return `
        <div class="tile">
            <p class="tile-label">${escapeHtml(label)}</p>
            <p class="tile-value">${escapeHtml(fact.value)}${fact.value.startsWith("Up to") ? "*" : ""}</p>
            ${fact.detail ? `<p class="tile-detail">${glossarize(fact.detail)}</p>` : ""}
            ${fact.sources && fact.sources.length ? `<p class="tile-sources">${sourceLinks(fact.sources)}</p>` : ""}
        </div>`;
}

// One criterion: title on the left, value on the right, sources underneath.
function factItem(title, value, { status, sources, notes, meta } = {}) {
    return `
        <li class="fact">
            <p class="fact-title">${glossarize(title)}</p>
            <div class="fact-body">
                <p class="fact-value">${glossarize(value)} ${statusBadge(status)}</p>
                ${notes ? `<p class="fact-note">${glossarize(notes)}</p>` : ""}
                <p class="fact-meta">${meta ? escapeHtml(meta) + " " : ""}${sourceLinks(sources)}</p>
            </div>
        </li>`;
}

function factList(items) {
    return items.length ? `<ul class="fact-list">${items.join("")}</ul>` : `<p class="empty">${NOT_CAPTURED}</p>`;
}

function accordion(title, body, count) {
    const label = count === undefined ? title : `${title} <span class="count">${count}</span>`;
    return `<details><summary>${label}</summary><div class="accordion-body">${body}</div></details>`;
}


/* ---------- Profile sections (same order for every lender) ---------- */

function sectionRequirements(lender) {
    const rows = rowsFor("mortgage_requirements", lender);
    if (!rows.length) return accordion("Mortgage requirements", `<p class="empty">${NOT_CAPTURED}</p>`, 0);

    const categories = [...new Set(rows.map(row => row.category))];
    const body = categories.map(category => `
        <h3 class="group-heading">${escapeHtml(category)}</h3>
        ${factList(rows.filter(row => row.category === category).map(row =>
            factItem(row.criterion, row.value, {
                status: row.status,
                sources: row.source_id,
                meta: row.brand_scope && row.brand_scope !== lender.researchGroup ? `Applies to: ${row.brand_scope}.` : ""
            })))}`).join("");

    const intermediary = rows.some(row => row.channel === "Intermediary");
    const channelNote = intermediary
        ? `<p class="section-note">Most of these criteria come from the lender's guides for mortgage brokers. Applying directly can differ.</p>` : "";
    return accordion("Mortgage requirements", channelNote + body, rows.length);
}

function sectionAffordability(lender) {
    const rows = rowsFor("affordability", lender);
    const stress = RESEARCH.stress_and_benchmarks.filter(row => row.lender_scope === lender.researchGroup);
    const items = rows.map(row => factItem(row.criterion, row.value, { status: row.status, sources: row.source_id, notes: row.notes }))
        .concat(stress.map(row => factItem(row.item, row.detail, { status: row.status, sources: row.source_id })));
    return accordion("Income multiples and affordability", factList(items), items.length);
}

function rateTable(rows) {
    return `
        <div class="table-scroll">
            <table class="data-table">
                <thead><tr>
                    <th scope="col">Product</th><th scope="col">For</th><th scope="col"><span class="term" data-term="LTV">LTV</span> band</th>
                    <th scope="col">Initial rate</th><th scope="col"><span class="term" data-term="APRC">APRC</span></th>
                    <th scope="col">Product fee</th><th scope="col"><span class="term" data-term="ERC">ERC</span></th><th scope="col">Source</th>
                </tr></thead>
                <tbody>${rows.map(row => `
                    <tr>
                        <td>${glossarize(row.product)}</td>
                        <td>${escapeHtml(row.buyer_type || row.purpose)}</td>
                        <td>${escapeHtml(row.ltv_band)}</td>
                        <td class="num">${glossarize(row.initial_rate)}</td>
                        <td class="num">${escapeHtml(row.aprc)}</td>
                        <td class="num">${escapeHtml(row.product_fee)}</td>
                        <td>${escapeHtml(row.early_repayment_charge)}</td>
                        <td>${sourceLinks(row.source_id)} ${statusBadge(row.status)}</td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
}

// Lowest initial rate for each LTV band (rows) and deal type (columns).
function rateMatrix(rows) {
    const usable = rows.filter(row => typeof row.ltv_max === "number" && typeof row.initial_rate_number === "number" && !SPECIAL_PRODUCT.test(row.product));
    if (!usable.length) return "";
    const columnKey = row => `${row.initial_period_months || 0}|${row.rate_type}`;
    const columns = [...new Set(usable.map(columnKey))].sort((a, b) => {
        const [ma, ta] = a.split("|"), [mb, tb] = b.split("|");
        return Number(ma) - Number(mb) || ta.localeCompare(tb);
    });
    const bands = [...new Set(usable.map(row => row.ltv_max))].sort((a, b) => a - b);
    const lowest = (band, column) => usable
        .filter(row => row.ltv_max === band && columnKey(row) === column)
        .sort((a, b) => a.initial_rate_number - b.initial_rate_number)[0];
    const label = column => {
        const [months, type] = column.split("|");
        return `${Number(months) ? Number(months) / 12 + "-year " : ""}${type.toLowerCase()}`;
    };

    return `
        <div class="table-scroll">
            <table class="data-table rate-matrix">
                <thead><tr><th scope="col">Up to <span class="term" data-term="LTV">LTV</span></th>
                    ${columns.map(column => `<th scope="col">${escapeHtml(label(column))}</th>`).join("")}</tr></thead>
                <tbody>${bands.map(band => `
                    <tr><th scope="row">${band}%</th>
                        ${columns.map(column => {
                            const row = lowest(band, column);
                            return row
                                ? `<td class="num">${escapeHtml(row.initial_rate)}${isRateAnomalous(row) ? '<span class="flag" title="' + escapeHtml(RATE_ANOMALY_NOTE) + '" tabindex="0">check</span>' : ""}<span class="cell-note">${row.product_fee_number === 0 ? "No fee" : escapeHtml(row.product_fee) + " fee"}</span></td>`
                                : `<td class="muted">–</td>`;
                        }).join("")}
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
}

const SEGMENTS = [
    { label: "First-time buyers", test: row => row.buyer_type === "First-time buyer" },
    { label: "Moving home", test: row => row.buyer_type === "Home mover / purchase" },
    { label: "Buying a home", test: row => row.buyer_type === "Purchase" || row.buyer_type === "Purchase (segment not disambiguated)" },
    { label: "Remortgaging", test: row => row.buyer_type === "Remortgage" || row.purpose === "Remortgage" }
];

function sectionRates(lender) {
    const all = ratesFor(lender).filter(row => isDisplayable(row));
    const reversion = all.filter(row => row.buyer_type === "Reversion" || row.rate_type === "SVR");
    const products = all.filter(row => !reversion.includes(row) && row.purpose !== "Buy-to-let purchase");
    if (!all.length) return accordion("Mortgage rates", `<p class="empty">${NOT_CAPTURED}</p>`, 0);

    // Split sub-brands (e.g. Virgin Money) so each keeps its own rates.
    const brands = [{ name: lender.name, rows: products.filter(row => !(lender.subBrands || []).some(sub => row.product.startsWith(sub.productPrefix))) }]
        .concat((lender.subBrands || []).map(sub => ({ name: sub.name, rows: products.filter(row => row.product.startsWith(sub.productPrefix)) })))
        .filter(brand => brand.rows.length);

    const oldest = products.map(row => row.date_checked).sort()[0] || all[0].date_checked;
    const stale = daysSince(oldest) > RATE_STALE_AFTER_DAYS;
    const official = products.length && products.every(row => (findSource(parseSourceIds(row.source_id)[0]) || {}).source_type?.startsWith("Official"));
    const effective = [...new Set(products.map(row => row.effective_date).filter(Boolean))].map(formatDate);
    const intro = `
        <p class="${stale ? "note note-caution" : "section-note"}">
            Checked ${formatDate(oldest)}${stale ? ", over a week ago, so these may have changed or been withdrawn" : ""}.
            ${official ? `From the lender's official rate sheets${effective.length ? ` (in effect from ${effective.join(", ")})` : ""}.` : "Includes a third-party broker snapshot, so check with the lender."}
            ${sourceLinks([...new Set(products.flatMap(row => parseSourceIds(row.source_id)))])}
            A snapshot, not live rates. The tables show the lowest initial rate for each <span class="term" data-term="LTV">LTV</span> band and deal type; products only for specific groups (such as Premier or shared ownership) are left out.
        </p>`;

    const anomalyNote = products.some(isRateAnomalous)
        ? `<p class="note note-caution">Some rates below are marked <span class="flag">check</span>: they undercut this lender's own rates at smaller loan-to-values, which is unlikely. ${escapeHtml(RATE_ANOMALY_NOTE.split(". ").slice(1).join(". "))}</p>`
        : "";

    const matrices = brands.map(brand => SEGMENTS.map(segment => {
        const rows = brand.rows.filter(segment.test);
        const matrix = rateMatrix(rows);
        if (!matrix) return "";
        return `<h3 class="group-heading">${brands.length > 1 ? escapeHtml(brand.name) + ": " : ""}${segment.label}</h3>${matrix}`;
    }).join("")).join("");

    const reversionText = reversion.length ? `
        <h3 class="group-heading">Rate after the deal ends</h3>
        ${factList(reversion.map(row => factItem(row.product, row.initial_rate, { status: row.status, sources: row.source_id })))}` : "";

    // The full list can run to hundreds of rows, so it's only built when opened.
    const fullList = `
        <details class="full-list" data-full-rates="${lender.id}">
            <summary>Show every product (${products.length})</summary>
            <div class="full-list-body"></div>
        </details>`;

    return accordion("Mortgage rates", intro + anomalyNote + matrices + reversionText + fullList, products.length);
}

function setUpFullRateLists(lender) {
    document.querySelectorAll("[data-full-rates]").forEach(details => {
        details.addEventListener("toggle", () => {
            const body = details.querySelector(".full-list-body");
            if (!details.open || body.childElementCount) return;
            const rows = ratesFor(lender).filter(row => isDisplayable(row) && row.buyer_type !== "Reversion" && row.rate_type !== "SVR")
                .sort((a, b) => (a.initial_period_months || 0) - (b.initial_period_months || 0) || (a.ltv_max || 0) - (b.ltv_max || 0) || (a.initial_rate_number || 0) - (b.initial_rate_number || 0));
            body.innerHTML = rateTable(rows);
        });
    });
}

function comparisonRowsFor(lender) {
    return RESEARCH.comparison_fields.filter(row =>
        (row.lender_group === lender.researchGroup || row.lender_group.startsWith(lender.researchGroup + " (")) && isDisplayable(row));
}

function sectionKeyFacts(lender) {
    const rows = comparisonRowsFor(lender).filter(row => row.status !== "NOT VERIFIED");
    const missing = comparisonRowsFor(lender).filter(row => row.status === "NOT VERIFIED").map(row => row.field);
    const note = missing.length ? `<p class="section-note">Not yet verified: ${escapeHtml(missing.join(", ").toLowerCase())}.</p>` : "";
    return accordion("Key facts for comparing", factList(rows.map(row =>
        factItem(row.field, row.value, { status: row.status, sources: row.source_id, notes: row.notes }))) + note, rows.length);
}

function sectionFirstTimeBuyers(lender) {
    const summary = overviewField(lender, "first_time_buyer_support");
    const keywords = lender.schemeKeywords || [];
    const schemes = RESEARCH.support_schemes.filter(row =>
        isDisplayable(row) && keywords.some(word => row.scheme_product.includes(word)));
    const items = schemes.map(row => factItem(row.scheme_product, row.description, {
        status: row.data_status, sources: row.source_id, notes: row.key_limits && row.key_limits !== "n/a" ? `Limits: ${row.key_limits}` : ""
    }));
    const lead = summary.value === "Available" && summary.detail
        ? `<p>${glossarize(summary.detail)}. ${sourceLinks(summary.sources)}</p>` : "";
    const list = items.length ? factList(items) : (lead ? "" : factList([]));
    return accordion("First-time buyer options", lead + list, items.length);
}

function sectionSimple(title, sheet, lender, labelKey, valueKey) {
    const rows = rowsFor(sheet, lender);
    return accordion(title, factList(rows.map(row => factItem(row[labelKey], row[valueKey], {
        status: row.status, sources: row.source_id, notes: row.notes
    }))), rows.length);
}

function sectionCredit(lender) {
    const rows = rowsFor("credit_requirements", lender);
    const items = rows.map(row => factItem(row.criterion, row.value, {
        status: row.status, sources: row.source_id, notes: row.notes, meta: row.product_line + "."
    }));
    const universal = RESEARCH.credit_requirements.find(row => row.criterion === "Minimum credit score");
    const lead = universal ? `<p class="section-note">${glossarize(universal.value)}. ${sourceLinks(universal.source_id)}</p>` : "";
    return accordion("Credit history", lead + factList(items), rows.length);
}

function sectionFees(lender) {
    const rows = rowsFor("fees_charges", lender);
    return accordion("Fees and charges", factList(rows.map(row =>
        factItem(row.fee_type, row.value, { status: row.status, sources: row.source_id, meta: row.product_line + "." }))), rows.length);
}

function sectionFlexibility(lender) {
    const rows = rowsFor("flexibility", lender);
    return accordion("Overpayments and flexibility", factList(rows.map(row =>
        factItem(row.feature, row.detail, { status: row.status, sources: row.source_id, meta: row.product_line + "." }))), rows.length);
}

// APR by amount borrowed (Loan_APR_Tiers sheet), when the lender publishes it.
function aprTiers(lender, product) {
    const tiers = RESEARCH.loan_apr_tiers.filter(row =>
        row.lender_group === lender.researchGroup && row.product === product && isDisplayable(row) && typeof row.apr === "number");
    if (tiers.length < 2) return "";
    return `
        <p class="group-heading">APR by amount</p>
        <div class="table-scroll">
            <table class="data-table">
                <thead><tr><th scope="col">Borrowing</th><th scope="col"><span class="term" data-term="APR">APR</span></th><th scope="col">Type</th></tr></thead>
                <tbody>${tiers.map(row => `<tr>
                    <td>${formatPounds(row.amount_from)} – ${formatPounds(row.amount_to)}</td>
                    <td class="num">${row.apr}%</td>
                    <td>${escapeHtml(row.apr_type)}</td></tr>`).join("")}</tbody>
            </table>
        </div>`;
}

function sectionLoans(lender) {
    const rows = rowsFor("personal_loans", lender);
    if (!rows.length) return accordion("Personal loans", `<p class="empty">${NOT_CAPTURED}</p>`, 0);

    const cards = rows.map(row => {
        const details = [
            ["Amount", `${row.min_amount} – ${row.max_amount}`],
            ["Term", row.term],
            ["Representative APR", row.rep_apr_band && row.rep_apr_band !== "Not verified" ? `${row.representative_apr} (on ${row.rep_apr_band})` : row.representative_apr],
            ["Maximum APR", row.max_apr],
            ["Minimum age", row.age],
            ["Income", row.minimum_income],
            ["Who can apply", [row.residency, row.customer_requirement].filter(Boolean).join(". ")],
            ["Eligibility check", row.eligibility_checker_search],
            ["Paying off early", row.overpayment_early_repayment],
            ["Fees", row.fees]
        ].filter(([, value]) => value && value !== "Not verified" && value !== "Not verified – Not verified");

        return `
            <div class="loan-card">
                <h3 class="group-heading">${escapeHtml(row.product)} ${statusBadge(row.status)}</h3>
                ${details.length ? `<dl class="detail-list">${details.map(([label, value]) =>
                    `<div><dt>${label === "Representative APR" ? '<span class="term" data-term="Representative APR">Representative APR</span>' : escapeHtml(label)}</dt><dd>${glossarize(value)}</dd></div>`).join("")}</dl>`
                    : `<p class="empty">Details not verified in this research pass.</p>`}
                ${row.notes ? `<p class="fact-note">${glossarize(row.notes)}</p>` : ""}
                ${aprTiers(lender, row.product)}
                <p class="fact-meta">${sourceLinks(row.source_id)}</p>
            </div>`;
    }).join("");

    const note = `<p class="section-note">The representative APR is what at least 51% of accepted applicants get. It is not an approval rate.</p>`;
    return accordion("Personal loans", note + cards, rows.length);
}

function sectionSources(lender, profileHtml) {
    const conflicts = RESEARCH.conflicts.filter(row => row.lender === lender.researchGroup);
    const conflictHtml = conflicts.length ? `
        <h3 class="group-heading">Conflicting information</h3>
        <p class="section-note">Where sources disagreed, both versions were recorded. Unresolved items should be confirmed with the lender.</p>
        ${factList(conflicts.map(row => factItem(row.data_point,
            `${row.version_a}. Alternative: ${row.version_b}.`,
            { notes: row.updated_resolution || row.resolution, sources: [row.source_ids, row.resolution_source_id].filter(Boolean).join(";") })))}` : "";

    // Every source ID that appears anywhere on this profile.
    const ids = [...new Set((profileHtml.match(/>S\d+</g) || []).map(match => match.slice(1, -1)))]
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const sources = ids.map(findSource).filter(Boolean);
    const sourceHtml = `
        <h3 class="group-heading">Sources used on this page</h3>
        <ul class="source-list">${sources.map(source => `
            <li>
                <span class="source-id">${escapeHtml(source.source_id)}</span>
                <div>
                    ${isSafeUrl(source.source_url)
                        ? `<a href="${escapeHtml(source.source_url)}" target="_blank" rel="noopener">${escapeHtml(source.source_title)}</a>`
                        : escapeHtml(source.source_title)}
                    <p class="fact-meta">${source.source_status === "OUTDATED" ? "<strong>Superseded source, kept for the record.</strong> " : ""}${escapeHtml(source.source_type)}. Published: ${escapeHtml(formatDate(source.publication_update_date))}. Accessed: ${escapeHtml(formatDate(source.date_accessed))}. Confidence: ${escapeHtml(source.confidence)}.</p>
                </div>
            </li>`).join("")}
        </ul>`;

    return accordion("Sources and data notes", conflictHtml + sourceHtml, sources.length);
}


/* ---------- Lender profile page ---------- */

function renderProfile(container) {
    const id = new URLSearchParams(window.location.search).get("id");
    const lender = LENDERS.find(item => item.id === id);

    if (!lender || !RESEARCH) {
        container.innerHTML = `
            <h1>Lender not found</h1>
            <p class="hero-text">We couldn't find that lender. <a href="lenders.html">See all lenders</a>.</p>`;
        return;
    }

    document.title = `${lender.name} | LoanD`;
    const primary = overviewRowsFor(lender)[0] || {};
    const approval = RESEARCH.approval_rates.find(row => row.lender_scope === lender.researchGroup);

    const sections = [
        sectionKeyFacts(lender),
        sectionRequirements(lender),
        sectionAffordability(lender),
        sectionRates(lender),
        sectionFirstTimeBuyers(lender),
        sectionSimple("Remortgaging", "remortgage", lender, "item", "value"),
        sectionCredit(lender),
        sectionFees(lender),
        sectionFlexibility(lender),
        sectionLoans(lender)
    ].join("");

    const header = `
        <a href="lenders.html" class="back-link">All lenders</a>
        <h1>${escapeHtml(lender.name)}</h1>
        <p class="hero-text">${escapeHtml(primary.institution_type || "")}${primary.parent_group ? `, part of ${escapeHtml(primary.parent_group)}` : ""}.
            ${lender.brands.length > 1 ? `Covers ${escapeHtml(lender.brands.join(", "))}.` : ""}</p>
        ${lender.notice ? `<p class="notice">${escapeHtml(lender.notice.text)} ${sourceLinks(lender.notice.sources)}</p>` : ""}

        <div class="tile-grid">
            ${tile("Maximum LTV", lender.summary.maxLtv)}
            ${tile("Personal loans", lender.summary.loans)}
            ${tile("First-time buyers", overviewField(lender, "first_time_buyer_support"))}
            ${tile("Remortgaging", overviewField(lender, "remortgage"))}
        </div>
        <p class="tile-footnote">*Subject to product and applicant eligibility. <span class="term" data-term="LTV">LTV</span> means loan-to-value.</p>

        <p class="approval-line"><strong>Approval or acceptance rate:</strong>
            ${escapeHtml(approval ? approval.figure : "Not publicly disclosed")}.
            No lender we reviewed publishes one, and LoanD doesn't estimate it.</p>

        <div class="profile-meta">
            <p>Research coverage: <strong>${escapeHtml(primary.research_depth || "Not recorded")}</strong>. Last verified ${formatDate(RESEARCH.meta.data_as_at)}.</p>
            <details class="how-to-read">
                <summary>How to read this page</summary>
                <div class="accordion-body">
                    <p>Facts without a label are confirmed by an official source. Other facts carry a label:</p>
                    <ul class="legend">${RESEARCH.status_definitions
                        .filter(row => !["CONFIRMED", "OUTDATED"].includes(row.status))
                        .map(row => `<li>${statusBadge(row.status)} ${escapeHtml(row.definition)}</li>`).join("")}</ul>
                    <p>Links like ${sourceLinks(["S13"])} open the original source.</p>
                </div>
            </details>
        </div>

        <h2 class="section-title">Detailed criteria</h2>`;

    container.innerHTML = header +
        `<div class="accordion">${sections}${sectionSources(lender, header + sections)}</div>`;
    setUpFullRateLists(lender);
}


/* ---------- Lender directory page ---------- */

function renderDirectory(container) {
    if (!RESEARCH) { container.innerHTML = `<p class="empty">Lender data couldn't be loaded.</p>`; return; }

    const cards = LENDERS.map(lender => {
        const primary = overviewRowsFor(lender)[0] || {};
        return `
            <li>
                <a class="lender-card" href="lender.html?id=${lender.id}">
                    <h3>${escapeHtml(lender.name)}</h3>
                    <p class="lender-type">${escapeHtml(primary.institution_type || "")}${lender.brands.length > 1 ? `. Includes ${escapeHtml(lender.brands.slice(1).join(", "))}` : ""}</p>
                    <dl class="lender-facts">
                        <div><dt><span class="term" data-term="LTV">Max LTV</span></dt><dd>${escapeHtml(lender.summary.maxLtv.value)}</dd></div>
                        <div><dt>Personal loans</dt><dd>${escapeHtml(lender.summary.loans.value)}</dd></div>
                    </dl>
                    <p class="lender-coverage">Research coverage: ${escapeHtml(primary.research_depth || "Not recorded")}</p>
                </a>
            </li>`;
    }).join("");

    const pending = (window.LOAND_LENDERS_PENDING || []).map(name =>
        RESEARCH.lender_overview.find(row => row.lender === name)).filter(Boolean);

    container.innerHTML = `
        <ul class="lender-grid">${cards}</ul>
        <p class="tile-footnote">Maximum LTV is subject to product and applicant eligibility. Lenders are listed in research order, not ranked.</p>

        <div class="accordion pending">
            <details>
                <summary>Lenders not yet researched in detail <span class="count">${pending.length}</span></summary>
                <div class="accordion-body">
                    <p class="section-note">These lenders are in our list, but their criteria couldn't be captured in this research pass.</p>
                    ${factList(pending.map(row => factItem(row.lender, row.why_included, { notes: row.notes, meta: row.institution_type + "." })))}
                </div>
            </details>
        </div>`;
}


/* ---------- Start ---------- */

const profileContainer = document.getElementById("lender-profile");
const directoryContainer = document.getElementById("lender-directory");
if (profileContainer) renderProfile(profileContainer);
if (directoryContainer) renderDirectory(directoryContainer);
