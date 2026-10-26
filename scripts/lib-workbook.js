/* Reading research workbooks from disk. Shared by build-data.js and diff-releases.js. */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { SKIP_SHEETS, tableFromRows } = require("./lib-data");

const ROOT = path.join(__dirname, "..");

// Every Loand_UK_Lender_Research_*.xlsx in data/ and tools/, oldest first (by the date in the name).
function findWorkbooks() {
    return ["data", "tools"].flatMap(dir => {
        const full = path.join(ROOT, dir);
        return fs.existsSync(full)
            ? fs.readdirSync(full).filter(file => /^Loand_UK_Lender_Research_.*\.xlsx$/.test(file)).map(file => path.join(full, file))
            : [];
    }).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

// { "Sheet_Name": { headers, keys, rows } } for every data sheet.
function readWorkbookTables(file) {
    const workbook = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true });
    const tables = {};
    for (const name of workbook.SheetNames) {
        if (SKIP_SHEETS.has(name)) continue;
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
        tables[name] = tableFromRows(matrix);
    }
    return tables;
}

module.exports = { ROOT, findWorkbooks, readWorkbookTables };
