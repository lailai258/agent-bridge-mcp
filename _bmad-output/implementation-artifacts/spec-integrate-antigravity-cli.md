---
title: '集成 Antigravity CLI 到 MCP 后台 agent 运行链路'
type: 'feature'
created: '2026-05-26'
status: 'done'
baseline_commit: '54745eb9bee3cc91e2d4d8e75f5764f6a0deadb7'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/architecture.md'
  - '{project-root}/docs/mcp-tool-contracts.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Antigravity CLI 已发布并在本机验证可通过 `agy --print` 非交互执行，但项目当前只支持 Claude、Codex、Gemini、Forge、OpenCode，MCP 客户端无法通过统一后台任务接口调用 Antigravity。

**Approach:** 将 Antigravity 作为现有 `run/list_processes/get_result/wait/peek/doctor/models` 链路中的第 6 类 agent 接入，复用当前 MCP-only 架构、进程管理、路径解析和结果包装机制。首版采用保守集成：`model: "antigravity"` 路由到 `agy --dangerously-skip-permissions --add-dir <workFolder> --print-timeout 5m --print <prompt>`，不新增独立 MCP tool，不引入新依赖。

## Boundaries & Constraints

**Always:** 保持 MCP-only 架构；`run` 仍必须立即返回 PID；外部 CLI 必须通过 `spawn` 参数数组启动；`doctor` 只检查二进制可用性和路径解析；新增代码遵循 TypeScript ESM 和 `.js` 相对导入规则；Antigravity 的 `reasoning_effort` 必须明确拒绝；测试不得依赖本机真实 `agy` 登录态。

**Ask First:** 如果实现时发现官方 `agy` 支持稳定的模型选择 flag、结构化 JSON 输出、会话 ID 输出或不同的权限/沙箱推荐参数，先暂停确认是否扩大首版范围。若需要修改 MCP tool 入参结构、引入新依赖、改变注册表语义、删除或重写现有 agent 行为，也必须先确认。

**Never:** 不新增人类 CLI；不把 Antigravity 做成独立 MCP tool；不调用 Google/模型 API；不在 `doctor` 中验证登录、模型权限、网络或条款接受；不让 `run` 同步等待 Antigravity 完成；不把 prompt 拼接进 shell 字符串；不为 Antigravity 伪造未验证的模型列表或会话 ID。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Antigravity 正常启动 | `run` 参数包含 `model: "antigravity"`、有效 `workFolder`、`prompt` | 返回 `{ pid, status: "started", agent: "antigravity" }`；实际命令使用 `agy --dangerously-skip-permissions --add-dir <cwd> --print-timeout 5m --print <prompt>` | 启动失败映射为 MCP 内部错误 |
| Antigravity 会话恢复 | `model: "antigravity"` 且传入 `session_id` | 命令参数追加 `--conversation <session_id>`，仍以非交互 print 模式执行 | 若 `agy` 输出 warning，结果解析保留可读 message，不让解析崩溃 |
| 不支持推理强度 | `model: "antigravity"` 且传入 `reasoning_effort` | 参数校验失败，不启动子进程 | MCP handler 返回 `InvalidParams` |
| doctor 检查 | PATH 中存在 `agy` 或设置 `ANTIGRAVITY_CLI_NAME` | `doctor` payload 新增 `antigravity`，包含 configuredCommand、resolvedPath、available、lookup | 相对路径配置返回错误，与其他 CLI 一致 |
| 纯文本输出解析 | `agy --print` 返回普通文本或 warning 加答案 | `get_result` compact/verbose 中解析出 `{ message }`，原始 stdout/stderr 仍按现有结果规则保留 | 空输出返回 `null`，不抛异常 |

</frozen-after-approval>

## Code Map

