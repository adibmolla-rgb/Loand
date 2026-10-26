/* Comparing two research releases. Pure functions on the { headers, keys, rows }
   tables from lib-data.js, so they are testable without any workbook files. */

// How to recognise "the same row" in each sheet across releases. Sheets not
// listed fall back to comparing whole rows (a changed row then shows as one
// removed and one added).
const ROW_KEYS = {
    Lender_Overview: ["lender"],
    Rules_Numeric: ["rule_id"],
    Mortgage_Rates: ["lender_group", "product", "ltv_band", "buyer_type", "rate_type", "initial_period"],
    Personal_Loans: ["lender_group", "product"],
    Loan_APR_Tiers: ["lender_group", "product", "amount_from"],
    Property_Taxes: ["tax", "nation", "band_relief", "band_from"],
    Stress_and_Benchmarks: ["lender_scope", "item"],
    Comparison_Fields: ["lender_group", "field"],
    Time_Series: ["series", "date"],
    Sources: ["source_id"],
    Conflicts: ["conflict_id"]
};

// Columns that change every release without the fact changing. A row where only
// these differ is counted as "re-verified", not "changed".
const BOOKKEEPING = /^(last_verified|date_checked|checked_in_release.*|resolution_source_id)$/;

// Sheets that describe the release rather than hold facts.
const META_SHEETS = new Set(["Changelog", "Sheet_Notes", "Status_Definitions"]);

const keyOf = (sheet, row, keyFields) => (keyFields ? keyFields.map(field => String(row[field] ?? "")).join("|") : JSON.stringify(row));

// Same key twice in one release (e.g. repeated products): number them in order so each is compared with its counterpart.
function indexRows(sheet, rows) {
    const keyFields = ROW_KEYS[sheet];
    const seen = new Map();
    const map = new Map();
    for (const row of rows) {
        const base = keyOf(sheet, row, keyFields);
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        map.set(n === 1 ? base : `${base}#${n}`, row);
    }
    return map;
}

function diffRows(sheet, oldRows, newRows) {
    const before = indexRows(sheet, oldRows), after = indexRows(sheet, newRows);
    const result = { added: [], removed: [], changed: [], reverified: 0 };
    for (const [key, row] of after) {
        if (!before.has(key)) { result.added.push({ key, row }); continue; }
        const old = before.get(key);
        const fields = [...new Set([...Object.keys(old), ...Object.keys(row)])]
            .filter(field => (old[field] ?? null) !== (row[field] ?? null))
            .map(field => ({ field, old: old[field] ?? null, new: row[field] ?? null }));
        const material = fields.filter(item => !BOOKKEEPING.test(item.field));
        if (material.length) result.changed.push({ key, old, row, fields: material });
        else if (fields.length) result.reverified++;
    }
    for (const [key, row] of before) if (!after.has(key)) result.removed.push({ key, row });
    return result;
}

/* Schema changes the site depends on being absent: the README promises no column
   is renamed or removed, and that old columns stay in place with new ones added
   at the end. */
function diffSchema(oldTables, newTables) {
    const problems = [], additions = [];
    for (const sheet of Object.keys(oldTables)) {
        if (!newTables[sheet]) { problems.push(`Sheet "${sheet}" was removed or renamed.`); continue; }
        const before = oldTables[sheet].headers.filter(Boolean), after = newTables[sheet].headers.filter(Boolean);
        const missing = before.filter(header => !after.includes(header));
        if (missing.length) problems.push(`${sheet}: column${missing.length > 1 ? "s" : ""} removed or renamed: ${missing.map(m => `"${m}"`).join(", ")}.`);
        else if (before.some((header, i) => after[i] !== header)) problems.push(`${sheet}: existing columns were reordered or new columns were inserted before the end.`);
        const added = after.filter(header => !before.includes(header));
        if (added.length) additions.push({ sheet, columns: added });
    }
    const newSheets = Object.keys(newTables).filter(sheet => !oldTables[sheet]);
    return { problems, additions, newSheets };
}

