# AI产品加工厂

<p>
  <a href="https://github.com/ebon-gryphon/ai-product-factory/blob/main/docs/demo.html">
    <img src="AionUi/public/pwa/icon-192.png" width="64" height="64" align="middle" alt="AI产品加工厂图标" />
    <strong>体验 Demo · 下载独立 HTML</strong>
  </a>
</p>

打开上方链接，在 GitHub 文件页点击 **Download raw file（下载原始文件）**，下载后双击 `demo.html` 即可体验。图标、样式和脚本全部内置，无需安装、启动服务或联网。仓库目前为私有，需要有仓库访问权限。

Demo 支持四个工序的任务选择、草稿编辑和清空；不连接 AI 服务，不会自动生成产品。

把产品想法加工成需求、原型、开发任务和验收成果。面向个人和小团队的 AI 产品制作工作台。

本版本基于同级的 product-manager-workbench-main 独立复制改造，原目录未编辑。按用户确认的 AI 产品加工厂方向定制。

## 已完成的改造

- 首页增加产品定义、原型设计、开发拆解、验收交付四个工序入口，点击后追加任务草稿，保留已有输入，发送期间禁用选择。
- 更换应用显示名称、首页文案与卡片布局；侧栏、桌面和 PWA 沿用已确认的战车工厂图标。
- 设置独立桌面 appId、可执行文件名称及开发数据目录 AIFactory-Dev。
- 保留原有助手、会话、项目文件夹、模型对比与后端架构。
- 新增文案提供简体中文和英文；其他语言暂用英文。旧有多语言内容保持原状。

首页工序卡片仍用于编辑提示词；侧栏的「生产项目」提供持久化的四工序流程，AI 执行通过原有助手、模型和会话链路完成。

## 生产项目使用方式

1. 在设置中配置模型 API；新建生产项目，填写产品资料并选择助手和模型。自定义 API 模型使用 Aion CLI 助手。
2. 执行当前工序，或连续执行剩余工序。流程依次生成需求、HTML 原型、开发任务、验收报告。需要回答问题或批准操作时，页面显示等待提示，可直接打开正在执行的会话处理。
3. 审阅并编辑成果，每次保存创建新版本；恢复旧版本也会保留历史。修改上游成果会让下游成果过期。
4. 按顺序人工验收工序，完成交付清单后确认最后一道工序；可导出 Markdown 交付文档、JSON 版本档案和 HTML 原型。

项目保存到后端 SQLite。离开页面不停止任务；退出应用后未完成任务会标为中断，需要手动重试，不自动重放收费请求。模型生成不会自动视为人工验收通过。原型在隔离预览中运行，外部网络禁用，部分浏览器存储能力受限；需要完整浏览器环境时下载 HTML。

当前流程交付的是需求、原型、开发计划和验收记录；完整业务系统的实现与上线需要按开发计划继续推进。已使用用户配置的 MiMo `mimo-v2.5` 和 DeepSeek `deepseek-flash` 开展真实 API 联调，结果见下方本轮验收记录。

品牌图标固定使用现有战车工厂素材（`AionUi/resources/app.png`），后续开发保留这版，不以字母标识或新设计替换。

## 获取项目