- `src/cli-utils.ts` -- CLI 二进制发现、环境变量覆盖、doctor 状态；需新增 `antigravity`/`agy` 配置。
- `src/cli-builder.ts` -- agent 路由、参数校验、命令数组构造；需新增 Antigravity 分支并拒绝 `reasoning_effort`。
- `src/model-catalog.ts` -- MCP `models` payload 和 model 参数描述；需新增 `ANTIGRAVITY_MODELS = ["antigravity"]`。
- `src/process-service.ts` -- `AgentType`、进程记录和输出解析分发；需纳入 `antigravity`。
- `src/parsers.ts` -- agent 输出解析与 peek 事件提取；需新增纯文本 Antigravity parser，按风险决定是否为 peek 增加普通行消息提取。
- `src/app/mcp.ts` -- MCP tool 描述、doctor 配置错误检查、`ProcessService` 初始化；需注入 Antigravity CLI path 并更新文案。
- `src/server.ts` -- 顶层导出 CLI 查找函数；需同步导出 `findAntigravityCli`。
- `src/__tests__/cli-builder.test.ts` -- 覆盖命令参数、会话恢复、拒绝 reasoning。
- `src/__tests__/cli-utils.test.ts` -- 覆盖 `ANTIGRAVITY_CLI_NAME`、默认 PATH 查找和相对路径拒绝。
- `src/__tests__/parsers.test.ts` -- 覆盖纯文本、warning 加答案、空输出。
- `src/__tests__/mcp-contract.test.ts`、`src/__tests__/server.test.ts`、`src/__tests__/process-management.test.ts` -- 覆盖 MCP 描述、models/doctor payload 和后台运行形状。
- `README.md`、`README.zh-CN.md`、`docs/architecture.md`、`docs/mcp-tool-contracts.md`、`docs/api-contracts.md`、`docs/data-models.md`、`docs/component-inventory.md`、`docs/project-overview.md`、`docs/source-tree-analysis.md`、`docs/development-guide.md` -- 同步公开契约、支持列表、环境变量和架构说明。

## Tasks & Acceptance

**Execution:**
- [x] `src/cli-utils.ts` -- 将 `CliBinaryName`、`CliPaths`、`CliDoctorStatus` 扩展为包含 `antigravity`；新增默认命令 `agy` 和环境变量 `ANTIGRAVITY_CLI_NAME` -- 让 doctor 和启动路径解析复用现有安全边界。
- [x] `src/cli-builder.ts` -- 扩展 agent 类型和模型路由；当 raw model 为 `antigravity` 时构造 `agy` print 模式参数；有 `session_id` 时添加 `--conversation`；传入 `reasoning_effort` 时抛错 -- 保持统一 run 入参语义。
- [x] `src/model-catalog.ts` -- 新增 Antigravity 模型列表和 `models` payload 字段；更新模型描述 -- 让 MCP 客户端可发现 `model: "antigravity"`。
- [x] `src/process-service.ts`、`src/parsers.ts` -- 新增 `parseAntigravityOutput(stdout)` 并接入 `parseAgentOutput`；输出为空返回 `null`，非空返回 `{ message }` -- 适配 `agy --print` 的纯文本输出。
- [x] `src/app/mcp.ts`、`src/server.ts` -- 初始化 Antigravity CLI path，更新 setup 日志、配置错误扫描、tool 描述、`reasoning_effort` 和 `session_id` 文案 -- 保证 MCP 契约描述与运行时一致。
- [x] `src/__tests__` -- 补充或更新构造、doctor、parser、MCP contract、process-management/server 测试 -- 防止新增 agent 破坏现有五类 agent。
- [x] `README.md`、`README.zh-CN.md`、`docs/*` -- 同步支持列表、环境变量、模型目录、非目标和测试说明 -- 保证发布文档不落后于代码。

**Acceptance Criteria:**
- Given Antigravity CLI 在 PATH 中可执行, when 调用 `doctor`, then 返回 payload 包含 `antigravity.available: true` 且不检查登录态。
- Given `model: "antigravity"`、有效 `workFolder` 和 `prompt`, when 调用 `run`, then 返回 `agent: "antigravity"` 且后台进程使用 `agy --print` 非交互模式启动。
- Given `model: "antigravity"` 和 `session_id`, when 构造命令, then 参数包含 `--conversation <session_id>`。
- Given `model: "antigravity"` 和任意 `reasoning_effort`, when 调用 `run`, then 返回参数错误且不启动子进程。
- Given Antigravity stdout 为纯文本, when 调用 `get_result` 或 `wait`, then compact 结果能解析出可读 `message`，解析失败不会导致查询崩溃。
- Given 现有 Claude/Codex/Gemini/Forge/OpenCode 测试输入, when 运行单元测试, then 现有 agent 命令构造、输出解析和 MCP 契约保持兼容。