/* Full comparison of two parsed releases. */
function diffReleases(oldTables, newTables) {
    const schema = diffSchema(oldTables, newTables);
    const sheets = {};
    for (const sheet of Object.keys(newTables)) {
        if (!oldTables[sheet]) continue;
        sheets[sheet] = {
            ...diffRows(sheet, oldTables[sheet].rows, newTables[sheet].rows),
            oldCount: oldTables[sheet].rows.length, newCount: newTables[sheet].rows.length
        };
    }

    const oldSources = new Map((oldTables.Sources?.rows || []).map(row => [row.source_id, row]));
    const newSources = new Map((newTables.Sources?.rows || []).map(row => [row.source_id, row]));
    const removedSources = [...oldSources.keys()].filter(id => !newSources.has(id));

    // Cross-check the new release's own Changelog against what actually differs.
    const logged = {};
    (newTables.Changelog?.rows || []).forEach(row => { logged[row.sheet] = (logged[row.sheet] || 0) + 1; });
    const observed = Object.fromEntries(Object.entries(sheets)
        .filter(([sheet]) => !META_SHEETS.has(sheet))
        .map(([sheet, d]) => [sheet, d.added.length + d.removed.length + d.changed.length]));
    const undocumented = Object.entries(observed).filter(([sheet, n]) => n > 0 && !logged[sheet]).map(([sheet, n]) => ({ sheet, observed: n }));
    const notFound = Object.entries(logged)
        .filter(([sheet]) => !META_SHEETS.has(sheet) && sheets[sheet] && !observed[sheet])
        .map(([sheet, n]) => ({ sheet, logged: n }));
    const unknownSheets = Object.keys(logged).filter(sheet => !newTables[sheet] && !META_SHEETS.has(sheet));

    return { schema, sheets, removedSources, changelog: { logged, observed, undocumented, notFound, unknownSheets } };
}


/* ---------- The checklist ---------- */

const cell = value => (value === null || value === undefined ? "(blank)" : String(value));
const list = (items, limit = 15) => {
    const shown = items.slice(0, limit).map(item => `  - ${item}`);
    return [...shown, ...(items.length > limit ? [`  - ...and ${items.length - limit} more`] : [])];
};
const fieldText = changes => changes.map(c => `${c.field}: ${cell(c.old)} -> ${cell(c.new)}`).join("; ");

/* Markdown checklist for the person updating the site.
   context: { oldName, newName, generalRules: Set of rule IDs, knownGroups: Set of lender groups in the registry } */
