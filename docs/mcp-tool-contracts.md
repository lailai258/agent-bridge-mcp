# MCP 工具契约

**日期：** 2026-05-14

本文档描述 `agent-bridge-mcp` 暴露的 MCP tools。项目只提供 MCP server，不提供人类 CLI 子命令。

所有 tool 返回值都使用 MCP content 包装：

```json
{
  "content": [
    {
      "type": "text",
      "text": "{...}"
    }
  ]
}
```

`text` 字段内是 `JSON.stringify(value, null, 2)` 生成的 JSON 字符串。

## `run`

启动一个新的后台 AI CLI 子进程，并立即返回 PID。

### 参数

必填参数：

- `workFolder`：绝对工作目录路径，目录必须存在。

二选一参数：

- `prompt`：直接传入的任务提示词。
- `prompt_file`：提示词文件路径。相对路径会基于 `workFolder` 解析。

可选参数：

- `model`：模型名、模型别名或 OpenCode 动态模型格式。
- `reasoning_effort`：Claude 与 Codex 的推理强度。
- `session_id`：恢复对应 CLI 的已有会话。

### 约束

- `prompt` 与 `prompt_file` 必须且只能提供一个。
- 每次调用都会启动一个新的后台子进程。
- `reasoning_effort` 只支持 Claude 和 Codex。
- Claude 支持 `low`、`medium`、`high`、`xhigh`、`max`。
- Codex 支持 `low`、`medium`、`high`、`xhigh`。
- Gemini、Forge、OpenCode 不支持 `reasoning_effort`。

### 返回

```json
{
  "pid": 12345,
  "status": "started",
  "agent": "codex",
  "message": "codex process started successfully"
}
```

## `list_processes`

列出内存中跟踪的进程摘要。

### 参数

无。

### 返回字段

- `pid`
- `agent`
- `status`

示例：

```json
[
  {
    "pid": 12345,
    "agent": "claude",
    "status": "running"
  }
]
```

## `get_result`

按 PID 获取当前进程结果。

### 参数

- `pid`：`run` 返回的 PID。
- `verbose`：为 `true` 时返回更完整的元数据和解析结果。

### 返回

默认 compact 结果包含：

- `pid`
- `agent`
- `status`
- `exitCode`
- `model`
- `session_id`（如果解析到）
- `agentOutput` 或原始 `stdout` / `stderr`

verbose 结果额外包含：

- `startTime`
- `workFolder`
- `prompt`
- 更完整的解析输出

## `wait`

等待一个或多个进程完成。

### 参数

- `pids`：PID 数组，必须非空。
- `timeout`：秒级超时时间，默认 180。
- `verbose`：为 `true` 时每个结果返回完整信息。

### 返回

返回与输入 PID 对应的结果数组。任一 PID 不存在时返回参数错误。

## `peek`

在短时间窗口中观察运行中进程的新输出。

### 参数

- `pids`：PID 数组，会按首次出现顺序去重。
- `peek_time_sec`：观察窗口，默认 10 秒，最大 60 秒。
- `include_tool_calls`：是否包含规范化工具调用事件。

### 返回

返回观察窗口内提取到的自然语言消息和可选工具调用摘要：

- `peek_started_at`
- `observed_duration_sec`
- `processes[]`
  - `pid`
  - `agent`
  - `status`
  - `events`
  - `truncated`
  - `error`

### 重要边界

`peek` 不是历史 API，不保证无间隙流式记录，也不是 stdout/stderr tail。它不返回原始工具输出、命令输出或累计 stderr。

## `kill_process`

终止运行中的进程。

### 参数

- `pid`：`run` 返回的 PID。

### 返回

运行中进程被终止时：

```json
{
  "pid": 12345,
  "status": "terminated",
  "message": "Process terminated successfully"
}
```

已结束进程会返回其当前状态和 `Process already terminated` 消息。

## `cleanup_processes`

从内存跟踪表中移除已完成或失败的进程。

### 参数

无。

### 返回

```json
{
  "removed": 1,
  "removedPids": [12345],
  "message": "Cleaned up 1 finished process(es)"
}
```

## `doctor`

检查 Claude、Codex、Gemini、Forge、OpenCode CLI 的二进制可用性与路径解析状态。

### 参数

无。

### 返回

返回每个 CLI 的：

- `configuredCommand`
- `resolvedPath`
- `available`
- `lookup`
- `error`

### 非目标

不会验证登录状态、模型权限、网络连通性或条款接受状态。

## `models`

返回支持的模型、模型别名和 OpenCode 动态模型描述。

### 参数

无。

### 支持别名

- `claude-ultra`：解析为 `opus`，默认 `reasoning_effort=max`。
- `codex-ultra`：解析为 `gpt-5.5`，默认 `reasoning_effort=xhigh`。
- `gemini-ultra`：解析为 `gemini-3.1-pro-preview`。

### OpenCode 动态模型

OpenCode 动态模型格式：

```text
oc-<provider/model>
```

示例：

```text
oc-openai/gpt-5.4
```

## 契约维护清单

修改工具契约时必须同步：

- `src/app/mcp.ts`
- `docs/mcp-tool-contracts.md`
- `docs/api-contracts.md`
- `README.md` 中的相关说明
- `src/__tests__/mcp-contract.test.ts`
- 受影响的单元测试
