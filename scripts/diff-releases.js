/* Usage: node scripts/diff-releases.js [old.xlsx new.xlsx] [--out checklist.md]

   Compares two research workbook releases and prints a markdown checklist for
   updating the site: what to fix before using the release, what to review
   (rules that need a human decision, status changes, new lenders, undocumented
   changes) and the steps to run afterwards. Read-only: it changes nothing.

   With no paths, the two newest workbooks in data/ and tools/ are compared.
   Exit code 1 means a blocking problem (a column, sheet or Source ID was
   removed or renamed), so it can also be used as a gate. */

const fs = require("fs");
const path = require("path");
const { ROOT, findWorkbooks, readWorkbookTables } = require("./lib-workbook");
const { diffReleases, buildChecklist } = require("./lib-diff");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const paths = args.filter((arg, i) => !arg.startsWith("--") && (outIndex < 0 || i !== outIndex + 1)).map(arg => path.resolve(arg));

// Lender groups the site already knows, read from the hand-written registry.
function knownGroups() {
    const file = path.join(ROOT, "data", "lender-registry.js");
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const groups = [...text.matchAll(/researchGroup:\s*"([^"]+)"/g), ...text.matchAll(/rateFilter:\s*\{\s*group:\s*"([^"]+)"/g)].map(match => match[1]);
    return new Set(groups);
}

// The rule IDs reviewed as ordinary cases, read from the engine itself.
function generalRules() {
    return require("../js/engine/rules").GENERAL_CONDITION_RULES;
}

function main() {
    let [oldFile, newFile] = paths;
    if (!oldFile || !newFile) {
        const found = findWorkbooks();
        if (found.length < 2) throw new Error(`Need two workbooks to compare; found ${found.length} in data/ and tools/. Pass both paths: node scripts/diff-releases.js old.xlsx new.xlsx`);
        [oldFile, newFile] = found.slice(-2);
    }
    const diff = diffReleases(readWorkbookTables(oldFile), readWorkbookTables(newFile));
    const checklist = buildChecklist(diff, {
        oldName: path.basename(oldFile), newName: path.basename(newFile),
        generalRules: generalRules(), knownGroups: knownGroups()
    });
    if (outFile) { fs.writeFileSync(path.resolve(outFile), checklist); console.log(`Wrote ${outFile}`); }
    else console.log(checklist);
    if (diff.schema.problems.length || diff.removedSources.length) process.exitCode = 1;
}

try { main(); } catch (error) { console.error("Diff failed:", error.message); process.exit(1); }
