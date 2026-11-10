#!/usr/bin/env bash
# Build the release of the Brain app (`brain`) onto this repo's `release` branch, the branch KiroCrew installs from.
# KiroCrew's App Store reads this repo as a source (Apps → Discover → gear → Sources, the repo URL, branch release):
# the release branch's app-registry.json lists `brain` (KiroCrew installs a same-repo entry from the source's own branch,
# whatever the entry says: indexes.py), and the branch holds the app at its root: app.json,
# backend/, the built ui/dist/ and the brain-kit the app runs on (vendor/brain-kit, with its AI-DLC Lean), and no
# package.json / pyproject.toml / setup.py / requirements.txt, so KiroCrew's install runs no npm or pip: the installer
# needs no node and no brain-kit checkout. One commit per release on top of the last one.
#
#   scripts/release.sh               # UI check + build, assemble, check, one commit on the local branch `release`
#   scripts/release.sh --push        # the same, then push `release` to origin
#   scripts/release.sh --no-test     # skip the UI type check and tests (the build and every release check still run)
#
# What goes in: the app at the COMMITTED HEAD of this checkout (git archive; the working tree never), brain-kit at
# BRAINKIT_COMMIT from $BRAINKIT_REPO and Lean at the vendor/aidlc-lean commit brain-kit records there, from
# $LEAN_REPO; both must be on a remote branch (public), both exported with git archive (tracked files only), their
# tests/ left out. What stays out: tests, the preview, scripts, signer/ (the team runner's, deployed from main),
# BRAINKIT_REQUESTS.md, the dev README, ui/ sources and package files. INSTALL.md becomes the branch's README.md.
# Bump app.json's "version" for a release people should be offered as an update.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
PY3=/usr/bin/python3
[ -x "$PY3" ] || PY3="$(command -v python3)"
BRAINKIT_REPO="${BRAINKIT_REPO:-$HOME/warren_ws/brain-kit}"
BRAINKIT_COMMIT="${BRAINKIT_COMMIT:-0892fdb09799da7349247170e02c2687063c8c1a}"
LEAN_REPO="${LEAN_REPO:-$HOME/warren_ws/aidlc/aidlc-lean}"
BRANCH=release
TEST=1
PUSH=0
die() { echo "!! $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-test) TEST=0; shift ;;
    --push) PUSH=1; shift ;;
    *) die "unknown flag: $1" ;;
  esac
done

# node's folder, as dev-install.sh finds it ($NODE_BIN, PATH, Homebrew, nvm), and ~/.local/bin
node_ok() { [ -x "$1/node" ] && [ "$("$1/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ]; }
if [ -z "${NODE_BIN:-}" ]; then
  for d in "$(dirname "$(command -v node 2>/dev/null || echo /nonexistent/node)")" /opt/homebrew/bin /usr/local/bin \
           "$HOME/.local/bin" $(ls -d "$HOME"/.nvm/versions/node/v*/bin 2>/dev/null | sort -t v -k 2 -V -r); do
    node_ok "$d" && { NODE_BIN="$d"; break; }
  done
fi
[ -n "${NODE_BIN:-}" ] && node_ok "$NODE_BIN" || die "need node 22 or newer: install it, or pass NODE_BIN=<folder of node>"
export PATH="$NODE_BIN:$PATH"

# --- the pins ---------------------------------------------------------------------------------------------------- #
APP_COMMIT="$(git -C "$ROOT" rev-parse HEAD)"
BK="$(git -C "$BRAINKIT_REPO" rev-parse --verify "$BRAINKIT_COMMIT^{commit}")" || die "no brain-kit commit $BRAINKIT_COMMIT in $BRAINKIT_REPO"
[ -n "$(git -C "$BRAINKIT_REPO" branch -r --contains "$BK" 2>/dev/null)" ] || die "brain-kit $BK is on no remote branch: push it (public) first"
LEAN="$(git -C "$BRAINKIT_REPO" rev-parse "$BK:vendor/aidlc-lean")" || die "brain-kit $BK records no vendor/aidlc-lean"
git -C "$LEAN_REPO" rev-parse --verify -q "$LEAN^{commit}" >/dev/null || die "no Lean commit $LEAN in $LEAN_REPO"
[ -n "$(git -C "$LEAN_REPO" branch -r --contains "$LEAN" 2>/dev/null)" ] || die "Lean $LEAN is on no remote branch"
AUTHOR_NAME="$(git -C "$ROOT" config user.name)" || die "no git user.name in $ROOT"
AUTHOR_EMAIL="$(git -C "$ROOT" config user.email)" || die "no git user.email in $ROOT"
[ -z "$(git -C "$ROOT" status --porcelain)" ] || echo "   (this checkout has uncommitted changes: they are NOT released, HEAD is)"
echo "== app $APP_COMMIT, brain-kit $BK, AI-DLC Lean $LEAN, node $("$NODE_BIN/node" --version)"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/brain-release.XXXXXX")"
WT="$STAGE/wt"
cleanup() { [ ! -d "$WT" ] || git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || true; rm -rf "$STAGE"; }
trap cleanup EXIT
SRC="$STAGE/src"; REL="$STAGE/release"; A="$REL"
mkdir -p "$SRC" "$A/ui" "$A/vendor/brain-kit"
git -C "$ROOT" archive HEAD | tar -x -C "$SRC"

