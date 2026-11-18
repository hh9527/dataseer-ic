#!/usr/bin/env bash
# dari LSP 启动器，供 Helix 等编辑器调用。
#
# 工作区取当前目录：Helix 会按 roots 规则向上找到 dari.json，再把 server 的 cwd
# 设为那个工作区根。模型由 <工作区>/dari.json 的 model 决定，可用环境变量覆盖：
#   DARI_LSP_MODEL=<wasm>    强制指定模型
#   DARI_LSP_ROOT=<目录>     覆盖工作区（其他编辑器用）
#   DARI_LSP_DEPLOY=<目录>   覆盖运行时所在部署
# 运行时默认从工作区位置推导（<deploy>/demo-ws → <deploy>），推导不出时退回 10924。
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# 工作区默认交给 LSP 自己判断（按打开的文件向上找 dari.json）；
# DARI_LSP_ROOT 可在编辑器不给正确根时强制指定。
WORKSPACE="${DARI_LSP_ROOT:-}"

DEPLOY="${DARI_LSP_DEPLOY:-}"
if [ -z "$DEPLOY" ]; then
  base="${WORKSPACE:-$PWD}"
  candidate="$(cd -- "$base/../.." 2>/dev/null && pwd || true)"
  if [ -n "$candidate" ] && [ -f "$candidate/packages/dsh-plugin-dari/dari-runtime/bin/dari-lsp.mjs" ]; then
    DEPLOY="$candidate"
  fi
fi
[ -n "$DEPLOY" ] || DEPLOY="$ROOT/.deploy/${DARI_LSP_PORT:-10924}/dsh"

LSP="$DEPLOY/packages/dsh-plugin-dari/dari-runtime/bin/dari-lsp.mjs"
[ -f "$LSP" ] || { echo "dari-lsp: 找不到 $LSP（先 just deploy <端口>）" >&2; exit 1; }

MODEL="${DARI_LSP_MODEL:-}"
WORKSPACE_ARG=()
[ -n "$WORKSPACE" ] && WORKSPACE_ARG=(--workspace "$WORKSPACE")
if [ -n "$MODEL" ]; then
  case "$MODEL" in
    *'"'*|*'\\'*) echo "dari-lsp: 模型路径里的引号或反斜杠目前不支持：$MODEL" >&2; exit 1 ;;
  esac
  exec node "$LSP" "${WORKSPACE_ARG[@]}" --options "{\"model\":\"$MODEL\"}"
fi
exec node "$LSP" "${WORKSPACE_ARG[@]}"
