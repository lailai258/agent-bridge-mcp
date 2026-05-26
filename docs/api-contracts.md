# agent-bridge-mcp - MCP API 契约

**日期：** 2026-05-14

## 总览

本项目不暴露 HTTP API。对外 API 是 MCP stdio server 暴露的 tools。所有 tool 的返回内容均使用 MCP `content` 数组包装，核心文本内容是格式化 JSON：

```json
{
  "content": [
    {
      "type": "text",
      "text": "{...JSON...}"
    }
  ]
}
```

## 通用错误语义

- 参数缺失、类型错误、非法模型、非法路径等输入问题映射为 `ErrorCode.InvalidParams`。
- 未知 tool 映射为 `ErrorCode.MethodNotFound`。
- 进程启动失败或内部执行异常映射为 `ErrorCode.InternalError`。
- 未知 PID 在 `get_result`、`wait`、`kill_process` 中按无效参数处理。

## `run`

启动一个 Claude、Codex、Gemini、Forge、OpenCode 或 Antigravity CLI 后台任务，并立即返回 PID。

### 输入

```json
{
  "workFolder": "/absolute/path/to/project",
  "prompt": "任务说明",
  "model": "codex-ultra",
  "reasoning_effort": "xhigh",
  "session_id": "optional-session-id"
}
```

也可以使用 `prompt_file`：

```json
{
  "workFolder": "/absolute/path/to/project",
  "prompt_file": "prompt.md",
  "model": "gemini-2.5-pro"
}
```

### 约束

- `workFolder` 必填，且必须能解析为存在的目录。
- `prompt` 与 `prompt_file` 必须且只能提供一个。
- `prompt_file` 可以是绝对路径，也可以相对 `workFolder`。
- `reasoning_effort` 只支持 Claude 和 Codex。
- OpenCode 动态模型必须使用精确格式 `oc-<provider/model>`，例如 `oc-opencode-go/deepseek-v4-pro`。
- `model: "antigravity"` 选择 Antigravity CLI，不向 `agy` 传递模型选择参数；`session_id` 会映射为 `--conversation`。

### 输出

```json
{
  "pid": 12345,
  "status": "started",
  "agent": "codex",
  "message": "codex process started successfully"
}
```

## `list_processes`

列出当前 server 内存中跟踪的进程。

### 输入

```json
{}
```

### 输出

```json
[
  {
    "pid": 12345,
    "agent": "codex",
    "status": "running"
  }
]
```

## `get_result`

按 PID 获取当前进程状态和输出。

### 输入

```json
{
  "pid": 12345,
  "verbose": false
}
```

### 输出

compact 结果示例：

```json
{
  "pid": 12345,
  "agent": "claude",
  "status": "completed",
  "exitCode": 0,
  "model": "sonnet",
  "agentOutput": {
    "result": "..."
  }
}
```

verbose 为 `true` 时会额外包含 `startTime`、`workFolder`、`prompt` 和更完整的解析结果。

## `wait`

等待一个或多个进程完成，返回 wait 响应对象。长任务不会让单次 MCP tool call 一直阻塞到宿主超时。

### 输入

```json
{
  "pids": [12345, 12346],
  "timeout": 900,
  "on_timeout": "return_status",
  "verbose": true
}
```

### 约束

- `pids` 必须是非空数组。
- `timeout` 是逻辑等待预算，默认 900 秒。
- 单次 tool call 观察窗口默认 90 秒，最大 110 秒。
- `on_timeout` 默认 `return_status`，未完成时返回 running 状态而不是抛错。
- 任一 PID 不存在时返回参数错误。

## `peek`

短窗口观察运行中进程新产生的输出事件。

### 输入

```json
{
  "pids": [12345],
  "peek_time_sec": 10,
  "include_tool_calls": true
}
```

### 约束

- PID 会去重，并保持首次出现顺序。
- 去重后 PID 数量必须在 1 到 32 之间。
- `peek_time_sec` 必须是正整数，最大 60。
- 默认不返回工具调用事件。

### 输出

```json
{
  "peek_started_at": "2026-05-14T09:19:04.000Z",
  "observed_duration_sec": 2.01,
  "processes": [
    {
      "pid": 12345,
      "agent": "claude",
      "status": "running",
      "events": [
        {
          "kind": "message",
          "ts": "2026-05-14T09:19:05.000Z",
          "text": "可见的 assistant 消息"
        }
      ],
      "truncated": false,
      "error": null
    }
  ]
}
```

### 安全边界

`peek` 不返回原始工具输出、命令 stdout/stderr 或历史累计输出。工具调用只返回工具名、阶段、状态、摘要等规范化信息。

## `kill_process`

终止运行中的进程。

### 输入

```json
{
  "pid": 12345
}
```

### 输出

```json
{
  "pid": 12345,
  "status": "terminated",
  "message": "Process terminated successfully"
}
```

如果进程已经结束，返回当前状态并说明进程已终止。

## `cleanup_processes`

清理内存中已完成或失败的进程记录。

### 输入

```json
{}
```

### 输出

```json
{
  "removed": 2,
  "removedPids": [12345, 12346],
  "message": "Cleaned up 2 finished process(es)"
}
```

## `doctor`

检查支持的 CLI 二进制是否可解析和可执行。

### 输入

```json
{}
```

### 输出重点

- `checks.binaryAvailability`
- `checks.pathResolution`
- 每个 CLI 的 `configuredCommand`、`resolvedPath`、`available`、`lookup`、`error`

### 非目标

`doctor` 不检查登录态、模型权限、条款接受状态或网络可用性。

## `models`

列出支持模型、模型别名和动态模型后端提示。

### 输入

```json
{}
```

### 输出重点

- `aliases`
- `claude`
- `codex`
- `gemini`
- `forge`
- `opencode`
- `antigravity`
- `dynamicModelBackends.opencode`

## 契约维护要求

修改任何 tool 的 schema、说明、参数、错误语义或响应形状时，必须同步维护：

- `src/app/mcp.ts`
- `docs/mcp-tool-contracts.md`
- `docs/api-contracts.md`
- `src/__tests__/mcp-contract.test.ts`
- 与变更相关的单元测试

---

_Generated using BMAD Method `document-project` workflow_
