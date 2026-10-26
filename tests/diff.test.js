const test = require("node:test");
const assert = require("node:assert/strict");
const { tableFromRows } = require("../scripts/lib-data");
const { diffRows, diffSchema, diffReleases, buildChecklist } = require("../scripts/lib-diff");
const { findWorkbooks, readWorkbookTables } = require("../scripts/lib-workbook");
const { GENERAL_CONDITION_RULES } = require("../js/engine/rules");

const table = (headers, ...rows) => tableFromRows([headers, ...rows]);
const RULE_HEADERS = ["Rule ID", "Lender group", "Rule type", "Value numeric", "Other condition", "Status", "Source ID", "Last verified"];
const rule = (id, value, other = null, status = "CONFIRMED", verified = "2026-09-26") => [id, "Barclays", "max_lti", value, other, status, "S01", verified];

function release(rules, extra = {}) {
    return {
        Sources: table(["Source ID", "Source title"], ["S01", "Barclays criteria"], ["S02", "Rates"]),
        Rules_Numeric: table(RULE_HEADERS, ...rules),
        Changelog: table(["Sheet", "Item", "Change type"]),
        ...extra
    };
}
const context = (over = {}) => ({ oldName: "old.xlsx", newName: "new.xlsx", generalRules: new Set(), knownGroups: new Set(["Barclays"]), ...over });

/* ----- Rows ----- */

test("rows are matched by key: added, removed and changed are found", () => {
    const before = table(RULE_HEADERS, rule("R1", 4.5), rule("R2", 5), rule("R3", 6)).rows;
    const after = table(RULE_HEADERS, rule("R1", 4.49), rule("R3", 6), rule("R4", 3)).rows;
    const diff = diffRows("Rules_Numeric", before, after);
    assert.deepEqual(diff.added.map(item => item.key), ["R4"]);
    assert.deepEqual(diff.removed.map(item => item.key), ["R2"]);
    assert.equal(diff.changed.length, 1);
    assert.deepEqual(diff.changed[0].fields, [{ field: "value_numeric", old: 4.5, new: 4.49 }]);
});

test("a row where only 'last verified' moved counts as re-verified, not changed", () => {
    const before = table(RULE_HEADERS, rule("R1", 4.5, null, "CONFIRMED", "2026-09-26")).rows;
    const after = table(RULE_HEADERS, rule("R1", 4.5, null, "CONFIRMED", "2026-09-27")).rows;
    const diff = diffRows("Rules_Numeric", before, after);
    assert.equal(diff.changed.length, 0);
    assert.equal(diff.reverified, 1);
});

test("repeated keys are paired in order, so a duplicate isn't mistaken for an addition", () => {
    const headers = ["Lender group", "Product", "LTV band", "Buyer type", "Rate type", "Initial period", "Initial rate (number)"];
    const row = rate => ["A", "2yr", "<=75%", "Purchase", "Fixed", "2 years", rate];
    const diff = diffRows("Mortgage_Rates", table(headers, row(4.5), row(4.6)).rows, table(headers, row(4.5), row(4.7)).rows);
    assert.equal(diff.added.length + diff.removed.length, 0);
    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0].fields[0].new, 4.7);
});

/* ----- Schema ----- */

test("removed, renamed and reordered columns and removed sheets are schema problems; appended columns are not", () => {
    const old = { A: table(["One", "Two"], [1, 2]), B: table(["X"], [1]) };
    const ok = diffSchema(old, { A: table(["One", "Two", "Three"], [1, 2, 3]), B: table(["X"], [1]) });
    assert.deepEqual(ok.problems, []);
    assert.deepEqual(ok.additions, [{ sheet: "A", columns: ["Three"] }]);

    assert.match(diffSchema(old, { A: table(["One", "Deux"], [1, 2]), B: old.B }).problems[0], /A: column removed or renamed: "Two"/);
    assert.match(diffSchema(old, { A: table(["Two", "One"], [1, 2]), B: old.B }).problems[0], /reordered/);
    assert.match(diffSchema(old, { A: old.A }).problems[0], /Sheet "B" was removed/);
    assert.deepEqual(diffSchema(old, { ...old, C: table(["Z"], [1]) }).newSheets, ["C"]);
});

/* ----- Sources ----- */

test("a removed Source ID is blocking", () => {
    const newer = release([rule("R1", 4.5)]);
    newer.Sources = table(["Source ID", "Source title"], ["S01", "Barclays criteria"]);
    const diff = diffReleases(release([rule("R1", 4.5)]), newer);
    assert.deepEqual(diff.removedSources, ["S02"]);
    assert.match(buildChecklist(diff, context()), /\*\*Sources removed \(1\):\*\* S02/);
});

/* ----- Checklist ----- */

test("an unchanged release produces a clean checklist", () => {
    const text = buildChecklist(diffReleases(release([rule("R1", 4.5)]), release([rule("R1", 4.5)])), context());
    assert.match(text, /\[x\] Nothing blocking/);
    assert.match(text, /\[x\] Nothing needs a decision/);
});

test("a new CONFIRMED rule with an Other condition that hasn't been reviewed is flagged for GENERAL_CONDITION_RULES", () => {
    const diff = diffReleases(release([rule("R1", 4.5)]), release([rule("R1", 4.5), rule("R9", 5, "Existing customers only")]));
    const text = buildChecklist(diff, context());
    assert.match(text, /New rules with an "Other condition" \(1\)/);
    assert.match(text, /R9 Barclays max_lti 5: Existing customers only/);
    // Once reviewed and listed, it is no longer flagged.
    assert.doesNotMatch(buildChecklist(diff, context({ generalRules: new Set(["R9"]) })), /New rules with an "Other condition"/);
});

