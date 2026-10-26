# REA 本地运行时

本目录固定使用 [morluto/rea](https://github.com/morluto/rea) 发布的 `rea-agents@6.7.0`，供 AI 产品加工厂的本地 JavaScript / Electron 静态取证和功能线索追踪使用。REA 自身代码遵循 MIT 许可证；第三方组件保留各自许可证，见上游 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。

在项目根目录双击 `配置REA.command`，或在此目录执行：

```sh
npm ci --omit=optional --ignore-scripts --no-audit --no-fund
```

需要 Node.js 22.19+（22.x）、24.11+（24.x）或 26+。工厂前端当前支持 Node.js 22–24，建议统一使用 24.11+（24.x）。

`启动AI加工厂.command` 会将本地可执行文件通过 `AIFACTORY_REA_BIN` 传给后端。直接启动后端或运行端到端测试时，也可自行设置该变量，或将已安装的 `rea` 放入 `PATH`。状态检查不会自动下载依赖；依赖缺失时，页面显示配置指引。

此安装只准备项目内的 CLI，不运行 `rea setup`，不修改任何 Agent 的全局 MCP / Skill 配置，也不安装 Hopper、Ghidra、IDA 或 Frida。静态分析读取用户指定的目录或 ASAR，不执行目标应用。
