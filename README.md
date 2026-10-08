# LoanD

A UK mortgage and loan research tool. Estimate what you could borrow, see how
your figures compare with each lender's published limits, compare lenders side
by side, and read the market trends behind the numbers.

Every fact carries a source code (e.g. `S13`) linking back to the lender,
regulator or government page it came from.

LoanD is not a lender. It gives estimates, not decisions.

## Running it

No build step and no server. Open `index.html` in a browser.
Everything runs in the browser; no data is sent anywhere.

## Structure

**Every filename in this project is unique.** Two files with the same name in
different folders (e.g. `data/lenders.js` and `js/lenders.js`) get confused with
each other the moment they're downloaded or moved. Keep it that way.

```
Loand/
├── index.html              home
├── mortgage.html           calculator
├── lenders.html            lender directory
├── lender.html             one profile template: lender.html?id=barclays
├── compare.html            side-by-side comparison
├── market.html             Bank of England trend charts
├── style.css               one shared stylesheet
├── script.js               shared helpers: formatting, sources, glossary,
│                           theme, navigation
├── js/
│   ├── mortgage.js         calculator: maths (Part A) + page code (Part B)
│   ├── lender-match.js     checks figures against lenders' published rules
│   ├── lender-pages.js     directory and profile pages
│   ├── compare.js          comparison table
│   └── market.js           charts
├── data/
│   ├── research.js         GENERATED from the workbook — do not edit
│   ├── lender-registry.js  lender IDs, brand grouping, summaries (hand-written)
│   └── glossary.js         plain-English definitions for jargon
├── tools/
│   ├── convert.py          workbook -> data/research.js
│   └── *.xlsx              the research workbook (source data)
└── docs/                   research report, database notes, original sketch
```

Scripts load in a fixed order on every page: data, then `script.js`, then the
page's own file. A page file assumes the shared helpers already exist.

## Putting it on GitHub

**If you have NOT created the repository yet**, one command does everything:

```
bash tools/setup-github.sh
```

It checks your setup, signs you in if needed, creates the repository, pushes
the code and turns on GitHub Pages, so the site goes live at
`https://<your-username>.github.io/loand/`.

Needs [Git](https://git-scm.com/downloads) and the
[GitHub CLI](https://github.com/cli/cli#installation) (`brew install gh` on
macOS, `winget install GitHub.cli` on Windows). On Windows, run it from Git
Bash rather than PowerShell.

Options:

```
bash tools/setup-github.sh my-repo-name    # choose the name (default: loand)
REPO_PRIVATE=1 bash tools/setup-github.sh  # private repo
```

It refuses to touch a repository that already exists, so it can't overwrite
anything by accident.

**If you already created the repository on GitHub** (with a README, a licence
or a .gitignore), use this instead:

```
bash tools/push-to-existing.sh your-name/loand
```

It joins your files onto the repository's existing history, prints exactly what
will change, warns you if anything on GitHub would be deleted, and pushes only
after you confirm. Nothing is sent if you answer no.

For every change after that:

```
bash tools/deploy.sh "what you changed"
```

That commits, pushes and republishes. If a newer research workbook is sitting
in `tools/`, it rebuilds `data/research.js` first, so a new release can't be
left half-applied.

## Updating the research data

The site reads `data/research.js`, generated from the research workbook. When a
new workbook arrives, put it in `tools/` and run:

```
pip install openpyxl
python3 tools/convert.py
```

It uses the newest workbook it finds, or pass a path as an argument.
Never edit `data/research.js` by hand: fix the spreadsheet and re-run.

After a new release, re-check `GENERAL_CONDITION_RULES` in
`js/lender-match.js`. It lists the rule IDs reviewed as applying to ordinary
cases; unreviewed rules are treated as special routes and never used to judge
someone's figures.

## Data handling rules

Deliberate, and worth keeping:

- Only `CONFIRMED` rules decide whether figures fall within a lender's limits.
- `OUTDATED` rows are kept for the record but never shown as facts.
- `NOT VERIFIED` means "we could not retrieve it", never "not offered".
- Rates older than 7 days are flagged as possibly stale.
- No lender is scored or ranked.
- Approval and acceptance rates are shown as "not publicly disclosed", never estimated.
- All research text is escaped before it reaches the page.
- Rates that undercut the same lender's own smaller-loan bands are marked
  "check" and sorted last, never hidden. Mortgage rates should rise as the
  loan-to-value rises, so a reversal usually means the research couldn't
  separate two product segments. The check compares adjacent bands only, at
  equal product fees, with a small tolerance, because a genuinely cheaper rate
  at a higher LTV does exist when the fee is much larger.

## Still to build

- Loans calculator (the personal-loan data is already in place)
- Node/Express backend and PostgreSQL, replacing the generated data file
- User accounts and saved calculations
