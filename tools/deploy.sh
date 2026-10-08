#!/usr/bin/env bash
#
# Push changes to GitHub. Use this after the first-time setup.
#
#   bash tools/deploy.sh "added the loans calculator"
#   bash tools/deploy.sh            -> uses a dated message
#
set -euo pipefail

cd "$(dirname "$0")/.."

MESSAGE="${1:-Update $(date +%Y-%m-%d)}"

[ -d .git ] || { echo "Not set up yet. Run: bash tools/setup-github.sh" >&2; exit 1; }

# If a research release arrived that data/research.js wasn't built from,
# regenerate it, so a new workbook can't be left half-applied. This compares
# the recorded source file, not timestamps: copying files changes timestamps
# and would otherwise rebuild on every single deploy.
NEWEST_BOOK="$(ls -t tools/Loand_UK_Lender_Research_*.xlsx 2>/dev/null | head -1 || true)"
if [ -n "$NEWEST_BOOK" ]; then
    BOOK_NAME="$(basename "$NEWEST_BOOK")"
    BUILT_FROM="$(grep -o '"source_file": "[^"]*"' data/research.js | head -1 | cut -d'"' -f4)"
    if [ "$BOOK_NAME" != "$BUILT_FROM" ]; then
        echo "New research release ($BOOK_NAME); rebuilding data/research.js."
        python3 tools/convert.py 2>/dev/null || {
            echo "Rebuild failed. Install openpyxl (pip install openpyxl) and try again." >&2
            exit 1
        }
    fi
fi

git add -A
if git diff --cached --quiet; then
    echo "No changes to push."
    exit 0
fi

git status --short
git commit -qm "$MESSAGE"
git push -q origin "$(git branch --show-current)"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo "")"
echo "Pushed: $MESSAGE"
[ -n "$REPO" ] && echo "Live in a minute or so at https://${REPO%%/*}.github.io/${REPO##*/}/"