仓库：[ebon-gryphon/ai-product-factory](https://github.com/ebon-gryphon/ai-product-factory)，当前为私有仓库。

```sh
gh repo clone ebon-gryphon/ai-product-factory
cd ai-product-factory/AionUi
bun install --ignore-scripts
```

以上安装方式用于首页预览与前端检查；完整桌面启动按下文准备后端和 Electron。

## 查看界面

直接下载上方的 [HTML Demo](docs/demo.html)，用浏览器打开即可。

开发者如需重新生成 HTML，在安装前端依赖后执行：

```sh
node docs/preview/build-demo.mjs
```

预览复用正式工序组件，支持选择工序、编辑和清空草稿，不连接 AI 服务。截图见 [首页预览](docs/factory-preview.png)。

## 启动完整桌面应用

需要 Node.js 22–24、Bun、Rust/Cargo 工具链。2026-10-08 已在本机 Apple Silicon macOS 完成 Rust 1.95.0、Electron 37.10.3 和原生数据库依赖安装，编译后端并验证完整桌面启动。

**本机启动：双击项目根目录的 `启动AI加工厂.command`。** 该入口会自动定位本机 Node/Bun 和已编译的后端，启动开发版桌面应用。需要保留终端窗口；这不是已打包的安装版。开发数据存放在 `~/Library/Application Support/AIFactory-Dev/`。

首次在其他机器准备环境时：

```sh
cd AionCore
cargo build --locked -p aionui-app
cd ../AionUi
bun install
node node_modules/electron/install.js
AIONUI_BACKEND_BIN="$(cd ../AionCore && pwd)/target/debug/aioncore" bun run start
```

首次进入后，配置模型服务、凭据和助手，再选择项目资料并发送任务。此副本没有附带模型账号或密钥。更多环境说明见 [原项目开发文档](AionUi/docs/contributing/development.md)。

如 crates.io 下载超时，可在 `AionCore` 下使用本次验证过的临时镜像配置，不修改全局 Cargo 配置：

```sh
CARGO_HTTP_MULTIPLEXING=false cargo \
  --config 'source.crates-io.replace-with="factory-mirror"' \
  --config 'source.factory-mirror.registry="sparse+https://rsproxy.cn/index/"' \
  build --locked -p aionui-app
```

## 验证情况

- TypeScript 检查通过。
- 国际化键完整性与生成类型同步检查通过。
- Electron 主进程、预加载与渲染端生产构建通过，存在原有大体积 chunk 提示。
- 前端全量测试 5,025 项通过、5 项跳过（526 个测试文件通过、1 个跳过）。
- 首页预览在 1280px 和 390px 宽度下检查，任务选择通过，无横向溢出。
- 2026-10-08 复验：TypeScript 检查、前端生产构建通过；启动管理与工序相关测试 47 项通过；Electron 内实际加载 SQLite 并执行查询成功。
- Rust 后端开发构建通过。真实桌面端 5 项 E2E 验收通过，覆盖窗口与页面加载、加载后未捕获异常检查、渲染端访问 `/health` 和 `/api/system/info`、四个工序追加草稿并保留原输入。
- 已通过 `启动AI加工厂.command` 启动本机开发版并检查首页。真实 AI 请求已在 2026-10-09 追加验证，尚未生成安装包。

2026-10-09 生产流程专项验收：8 项流程测试、2 项 HTTP 接口测试、6 项桌面 E2E 和 12 项侧栏测试通过；TypeScript、i18n、生产构建和 factory domain 的 Clippy 检查通过。流程测试使用模拟执行器，桌面测试验证真实后端与持久化，不代表真实模型已验收。

后端全量运行测试 9,402 项通过、52 项跳过。首次全量检查的文档测试因依赖库加载错误中断；串行重建后，工作区文档测试单独复跑通过。真实 CLI／模型凭据依赖项不因此视为已验收。

### 2026-10-09 真实模型联调结果

| 模型 | 已保存成果 | 本轮结论 |
| --- | --- | --- |
| MiMo `mimo-v2.5` | 需求、原型、开发任务、验收报告，4 个 AI 版本 | 四工序生成闭环完成，全部待人工验收 |
| DeepSeek `deepseek-flash` | 需求、原型、开发任务，3 个 AI 版本 | 最后报告回复流发生连接中断，保留失败状态，未计作完成 |

已独立在真实浏览器验证两份原型的添加、完成、删除、筛选、刷新保存、存储降级与安全文本展示；360px 宽度无横向溢出。DeepSeek 原型还在桌面应用内实际完成添加操作。MiMo 完整 JSON 档案经应用原生保存对话框导出，并与后端数据逐字段核对一致。

本轮修复了三处实际问题：等待授权时打开正在执行的会话；隔离预览支持本地表单交互且 CSP 继续禁止外发；macOS E2E 不再改写正常开发实例的共享数据/配置符号链接。修复后 3 项路径隔离测试、7 项桌面 E2E、TypeScript、i18n 校验和生产构建通过；扩展 lint 范围有 16 个警告、0 个错误（警告主要来自工具文件和串行 E2E）。

MiMo 首轮验收遇到服务商网络错误，重试后完成。路径隔离修复后 DeepSeek 第三工序恢复，最终第四工序收到 HTTP 200 但 SSE 连接中断、缺少完成标记，应用没有把半截回复当成成果。其工作目录中的验收报告仅为草稿；需要在项目第 4 工序重试成功后才能计作生成完成。

这些结果证明的是工厂调用和成果生成能力。开发工序按测试约定只拆解任务，正式待办产品实现与上线未完成；模型生成的验收报告也需人工判断。MiMo 曾声称写入需求文件，但文件未落盘，正文保存在应用版本中。DeepSeek 将测试标题中的模型 API 联调误读为待办后端 API 联调，原始报告保留供审阅。

证据见 [结构化验收记录](docs/validation/2026-10-09/validation.json)、[MiMo 版本档案](docs/validation/2026-10-09/mimo-project.json)、[DeepSeek 版本档案](docs/validation/2026-10-09/deepseek-project.json)。可直接打开 [MiMo 原型](docs/validation/2026-10-09/mimo-prototype.html) 或 [DeepSeek 原型](docs/validation/2026-10-09/deepseek-prototype.html)。战车工厂图标保持原样。

复跑桌面启动验收（先执行 `bun run package`，在 `AionUi` 目录运行）：

```sh
AIONUI_BACKEND_BIN="$(cd ../AionCore && pwd)/target/debug/aioncore" \
  bunx playwright test tests/e2e/specs/app-launch.e2e.ts \
  tests/e2e/specs/factory-startup.e2e.ts --reporter=list
```

结构分析和改造边界见 [架构与改造说明](docs/FACTORY-ARCHITECTURE.md)。

## 提交与推送

在仓库根目录运行 `just check`，统一检查前后端的迁移、格式、lint、类型、国际化与全量测试。需要先安装 Just、Rust、Node.js 和 Bun，并安装前端依赖。提交后运行 `just push origin main`；任一检查失败都会阻止推送。数据库迁移保护同时支持当前合并仓库和独立后端目录。

## 来源与归属

基于周承健的产品经理工作台，以及 AionUi / AionCore 上游项目。原 README 保存在 [UPSTREAM-README.md](docs/UPSTREAM-README.md)。本次修改不将原有功能声明为原创。保留 LICENSE、NOTICE、上游版权和原分支修改记录。

上游宣传动图和视频（约 439 MB）保留在本地参考文件中，不随此仓库分发；源码、运行资源和本产品预览均已包含。上游说明中的部分历史演示媒体需要到原项目查看。
