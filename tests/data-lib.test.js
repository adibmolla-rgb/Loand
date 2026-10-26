const test = require("node:test");
const assert = require("node:assert/strict");
const { makeKeys, cleanValue, parseSourceIds, tableFromRows, validate } = require("../scripts/lib-data");

test("makeKeys matches the old convert.py naming", () => {
    assert.deepEqual(makeKeys(["Initial rate", "Initial rate (number)", "Type (Government / lender)", "LTV min"]),
        ["initial_rate", "initial_rate_number", "type", "ltv_min"]);
});

test("cleanValue trims text, keeps numbers, turns blanks and dates into null/ISO", () => {
    assert.equal(cleanValue("  hi "), "hi");
    assert.equal(cleanValue(""), null);
    assert.equal(cleanValue(4.25), 4.25);
    assert.equal(cleanValue(new Date("2026-09-27T00:00:00Z")), "2026-09-27");
});

test("parseSourceIds ignores anything that is not S##", () => {
    assert.deepEqual(parseSourceIds("S13; S55,S2 -"), ["S13", "S55", "S2"]);
    assert.deepEqual(parseSourceIds("-"), []);
});

// Smallest workbook that passes validation, for the failure tests below.
function minimalTables() {
    const t = (headers, ...rows) => tableFromRows([headers, ...rows]);
    const base = {
        Sources: t(["Source ID"], ["S01"]),
        Lender_Overview: t(["Lender", "Parent group", "Last verified"], ["A", "A plc", "2026-09-27"]),
        Rules_Numeric: t(["Rule ID", "Lender group", "Brand scope", "Rule type", "Value numeric", "Unit", "Min income", "Max income", "Min LTV", "Max LTV", "Min loan", "Max loan", "Property type", "Buyer type", "Applicants", "Repayment type", "Other condition", "Status", "Source ID"],
            ["R0001", "A", null, "max_ltv", 95, "%", null, null, null, null, null, null, null, null, null, null, null, "CONFIRMED", "S01"]),
        Mortgage_Rates: t(["Lender group", "Product", "Initial rate (number)", "APRC (number)", "Product fee (number, £)", "LTV min", "LTV max", "Initial period months", "Effective date", "Status", "Buyer type", "Max loan (number, £)", "Reversion rate (number)", "Source ID"],
            ["A", "P", 4.5, null, 999, 0, 90, 24, "2026-09-24", "CONFIRMED", "Purchase", null, null, "S01"]),
        Personal_Loans: t(["Lender group", "Product", "Status", "Source ID"], ["A", "L", "CONFIRMED", "S01"]),
        Loan_APR_Tiers: t(["Lender group", "Product", "Amount from (£)", "Amount to (£)", "APR (%)", "Status", "Source ID"], ["A", "L", 1000, 5000, 9.9, "CONFIRMED", "S01"]),
        Property_Taxes: t(["Tax", "Nation", "Band / relief", "Band from (£)", "Band to (£)", "Rate (%)", "Effective date", "Status", "Source ID"], ["SDLT", "England & Northern Ireland", "Standard residential", 0, 125000, 0, "2025-04-01", "CONFIRMED", "S01"]),
        Stress_and_Benchmarks: t(["Lender / scope", "Item", "Value numeric", "Status", "Source ID"], ["TSB", "Stress rate", 6.25, "CONFIRMED", "S01"]),
        Comparison_Fields: t(["Lender group", "Field", "Value (text)", "Value numeric", "Status", "Source ID"], ["A", "F", "x", null, "CONFIRMED", "S01"]),
        Time_Series: t(["Series", "Date", "Value numeric", "Unit", "Status", "Source ID"], ["Bank Rate", "2026-09-30", 3.75, "%", "CONFIRMED", "S01"]),
        Conflicts: t(["Conflict ID"], ["C01"]),
        Changelog: t(["Sheet", "Item", "Change type"], ["x", "y", "added"]),
        Status_Definitions: t(["Status"], ["CONFIRMED"])
    };
    return base;
}

test("a minimal workbook validates cleanly", () => {
    const { errors, warnings } = validate(minimalTables());
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
});

test("unknown Source ID, bad status, non-numeric value and non-ISO date are all errors", () => {
    const tables = minimalTables();
    tables.Rules_Numeric.rows[0].source_id = "S99";
    tables.Rules_Numeric.rows[0].status = "PROBABLY";
    tables.Rules_Numeric.rows[0].value_numeric = "95%";
    tables.Mortgage_Rates.rows[0].effective_date = "24/09/2026";
    const text = validate(tables).errors.join("\n");
    assert.match(text, /S99 is not in Sources/);
    assert.match(text, /not one of the six labels/);
    assert.match(text, /"Value numeric" is "95%", not a number/);
    assert.match(text, /not YYYY-MM-DD/);
});

test("a missing required column or sheet is an error", () => {
    const tables = minimalTables();
    delete tables.Time_Series;
    tables.Sources = tableFromRows([["Wrong"], ["S01"]]);
    const text = validate(tables).errors.join("\n");
    assert.match(text, /Missing sheet: Time_Series/);
    assert.match(text, /Sources: missing required column "Source ID"/);
});

test("placeholder Source IDs are accepted only on NOT VERIFIED / NOT DISCLOSED rows", () => {
    const tables = minimalTables();
    tables.Comparison_Fields = tableFromRows([["Lender group", "Field", "Value (text)", "Value numeric", "Status", "Source ID"],
        ["A", "F1", null, null, "NOT VERIFIED", "-"], ["A", "F2", "x", null, "CONFIRMED", "-"]]);
    const errors = validate(tables).errors;
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Comparison_Fields row 3/);
});

test("the truncated 'Not verified' defect is reported as a warning", () => {
    const tables = minimalTables();
    tables.Lender_Overview.rows[0].shared_equity_detail = "t verified";
    const { errors, warnings } = validate(tables);
    assert.deepEqual(errors, []);
    assert.match(warnings[0], /shared_equity_detail/);
});
