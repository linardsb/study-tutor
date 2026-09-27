#!/usr/bin/env bash
# Copies the E1 files from this folder into the v1 tutor folder, then runs both tests there.
#   bash e1/install.sh [path-to-v1-folder]
# Copies only. Never touches sessions.md, topics.md, assets/progress-data.js, MISSION.md or
# learning-records/, and deletes nothing.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
V1="${1:-$HOME/Desktop/Matis_study_tutor}"

for need in "$V1/assets/generate.js" "$V1/assets/progress-data.js"; do
  if [ ! -f "$need" ]; then
    echo "refusing: $need is missing, so $V1 is not the tutor folder" >&2
    exit 1
  fi
done

mkdir -p "$V1/.claude/tools"

copied=()
copy() {
  cp "$HERE/$1" "$V1/$2"
  copied+=("$2")
}
copy map.html map.html
copy case.html case.html
copy assets/case.js assets/case.js
copy assets/quiz.js assets/quiz.js
copy "Open map.bat" "Open map.bat"
copy "Open case.bat" "Open case.bat"
copy test-case.js .claude/tools/test-case.js

echo "copied into $V1:"
for f in "${copied[@]}"; do echo "  $f"; done
echo

echo "== test-case.js =="
V1="$V1" bun "$V1/.claude/tools/test-case.js"
echo
echo "== test-generators.js =="
node "$V1/.claude/tools/test-generators.js"
