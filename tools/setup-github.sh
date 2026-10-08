#!/usr/bin/env bash
#
# First-time GitHub setup for LoanD. Run this once.
#
#   bash tools/setup-github.sh            -> repo named "loand", public
#   bash tools/setup-github.sh my-name    -> choose the repo name
#   REPO_PRIVATE=1 bash tools/setup-github.sh
#
# It creates the repo, pushes the code and turns on GitHub Pages so the
# site is live at a public URL.
#
# "set -e" stops at the first failing command, so a half-finished setup
# can't be mistaken for a working one.
set -euo pipefail

REPO_NAME="${1:-loand}"
VISIBILITY="public"
[ "${REPO_PRIVATE:-0}" = "1" ] && VISIBILITY="private"

# Always work from the project root, whichever folder the script is run from.
cd "$(dirname "$0")/.."

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# ---------- 1. Checks, before anything is changed ----------

say "Checking your setup"

command -v git >/dev/null || fail "Git isn't installed. Get it from https://git-scm.com/downloads"

if ! command -v gh >/dev/null; then
    fail "The GitHub CLI isn't installed. Install it, then run this again:
  macOS:    brew install gh
  Windows:  winget install GitHub.cli
  Linux:    see https://github.com/cli/cli#installation"
fi

if ! gh auth status >/dev/null 2>&1; then
    say "You're not signed in to GitHub. Opening the sign-in flow."
    gh auth login
fi

USER_NAME="$(gh api user --jq .login)"
echo "Signed in as $USER_NAME"

# Refuse rather than touch a repo that already exists.
if gh repo view "$USER_NAME/$REPO_NAME" >/dev/null 2>&1; then
    fail "$USER_NAME/$REPO_NAME already exists.
Pick another name:  bash tools/setup-github.sh loand-site
Or, if you want to push to it, use tools/deploy.sh instead."
fi

[ -f index.html ] || fail "No index.html here. Run this from inside the Loand folder."

# ---------- 2. Local repository ----------

say "Preparing the local repository"

if [ -d .git ]; then
    echo "Already a Git repository; keeping its history."
else
    git init -q
    git symbolic-ref HEAD refs/heads/main      # name the branch "main"
fi

# Git needs a name and email on the commit. Ask only if they're not set.
if ! git config user.name >/dev/null; then
    read -r -p "Your name (for commit history): " NAME
    git config user.name "$NAME"
fi
if ! git config user.email >/dev/null; then
    read -r -p "Your email (for commit history): " EMAIL
    git config user.email "$EMAIL"
fi

git add -A
if git diff --cached --quiet; then
    echo "Nothing new to commit."
else
    git commit -qm "LoanD: mortgage calculator, lender criteria and comparison"
fi

# ---------- 3. Create and push ----------

say "Creating $USER_NAME/$REPO_NAME ($VISIBILITY) and pushing"

gh repo create "$REPO_NAME" \
    --"$VISIBILITY" \
    --source=. \
    --remote=origin \
    --push \
    --description "UK mortgage and loan research tool: eligibility estimates, lender criteria and comparison, built on a sourced research database."

# ---------- 4. GitHub Pages ----------

say "Turning on GitHub Pages"

BRANCH="$(git branch --show-current)"
if gh api -X POST "repos/$USER_NAME/$REPO_NAME/pages" \
        -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1; then
    echo "Pages enabled."
else
    echo "Couldn't enable Pages automatically (this is common on private repos)."
    echo "Turn it on by hand: Settings -> Pages -> Branch: $BRANCH, folder: / (root)."
fi

# A description and topics make the repo readable to anyone who finds it.
gh repo edit "$USER_NAME/$REPO_NAME" \
    --homepage "https://$USER_NAME.github.io/$REPO_NAME/" \
    --add-topic fintech --add-topic mortgage --add-topic javascript \
    --add-topic data-analysis --add-topic uk >/dev/null 2>&1 || true

say "Done"
echo "Code:  https://github.com/$USER_NAME/$REPO_NAME"
echo "Site:  https://$USER_NAME.github.io/$REPO_NAME/"
echo
echo "The site takes a minute or two to appear the first time."
echo "For later changes:  bash tools/deploy.sh \"what you changed\""
