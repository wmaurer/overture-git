#!/usr/bin/env bash
set -euo pipefail

command -v git >/dev/null 2>&1 || {
  echo "git is required but not found in PATH" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REFERENCES_DIR="$REPO_ROOT/.references"

mkdir -p "$REFERENCES_DIR"

repos=(
  "effect|https://github.com/Effect-TS/effect-smol.git"
  "kdl|https://github.com/bgotink/kdl.git"
  "env-paths|https://github.com/sindresorhus/env-paths.git"
)

for entry in "${repos[@]}"; do
  name="${entry%%|*}"
  url="${entry#*|}"
  target="$REFERENCES_DIR/$name"

  if [ -d "$target/.git" ]; then
    echo "Updating $name..."
    git -C "$target" pull --rebase --depth 1
    echo "✓ $name up to date"
    echo
    continue
  fi

  echo "Cloning $name from $url..."
  git clone --depth 1 "$url" "$target"
  echo "✓ Finished cloning $name"
  echo
done

echo "References ready in $REFERENCES_DIR"
