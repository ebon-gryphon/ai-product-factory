# AI 加工厂架构与改造说明

## 源项目构造

这是一套桌面 AI 工作台。AionUi 为 TypeScript monorepo，桌面包使用 Electron、React 19、Arco Design、UnoCSS 与 i18next。AionCore 为 Rust workspace，承担 HTTP/WebSocket 服务与业务存储。

| 层次 | 文件入口 | 职责与改造建议 |
| --- | --- | --- |
| 应用与打包 | `AionUi/package.json`、`packages/desktop/electron-builder.yml` | 开发构建、桌面包身份与分发配置；本次更换产品名称和身份 |
| Electron 主进程 | `AionUi/packages/desktop/src/index.ts` | 应用窗口、平台初始化和后端启动 |
| 后端定位 | `AionUi/packages/desktop/src/process/backend/binaryResolver.ts` | 从环境变量、应用资源或 PATH 定位 aioncore |
| React 首页 | `AionUi/packages/desktop/src/renderer/pages/guid/GuidPage.tsx` | 组合助手、模型、文件、输入草稿与发送钩子；本次在此增加工序选择 |
| 品牌适配 | `AionUi/packages/desktop/src/common/branding.ts` | 统一显示名称与助手名称，保留上游链接和归属文案 |
| 国际化 | `AionUi/packages/desktop/src/common/config/i18n-config.json` | 支持语言与模块清单；新增 factory 文案放入 guid 模块 |
| 后端分层 | `AionCore/ARCHITECTURE.zh-CN.md` | 文档描述 Foundation → Capability → Domain → Composition，使用 Axum、Tokio、SQLite；本次未修改后端 |

首页现有数据流是选择助手和项目资料 → 编辑草稿 → `useGuidSend` → 会话。新增组件 `FactoryLaunchpad` 只负责返回预置任务文本，`GuidPage` 用现有 `appendPromptToDraft` 追加到草稿，之后沿用原发送链路。不会在点击工序时直接调用模型，也不会清空用户原有输入。

## 产品化范围

第一版定位为个人和小团队的 AI 产品制作工作台。四类工序明确要求输入素材、输出目标、证据与验收条件，让用户更容易开始任务。

保留原有会话、助手、项目与模型对比入口；没有新建订单数据库、流水线执行器或成果管理数据库。验收交付入口属于模型提示词模板，并非程序化质量保证。后续如果需要自动多步流转，应在 Rust domain 层建立任务、阶段、产物和状态模型，并通过真实后端事件同步前端。

## 修改边界

- 原目录 `../product-manager-workbench-main` 为参考来源，本目录为独立副本。
- 桌面 appId 为 `local.aifactory.desktop`，可执行名称为 `AIFactory`，开发数据目录为 `AIFactory-Dev` / `AIFactory-Dev-2`。
- 技术包命名、既有 IPC/HTTP 契约和 `aionui` 深链接协议仍沿用上游；本次没有宣称所有运行环境的数据已完全隔离。
- 更新机制沿用原定制版禁用上游自动替换的设置。
- `docs/preview` 是明确标注的前端交互预览，复用正式组件，但不启动后端。
- 新增界面没有加入日志；现有发送链路未变，日志调整没有必要。
- 原作者 NOTICE、LICENSE 和历史修改记录保留。根 README 描述当前产品，UPSTREAM-README 留存原产品介绍。

## 校验与待验证项目

执行了 `tsc --noEmit`、i18n 类型生成及校验、Electron Vite 生产构建和前端全量测试（5,025 项通过、5 项跳过）。新增测试覆盖四类任务对应的文本、请求进行时禁止选择、追加时保留原始资料。浏览器检查覆盖预览的桌面与窄屏布局、真实按钮点击和草稿内容。

Rust 工具链缺失，因此未构建和启动后端；真实模型调用、完整桌面端端到端联调和安装包生成尚未完成。依赖安装使用 `--ignore-scripts`，启动完整桌面端前应执行 README 中的正常安装与 Electron 安装步骤。

对源目录附带的 3780 条文件哈希进行了读取校验，只有 `.npmrc` 与源仓库清单不一致；该文件修改时间早于本次任务，且与初始复制的副本一致。未修正源目录中的历史差异。当前副本的 FILES.sha256 重新生成，只包含源码与交付文档，不包含依赖和构建缓存。
