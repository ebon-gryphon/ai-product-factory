# REA 产品拆解工作方法

## 核验依据

本次接入以已发布的 `rea-agents@6.7.0` 为准，核对了包内的 `skills/reverse-engineer-anything/SKILL.md`、`references/javascript-applications.md`、`references/evidence-workflows.md`，以及 `dist/domain/javascript/javascriptFeatureTraceSchemas.js` 和 `dist/cli/applicationCommands.js`。同时在本机执行真实 CLI，记录见 [概览取证](validation/2026-10-21-rea/cli-smoke.json)、[功能追踪](validation/2026-10-21-rea/trace-smoke.json)。

官方资料为 [REA 仓库](https://github.com/morluto/rea)、[JavaScript 工作流](https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md) 和 [浏览器观察](https://github.com/morluto/rea/blob/main/docs/browser-observation.md)。仓库 main 的新增能力不等于当前固定版本已接入的能力。

## 调查顺序

1. 明确用户要解释的一项功能、目标产物和调查问题。普通完整源码仓库的架构阅读使用常规代码工具；REA 重点处理已发布产物、封装包及源码无法单独证明的行为。
2. 根据目标类型选择工具。本版只接本地 JavaScript / Electron 目录或 ASAR，使用 `analyze-javascript-application`。网页、运行中的应用和原生二进制需要不同入口，尚未接入。
3. 先取得应用概览、证据身份、覆盖范围及局限。概览成功表示取得了静态资料，不能据此认定用户的问题已经回答。
4. 从已观察到的模块、IPC 通道、API、路由等线索选择一个起点。只有仍有具体问题时才继续追踪，复用原始应用 Evidence，不重复整包扫描。通过 `trace-application-feature` 按 incoming、outgoing 或 both 查询关系。
5. 将实际返回的关系、位置和证据交给 AI 解读。区分观察、推断、建议及未知；逐项说明调查问题已回答、部分回答或尚未回答。到达一个图节点不等于它一定参与目标功能，静态关系不证明运行或可达性。
6. 需要重建时，再整理功能规则、独立实现方案和验收方法。转入生产项目时携带所选已保存版本及来源引用，不自动运行模型或声称已实现。

## 本版界面与实际执行

| 区域     | 实际执行                         | 用户得到什么                                         |
| -------- | -------------------------------- | ---------------------------------------------------- |
| 应用概览 | REA 静态分析，无需模型           | 统计、真实可追踪线索、覆盖范围、局限、完整 JSON 证据 |
| 功能追踪 | REA 查询已保存的应用图，无需模型 | 所选线索的关联关系、证据身份、覆盖范围和未知         |
| 证据解读 | 用户选择的助手及模型             | 对调查问题的解释、引用和未解决事项                   |
| 重建方案 | 用户选择的助手及模型             | 可转入产品加工的需求、规则、任务与验收草稿           |

四个区域用于组织调查资料，不以 25% / 50% / 100% 宣称调查完成。REA 页面不提供不经选择线索的一键连续执行。

工具产生的两个原始阶段只读，重新分析或追踪创建新版本；手动编辑不能替代取证。修改目标或重新生成上游资料使下游成果过期。仅修改调查问题时保留应用概览，重新选择线索并追踪；不因换问题而重复扫描同一目标。历史版本保留，可查看和下载对应原始 JSON。

## 追踪契约

CLI 读取请求 JSON 文件，文件包含完整的原始 application Evidence、真实 node ID 以及 direction。例如：

```json
{
  "application": "此处实际放入完整 Evidence 对象，不是字符串或虚构 ID",
  "seed": { "kind": "node-id", "value": "用户从当前应用图选择的真实 node_id" },
  "direction": "both"
}
```

以上仅解释字段。实际运行由后端从已保存的原始 JSON 组装对象，不接受用户上传任意 Evidence 或文件路径作为内部取证来源。CLI 输出的 operation 必须对应当前操作，并保留源证据引用及完整结果。

## 状态、证据与测试边界

可用性检查、扫描、追踪、AI 解读分别呈现。正在运行和请求停止的提示依据真实运行阶段；后端确认取消后才结束任务状态。失败、超时、输出超限、证据丢失或校验不符都不能产生伪成功。

原始证据使用服务端生成的文件名，记录字节数、SHA-256 和 Evidence ID。下载先校验项目归属与版本，限制读取大小并复核散列。日志复用已有生命周期记录，仅包含项目标识与固定错误码，不记录源代码、原始输出或凭据。

真实 CLI 取证与追踪、模拟执行器流程测试、真实 Electron / Rust 桌面验收分别记录。测试通过只能证明实际覆盖的路径，不能据此声称恢复了目标应用的全部架构或运行行为。