## Spec Change Log

- 2026-05-26 review: step-04 本地审查发现 MCP contract 测试只断言 Antigravity `reasoning_effort` 文案，可能漏掉 OpenCode 不支持说明的回归保护；已补强测试断言同时覆盖 OpenCode、Antigravity 和 `do not support reasoning_effort`，无 spec 意图变更。

## Design Notes

Antigravity 首版不要尝试和 OpenCode 一样做动态模型后端，因为当前 `agy --help` 未暴露稳定 `--model` 参数。`model: "antigravity"` 在本项目中代表“选择 Antigravity CLI agent”，不是声明底层大模型。这样可以避免把未验证能力写入公开契约。

建议参数顺序保持稳定，便于测试和用户排错：

```text
agy --dangerously-skip-permissions --add-dir <cwd> --print-timeout 5m --print <prompt>
agy --dangerously-skip-permissions --add-dir <cwd> --conversation <id> --print-timeout 5m --print <prompt>
```

如需为测试避免真实用户目录日志或端口限制，使用 mock CLI 覆盖，不在生产参数中强行加入 `--log-file`；`--log-file` 属于本次调研用的沙箱规避参数，不应成为默认运行契约。

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript 编译通过。actual: 通过。
- `npm run test:unit` -- expected: 单元测试通过，新增 Antigravity 覆盖项通过。actual: 10 个测试文件、231 个测试通过。
- `npm test` -- expected: MCP stdio 契约和集成测试通过。actual: 11 个测试文件，242 个通过、1 个跳过。

**Manual checks (if no CLI):**
- 检查 `models` tool 返回包含 `antigravity`，且 README/中文 README 与 docs 中的支持列表一致。
- 检查 `run` tool 描述仍强调后台 PID 语义，没有新增人类 CLI 用法。

## Suggested Review Order

**MCP Entry Contract**

- 首先确认 server 初始化注入第六类 CLI。
  [`mcp.ts:91`](../../src/app/mcp.ts#L91)

- 核对 tool schema 文案与运行时能力一致。
  [`mcp.ts:150`](../../src/app/mcp.ts#L150)

**Command Routing**

- 查看 Antigravity 如何成为独立 agent 路由。
  [`cli-builder.ts:20`](../../src/cli-builder.ts#L20)

- 确认 Antigravity 明确拒绝 `reasoning_effort`。
  [`cli-builder.ts:105`](../../src/cli-builder.ts#L105)

- 审查 `agy --print` 参数顺序和会话映射。
  [`cli-builder.ts:274`](../../src/cli-builder.ts#L274)

**Discovery And Models**

- 核对 doctor 类型和 path 解析新增字段。
  [`cli-utils.ts:22`](../../src/cli-utils.ts#L22)

- 确认默认命令 `agy` 和环境变量配置。
  [`cli-utils.ts:216`](../../src/cli-utils.ts#L216)

- 检查 `models` payload 暴露 Antigravity 入口。
  [`model-catalog.ts:28`](../../src/model-catalog.ts#L28)

**Output Parsing**

- 查看 warning 过滤与纯文本归一化策略。
  [`parsers.ts:357`](../../src/parsers.ts#L357)

- 确认 peek 可提取 Antigravity 普通文本。
  [`parsers.ts:419`](../../src/parsers.ts#L419)

- 确认 `get_result`/`wait` 使用 Antigravity parser。
  [`process-service.ts:84`](../../src/process-service.ts#L84)

**Tests And Docs**

- 命令构造测试锁定 `agy --print` 参数。
  [`cli-builder.test.ts:700`](../../src/__tests__/cli-builder.test.ts#L700)

- MCP 契约测试保护 schema 文案和模型发现。
  [`mcp-contract.test.ts:165`](../../src/__tests__/mcp-contract.test.ts#L165)

- 端到端 mock 覆盖 `run -> wait -> get_result`。
  [`mcp-contract.test.ts:860`](../../src/__tests__/mcp-contract.test.ts#L860)

- README 说明用户可见模型、会话和环境变量。
  [`README.md:317`](../../README.md#L317)

- 工具契约文档说明 Antigravity 不暴露模型 flag。
  [`mcp-tool-contracts.md:259`](../../docs/mcp-tool-contracts.md#L259)