function buildChecklist(diff, { oldName, newName, generalRules = new Set(), knownGroups = new Set() }) {
    const lines = [`# Data update checklist: ${oldName} to ${newName}`, ""];
    const blocking = [];
    const review = [];
    const add = (target, title, details = []) => target.push(`- [ ] ${title}`, ...details);
    const info = (target, text) => target.push(`- ${text}`);

    // Must fix before using the release.
    diff.schema.problems.forEach(problem => add(blocking, `**Schema:** ${problem} The site reads these by name; ask the researcher to restore it.`));
    if (diff.removedSources.length) {
        add(blocking, `**Sources removed (${diff.removedSources.length}):** ${diff.removedSources.join(", ")}. Source IDs must never be removed or renumbered; saved links and every fact citing them depend on it.`);
    }
    const sourceChanges = diff.sheets.Sources?.changed || [];
    if (sourceChanges.length) {
        add(review, `**Source details changed (${sourceChanges.length}):** check none now points at a different document.`,
            list(sourceChanges.map(c => `${c.row.source_id}: ${fieldText(c.fields)}`)));
    }

    // Status changes in any fact sheet.
    const downgrades = [];
    for (const [sheet, d] of Object.entries(diff.sheets)) {
        d.changed.forEach(c => {
            const status = c.fields.find(f => f.field === "status" || f.field === "data_status");
            if (status) downgrades.push({ sheet, c, status });
        });
    }
    const lostConfirmed = downgrades.filter(d => d.status.old === "CONFIRMED" && d.status.new !== "CONFIRMED");
    if (lostConfirmed.length) {
        add(review, `**No longer CONFIRMED (${lostConfirmed.length}):** these stop deciding estimates and are shown as "check with the lender".`,
            list(lostConfirmed.map(d => `${d.sheet} ${d.c.key}: ${d.status.old} -> ${d.status.new}`)));
    }
    const gained = downgrades.filter(d => d.status.new === "CONFIRMED" && d.status.old !== "CONFIRMED");
    if (gained.length) {
        add(review, `**Newly CONFIRMED (${gained.length}):** these now decide estimates; spot-check them against their sources.`,
            list(gained.map(d => `${d.sheet} ${d.c.key}: ${d.status.old} -> ${d.status.new}`)));
    }

    // Rules: the heart of the estimate engine.
    const rules = diff.sheets.Rules_Numeric;
    if (rules) {
        const needsReview = rules.added.filter(({ row }) => row.other_condition && !generalRules.has(row.rule_id) && row.status === "CONFIRMED");
        if (needsReview.length) {
            add(review, `**New rules with an "Other condition" (${needsReview.length}):** unreviewed ones are treated as special routes and never used to judge anyone's figures. For each, decide whether it describes an ordinary case and, if so, add its ID to \`GENERAL_CONDITION_RULES\` in js/engine/rules.js.`,
                list(needsReview.map(({ row }) => `${row.rule_id} ${row.lender_group} ${row.rule_type} ${cell(row.value_numeric)}: ${row.other_condition}`)));
        }
        const generalChanged = rules.changed.filter(c => generalRules.has(c.row.rule_id));
        if (generalChanged.length) {
            add(review, `**Reviewed rules that changed (${generalChanged.length}):** re-check they still describe the ordinary case.`,
                list(generalChanged.map(c => `${c.row.rule_id} ${c.row.lender_group}: ${fieldText(c.fields)}`)));
        }
        const valueChanged = rules.changed.filter(c => c.fields.some(f => f.field === "value_numeric"));
        if (valueChanged.length) {
            add(review, `**Rule values changed (${valueChanged.length}):** update any test fixture that quotes them (tests/rules.test.js uses Barclays R0045/R0046 and Nationwide R0149).`,
                list(valueChanged.map(c => `${c.row.rule_id} ${c.row.lender_group} ${c.row.rule_type}: ${fieldText(c.fields.filter(f => f.field === "value_numeric"))}`)));
        }
        if (rules.removed.length) {
            add(review, `**Rules removed (${rules.removed.length}):** if one is in \`GENERAL_CONDITION_RULES\`, remove it there too.`,
                list(rules.removed.map(({ row }) => `${row.rule_id} ${row.lender_group} ${row.rule_type}`)));
        }
        info(review, `Rules: ${rules.added.length} added, ${rules.changed.length} changed, ${rules.removed.length} removed (${rules.oldCount} to ${rules.newCount}).`);
    }

    // Lenders the site doesn't know yet.
    const groups = new Set();
    for (const sheet of ["Rules_Numeric", "Mortgage_Rates", "Personal_Loans", "Loan_APR_Tiers", "Comparison_Fields"]) {
        (diff.sheets[sheet]?.added || []).forEach(({ row }) => { if (row.lender_group) groups.add(row.lender_group); });
    }
    const unknown = [...groups].filter(group => ![...knownGroups].some(known => group === known || group.startsWith(known + " (")));
    if (unknown.length) {
        add(review, `**Lender groups not in data/lender-registry.js (${unknown.length}):** ${unknown.join(", ")}. Add them (with a summary that restates the research and cites its sources) or they won't appear in the lender pages and comparisons.`);
    }

    // Rates.
    const rates = diff.sheets.Mortgage_Rates;
    if (rates) {
        const rateMoves = rates.changed.filter(c => c.fields.some(f => f.field === "initial_rate_number"));
        info(review, `Rates: ${rates.added.length} added, ${rates.removed.length} removed, ${rateMoves.length} with a new initial rate (${rates.oldCount} to ${rates.newCount}).`);
        const newlyOutdated = rates.changed.filter(c => c.fields.some(f => f.field === "status" && f.new === "OUTDATED"));
        if (newlyOutdated.length) info(review, `${newlyOutdated.length} rate rows are newly OUTDATED (they disappear from every view).`);
    }
    const series = diff.sheets.Time_Series;
    if (series && series.added.length) {
        const dates = series.added.map(({ row }) => row.date).filter(Boolean).sort();
        info(review, `Historical series: ${series.added.length} new observations (${dates[0]} to ${dates[dates.length - 1]}). Check the Market page takeaways still read sensibly.`);
    }
    const taxes = diff.sheets.Property_Taxes;
    if (taxes && (taxes.added.length || taxes.changed.length || taxes.removed.length)) {
        add(review, `**Property taxes changed (${taxes.added.length + taxes.changed.length + taxes.removed.length} rows):** re-run \`npm test\` and check the official worked examples (SDLT £295,000 = £4,750; LBTT £875,000 = £63,350; LTT £280,000 = £3,300) still hold, and update them if the bands changed.`);
    }

    // The release's own change log versus what actually differs.
    const log = diff.changelog;
    log.undocumented.forEach(({ sheet, observed }) => add(review, `**Undocumented change:** ${sheet} differs in ${observed} rows but the Changelog doesn't mention it. Ask the researcher.`));
    if (log.notFound.length) {
        info(review, `The Changelog lists changes this comparison can't find in: ${log.notFound.map(item => `${item.sheet} (${item.logged})`).join(", ")}. Expected if you are comparing releases that aren't adjacent; otherwise ask the researcher.`);
    }
    log.unknownSheets.forEach(sheet => add(review, `Changelog mentions a sheet that doesn't exist: ${sheet}.`));

    // Added columns and sheets.
    diff.schema.additions.forEach(({ sheet, columns }) => add(review, `New column${columns.length > 1 ? "s" : ""} in ${sheet}: ${columns.join(", ")}. The build keeps them; decide whether the site should use them.`));
    diff.schema.newSheets.forEach(sheet => add(review, `New sheet: ${sheet}. The build will convert it; decide whether the site should use it.`));

    // Counts overview.
    const overview = Object.entries(diff.sheets)
        .filter(([, d]) => d.added.length || d.removed.length || d.changed.length || d.reverified)
        .map(([sheet, d]) => `${sheet}: +${d.added.length} -${d.removed.length} ~${d.changed.length}${d.reverified ? ` (${d.reverified} only re-verified)` : ""}`);

    lines.push("## Fix before using this release", ...(blocking.length ? blocking : ["- [x] Nothing blocking: no columns, sheets or Source IDs were removed."]), "");
    const needsDecision = review.some(line => line.startsWith("- [ ]"));
    lines.push("## Review", ...(needsDecision ? [] : ["- [x] Nothing needs a decision."]), ...review, "");
    lines.push("## What changed, sheet by sheet", ...(overview.length ? overview.map(line => `- ${line}`) : ["- No differences."]), "");
    lines.push("## Then", [
        "- [ ] Put the new workbook in `data/` or `tools/` and run `npm run build-data` (add `:strict` once the known defects are fixed).",
        "- [ ] Run `npm test`; fix fixtures that quote changed values.",
        "- [ ] Open the Mortgages, Rates, Loans, Compare and Methodology pages and confirm the release date and stale badges look right.",
        "- [ ] Commit the workbook with the regenerated `data/` files, push, and check CI."
    ].join("\n"), "");
    return lines.join("\n");
}

module.exports = { ROW_KEYS, diffRows, diffSchema, diffReleases, buildChecklist };
