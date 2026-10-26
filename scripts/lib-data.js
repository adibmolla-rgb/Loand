/* Pure helpers for the data build: no file access, so they can be tested.
   Key naming matches the old tools/convert.py so existing pages keep working. */

const STATUSES = ["CONFIRMED", "SUPPORTED", "UNCONFIRMED", "NOT DISCLOSED", "OUTDATED", "NOT VERIFIED"];
const SKIP_SHEETS = new Set(["README", "QC_Summary"]);

// Sheets that must exist, and the columns the site relies on in each.
const REQUIRED_COLUMNS = {
    Lender_Overview: ["Lender", "Parent group", "Last verified"],
    Rules_Numeric: ["Rule ID", "Lender group", "Brand scope", "Rule type", "Value numeric", "Unit", "Min income", "Max income",
        "Min LTV", "Max LTV", "Min loan", "Max loan", "Property type", "Buyer type", "Applicants", "Repayment type",
        "Other condition", "Status", "Source ID"],
    Mortgage_Rates: ["Lender group", "Product", "Initial rate (number)", "APRC (number)", "Product fee (number, £)", "LTV min", "LTV max",
        "Initial period months", "Effective date", "Status", "Buyer type", "Max loan (number, £)", "Reversion rate (number)", "Source ID"],
    Personal_Loans: ["Lender group", "Product", "Status", "Source ID"],
    Loan_APR_Tiers: ["Lender group", "Product", "Amount from (£)", "Amount to (£)", "APR (%)", "Status", "Source ID"],
    Property_Taxes: ["Tax", "Nation", "Band / relief", "Band from (£)", "Band to (£)", "Rate (%)", "Effective date", "Status", "Source ID"],
    Stress_and_Benchmarks: ["Lender / scope", "Item", "Value numeric", "Status", "Source ID"],
    Comparison_Fields: ["Lender group", "Field", "Value (text)", "Value numeric", "Status", "Source ID"],
    Time_Series: ["Series", "Date", "Value numeric", "Unit", "Status", "Source ID"],
    Sources: ["Source ID"],
    Conflicts: [],
    Changelog: ["Sheet", "Item", "Change type"],
    Status_Definitions: []
};

// Columns (by header) that must hold a number or be empty.
const NUMERIC_HEADERS = {
    Rules_Numeric: ["Value numeric", "Min income", "Max income", "Min LTV", "Max LTV", "Min loan", "Max loan"],
    Mortgage_Rates: ["Initial rate (number)", "APRC (number)", "Product fee (number, £)", "LTV min", "LTV max",
        "Initial period months", "Max loan (number, £)", "Reversion rate (number)"],
    Loan_APR_Tiers: ["Amount from (£)", "Amount to (£)", "APR (%)", "Max APR (%)"],
    Property_Taxes: ["Band from (£)", "Band to (£)", "Rate (%)"],
    Stress_and_Benchmarks: ["Value numeric"],
    Comparison_Fields: ["Value numeric"],
    Time_Series: ["Value numeric"],
    Personal_Loans: ["Min amount (number)", "Max amount (number)", "Min term months", "Max term months",
        "Representative APR (number)", "Max APR (number)", "Minimum age (number)", "Minimum income (number, £ per year)"]
};