test("a reviewed rule that changes is flagged for re-review, and value changes point at the fixtures", () => {
    const diff = diffReleases(release([rule("R44", 4.49, "Default")]), release([rule("R44", 4.25, "Default")]));
    const text = buildChecklist(diff, context({ generalRules: new Set(["R44"]) }));
    assert.match(text, /Reviewed rules that changed \(1\)/);
    assert.match(text, /Rule values changed \(1\)/);
    assert.match(text, /value_numeric: 4\.49 -> 4\.25/);
    assert.match(text, /tests\/rules\.test\.js/);
});

test("losing CONFIRMED status is called out, as is gaining it", () => {
    const diff = diffReleases(release([rule("R1", 4.5), rule("R2", 5, null, "SUPPORTED")]), release([rule("R1", 4.5, null, "SUPPORTED"), rule("R2", 5, null, "CONFIRMED")]));
    const text = buildChecklist(diff, context());
    assert.match(text, /No longer CONFIRMED \(1\)/);
    assert.match(text, /Rules_Numeric R1: CONFIRMED -> SUPPORTED/);
    assert.match(text, /Newly CONFIRMED \(1\)/);
});

test("a lender group the registry doesn't know is flagged; a known brand variant is not", () => {
    const newer = release([rule("R1", 4.5)]);
    newer.Rules_Numeric = table(RULE_HEADERS, rule("R1", 4.5), ["R7", "Metro Bank", "max_lti", 4, null, "CONFIRMED", "S01", "2026-09-27"], ["R8", "Barclays (Kensington)", "max_lti", 4, null, "CONFIRMED", "S01", "2026-09-27"]);
    const text = buildChecklist(diffReleases(release([rule("R1", 4.5)]), newer), context());
    assert.match(text, /not in data\/lender-registry\.js \(1\):\*\* Metro Bank/);
});

test("changes the Changelog doesn't mention are reported as undocumented", () => {
    const newer = release([rule("R1", 4.0)]);                       // changed, Changelog empty
    const text = buildChecklist(diffReleases(release([rule("R1", 4.5)]), newer), context());
    assert.match(text, /Undocumented change:\*\* Rules_Numeric differs in 1 rows/);

    const logged = release([rule("R1", 4.0)]);
    logged.Changelog = table(["Sheet", "Item", "Change type"], ["Rules_Numeric", "R1", "updated"]);
    assert.doesNotMatch(buildChecklist(diffReleases(release([rule("R1", 4.5)]), logged), context()), /Undocumented/);
});

/* ----- The real workbook ----- */

const workbooks = findWorkbooks();
const realTest = workbooks.length ? test : test.skip;

realTest("the real workbook compared with itself shows no differences and nothing blocking", () => {
    const tables = readWorkbookTables(workbooks[workbooks.length - 1]);
    const diff = diffReleases(tables, tables);
    assert.deepEqual(diff.schema.problems, []);
    assert.deepEqual(diff.removedSources, []);
    assert.ok(Object.values(diff.sheets).every(d => !d.added.length && !d.removed.length && !d.changed.length));
});

realTest("changes made to a copy of the real workbook are found and explained", () => {
    const original = readWorkbookTables(workbooks[workbooks.length - 1]);
    const edited = JSON.parse(JSON.stringify(original));

    // 1. A rule value changes, and a reviewed rule (R0044, Barclays default) is the one.
    const barclaysDefault = edited.Rules_Numeric.rows.find(row => row.rule_id === "R0044");
    barclaysDefault.value_numeric = 4.25;
    // 2. A new rule with an unreviewed condition.
    edited.Rules_Numeric.rows.push({ ...barclaysDefault, rule_id: "R9999", value_numeric: 5, other_condition: "Staff mortgage" });
    // 3. A rule loses CONFIRMED.
    edited.Rules_Numeric.rows.find(row => row.rule_id === "R0045").status = "SUPPORTED";
    // 4. A Source ID is dropped, and a column disappears.
    edited.Sources.rows = edited.Sources.rows.filter(row => row.source_id !== "S96");
    edited.Property_Taxes.headers = edited.Property_Taxes.headers.filter(header => header !== "Notes");

    const diff = diffReleases(original, edited);
    assert.deepEqual(diff.removedSources, ["S96"]);
    assert.match(diff.schema.problems.join(" "), /Property_Taxes: column removed or renamed: "Notes"/);

    const text = buildChecklist(diff, context({ generalRules: GENERAL_CONDITION_RULES, knownGroups: new Set(["Barclays", "HSBC UK", "Lloyds Banking Group", "NatWest Group", "Santander UK", "TSB", "Nationwide", "Co-operative Bank", "Skipton BS", "Coventry BS"]) }));
    assert.match(text, /\*\*Sources removed \(1\):\*\* S96/);
    assert.match(text, /Reviewed rules that changed/);
    assert.match(text, /R0044 Barclays: value_numeric: 4\.49 -> 4\.25/);
    assert.match(text, /R9999 Barclays max_lti 5: Staff mortgage/);
    assert.match(text, /Rules_Numeric R0045: CONFIRMED -> SUPPORTED/);
    assert.match(text, /Rules: 1 added, 2 changed, 0 removed/);
});
