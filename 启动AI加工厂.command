#!/bin/zsh
set -eu

FACTORY_ROOT="${0:A:h}"
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
if ! command -v node >/dev/null; then
  for FACTORY_NODE_BIN in "$HOME"/.local/node-v*/bin(N); do
    export PATH="$FACTORY_NODE_BIN:$PATH"
  done
fi

fail() {
  print -u2 -- "$1"
  if [[ -t 0 ]]; then
    read -r '?按回车退出。'
  fi
  exit 1
}

command -v node >/dev/null || fail '缺少 Node.js，请先安装 Node.js 22–24。'
command -v bun >/dev/null || fail '缺少 Bun，请先安装 Bun。'
cd "$FACTORY_ROOT/AionUi"
[[ -d node_modules ]] || fail '缺少前端依赖，请先在 AionUi 目录执行 bun install。'
node -e 'require("electron")' >/dev/null 2>&1 || fail '缺少 Electron，请在 AionUi 目录执行 node node_modules/electron/install.js。'

if [[ -z "${AIONUI_BACKEND_BIN:-}" ]]; then
  if [[ -x "$FACTORY_ROOT/AionCore/target/debug/aioncore" ]]; then
    export AIONUI_BACKEND_BIN="$FACTORY_ROOT/AionCore/target/debug/aioncore"
  elif [[ -x "$FACTORY_ROOT/AionCore/target/release/aioncore" ]]; then
    export AIONUI_BACKEND_BIN="$FACTORY_ROOT/AionCore/target/release/aioncore"
  else
    fail '缺少后端，请先在 AionCore 目录执行 cargo build --locked -p aionui-app。'
  fi
fi
[[ -x "$AIONUI_BACKEND_BIN" ]] || fail "后端不可执行：$AIONUI_BACKEND_BIN"
print -- '正在启动 AI产品加工厂。关闭应用后，可关闭此终端窗口。'
exec bun run start
