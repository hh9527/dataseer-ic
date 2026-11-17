#!/usr/bin/env bash
# 用法：archive-run.sh <结果文件名，如 r106-6.md>
set -euo pipefail
LAB=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${TESTER_STATE_DIR:=$LAB/.tester/10924}"
f=${1:?请指定结果文件名}
[[ "$f" == "$(basename -- "$f")" && "$f" == *.md ]] || { echo '请指定 Markdown 文件名' >&2; exit 1; }
src="$TESTER_STATE_DIR/samples/$f"
[ -f "$src" ] || { echo "找不到 $src" >&2; exit 1; }
mkdir -p "$LAB/runs"
cp -- "$src" "$LAB/runs/$f"
echo "已归档 $f → $LAB/runs/"
