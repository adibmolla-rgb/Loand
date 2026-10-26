/* Checks the committed output of the build against the workbook's published facts.
   Run `npm run build-data` first if data/json is missing. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "data", "json");
const load = name => JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));

test("meta.json records the release date, row counts and source count", () => {
    const meta = load("meta");
    assert.match(meta.data_as_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(meta.source_count, load("sources").length);
    assert.equal(meta.row_counts.rules_numeric, load("rules_numeric").length);
});

test("rule rows keep the documented fixtures (Barclays DTI and Nationwide 95% LTV loan cap)", () => {
    const rules = load("rules_numeric");
    const dti = rules.find(r => r.lender_group === "Barclays" && r.rule_type === "dti_threshold");
    assert.ok(dti, "Barclays dti_threshold row");
    assert.equal(dti.value_numeric, 20);
    const capped = rules.find(r => r.lender_group === "Barclays" && r.rule_type === "max_lti" && /dti_threshold triggered/.test(r.other_condition || ""));
    assert.equal(capped.value_numeric, 4);
    const nationwide = rules.find(r => r.lender_group === "Nationwide" && r.rule_type === "max_loan" && r.max_ltv === 95 && r.value_numeric === 750000);
    assert.ok(nationwide, "Nationwide 95% LTV max loan £750,000");
});

test("every Source ID cited by a rule exists in Sources", () => {
    const ids = new Set(load("sources").map(s => s.source_id));
    load("rules_numeric").forEach(r => assert.ok(ids.has(r.source_id) || String(r.source_id).split(/[;,\s]+/).every(x => ids.has(x)), r.rule_id));
});

test("numeric rate columns are numbers or null", () => {
    load("mortgage_rates").forEach(r => ["initial_rate_number", "aprc_number", "ltv_min", "ltv_max"].forEach(k =>
        assert.ok(r[k] === null || typeof r[k] === "number", `${r.product}: ${k}`)));
});
