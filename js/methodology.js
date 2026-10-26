/* ==========================================================
   LoanD – Data & methodology (methodology.html)
   Everything factual on this page (release date, counts, status
   definitions, conflicts, notes, what isn't disclosed) is read
   from the research data, so it can't drift from it.
   ========================================================== */

const methodRoot = document.getElementById("method-release");

if (methodRoot && RESEARCH) {
    const put = (id, html) => { const element = document.getElementById(id); if (element) element.innerHTML = html; };
    const count = (rows, test) => rows.filter(test).length;
    const STATUS_ORDER = ["CONFIRMED", "SUPPORTED", "UNCONFIRMED", "NOT DISCLOSED", "NOT VERIFIED", "OUTDATED"];
    const statusOf = row => row.status || row.data_status;

    /* ----- Release ----- */
    const releaseDate = formatDate(RESEARCH.meta.data_as_at);
    const sheetCount = Object.keys(RESEARCH).filter(key => Array.isArray(RESEARCH[key])).length;
    const rateRows = RESEARCH.mortgage_rates;
    const effective = rateRows.map(row => row.effective_date).filter(Boolean).sort();
    put("method-release", `
        <dl class="stat-grid">
            <div><dt>Research release</dt><dd>${escapeHtml(releaseDate)}</dd></div>
            <div><dt>Source documents</dt><dd>${RESEARCH.sources.length}</dd></div>
            <div><dt>Published rules</dt><dd>${RESEARCH.rules_numeric.length}</dd></div>
            <div><dt>Mortgage rate rows</dt><dd>${rateRows.length}</dd></div>
        </dl>
        <p>Rates on this site are those in the lenders' own rate sheets (or, where none could be retrieved, a broker's published list), as researched on ${escapeHtml(releaseDate)}.
        The rate sheets in this release carry effective dates from ${escapeHtml(formatDate(effective[0]))} to ${escapeHtml(formatDate(effective[effective.length - 1]))}.
        Any rate more than ${RATE_STALE_AFTER_DAYS} days past its date is marked <span class="badge badge-stale">May be out of date</span>, so after a week every rate on the site will carry the badge until the research is refreshed. That is deliberate.</p>`);

    /* ----- Status definitions, and what the site does with each ----- */
    const USE = {
        "CONFIRMED": "Used. This is the only status that decides whether your figures fall within a lender's published limits.",
        "SUPPORTED": "Shown with a badge, and listed as “check with the lender”. Never used on its own to judge your figures.",
        "UNCONFIRMED": "Shown with a badge, and listed as “check with the lender”. Never used to judge your figures.",
        "NOT DISCLOSED": "Shown as not published. The lender doesn't make it public, so nothing is estimated in its place.",
        "NOT VERIFIED": "Shown as not verified. It means we couldn't retrieve it, not that the lender doesn't offer it.",
        "OUTDATED": "Kept in the research for the audit trail and left out of every view on this site."
    };
    const definitions = Object.fromEntries(RESEARCH.status_definitions.map(row => [row.status, row.definition]));
    put("method-statuses", `<div class="table-scroll"><table class="data-table">
        <thead><tr><th scope="col">Status</th><th scope="col">What it means</th><th scope="col">What this site does with it</th></tr></thead>
        <tbody>${STATUS_ORDER.map(status => `<tr><th scope="row">${escapeHtml(status)}</th><td>${escapeHtml(definitions[status] || "")}</td><td>${escapeHtml(USE[status])}</td></tr>`).join("")}</tbody>
    </table></div>`);

    /* ----- Counts by dataset and status ----- */
    const DATASETS = [
        ["Mortgage rates", RESEARCH.mortgage_rates], ["Published numeric rules", RESEARCH.rules_numeric],
        ["Mortgage criteria (text)", RESEARCH.mortgage_requirements], ["Comparison fields", RESEARCH.comparison_fields],
        ["Personal loans", RESEARCH.personal_loans], ["Personal loan APR bands", RESEARCH.loan_apr_tiers],
        ["Property taxes", RESEARCH.property_taxes], ["Affordability benchmarks", RESEARCH.stress_and_benchmarks],
        ["Historical series (Bank of England)", RESEARCH.time_series]
    ];
    put("method-counts", `<div class="table-scroll"><table class="data-table">
        <thead><tr><th scope="col">Dataset</th><th scope="col">Rows</th>${STATUS_ORDER.map(status => `<th scope="col">${escapeHtml(status)}</th>`).join("")}</tr></thead>
        <tbody>${DATASETS.map(([name, rows]) => `<tr><th scope="row">${escapeHtml(name)}</th><td class="num">${rows.length}</td>${STATUS_ORDER.map(status => {
            const n = count(rows, row => statusOf(row) === status);
            return `<td class="num">${n || "–"}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <p class="table-note">Counts are rows in the research workbook, not numbers of lenders or approvals.</p>`);

    /* ----- Sources ----- */
    const kinds = {};
    RESEARCH.sources.forEach(source => { const kind = sourceKind([source.source_id]); kinds[kind] = (kinds[kind] || 0) + 1; });
    const superseded = RESEARCH.sources.filter(source => source.source_status === "OUTDATED");
    put("method-sources", `<ul class="plain-list">${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `<li><strong>${escapeHtml(kind)}:</strong> ${n} source${n === 1 ? "" : "s"}</li>`).join("")}</ul>
        ${superseded.length ? `<p>Superseded sources kept for the record: ${superseded.map(source => `${escapeHtml(source.source_id)} (${escapeHtml(source.source_title)})`).join("; ")}.</p>` : ""}
        <p>“Official” covers lender websites, lender rate sheets and criteria documents, and intermediary documents the lender publishes. Where only a broker's list was available, the row is labelled “Third-party” and is no stronger than SUPPORTED.</p>`);

    /* ----- Gaps: the lenders' own non-disclosure, and our notes ----- */
    const notDisclosed = [...RESEARCH.approval_rates, ...RESEARCH.stress_and_benchmarks, ...RESEARCH.credit_requirements]
        .filter(row => statusOf(row) === "NOT DISCLOSED");
    const notVerifiedLoans = RESEARCH.personal_loans.filter(row => row.status === "NOT VERIFIED");
    put("method-gaps", `
        <p>${notDisclosed.length} items in the research are marked NOT DISCLOSED: the lender doesn't publish them, and nothing here estimates them. This includes approval and acceptance rates and minimum credit scores. A representative APR is the rate at least 51% of accepted applicants get; it is not an approval rate.</p>
        <p>${notVerifiedLoans.length} personal loan products (${notVerifiedLoans.map(row => escapeHtml(row.product)).join(", ")}) could not be verified in this release.</p>
        <details class="accordion-block"><summary>Notes the researchers recorded for each sheet</summary>
            <ul class="plain-list">${RESEARCH.sheet_notes.map(row => `<li><strong>${escapeHtml(row.sheet.replace(/_/g, " "))}:</strong> ${glossarize(row.note)}</li>`).join("")}</ul>
        </details>`);

    /* ----- Conflicts ----- */
    const resolution = row => row.updated_resolution || row.resolution || "";
    const open = RESEARCH.conflicts.filter(row => /^unresolved/i.test(resolution(row)));
    const conflictRow = row => `<tr><th scope="row">${escapeHtml(row.conflict_id)}</th><td>${escapeHtml(row.lender)}</td><td>${escapeHtml(row.data_point)}</td>
        <td>${glossarize(row.version_a)}<br>${glossarize(row.version_b)}</td><td>${glossarize(resolution(row))} ${sourceLinks(row.resolution_source_id || row.source_ids)}</td></tr>`;
    const table = rows => `<div class="table-scroll"><table class="data-table"><thead><tr><th scope="col">ID</th><th scope="col">Lender</th><th scope="col">What differs</th><th scope="col">The two versions</th><th scope="col">Where it stands</th></tr></thead><tbody>${rows.map(conflictRow).join("")}</tbody></table></div>`;
    put("method-conflicts", `
        <p>${open.length} of ${RESEARCH.conflicts.length} recorded conflicts between sources are still unresolved. The notes below say what was tried and how each was handled; confirm any of these with the lender.</p>
        ${table(open)}
        <details class="accordion-block"><summary>The ${RESEARCH.conflicts.length - open.length} resolved or not-a-conflict items</summary>${table(RESEARCH.conflicts.filter(row => !open.includes(row)))}</details>`);

    /* ----- Changes in this release ----- */
    const byType = {};
    RESEARCH.changelog.forEach(row => { byType[row.change_type] = (byType[row.change_type] || 0) + 1; });
    put("method-changes", `<p>${RESEARCH.changelog.length} changes were logged for this release: ${Object.entries(byType).map(([type, n]) => `${n} ${escapeHtml(type)}`).join(", ")}.</p>
        <details class="accordion-block"><summary>Show the change log</summary><div class="table-scroll chart-table" tabindex="0" role="region" aria-label="Change log, scrollable"><table class="data-table"><thead><tr><th scope="col">Sheet</th><th scope="col">Item</th><th scope="col">Change</th><th scope="col">Old</th><th scope="col">New</th></tr></thead>
        <tbody>${RESEARCH.changelog.map(row => `<tr><th scope="row">${escapeHtml(row.sheet)}</th><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.change_type)}</td><td>${escapeHtml(row.old_value ?? "")}</td><td>${escapeHtml(row.new_value ?? "")}</td></tr>`).join("")}</tbody></table></div></details>`);
} else if (methodRoot) {
    methodRoot.innerHTML = `<p class="empty">The research data couldn't be loaded.</p>`;
}