# --- the UI ------------------------------------------------------------------------------------------------------ #
echo "== UI: npm ci"
(cd "$SRC/ui" && "$NODE_BIN/npm" ci --no-audit --no-fund --prefer-offline --silent)
if [ "$TEST" = 1 ]; then
  echo "== UI: type check and tests (--no-test skips)"
  (cd "$SRC/ui" && "$NODE_BIN/npm" run typecheck --silent && "$NODE_BIN/npm" run test --silent)
fi
echo "== UI: build"
(cd "$SRC/ui" && "$NODE_BIN/npm" run build --silent)
"$NODE_BIN/node" --check "$SRC/ui/dist/index.mjs"
if grep -q -e '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED' -e 'react-dom.production' "$SRC/ui/dist/index.mjs"; then
  die "ui/dist/index.mjs contains React's own code: keep react / react-dom external in vite.config.ts"
fi

# --- the tree ---------------------------------------------------------------------------------------------------- #
echo "== assemble"
cp "$SRC/INSTALL.md" "$A/README.md"
cp "$SRC/release/gitignore" "$A/.gitignore"
cp "$SRC/LICENSE" "$A/LICENSE"
cp "$SRC/app.json" "$A/app.json"
cat > "$A/app-registry.json" <<'EOF'
[
  {
    "name": "brain",
    "gitUrl": "https://github.com/warren830/kirocrew-app-brain",
    "repo": "https://github.com/warren830/kirocrew-app-brain",
    "branch": "release"
  }
]
EOF
cp -R "$SRC/backend" "$A/backend"
cp -R "$SRC/ui/dist" "$A/ui/dist"
git -C "$BRAINKIT_REPO" archive "$BK" | tar -x -C "$A/vendor/brain-kit"
rm -rf "$A/vendor/brain-kit/tests" "$A/vendor/brain-kit/.gitmodules" "$A/vendor/brain-kit/vendor/aidlc-lean"
mkdir -p "$A/vendor/brain-kit/vendor/aidlc-lean"
git -C "$LEAN_REPO" archive "$LEAN" | tar -x -C "$A/vendor/brain-kit/vendor/aidlc-lean"
rm -rf "$A/vendor/brain-kit/vendor/aidlc-lean/tests"
find "$REL" \( -name __pycache__ -o -name '*.pyc' -o -name .DS_Store \) -prune -exec rm -rf {} +
cat > "$A/VERSIONS" <<EOF
brain (Brain 交付) $("$PY3" -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$A/app.json")
app         $APP_COMMIT  https://github.com/warren830/kirocrew-app-brain  (main; backend/, ui/dist/ built from ui/)
brain-kit   $BK  https://github.com/warren830/brain-kit  (vendor/brain-kit, git archive, tests/ left out)
aidlc-lean  $LEAN  https://github.com/warren830/aidlc-lean  (vendor/brain-kit/vendor/aidlc-lean, git archive, tests/ left out)
EOF

# --- the checks -------------------------------------------------------------------------------------------------- #
echo "== checks"
for f in package.json pyproject.toml setup.py requirements.txt; do
  [ ! -e "$A/$f" ] || die "$f would make KiroCrew run npm or pip on install"
done
[ -z "$(find "$REL" -type l)" ] || die "symlinks in the release: $(find "$REL" -type l | head -3)"
[ -f "$A/ui/dist/index.mjs" ] && [ -f "$A/backend/routes.py" ] && [ -f "$A/backend/hooks.py" ] || die "app files missing"
[ -x "$A/vendor/brain-kit/bin/brain" ] && [ -f "$A/vendor/brain-kit/vendor/aidlc-lean/install.sh" ] || die "brain-kit or Lean incomplete"
# The app's own loader, on the release tree: no $BRAINKIT_HOME, so the bundled brain-kit is found and passes the app's
# checks (its required modules and the interfaces of VERSION_NEEDED). -B: no __pycache__ in the tree.
env -u BRAINKIT_HOME "$PY3" -I -B - "$A" <<'EOF'
import importlib.util, json, os, sys
app = sys.argv[1]
spec = importlib.util.spec_from_file_location("_release_bk", os.path.join(app, "backend", "core", "bk.py"))
bk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bk)
want = os.path.realpath(os.path.join(app, "vendor", "brain-kit"))
got = bk.default_path()
assert os.path.realpath(got) == want, "default_path() is %s, not the bundled %s" % (got, want)
info = bk.load(got)
bk.unload()
assert info["ok"], "the bundled brain-kit fails the app's checks: %s" % info["error"]
print("   bundled brain-kit loads: version %s, needs %s or newer, optional modules %s"
      % (info["version"], bk.VERSION_NEEDED, json.dumps(info["modules"])))
