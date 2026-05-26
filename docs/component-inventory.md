# agent-bridge-mcp - 模块清单

**日期：** 2026-05-14

## 总览

本项目没有 UI 组件。这里的“组件”指后端/MCP server 的主要代码模块与运行时职责边界。

## 运行时模块

### `src/app/mcp.ts`

- **职责：** MCP server 注册、tool schema 声明、请求分发、错误映射、stdio transport 启动。
- **关键导出：** `ClaudeCodeServer`、`runMcpServer()`、`spawnAsync()`。
- **依赖：** MCP SDK、`ProcessService`、CLI doctor、模型目录、peek 参数校验。
- **变更风险：** 高。修改 tool schema、handler 名称或响应形状会影响 MCP 客户端和契约测试。

### `src/process-service.ts`

- **职责：** 后台子进程生命周期管理。
- **核心状态：** 内存 `Map<number, TrackedProcess>` + 本地 `ProcessRegistry`。
- **关键能力：** `startProcess()`、`listProcesses()`、`getProcessResult()`、`waitForProcesses()`、`peekProcesses()`、`killProcess()`、`cleanupProcesses()`。
- **变更风险：** 高。该模块定义 PID 生命周期、状态流转和 stdout/stderr 收集语义。

### `src/cli-builder.ts`

- **职责：** 将 MCP `run` 输入转换为具体 CLI 命令。
- **覆盖 CLI：** Claude、Codex、Gemini、Forge、OpenCode。
- **关键校验：** `workFolder`、`prompt` / `prompt_file` 互斥、模型别名、OpenCode 动态模型、`reasoning_effort` 支持范围。
- **变更风险：** 高。任何 CLI 参数变化都需要同步测试。

### `src/cli-utils.ts`

- **职责：** CLI 二进制解析、环境变量覆盖、可执行性检查、doctor 状态。
- **支持环境变量：** `CLAUDE_CLI_NAME`、`CODEX_CLI_NAME`、`GEMINI_CLI_NAME`、`FORGE_CLI_NAME`、`OPENCODE_CLI_NAME`。
- **安全边界：** 禁止相对路径形式的自定义 CLI 值。
- **变更风险：** 中到高。会影响 server 初始化和 `doctor` 输出。

### `src/model-catalog.ts`

- **职责：** 模型列表、别名、OpenCode 动态模型说明。
- **核心数据：** Claude/Codex/Gemini/Forge/OpenCode 标准模型和 `claude-ultra`、`codex-ultra`、`gemini-ultra` 别名。
- **变更风险：** 中。修改时需同步 README 和测试。

### `src/parsers.ts`

- **职责：** 解析不同 CLI 的 stdout/stderr 输出，并提取 peek 事件。
- **支持格式：** Claude stream-json、Codex JSONL、Gemini stream-json、Forge 文本摘要、OpenCode JSON 事件。
- **安全边界：** `peek` 只能返回自然语言消息和规范化工具调用摘要，不返回原始 tool output。
- **变更风险：** 高。输出解析必须容忍损坏行和非 JSON 内容。

### `src/peek.ts`

- **职责：** `peek` 参数限制和响应辅助。
- **限制：** 默认观察 10 秒，最大 60 秒；PID 去重后最多 32 个；事件最多 50 条。
- **变更风险：** 中。修改限制会影响客户端行为和测试。

### `src/process-result.ts`

- **职责：** 构造 compact 与 verbose 进程结果。
- **关键行为：** 默认隐藏详细元数据；verbose 返回启动时间、工作目录、prompt 和完整解析结果；OpenCode 失败时保留原始输出。
- **变更风险：** 中。结果形状属于 MCP 契约的一部分。

### `src/server.ts`

- **职责：** 统一导出 server 能力，并在非测试环境启动 `runMcpServer()`。
- **测试边界：** `if (!process.env.VITEST)` 保护不能删除。
- **变更风险：** 中。影响导入副作用和测试稳定性。

### `src/bin/agent-bridge-mcp.ts`

- **职责：** npm bin 入口。
- **注意：** 应只负责启动 MCP stdio server，不承载业务逻辑。
- **变更风险：** 中。影响包安装后的可执行入口。

## 测试辅助模块

### `src/__tests__/utils/mcp-client.ts`

- **职责：** 通过构建后的 `dist/server.js` 启动真实 MCP stdio server，执行契约级交互。
- **用途：** 验证 MCP 初始化、tools/list、tools/call 和响应结构。

### Mock CLI 工具

- **路径：** `src/__tests__/utils/claude-mock.ts`、`opencode-mock.ts`、`persistent-mock.ts`、`test-helpers.ts`
- **职责：** 模拟外部 CLI 行为，避免测试依赖真实 CLI 登录态。

## 外部边界

- **MCP 客户端：** 通过 stdio transport 调用 tools。
- **本机 AI CLI：** 由 `child_process.spawn` 以 `shell: false` 或参数数组形式启动。
- **文件系统：** 读取 `prompt_file`，检查工作目录，检查 CLI 二进制可执行性。
- **进程信号：** `kill_process` 使用 `SIGTERM` 终止运行中子进程。

## 不存在的组件

- 无浏览器 UI。
- 无数据库或 ORM。
- 无 HTTP server 路由。
- 无持久化队列；只有轻量进程注册表和 stdout/stderr 日志文件。
- 无人类 CLI 子命令。

---

_Generated using BMAD Method `document-project` workflow_
