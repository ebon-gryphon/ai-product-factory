# AI产品加工厂架构与改造说明

## 源项目构造

这是一套桌面 AI 工作台。AionUi 为 TypeScript monorepo，桌面包使用 Electron、React 19、Arco Design、UnoCSS 与 i18next。AionCore 为 Rust workspace，承担 HTTP/WebSocket 服务与业务存储。

| 层次            | 文件入口                                                        | 职责与改造建议                                                                                                     |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 应用与打包      | `AionUi/package.json`、`packages/desktop/electron-builder.yml`  | 开发构建、桌面包身份与分发配置；本次更换产品名称和身份                                                             |
| Electron 主进程 | `AionUi/packages/desktop/src/index.ts`                          | 应用窗口、平台初始化和后端启动                                                                                     |
| 后端定位        | `AionUi/packages/desktop/src/process/backend/binaryResolver.ts` | 从环境变量、应用资源或 PATH 定位 aioncore                                                                          |
| React 首页      | `AionUi/packages/desktop/src/renderer/pages/guid/GuidPage.tsx`  | 组合助手、模型、文件、输入草稿与发送钩子；本次在此增加工序选择                                                     |
| 品牌适配        | `AionUi/packages/desktop/src/common/branding.ts`                | 统一显示名称与助手名称，保留上游链接和归属文案                                                                     |
| 国际化          | `AionUi/packages/desktop/src/common/config/i18n-config.json`    | 支持语言与模块清单；新增 factory 文案放入 guid 模块                                                                |
| 后端分层        | `AionCore/ARCHITECTURE.zh-CN.md`                                | 文档描述 Foundation → Capability → Domain → Composition，使用 Axum、Tokio、SQLite；生产流程新增独立 factory domain |

首页现有数据流是选择助手和项目资料 → 编辑草稿 → `useGuidSend` → 会话。组件 `FactoryLaunchpad` 只负责返回预置任务文本；`GuidPage` 用对应提示词替换输入框内容，重复点击不叠加，之后沿用原发送链路。选择工序不直接调用模型。其他明确要求保留草稿的导航预填仍沿用原有追加逻辑。

## 产品化范围

第一版定位为个人和小团队的 AI 产品制作工作台。四类工序明确要求输入素材、输出目标、证据与验收条件，让用户更容易开始任务。

保留原有会话、助手、项目与模型对比入口。新增 aionui-factory domain，以 FactoryRunner trait 对接 Composition 层的 ConversationService；每道工序单独创建会话，在同一项目工作目录执行。项目、阶段、版本、依赖版本和人工验收清单通过 044_factory_projects.sql 持久化，更新使用 revision 做并发冲突检测，API 按登录用户隔离并沿用 CSRF。前端生产页通过轮询同步执行状态。

连续执行传递前序成果，但不自动人工验收。上游改动使下游过期；应用重启标记未完成任务为中断，不自动重放。每实例最多同时运行 4 个生产任务，单工序上限 30 分钟；取消失败或超时明确提示用户核查会话，不声称运行已停止。预览 HTML 在不带 allow-same-origin 的 iframe 中运行，iframe 允许脚本和本地表单事件，CSP 禁用网络及表单向外提交；不授予 allow-same-origin。

## REA 产品拆解

`/factory-rea` 是独立入口，复用 factory 的项目、四阶段状态、成果版本和人工验收。项目 JSON 增加 `workflow`（`production` / `rea`）与 `target_path`；旧数据缺省为 production，继续使用现有 SQLite 存储，无需重写历史记录。

REA 四个资料区域为应用概览、功能追踪、证据解读、重建方案。前两阶段由 Composition 层的本地 CLI 适配器分别执行真实静态取证与图追踪，不需要模型；后两阶段沿用会话执行器。追踪从当前应用图的真实候选 node ID 开始，复用完整原始 Evidence。原始证据单独落盘，成果保存结构化元数据、SHA256 和摘要，分析局限与未知项继续传递给下游。两个工具阶段只读，不允许手工保存或恢复来绕过证据门；REA 禁止未选择线索的自动连续执行。

`GET /api/factory/rea/status` 读取已配置工具的可用性与版本，不自动安装。启动脚本通过 `AIFACTORY_REA_BIN` 指定项目内固定版本的 CLI，也支持 PATH 中已有的 rea。安装入口只准备本地运行时，不修改全局 Agent / MCP 配置。执行器对目标路径、进程时限、输出大小及取消做约束，不启动被分析的应用；日志仅记录固定错误码与任务标识，原始证据不进入生产日志。