// Columns that must be ISO YYYY-MM-DD or empty.
const ISO_DATE_HEADERS = {
    Lender_Overview: ["Last verified"],
    Rules_Numeric: ["Last verified"],
    Mortgage_Rates: ["Effective date"],
    Property_Taxes: ["Effective date", "Last verified"],
    Time_Series: ["Date"],
    Loan_APR_Tiers: ["Last verified"],
    Comparison_Fields: ["Last verified"],
    Personal_Loans: ["Last verified"]
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// 'Initial rate' -> initial_rate. Bracketed words are dropped unless that
// would clash with an earlier column: 'Initial rate (number)' -> initial_rate_number.
function makeKeys(headers) {
    const used = new Set();
    return headers.map(header => {
        if (header === null || header === undefined || header === "") return null;
        const short = slug(String(header).replace(/\(.*?\)/g, ""));
        let key = used.has(short) ? slug(header) : short;
        let n = 2;
        while (used.has(key)) key = `${slug(header)}_${n++}`;
        used.add(key);
        return key;
    });
}

function cleanValue(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value;
    const text = String(value).trim();
    return text === "" ? null : text;
}

function parseSourceIds(text) {
    return String(text ?? "").split(/[;,\s]+/).filter(id => /^S\d+$/.test(id));
}

// Turns [headerRow, ...rows] into { headers, keys, rows }.
function tableFromRows(matrix) {
    const headers = (matrix[0] || []).map(cell => (cell === null || cell === undefined ? null : String(cell).trim()));
    const keys = makeKeys(headers);
    const rows = [];
    for (const raw of matrix.slice(1)) {
        if (raw.every(cell => cell === null || cell === undefined || cell === "")) continue;
        const row = {};
        keys.forEach((key, i) => { if (key) row[key] = cleanValue(raw[i]); });
        rows.push(row);
    }
    return { headers, keys, rows };
}

/* Validates the parsed workbook. Returns { errors, warnings }.
   `tables` maps sheet name -> { headers, keys, rows }. */
function validate(tables) {
    const errors = [];
    const warnings = [];

    for (const [sheet, required] of Object.entries(REQUIRED_COLUMNS)) {
        if (!tables[sheet]) { errors.push(`Missing sheet: ${sheet}`); continue; }
        for (const header of required) {
            if (!tables[sheet].headers.includes(header)) errors.push(`${sheet}: missing required column "${header}"`);
        }
    }

    const sourceIds = new Set((tables.Sources?.rows || []).map(row => row.source_id));

    for (const [sheet, table] of Object.entries(tables)) {
        const keyOf = header => table.keys[table.headers.indexOf(header)];
        const sourceKey = keyOf("Source ID");
        const statusKey = keyOf("Status");

        table.rows.forEach((row, index) => {
            const where = `${sheet} row ${index + 2}`;
            if (sourceKey && sheet !== "Sources") {
                const ids = parseSourceIds(row[sourceKey]);
                const text = row[sourceKey];
                // Rows with nothing to cite (not disclosed / not verified) may carry a
                // placeholder such as "-" or a sentence; every other row needs real IDs.
                const nothingToCite = statusKey && ["NOT DISCLOSED", "NOT VERIFIED"].includes(row[statusKey]);
                if (!ids.length && text && !nothingToCite) errors.push(`${where}: Source ID "${text}" is not in S## form`);
                if (!text && sheet !== "Changelog" && statusKey && !nothingToCite) errors.push(`${where}: no Source ID`);
                ids.filter(id => !sourceIds.has(id)).forEach(id => errors.push(`${where}: Source ID ${id} is not in Sources`));
            }
            if (statusKey && row[statusKey] !== null && !STATUSES.includes(row[statusKey])) {
                errors.push(`${where}: status "${row[statusKey]}" is not one of the six labels`);
            }
            for (const header of NUMERIC_HEADERS[sheet] || []) {
                const key = keyOf(header);
                if (key && row[key] !== null && typeof row[key] !== "number") errors.push(`${where}: "${header}" is "${row[key]}", not a number`);
            }
            for (const header of ISO_DATE_HEADERS[sheet] || []) {
                const key = keyOf(header);
                if (key && row[key] !== null && !ISO_DATE.test(String(row[key]))) errors.push(`${where}: "${header}" is "${row[key]}", not YYYY-MM-DD`);
            }
        });
    }

    // Known workbook defect: "Not verified" cut to "t verified" when the
    // split columns were made. Reported as a warning; --strict makes it fatal.
    const lo = tables.Lender_Overview;
    if (lo) {
        const bad = new Set();
        lo.rows.forEach(row => Object.entries(row).forEach(([key, value]) => {
            if (key.endsWith("_detail") && typeof value === "string" && /^(t|ot) verified$/i.test(value)) bad.add(key);
        }));
        if (bad.size) warnings.push(`Lender_Overview: truncated text "t verified" (should be "Not verified") in ${bad.size} columns: ${[...bad].join(", ")}`);
    }

    return { errors, warnings };
}

module.exports = { STATUSES, SKIP_SHEETS, REQUIRED_COLUMNS, slug, makeKeys, cleanValue, parseSourceIds, tableFromRows, validate };
