# agent-bridge-mcp

> MCP-only 服务，用于把本机 Claude、Codex、Forge、OpenCode 和 Antigravity CLI 作为后台任务运行。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%5E20.19.0%20%7C%7C%20%3E%3D22.12.0-339933)](./package.json)
[![MCP](https://img.shields.io/badge/MCP-stdio%20server-blue)](./server.json)

[English](./README.md) | **简体中文**

`agent-bridge-mcp` 允许 MCP 客户端把任务委派给本机已经安装的 AI 编程 CLI。它不直接调用模型 API，而是启动本机 Claude、Codex、Forge、OpenCode 或 Antigravity CLI 后台子进程，立即返回 PID，并提供 MCP 工具来查询、等待、观察、终止和清理这些任务。

包内唯一可执行入口是：

```text
agent-bridge-mcp
```

## 为什么需要它

很多 AI CLI 擅长处理真实本地工程任务：编辑文件、运行命令、搜索代码、读取项目上下文，以及持续执行较长任务。但 MCP 客户端需要稳定的工具契约，并且不应该在长任务执行期间一直阻塞。

本项目解决的是这层衔接问题：

- 通过 MCP 启动长时间运行的本机 AI CLI 任务。
- 立即返回 PID，而不是等待任务结束。
- 后续按需查询 compact 或 verbose 结果。
- 使用 `peek` 观察短时间窗口内的实时自然语言输出。
- 用同一套 MCP 契约屏蔽 Claude、Codex、Forge、OpenCode、Antigravity 的参数差异。
- 运行中的进程句柄保存在当前 server 内存中，同时持久化轻量进程元数据和日志路径，支持 server 重启后恢复查询。

## 它不是什么

`agent-bridge-mcp` 的边界很明确：

- 它不是模型 API 网关。
- 它不是面向人类使用的终端 CLI 套件。
- 它不提供 `ai-cli run`、`ai-cli ps` 等子命令。
- 它不会重新附加到重启前的实时 stdout/stderr 流，但会通过本地注册表恢复已记录 PID 的基础状态和日志内容。
- 它不会验证 CLI 登录态、订阅状态、模型权限或条款接受状态。

## 支持的 Agent CLI

server 可以启动以下本机工具：

- Claude CLI
- Codex CLI
- Forge CLI
- OpenCode CLI
- Antigravity CLI

调用 `run` 前，你需要自行安装、配置并登录计划使用的 CLI。`doctor` 只检查二进制是否能解析和执行，不检查账号状态。

Gemini CLI 已移除，因为该 CLI 已不再维护。旧的 `gemini-*` 模型和 `gemini-ultra` 会被明确拒绝，不会被路由到其他 agent。

## 运行要求

- Node.js `^20.19.0 || >=22.12.0`
- npm
- 至少安装一个受支持的本机 AI CLI
- 支持 stdio server 的 MCP 客户端

## 安装

### 从源码安装

```bash
git clone https://github.com/lailai258/agent-bridge-mcp.git
cd agent-bridge-mcp
npm install
npm run build
```

启动构建后的 MCP server：

```bash
npm start
```

开发模式：

```bash
npm run dev
```

### 从 npm 安装

npm 包名是：

```bash
npm install -g agent-bridge-mcp-server
```

然后启动 stdio server：

```bash
agent-bridge-mcp
```

## MCP 客户端配置

如果 `agent-bridge-mcp` 在 `PATH` 中：

```json
{
  "mcpServers": {
    "agent-bridge-mcp": {
      "command": "agent-bridge-mcp",
      "args": []
    }
  }
}
```

也可以直接指向构建产物：

```json
{
  "mcpServers": {
    "agent-bridge-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-bridge-mcp/dist/server.js"
      ]
    }
  }
}
```

MCP registry 元数据见 [server.json](./server.json)。

## 快速示例

通过 MCP 客户端调用 `run`：

```json
{
  "model": "codex-ultra",
  "workFolder": "/absolute/path/to/project",
  "prompt": "Review this repository and identify the most important test failures."
}
```

server 会立即返回：

```json
{
  "pid": 12345,
  "status": "started",
  "agent": "codex",
  "message": "codex process started successfully"
}
```

稍后查询该进程：

```json
{
  "pid": 12345,
  "verbose": true
}
```

或等待它完成：

```json
{
  "pids": [12345],
  "timeout": 300,
  "on_timeout": "return_status",
  "verbose": false
}
```

## MCP Tools

所有 tool 响应都以 MCP text content 返回，文本内容是格式化后的 JSON。

### `run`

启动一个新的本机 AI CLI 后台子进程，并立即返回 PID。

必填：

- `workFolder`：agent 进程的绝对工作目录。

提示词输入，必须且只能提供一个：

- `prompt`：直接传入的任务提示词。
- `prompt_file`：绝对路径，或相对于 `workFolder` 的路径。

可选：

- `model`：标准模型、别名或 OpenCode 动态模型。使用 `antigravity` 选择 Antigravity CLI。
- `reasoning_effort`：只支持 Claude 和 Codex。
- `session_id`：在所选 CLI 支持的情况下恢复已有会话。

### `list_processes`

列出当前 server 内存和持久化进程注册表中跟踪的进程：

- `pid`
- `agent`
- `status`

状态取值为 `running`、`completed` 或 `failed`。

### `get_result`

按 PID 获取当前进程状态和输出。

参数：

- `pid`：`run` 返回的 PID。
- `verbose`：包含 `startTime`、`workFolder`、`prompt` 和更完整的解析输出。

### `wait`

等待一个或多个被跟踪的进程结束。

参数：

- `pids`：非空 PID 数组。
- `timeout`：逻辑等待预算，单位秒。默认 `900`，可通过 `AGENT_BRIDGE_WAIT_TIMEOUT_SEC` 调整。
- `on_timeout`：默认 `return_status`，单次观察窗口结束时返回当前 running 结果；只有需要保留旧超时错误行为时才使用 `throw`。
- `verbose`：返回 verbose 结果对象。

单次 MCP tool call 最多观察 `AGENT_BRIDGE_WAIT_CALL_WINDOW_SEC` 秒，默认 `90`，上限 `110`，避免撞上宿主 `tools/call` 超时；后台子进程会继续运行。

### `peek`

对运行中的进程做一次短窗口实时观察。

参数：

- `pids`：PID 数组。重复 PID 会被去重，并保留第一次出现的顺序。
- `peek_time_sec`：正整数，默认 `10`，最大 `60`。
- `include_tool_calls`：是否包含规范化工具调用事件，不包含原始工具输出。

重要边界：

- `peek` 不是历史 API。
- `peek` 不是无间隙流式记录。
- `peek` 不是 stdout/stderr tail。
- 工具调用只返回摘要；原始工具输出不会返回。

### `kill_process`

按 PID 向运行中的进程发送 `SIGTERM`。

### `cleanup_processes`

从 server 内存进程表和持久化注册表中移除已完成和失败的进程记录。日志文件会保留在磁盘上，便于排障。

### `doctor`

报告受支持 CLI 的二进制路径解析状态：

- 配置的命令
- 解析后的路径
- 是否可用
- 查找来源
- 配置错误

它不验证登录态、条款接受状态、模型权限或网络连通性。

### `models`

列出支持的模型名、模型别名、Antigravity 入口和 OpenCode 动态模型语法。

## 模型

### 别名

- `claude-ultra` -> Claude `opus`，默认 `reasoning_effort=max`
- `codex-ultra` -> Codex `gpt-5.5`，默认 `reasoning_effort=xhigh`

### 标准模型

Claude：

- `sonnet`
- `sonnet[1m]`
- `deepseek-v4-pro[1m]`
- `deepseek-v4-flash[1m]`
- `glm-5.1`
- `opus`
- `opusplan`
- `haiku`

Codex：

- `gpt-5.4`
- `gpt-5.5`
- `gpt-5.4-mini`
- `gpt-5.3-codex`
- `gpt-5.3-codex-spark`
- `gpt-5.2`

Forge：

- `forge`

OpenCode：

- `opencode`
- `oc-<provider/model>`

Antigravity：

- `antigravity`

`antigravity` 表示选择 Antigravity CLI agent。本集成不会向 `agy` 传递模型选择参数。

OpenCode 动态模型示例：

```json
{
  "model": "oc-openai/gpt-5.4",
  "workFolder": "/absolute/path/to/project",
  "prompt": "Find the highest-risk regression in this branch."
}
```

OpenCode DeepSeek v4 Pro 示例：

```json
{
  "model": "oc-opencode-go/deepseek-v4-pro",
  "workFolder": "/absolute/path/to/project",
  "prompt": "Find the highest-risk regression in this branch."
}
```

## Reasoning Effort

`reasoning_effort` 按 agent 家族限制：

- Claude：`low`、`medium`、`high`、`xhigh`、`max`
- Codex：`low`、`medium`、`high`、`xhigh`
- Forge：不支持
- OpenCode：不支持
- Antigravity：不支持

不合法的组合会在启动子进程前被拒绝。

## 会话恢复

可选的 `session_id` 会按所选 CLI 的原生恢复机制传入：

- Claude：使用 forked session 语义恢复。
- Codex：`exec resume <session_id>`。
- Forge：conversation ID。
- OpenCode：`--session`。
- Antigravity：print 模式下使用 `--conversation <session_id>`。

具体会话行为仍取决于已安装 CLI 的版本和它自己的存储模型。

## CLI 路径配置

默认会从常见本地安装路径和 `PATH` 中解析 CLI。

可通过环境变量覆盖命令名或绝对路径：

- `CLAUDE_CLI_NAME`
- `CODEX_CLI_NAME`
- `FORGE_CLI_NAME`
- `OPENCODE_CLI_NAME`
- `ANTIGRAVITY_CLI_NAME`

变量值可以是简单命令名或绝对路径。相对路径，例如 `./claude` 或 `tools/codex`，会被拒绝。

启用调试日志：

```bash
MCP_CLAUDE_DEBUG=true agent-bridge-mcp
```

## 架构

```text
MCP Client
  ↓ stdio / tools.call
MCP Server Boundary        src/app/mcp.ts
  ↓
Runtime Process Layer      src/process-service.ts
  ↓
CLI Adapter Layer          src/cli-builder.ts / src/cli-utils.ts
  ↓
Local AI CLI Processes     claude / codex / forge / opencode / agy
```

核心模块：

- [src/app/mcp.ts](./src/app/mcp.ts)：MCP server、tool 注册、handler 分发和错误映射。
- [src/process-service.ts](./src/process-service.ts)：进程生命周期管理、wait/peek/kill 编排和注册表集成。
- [src/process-registry.ts](./src/process-registry.ts)：持久化进程元数据和 stdout/stderr 日志路径。
- [src/cli-builder.ts](./src/cli-builder.ts)：把 `run` 输入转换为安全的 CLI 参数数组。
- [src/cli-utils.ts](./src/cli-utils.ts)：CLI 路径解析和 doctor 状态。
- [src/model-catalog.ts](./src/model-catalog.ts)：模型列表、别名、Antigravity 入口和 OpenCode 动态模型元数据。
- [src/parsers.ts](./src/parsers.ts)：输出解析和 peek 事件提取。
- [src/process-result.ts](./src/process-result.ts)：compact / verbose 结果整形。
- [src/peek.ts](./src/peek.ts)：peek 参数校验和响应辅助。

## 运行时状态

运行中的子进程句柄只存在于当前 Node.js server 进程内存中；进程元数据和 stdout/stderr 日志路径会写入注册表，默认目录为 `~/.agent-bridge-mcp`，可通过 `AGENT_BRIDGE_PROCESS_REGISTRY_DIR` 覆盖。

这意味着：

- `run` 返回的 PID 在同一个 MCP server 进程内可实时观察。
- 重启 MCP server 后，无法重新附加实时输出流，但可恢复已记录 PID 的基础结果和日志内容。
- `cleanup_processes` 删除内存记录和持久化注册表记录，不删除日志文件。
- 每次 `run` 都会启动新的子进程。

## 安全说明

- 重要：部分 CLI 适配器会主动使用跳过审批或沙箱的危险参数，以便后台任务不被交互式确认卡住。Claude 和 Antigravity 使用 `--dangerously-skip-permissions`，Codex 使用 `--dangerously-bypass-approvals-and-sandbox`。只应在你信任的工作目录中运行本 server，并在接入不可信 prompt 或仓库前确认所选 CLI 自身的安全模型。
- 子进程使用参数数组启动，不把 prompt 拼接进 shell 字符串。
- 自定义 CLI 环境变量会拒绝相对路径。
- `peek` 不返回原始工具输出或原始命令输出。
- verbose 结果会包含 prompt，因此不要把敏感信息写入 prompt。
- 外部 CLI 的沙箱、网络访问、文件权限和审批行为由所选 CLI 自己控制，不由本 server 控制。

## 开发

安装依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

运行单元测试：

```bash
npm run test:unit
```

运行完整测试：

```bash
npm test
```

发布前检查包内容：

```bash
npm_config_cache="/private/tmp/agent-bridge-mcp-npm-cache" npm pack --dry-run
```

## 文档

更多项目文档：

- [docs/index.md](./docs/index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/mcp-tool-contracts.md](./docs/mcp-tool-contracts.md)
- [docs/api-contracts.md](./docs/api-contracts.md)
- [docs/development-guide.md](./docs/development-guide.md)
- [docs/data-models.md](./docs/data-models.md)

## License

MIT. See [LICENSE](./LICENSE).