前端分别展示两个 workflow 的项目。REA 按真实运行阶段显示进度和停止状态，优先展示概览、线索、覆盖范围及局限，不用四份报告的完成比例表示问题已经回答。原始 JSON 下载通过项目与版本鉴权、受控文件名、大小及散列复核。转加工时仅引用所选阶段的已保存版本，并记录源项目与版本编号，不自动运行收费工序。网页 CDP、原生反编译和动态执行不属于本次接入范围；详细依据见 [REA 工作方法](REA-WORKFLOW.md)。

## 修改边界

- 原目录 `../product-manager-workbench-main` 为参考来源，本目录为独立副本。
- 桌面 appId 为 `local.aifactory.desktop`，可执行名称为 `AIFactory`，开发数据目录为 `AIFactory-Dev` / `AIFactory-Dev-2`。
- 技术包命名、既有 IPC/HTTP 契约和 `aionui` 深链接协议仍沿用上游；本次没有宣称所有运行环境的数据已完全隔离。
- 更新机制沿用原定制版禁用上游自动替换的设置。
- `docs/preview` 是明确标注的前端交互预览，复用正式组件，但不启动后端。
- 新增生产任务开始、成果保存和失败日志，仅包含项目 ID、工序及固定错误码，不记录资料、成果正文或密钥。
- 原作者 NOTICE、LICENSE 和历史修改记录保留。根 README 描述当前产品，UPSTREAM-README 留存原产品介绍。

## 校验与待验证项目

执行了 `tsc --noEmit`、i18n 类型生成及校验、Electron Vite 生产构建和前端全量测试（5,025 项通过、5 项跳过）。新增测试覆盖四类任务对应的文本、请求进行时禁止选择、追加时保留原始资料。浏览器检查覆盖预览的桌面与窄屏布局、真实按钮点击和草稿内容。

2026-10-08 已补齐 Rust 1.95.0、Electron 37.10.3 和 Electron 原生数据库依赖，并完成 Rust 后端开发构建、前端生产构建与 TypeScript 检查。启动管理与工序相关测试 47 项通过。新增桌面启动验收与既有基础启动验收合计 5 项通过，验证真实窗口、渲染端加载、后端健康和系统接口、四工序草稿追加及原输入保留；这些测试使用独立临时用户数据目录。

项目根目录新增 `启动AI加工厂.command`，用于本机双击启动开发版，自动选择已编译的 debug/release 后端。本机正常用户数据实例亦已启动并检查首页。现有启动和 HTTP 日志足以诊断本次运行链路，没有增加业务日志。安装包尚未生成，自动工序流转已实现。2026-10-09 已接入用户配置的 MiMo 和 DeepSeek 开展真实 API 验收，具体结果见 README 本轮记录。

对源目录附带的 3780 条文件哈希进行了读取校验，只有 `.npmrc` 与源仓库清单不一致；该文件修改时间早于本次任务，且与初始复制的副本一致。未修正源目录中的历史差异。当前副本的 FILES.sha256 重新生成，只包含源码与交付文档，不包含依赖和构建缓存。

## 2026-10-09 生产流程验证

新增 8 项流程测试覆盖上下文传递、人工验收门槛、失败重试、停止、重启中断、版本恢复、上游失效、用户隔离与并发版本冲突；2 项 HTTP 测试覆盖鉴权、CSRF 和持久化接口。6 项桌面 E2E 通过，其中生产页案例使用真实 Rust 后端完成项目创建、版本保存、刷新恢复、隔离原型预览及上游修改后的过期标记。执行器在流程测试中为模拟实现，真实服务商 API 的验证证据与模拟执行器测试分开记录。

2026-10-09 实际联调发现并修复两类界面问题：等待工具确认时提供当前运行会话入口；预览支持使用 submit 事件的本地表单，仍由 CSP 阻止外发。另修复 macOS 桌面 E2E 测试改写正常开发实例共享符号链接的问题：E2E 直接使用隔离 userData 路径，不创建或重定向用户主目录下的链接。3 项路径回归测试、7 项桌面 E2E 通过，并确认测试结束后正常实例的链接和项目读取仍可用。
