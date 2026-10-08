"""Usage: python3 tools/convert.py [path/to/workbook.xlsx]

Convert the Loand research workbook into data/research.js.
Every data sheet becomes an array of row objects with snake_case keys.
Values are copied as-is: text stays text, numbers stay numbers.
With no argument, the newest Loand_UK_Lender_Research_*.xlsx in tools/ is used."""
import openpyxl, json, re, sys, os, glob, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1:
    SRC = sys.argv[1]
else:
    SRC = sorted(glob.glob(os.path.join(HERE, "Loand_UK_Lender_Research_*.xlsx")))[-1]
OUT = os.path.join(HERE, "..", "data", "research.js")
SKIP = {"README", "QC_Summary"}

def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")

def make_keys(headers):
    """'Initial rate' -> initial_rate. Bracketed words are dropped
    ('Type (Government / lender)' -> type) UNLESS that would clash with an
    earlier column, in which case they're kept: 'Initial rate (number)' ->
    initial_rate_number. This keeps old keys stable and new keys unique."""
    keys, used = [], set()
    for h in headers:
        if h is None:
            keys.append(None); continue
        short = slug(re.sub(r"\(.*?\)", "", str(h)))
        key = short if short not in used else slug(h)
        n = 2
        while key in used:
            key = f"{slug(h)}_{n}"; n += 1
        used.add(key); keys.append(key)
    return keys

def clean(value):
    if value is None: return None
    if isinstance(value, (datetime.date, datetime.datetime)): return value.strftime("%Y-%m-%d")
    if isinstance(value, float) and value.is_integer(): return int(value)
    if isinstance(value, (int, float)): return value
    return str(value).strip()

wb = openpyxl.load_workbook(SRC, data_only=True)
out, notes = {}, {}
for ws in wb.worksheets:
    if ws.title in SKIP: continue
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if sum(c is not None for c in r) >= 2)
    if hi > 0 and rows[0][0]: notes[slug(ws.title)] = rows[0][0]
    headers = make_keys(rows[hi])
    data = []
    for r in rows[hi + 1:]:
        if all(c is None for c in r):
            if data: break
            continue
        data.append({h: clean(v) for h, v in zip(headers, r) if h})
    out[slug(ws.title)] = data
    print(f"{ws.title}: {len(data)} rows", file=sys.stderr)

# Release date comes from the file name, e.g. ..._2026-09-27.xlsx
date = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(SRC))
meta = {"data_as_at": date.group(1) if date else None,
        "source_file": os.path.basename(SRC), "sheet_notes": notes}

with open(OUT, "w", encoding="utf-8") as f:
    f.write(f"/* AUTO-GENERATED from {os.path.basename(SRC)} by tools/convert.py.\n"
            "   Do not edit by hand: fix the spreadsheet and re-run the script. */\n")
    f.write("window.LOAND_RESEARCH = " + json.dumps({"meta": meta, **out}, indent=1, ensure_ascii=False) + ";\n")
print("Wrote", OUT, file=sys.stderr)
