# AI 加工厂

把产品想法加工成需求、原型、开发任务和验收成果。面向个人和小团队的 AI 产品制作工作台。

本版本基于同级的 product-manager-workbench-main 独立复制改造，原目录未编辑。按用户确认的 AI 产品加工厂方向定制。

## 已完成的改造

- 首页增加产品定义、原型设计、开发拆解、验收交付四个工序入口，点击后追加任务草稿，保留已有输入，发送期间禁用选择。
- 更换应用显示名称、AI 标识、桌面和 PWA 图标、首页文案与卡片布局。
- 设置独立桌面 appId、可执行文件名称及开发数据目录 AIFactory-Dev。
- 保留原有助手、会话、项目文件夹、模型对比与后端架构。
- 新增文案提供简体中文和英文；其他语言暂用英文。旧有多语言内容保持原状。

工序入口是可编辑的提示词模板，不是自动执行多步工作流。正式 AI 执行仍通过原有助手、模型和会话链路完成。

## 获取项目

仓库：[ebon-gryphon/ai-product-factory](https://github.com/ebon-gryphon/ai-product-factory)，当前为私有仓库。

```sh
gh repo clone ebon-gryphon/ai-product-factory
cd ai-product-factory/AionUi
bun install --ignore-scripts
```

以上安装方式用于首页预览与前端检查；完整桌面启动按下文准备后端和 Electron。

## 查看界面

在本目录下运行以下命令，然后打开 http://127.0.0.1:5188。

```sh
cd AionUi
./node_modules/.bin/vite --config ../docs/preview/vite.config.mjs
```

预览复用正式工序组件，支持选择工序、编辑和清空草稿，不连接 AI 服务。截图见 [首页预览](docs/factory-preview.png)。

## 启动完整桌面应用

需要 Node.js 22–24、Bun、Rust/Cargo 工具链。当前环境已安装前端依赖并完成编译，但未安装 Rust，尚未验证完整桌面运行和真实模型调用。

```sh
cd AionCore
cargo build --release --locked -p aionui-app
cd ../AionUi
bun install
node node_modules/electron/install.js
AIONUI_BACKEND_BIN="$(cd ../AionCore && pwd)/target/release/aioncore" bun run start
```

首次进入后，配置模型服务、凭据和助手，再选择项目资料并发送任务。此副本没有附带模型账号或密钥。更多环境说明见 [原项目开发文档](AionUi/docs/contributing/development.md)。

## 验证情况

- TypeScript 检查通过。
- 国际化键完整性与生成类型同步检查通过。
- Electron 主进程、预加载与渲染端生产构建通过，存在原有大体积 chunk 提示。
- 前端全量测试 5,025 项通过、5 项跳过（526 个测试文件通过、1 个跳过）。
- 首页预览在 1280px 和 390px 宽度下检查，任务选择通过，无横向溢出。
- 未构建 Rust 后端、未验证真实 AI 请求、未生成安装包。

结构分析和改造边界见 [架构与改造说明](docs/FACTORY-ARCHITECTURE.md)。

## 来源与归属

基于周承健的产品经理工作台，以及 AionUi / AionCore 上游项目。原 README 保存在 [UPSTREAM-README.md](docs/UPSTREAM-README.md)。本次修改不将原有功能声明为原创。保留 LICENSE、NOTICE、上游版权和原分支修改记录。

上游宣传动图和视频（约 439 MB）保留在本地参考文件中，不随此仓库分发；源码、运行资源和本产品预览均已包含。上游说明中的部分历史演示媒体需要到原项目查看。
