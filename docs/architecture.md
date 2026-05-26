# agent-bridge-mcp - 架构说明

**日期：** 2026-05-14

## 架构摘要

`agent-bridge-mcp` 是 MCP-only 项目，核心职责是在 MCP server 内通过本机 AI CLI 启动和管理后台任务。项目不直接调用模型 API，不提供人类 CLI 子命令；运行中的子进程句柄保存在内存中，轻量进程元数据和日志路径会写入本地注册表以支持重启后查询。

整体架构可以理解为四层：

```text
MCP Client
  ↓ stdio / tools.call
MCP Server Boundary        src/app/mcp.ts
  ↓
Runtime Process Layer      src/process-service.ts
  ↓
CLI Adapter Layer          src/cli-builder.ts / src/cli-utils.ts
  ↓
Local AI CLI Processes     claude / codex / gemini / forge / opencode
```

## 模块边界

### MCP server 边界

**文件：** `src/app/mcp.ts`

职责：

- 创建 MCP `Server`。
- 注册 `run`、`list_processes`、`get_result`、`wait`、`peek`、`kill_process`、`cleanup_processes`、`doctor`、`models` 九个 tools。
- 定义每个 tool 的 input schema 和描述。
- 将 MCP call 分发到对应 handler。
- 把参数错误、未知 PID、内部异常映射为 MCP 错误码。
- 使用 `StdioServerTransport` 启动 stdio server。

### 进程管理边界

**文件：** `src/process-service.ts`

职责：

- 通过 `buildCliCommand()` 构造命令。
- 使用 `child_process.spawn` 启动后台子进程。
- 在内存 `Map<pid, TrackedProcess>` 中记录运行中句柄、状态和输出，并把进程元数据同步到本地注册表。
- 收集 stdout/stderr。
- 处理 close/error 事件并更新状态。
- 实现查询、等待、peek、终止和清理。

### CLI 参数构造边界

**文件：** `src/cli-builder.ts`

职责：

- 校验 `workFolder`、`prompt`、`prompt_file`。
- 读取 `prompt_file`。
- 解析模型别名和 agent 类型。
- 校验 `reasoning_effort` 的模型家族兼容性。
- 为不同 CLI 构造参数数组。
- 将 OpenCode 动态模型 `oc-<provider/model>` 映射为 `--model <provider/model>`。

### CLI 可用性边界

**文件：** `src/cli-utils.ts`

职责：

- 查找 CLI 二进制。
- 支持环境变量覆盖命令名或绝对路径。
- 禁止相对路径形式的 CLI 配置。
- 生成 `doctor` 状态。

### 输出解析边界

**文件：** `src/parsers.ts`、`src/process-result.ts`、`src/peek.ts`

职责：

- 解析 Claude、Codex、Gemini、Forge、OpenCode 的输出格式。
- 构造 compact / verbose 结果。
- 提取短窗口 `peek` 消息和规范化工具调用事件。
- 限制 `peek` 返回内容，避免泄露原始工具输出。

### 模型目录边界

**文件：** `src/model-catalog.ts`

职责：

- 维护标准模型列表。
- 维护 `claude-ultra`、`codex-ultra`、`gemini-ultra` 别名。
- 为 MCP tool 描述和 `models` tool 生成统一 payload。

## 运行模型

MCP `run` 每次调用都会创建一个新的后台子进程，并立即返回：

```json
{
  "pid": 12345,
  "status": "started",
  "agent": "codex",
  "message": "codex process started successfully"
}
```

`ProcessService` 使用内存 `Map` 保存运行中的进程句柄、状态、输出和元数据，同时通过 `ProcessRegistry` 写入本地注册表和 stdout/stderr 日志。后续 tools 通过 PID 优先操作内存记录；server 重启后可从注册表恢复基础结果。

状态流转：

```text
running -> completed    子进程 close(0)
running -> failed       子进程 close(non-zero) 或 error
running -> failed       kill_process 发送 SIGTERM 后标记
completed/failed -> removed   cleanup_processes 清理
```

## 外部 CLI 支持

命令构造层支持：

- Claude CLI
- Codex CLI
- Gemini CLI
- Forge CLI
- OpenCode CLI

模型路由由 `src/cli-builder.ts` 和 `src/model-catalog.ts` 控制。OpenCode 的动态模型使用 `oc-<provider/model>` 格式映射为 OpenCode CLI 的 `--model <provider/model>`。

## 数据与持久化架构

项目没有数据库、ORM 或迁移脚本。运行中子进程句柄只存在当前 Node.js 进程内存中；进程元数据和日志路径会写入本地 JSON 注册表：

- `ProcessService` 的 `Map<number, TrackedProcess>` 是运行中句柄的权威来源。
- `ProcessRegistry` 默认写入 `~/.agent-bridge-mcp/processes.json`。
- stdout/stderr 追加到 `~/.agent-bridge-mcp/logs/<pid>.*.log`。
- `cleanup_processes` 会移除已完成或失败的内存记录和注册表记录，但不删除日志文件。
- `get_result` 和 `wait` 可访问当前内存 PID，也可基于注册表恢复已完成/失败进程的基础结果。

这属于刻意设计：只提供 MCP 后台任务恢复所需的轻量注册表，不扩展为带人类 CLI 子命令的完整任务系统。

## 错误处理策略

- 输入校验失败抛普通 `Error`，在 MCP handler 边界映射为 `ErrorCode.InvalidParams`。
- 进程启动失败映射为 `ErrorCode.InternalError`。
- 未知 tool 映射为 `ErrorCode.MethodNotFound`。
- 未知 PID 在面向 PID 的 tool 中映射为 `InvalidParams`。
- CLI 输出解析失败时保留原始 stdout/stderr，而不是让结果查询崩溃。

## 安全边界

- 外部 CLI 使用参数数组启动，避免把 prompt 拼接为 shell 字符串。
- 自定义 CLI 环境变量不允许相对路径。
- `peek` 不返回原始工具输出或命令 stdout/stderr。
- `doctor` 不执行登录态、模型权限或联网验证。
- verbose 结果会包含 prompt，调用方应避免把敏感内容放入 prompt。

## 测试架构

- 单元测试基于 Vitest。
- MCP stdio 契约测试通过构建后的 `dist/server.js` 启动真实 server。
- 外部 CLI 行为通过 mock CLI 或 mocked `spawn` 模拟。
- `src/__tests__/setup-unit.ts` 清理 SIGINT listener，避免进程级副作用污染测试。

## 非目标能力

项目不包含以下人类 CLI 模块：

- `src/app/cli.ts`
- `src/bin/ai-cli.ts`
- `src/cli-process-service.ts`
- `src/cli.ts`
- `src/cli-parse.ts`

`package.json` 的 `bin` 只暴露 `agent-bridge-mcp`。

## 变更影响指南

- 修改 MCP tool：同步 `src/app/mcp.ts`、文档和 MCP 契约测试。
- 修改 CLI 参数：同步 `src/cli-builder.ts` 和 `cli-builder.test.ts`。
- 修改输出解析：同步 `src/parsers.ts`、`process-result.ts` 和解析测试。
- 修改模型列表：同步 `src/model-catalog.ts`、README 和相关测试。
- 修改发布入口：同步 `package.json` 的 `bin`、`files` 和发布清单验证。
