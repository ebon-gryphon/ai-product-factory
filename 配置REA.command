#!/bin/zsh
set -eu

FACTORY_ROOT="${0:A:h}"
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
if ! command -v node >/dev/null; then
  for FACTORY_NODE_BIN in "$HOME"/.local/node-v*/bin(N); do
    export PATH="$FACTORY_NODE_BIN:$PATH"
  done
fi

command -v npm >/dev/null || { print -u2 -- '缺少 Node.js/npm，请先安装 Node.js 22.19+ 或 24.11+。'; exit 1; }
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26)) { console.error("REA 需要 Node.js 22.19+（22.x）、24.11+（24.x）或 26+，当前为 " + process.versions.node); process.exit(1); }'
cd "$FACTORY_ROOT/tools/rea"
print -- '正在安装本项目使用的 REA 6.7.0 运行时。'
npm ci --omit=optional --ignore-scripts --no-audit --no-fund
./node_modules/.bin/rea --version
print -- 'REA 已就绪。重新启动 AI加工厂后，即可在 REA 逆向工程板块运行取证。'