EOF
"$PY3" -I -B "$SRC/scripts/release_secrets.py" "$REL" || die "secret check failed: nothing was committed"
# Names that must not reach a public tree (internal hosts, tools, people): one per line in a file outside the repo,
# so the list itself is not published.
WORDS="${RELEASE_WORDS:-$HOME/.config/brain-release/words}"
if [ -f "$WORDS" ]; then
  if grep -rniF -f "$WORDS" "$REL" | sed "s|^$REL/|   |" | cut -c1-200 | grep .; then
    die "the release tree holds names listed in $WORDS: nothing was committed"
  fi
  echo "== no name from $WORDS in the tree"
else
  echo "   (no $WORDS: the internal-name check did not run)"
fi
echo "== bind scan (each hit must be loopback or explained)"
grep -rnE '0\.0\.0\.0|\[::\]|--host|listen\(' "$REL" | sed "s|^$REL/|   |" | cut -c1-200 || echo "   none"

# --- the release branch ------------------------------------------------------------------------------------------ #
echo "== commit onto $BRANCH"
if git -C "$ROOT" rev-parse --verify -q "refs/heads/$BRANCH" >/dev/null; then
  git -C "$ROOT" worktree add -q "$WT" "$BRANCH" || die "can't check out $BRANCH (checked out somewhere else?)"
elif git -C "$ROOT" rev-parse --verify -q "refs/remotes/origin/$BRANCH" >/dev/null; then
  git -C "$ROOT" worktree add -q -b "$BRANCH" "$WT" "origin/$BRANCH"
else
  git -C "$ROOT" worktree add -q --orphan -b "$BRANCH" "$WT"
fi
[ -z "$(git -C "$WT" ls-files)" ] || [ -f "$WT/VERSIONS" ] || die "$BRANCH is not a release branch made by this script"
git -C "$WT" ls-files -z | (cd "$WT" && xargs -0 rm -f)
find "$WT" -mindepth 1 -path "$WT/.git" -prune -o -type d -print | sort -r | while read -r d; do rmdir "$d" 2>/dev/null || true; done
cp -R "$REL/." "$WT/"
git -C "$WT" add -A
if [ -z "$(git -C "$WT" status --porcelain)" ]; then
  echo "   nothing changed since the last release"
else
  git -C "$WT" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" commit -q \
    -m "brain $(cut -c1-7 <<<"$APP_COMMIT"): brain-kit $(cut -c1-7 <<<"$BK"), AI-DLC Lean $(cut -c1-7 <<<"$LEAN")"
fi
# Every file of the tree is in the commit (no .gitignore inside the vendored repos dropped one), and the committed
# tree passes the secret check again.
diff <(cd "$REL" && find . -type f | sed 's|^\./||' | LC_ALL=C sort) \
     <(git -C "$WT" -c core.quotePath=false ls-files | LC_ALL=C sort) \
  || die "the commit on $BRANCH does not hold exactly the release tree"
mkdir "$STAGE/committed"
git -C "$WT" archive HEAD | tar -x -C "$STAGE/committed"
"$PY3" -I -B "$SRC/scripts/release_secrets.py" "$STAGE/committed" || die "secret check failed on the commit on $BRANCH"
REV="$(git -C "$WT" rev-parse --short HEAD)"
if [ "$PUSH" = 1 ]; then
  echo "== push $BRANCH to origin"
  git -C "$ROOT" push origin "$BRANCH"
  echo "== done: $BRANCH at $REV ($(git -C "$WT" ls-files | wc -l | tr -d ' ') files, $(du -sh "$STAGE/committed" | cut -f1)), pushed"
else
  echo "== done: $BRANCH at $REV ($(git -C "$WT" ls-files | wc -l | tr -d ' ') files, $(du -sh "$STAGE/committed" | cut -f1)); not pushed: git push origin $BRANCH"
fi
