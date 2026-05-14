# agent-bridge-mcp

`agent-bridge-mcp` 是一个 MCP-only server。它不直接调用任何模型 API，而是通过 MCP 工具调用本机已经安装并登录的 AI CLI，把每次任务作为后台子进程启动，并用 PID 管理运行状态、输出、等待、终止和清理。

这个项目只保留 MCP server 能力，包内唯一二进制入口是 `ai-cli-mcp`。

## 解决什么问题

当 MCP 客户端需要把代码修改、文件操作、搜索、分析或长时间任务交给本机 AI CLI 执行时，可以通过这个 server：

- 启动一个后台 Claude、Codex、Gemini、Forge 或 OpenCode CLI 任务。
- 立即拿到 PID，不阻塞 MCP 客户端。
- 后续用 PID 查询状态、等待完成、短窗口观察输出、终止进程或清理已完成记录。
- 用统一 MCP 工具契约屏蔽不同 CLI 的命令参数差异。

## 支持的 AI CLI

- Claude CLI
- Codex CLI
- Gemini CLI
- Forge CLI
- OpenCode CLI

本项目只负责调用本机 CLI。使用前需要自行安装、配置并登录对应 CLI，同时完成这些 CLI 自身要求的条款确认。

## 安装

```bash
npm install
npm run build
```

开发模式：

```bash
npm run dev
```

构建后启动：

```bash
npm start
```

也可以通过 bin 入口启动：

```bash
ai-cli-mcp
```

## MCP 客户端配置

构建后在 MCP 客户端中配置 stdio server：

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

如果通过 npm 全局安装或可执行入口可被 PATH 找到：

```json
{
  "mcpServers": {
    "agent-bridge-mcp": {
      "command": "ai-cli-mcp",
      "args": []
    }
  }
}
```

## MCP Tools

- `run`：启动一个 Claude、Codex、Gemini、Forge 或 OpenCode CLI 后台任务，返回 PID。
- `list_processes`：列出当前内存中跟踪的运行中和已结束进程。
- `get_result`：按 PID 获取当前状态和输出，支持 `verbose`。
- `wait`：等待一个或多个 PID 完成，支持超时和 `verbose`。
- `peek`：在短时间窗口中观察进程新输出的自然语言消息，可选包含规范化工具调用事件。
- `kill_process`：终止运行中的进程。
- `cleanup_processes`：清理已完成或失败的进程记录。
- `doctor`：检查受支持 CLI 的二进制可用性和路径解析状态。
- `models`：列出支持的模型、别名和 OpenCode 动态模型格式。

## 指定模型

`run` 的 `model` 参数支持这些别名：

- `claude-ultra`：映射到 Claude `opus`，默认 `reasoning_effort=max`。
- `codex-ultra`：映射到 Codex `gpt-5.5`，默认 `reasoning_effort=xhigh`。
- `gemini-ultra`：映射到 Gemini `gemini-3.1-pro-preview`。

标准模型包括：

- Claude：`sonnet`、`sonnet[1m]`、`opus`、`opusplan`、`haiku`
- Codex：`gpt-5.4`、`gpt-5.5`、`gpt-5.4-mini`、`gpt-5.3-codex`、`gpt-5.3-codex-spark`、`gpt-5.2`
- Gemini：`gemini-2.5-pro`、`gemini-2.5-flash`、`gemini-3.1-pro-preview`、`gemini-3-pro-preview`、`gemini-3-flash-preview`
- Forge：`forge`
- OpenCode：`opencode`

OpenCode 支持动态模型写法：

```text
oc-<provider/model>
```

例如：

```json
{
  "model": "oc-openai/gpt-5.4",
  "prompt": "检查这个项目的测试失败原因",
  "workFolder": "/absolute/path/to/project"
}
```

`reasoning_effort` 只支持 Claude 和 Codex。Claude 支持 `low`、`medium`、`high`、`xhigh`、`max`；Codex 支持 `low`、`medium`、`high`、`xhigh`。

## Gemini CLI 读图

Gemini CLI 支持在 prompt 中用 `@image.png` 引用图片。通过 MCP `run` 调用时，把 `workFolder` 指向图片所在目录，或在 prompt 中使用可解析的相对路径：

```json
{
  "model": "gemini-2.5-pro",
  "workFolder": "/absolute/path/to/assets",
  "prompt": "请分析 @image.png 中的界面层级和可读性问题"
}
```

也可以把 prompt 写入文件，再用 `prompt_file`：

```json
{
  "model": "gemini-2.5-pro",
  "workFolder": "/absolute/path/to/assets",
  "prompt_file": "prompt.md"
}
```

## CLI 路径配置

默认会在本机 PATH 或常见本地安装路径中查找 CLI。需要覆盖命令名或绝对路径时，可以设置环境变量：

- `CLAUDE_CLI_NAME`
- `CODEX_CLI_NAME`
- `GEMINI_CLI_NAME`
- `FORGE_CLI_NAME`
- `OPENCODE_CLI_NAME`

这些变量可以是简单命令名，也可以是绝对路径。不支持相对路径。

## 注意事项

- 进程状态只保存在 MCP server 当前内存中；server 重启后不会恢复旧 PID。
- 每次 `run` 都会启动新的后台子进程。
- `get_result`、`wait`、`peek`、`kill_process`、`cleanup_processes` 都基于 MCP server 内存中的 PID 管理。
- 本项目不包含人类 CLI 子命令，不提供 `ai-cli run/ps/result/wait/kill/cleanup/doctor/models/mcp`。
- 外部 CLI 的登录态、模型权限、网络访问和沙箱行为由对应 CLI 自身决定。
