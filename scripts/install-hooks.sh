#!/usr/bin/env bash
# Installs a git post-commit hook that automatically pushes to GitHub.
# Run once: bash scripts/install-hooks.sh
set -e

HOOK_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_FILE="$HOOK_DIR/post-commit"

cat > "$HOOK_FILE" << 'EOF'
#!/usr/bin/env bash
# Auto-push to GitHub after every commit.
if [ -z "$GITHUB_PAT" ]; then
  echo "[sync] GITHUB_PAT not set — skipping GitHub push"
  exit 0
fi
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "[sync] Pushing '$BRANCH' to GitHub…"
git push "https://${GITHUB_PAT}@github.com/evilos619-cell/sammystore.git" "${BRANCH}:${BRANCH}" 2>&1 \
  | sed "s/${GITHUB_PAT}/****/g"
EOF

chmod +x "$HOOK_FILE"
echo "✅ post-commit hook installed at $HOOK_FILE"
