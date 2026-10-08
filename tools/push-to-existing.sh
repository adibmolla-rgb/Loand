#!/usr/bin/env bash
#
# Push this project into a GitHub repository that ALREADY EXISTS and
# already has commits (e.g. you created it with a README and .gitignore).
#
#   bash tools/push-to-existing.sh https://github.com/you/loand.git
#   bash tools/push-to-existing.sh you/loand
#   bash tools/push-to-existing.sh                 -> asks for it
#
# It joins your local files onto the repository's existing history, shows
# exactly what will change, and only pushes once you say yes.
#
set -euo pipefail

cd "$(dirname "$0")/.."

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null || fail "Git isn't installed: https://git-scm.com/downloads"
[ -f index.html ] || fail "No index.html here. Run this from inside the Loand folder."

# ---------- 1. Where are we pushing? ----------

REPO="${1:-}"
if [ -z "$REPO" ]; then
    read -r -p "Repository (e.g. your-name/loand, or the full https URL): " REPO
fi
[ -n "$REPO" ] || fail "No repository given."

# "you/loand" is expanded to a full URL; a full URL is used as-is.
case "$REPO" in
    http*|git@*|ssh://*) REMOTE_URL="$REPO" ;;
    /*|./*|../*)         REMOTE_URL="$REPO" ;;              # a local path (used in testing)
    */*)                 REMOTE_URL="https://github.com/${REPO%.git}.git" ;;
    *)                   fail "Expected 'owner/repo' or a full URL, got: $REPO" ;;
esac

say "Target: $REMOTE_URL"

# ---------- 2. Local repository and remote ----------

if [ ! -d .git ]; then
    git init -q
    git symbolic-ref HEAD refs/heads/main
fi

if ! git config user.name >/dev/null; then
    read -r -p "Your name (for commit history): " NAME; git config user.name "$NAME"
fi
if ! git config user.email >/dev/null; then
    read -r -p "Your email (for commit history): " EMAIL; git config user.email "$EMAIL"
fi

if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$REMOTE_URL"
else
    git remote add origin "$REMOTE_URL"
fi

say "Fetching what's already in the repository"
git fetch -q origin || fail "Couldn't reach the repository. Check the address, and that you have access."

# Whichever branch the repo uses.
BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p' | head -1)"
BRANCH="${BRANCH:-main}"
echo "Branch: $BRANCH"

# ---------- 3. Join onto the existing history ----------

# "reset" points this repository at the remote's latest commit WITHOUT
# touching any of your files. Git then sees your folder as a set of changes
# on top of what's already on GitHub, which avoids the "unrelated histories"
# problem entirely.
git checkout -q -B "$BRANCH"
git reset -q "origin/$BRANCH"

git add -A

if git diff --cached --quiet; then
    say "Nothing to push: GitHub already matches this folder."
    exit 0
fi

# ---------- 4. Show what will change, then confirm ----------

say "What this will change on GitHub"
git diff --cached --stat | tail -40

DELETES="$(git diff --cached --name-status --diff-filter=D | cut -f2 || true)"
if [ -n "$DELETES" ]; then
    warn ""
    warn "These files are on GitHub but NOT in this folder, so they would be deleted:"
    echo "$DELETES" | sed 's/^/  /'
    warn "If you want to keep any of them, stop now (Ctrl+C), copy them into this"
    warn "folder, and run this again."
fi

printf '\n'
read -r -p "Push these changes? [y/N] " REPLY
case "$REPLY" in
    [yY]*) ;;
    *) git reset -q; fail "Stopped. Nothing was pushed." ;;
esac

# ---------- 5. Commit and push ----------

MESSAGE="${2:-LoanD: mortgage calculator, lender criteria and comparison}"
git commit -qm "$MESSAGE"
git push -q origin "$BRANCH"

say "Pushed"
OWNER_REPO="$(echo "$REMOTE_URL" | sed -E 's#.*github.com[:/]##; s#\.git$##')"
echo "Code:  https://github.com/$OWNER_REPO"
echo "Site:  https://${OWNER_REPO%%/*}.github.io/${OWNER_REPO##*/}/"
echo
echo "If the site isn't live yet, turn on GitHub Pages:"
echo "  Settings -> Pages -> Branch: $BRANCH, folder: / (root)"
echo
echo "For later changes:  bash tools/deploy.sh \"what you changed\""
