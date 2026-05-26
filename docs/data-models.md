# agent-bridge-mcp - 数据模型与状态边界

**日期：** 2026-05-14

## 总览

本项目没有数据库、ORM 或迁移脚本。运行中子进程句柄保存在当前 MCP server 进程内存中；轻量进程元数据和 stdout/stderr 日志路径写入本地 JSON 注册表。核心数据模型围绕后台子进程、注册表记录、模型目录、CLI 路径状态和 peek 事件展开。

server 重启后，内存中的 ChildProcess 句柄会丢失；PID、stdout/stderr 日志和基础状态可从注册表恢复。

## 持久化边界

- **无数据库。**
- **有轻量文件注册表。**
- **server 重启后可恢复基础进程结果；无法重新附加实时 stdout/stderr 事件。**
- **无消息队列或外部缓存。**

这意味着 `run` 返回的 PID 在当前 server 生命周期内支持实时观察；重启后可查询注册表中的基础结果，但不能继续监听旧进程的实时输出。

## 运行时进程模型

### `TrackedProcess`

位置：`src/process-service.ts`

语义：当前 server 内存中被跟踪的运行中子进程记录。

字段：

- `pid`：操作系统分配的子进程 PID。
- `process`：Node `ChildProcess` 实例。
- `prompt`：实际传给外部 CLI 的提示词。
- `workFolder`：解析后的工作目录。
- `model`：用户传入的模型名或别名。
- `toolType`：实际 agent 类型，取值为 `claude`、`codex`、`gemini`、`forge`、`opencode`、`antigravity`。
- `startTime`：进程启动 ISO 时间。
- `stdout`：累计 stdout 文本。
- `stderr`：累计 stderr 文本。
- `status`：`running`、`completed`、`failed`。
- `exitCode`：子进程退出码，未退出时为空。

### 状态流转

```text
run -> running
running + close(0) -> completed
running + close(non-zero) -> failed
running + error -> failed
running + kill_process -> failed，并返回 terminated
completed/failed + cleanup_processes -> 从内存 Map 和注册表移除
```

## 进程摘要模型

### `ProcessListItem`

位置：`src/process-service.ts`

用于 `list_processes`：

- `pid`
- `agent`
- `status`

## 进程结果模型

位置：`src/process-result.ts`

compact 模式默认返回：

- `pid`
- `agent`
- `status`
- `exitCode`
- `model`
- `session_id`（如果解析到）
- `agentOutput`（如果有有意义的解析输出）
- `stdout` / `stderr`（无可用解析结果或需要保留失败原文时）

verbose 模式额外返回：

- `startTime`
- `workFolder`
- `prompt`
- 更完整的 `agentOutput`

## CLI 命令模型

### `CliCommand`

位置：`src/cli-builder.ts`

字段：

- `cliPath`：实际执行的 CLI 命令或绝对路径。
- `args`：传给 `spawn` 的参数数组。
- `cwd`：执行工作目录。
- `agent`：解析后的 agent 类型。
- `prompt`：最终提示词内容。
- `resolvedModel`：模型别名解析后的模型名。

## CLI doctor 模型

位置：`src/cli-utils.ts`

### `CliBinaryStatus`

字段：

- `configuredCommand`：默认命令名或环境变量覆盖值。
- `resolvedPath`：解析到的可执行路径，可能为空。
- `available`：是否可执行。
- `lookup`：来源，取值为 `env`、`local`、`path`。
- `error`：路径配置错误。

### `CliDoctorStatus`

包含所有支持 CLI 的 `CliBinaryStatus`，以及检查能力说明：

- `binaryAvailability`
- `pathResolution`
- `loginState`
- `termsAcceptance`

其中登录态和条款接受状态固定不验证。

## 模型目录数据

位置：`src/model-catalog.ts`

维护：

- Claude 标准模型列表。
- Codex 标准模型列表。
- Gemini 标准模型列表。
- Forge 模型入口。
- OpenCode 默认入口。
- Antigravity 入口。
- 模型别名：`claude-ultra`、`codex-ultra`、`gemini-ultra`。
- OpenCode 动态模型后端说明：`oc-<provider/model>`。

## Peek 事件模型

位置：`src/parsers.ts`、`src/peek.ts`

### `PeekEvent`

两类事件：

- `message`：自然语言 assistant 消息。
- `tool_call`：规范化工具调用事件，包含阶段、工具名、摘要、状态、耗时等字段。

### `PeekProcessResult`

字段：

- `pid`
- `agent`
- `status`
- `events`
- `truncated`
- `error`

## 数据安全与隐私边界

- `peek` 不返回原始工具输出。
- `peek` 不返回累计 stdout/stderr。
- `get_result` 在无法解析或需要保留失败上下文时可能返回 stdout/stderr。
- verbose 结果会包含 prompt，调用方应避免在 prompt 中放入不应回显的敏感信息。

## 扩展建议

- 如果未来引入数据库或跨进程锁，需要新增明确的存储层文档、迁移策略和恢复语义。
- 不应在当前架构下悄悄扩展为完整任务队列，因为这会改变 PID 生命周期和 MCP tool 契约。

---

_Generated using BMAD Method `document-project` workflow_
