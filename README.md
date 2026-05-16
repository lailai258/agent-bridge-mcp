# agent-bridge-mcp

> MCP-only server for running local Claude, Codex, Gemini, Forge, and OpenCode CLI agents as background jobs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%5E20.19.0%20%7C%7C%20%3E%3D22.12.0-339933)](./package.json)
[![MCP](https://img.shields.io/badge/MCP-stdio%20server-blue)](./server.json)

**English** | [简体中文](./README.zh-CN.md)

`agent-bridge-mcp` lets an MCP client delegate work to AI coding CLIs already installed on your machine. It does not call model APIs directly. Instead, it starts local Claude, Codex, Gemini, Forge, or OpenCode CLI processes in the background, returns a PID immediately, and exposes MCP tools to inspect, wait for, peek at, terminate, and clean up those jobs.

The package has one executable entry point:

```text
agent-bridge-mcp
```

## Why This Exists

Most AI CLIs are excellent at real local work: editing files, running commands, searching code, using project context, and continuing long tasks. MCP clients, however, need a stable tool contract and should not block while a long agent process runs.

This server bridges that gap:

- Start long-running local AI CLI tasks through MCP.
- Return immediately with a PID instead of waiting for completion.
- Query compact or verbose results later.
- Observe short windows of live natural-language output with `peek`.
- Use one MCP contract across Claude, Codex, Gemini, Forge, and OpenCode.
- Keep process state simple and in memory for the current server lifecycle.

## What It Is Not

`agent-bridge-mcp` is intentionally narrow:

- It is not a model API gateway.
- It is not a human-facing terminal CLI suite.
- It does not provide `ai-cli run`, `ai-cli ps`, or similar subcommands.
- It does not persist process state across MCP server restarts.
- It does not verify CLI login state, subscriptions, model access, or terms acceptance.

## Supported Agent CLIs

The server can launch these local tools:

- Claude CLI
- Codex CLI
- Gemini CLI
- Forge CLI
- OpenCode CLI

You must install, configure, and sign in to the CLIs you plan to use before calling `run`. `doctor` only checks whether binaries can be resolved and executed; it does not check account state.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- npm
- At least one supported AI CLI installed locally
- An MCP client that supports stdio servers

## Installation

### From Source

```bash
git clone https://github.com/agent-bridge/agent-bridge-mcp.git
cd agent-bridge-mcp
npm install
npm run build
```

Start the built MCP server:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

### From npm

If installed from npm, the package name is:

```bash
npm install -g agent-bridge-mcp-server
```

Then start the stdio server with:

```bash
agent-bridge-mcp
```

## MCP Client Configuration

Use the package executable when it is available on `PATH`:

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

Or point your MCP client at the built server file:

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

MCP registry metadata is available in [server.json](./server.json).

## Quick Example

Call `run` from your MCP client:

```json
{
  "model": "codex-ultra",
  "workFolder": "/absolute/path/to/project",
  "prompt": "Review this repository and identify the most important test failures."
}
```

The server returns immediately:

```json
{
  "pid": 12345,
  "status": "started",
  "agent": "codex",
  "message": "codex process started successfully"
}
```

Later, inspect the process:

```json
{
  "pid": 12345,
  "verbose": true
}
```

Or wait for it:

```json
{
  "pids": [12345],
  "timeout": 300,
  "verbose": false
}
```

## MCP Tools

All tool responses are returned as MCP text content containing pretty-printed JSON.

### `run`

Starts a new local AI CLI child process in the background and returns a PID immediately.

Required:

- `workFolder`: absolute working directory for the agent process.

Prompt input, exactly one required:

- `prompt`: inline task prompt.
- `prompt_file`: absolute path or path relative to `workFolder`.

Optional:

- `model`: standard model, alias, or OpenCode dynamic model.
- `reasoning_effort`: supported only for Claude and Codex.
- `session_id`: resume an existing CLI session where the selected CLI supports it.

### `list_processes`

Lists tracked processes in the current server memory:

- `pid`
- `agent`
- `status`

Statuses are `running`, `completed`, or `failed`.

### `get_result`

Returns the current status and output for one PID.

Parameters:

- `pid`: PID returned by `run`.
- `verbose`: include metadata such as `startTime`, `workFolder`, `prompt`, and fuller parsed output.

### `wait`

Waits for one or more tracked processes to finish.

Parameters:

- `pids`: non-empty PID array.
- `timeout`: seconds, default `180`.
- `verbose`: return verbose result objects.

### `peek`

Observes a short live output window for running processes.

Parameters:

- `pids`: PID array. Duplicates are removed while preserving first-seen order.
- `peek_time_sec`: positive integer, default `10`, maximum `60`.
- `include_tool_calls`: include normalized tool-call events without raw tool output.

Important boundaries:

- `peek` is not a history API.
- `peek` is not a gapless stream.
- `peek` is not stdout/stderr tailing.
- Tool calls are summarized; raw tool output is excluded.

### `kill_process`

Sends `SIGTERM` to a running process by PID.

### `cleanup_processes`

Removes completed and failed process records from the server's in-memory process table.

### `doctor`

Reports binary path resolution for supported CLIs:

- configured command
- resolved path
- availability
- lookup source
- configuration errors

It does not verify login state, terms acceptance, model permissions, or network connectivity.

### `models`

Lists supported model names, aliases, and OpenCode dynamic model syntax.

## Models

### Aliases

- `claude-ultra` -> Claude `opus`, with default `reasoning_effort=max`
- `codex-ultra` -> Codex `gpt-5.5`, with default `reasoning_effort=xhigh`
- `gemini-ultra` -> Gemini `gemini-3.1-pro-preview`

### Standard Models

Claude:

- `sonnet`
- `sonnet[1m]`
- `deepseek-v4-pro[1m]`
- `deepseek-v4-flash[1m]`
- `glm-5.1`
- `opus`
- `opusplan`
- `haiku`

Codex:

- `gpt-5.4`
- `gpt-5.5`
- `gpt-5.4-mini`
- `gpt-5.3-codex`
- `gpt-5.3-codex-spark`
- `gpt-5.2`

Gemini:

- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-3.1-pro-preview`
- `gemini-3-pro-preview`
- `gemini-3-flash-preview`

Forge:

- `forge`

OpenCode:

- `opencode`
- `oc-<provider/model>`

Example dynamic OpenCode model:

```json
{
  "model": "oc-openai/gpt-5.4",
  "workFolder": "/absolute/path/to/project",
  "prompt": "Find the highest-risk regression in this branch."
}
```

Example OpenCode DeepSeek v4 Pro model:

```json
{
  "model": "oc-opencode-go/deepseek-v4-pro",
  "workFolder": "/absolute/path/to/project",
  "prompt": "Find the highest-risk regression in this branch."
}
```

## Reasoning Effort

`reasoning_effort` is intentionally limited by agent family:

- Claude: `low`, `medium`, `high`, `xhigh`, `max`
- Codex: `low`, `medium`, `high`, `xhigh`
- Gemini: not supported
- Forge: not supported
- OpenCode: not supported

Invalid combinations are rejected before launching the child process.

## Session Resume

The optional `session_id` parameter is passed to the selected CLI using that CLI's native resume mechanism:

- Claude: resume with forked session behavior.
- Codex: `exec resume <session_id>`.
- Gemini: resume flag.
- Forge: conversation ID.
- OpenCode: `--session`.

Session behavior still depends on the installed CLI version and its own storage model.

## Gemini Image Prompts

Gemini CLI can reference images from the prompt, for example `@image.png`. Set `workFolder` to the directory containing the image, or use a path Gemini can resolve:

```json
{
  "model": "gemini-2.5-pro",
  "workFolder": "/absolute/path/to/assets",
  "prompt": "Analyze @image.png and report the UI hierarchy issues."
}
```

You can also keep a larger prompt in a file:

```json
{
  "model": "gemini-2.5-pro",
  "workFolder": "/absolute/path/to/assets",
  "prompt_file": "prompt.md"
}
```

## CLI Path Configuration

By default, the server resolves CLIs from common local install paths and `PATH`.

Override a CLI command or absolute path with environment variables:

- `CLAUDE_CLI_NAME`
- `CODEX_CLI_NAME`
- `GEMINI_CLI_NAME`
- `FORGE_CLI_NAME`
- `OPENCODE_CLI_NAME`

Values may be simple command names or absolute paths. Relative paths such as `./claude` or `tools/codex` are rejected.

Enable debug logging with:

```bash
MCP_CLAUDE_DEBUG=true agent-bridge-mcp
```

## Architecture

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

Core modules:

- [src/app/mcp.ts](./src/app/mcp.ts): MCP server, tool registration, handler dispatch, error mapping.
- [src/process-service.ts](./src/process-service.ts): in-memory process lifecycle management.
- [src/cli-builder.ts](./src/cli-builder.ts): converts `run` input into safe CLI argument arrays.
- [src/cli-utils.ts](./src/cli-utils.ts): CLI path resolution and doctor status.
- [src/model-catalog.ts](./src/model-catalog.ts): model lists, aliases, and OpenCode dynamic model metadata.
- [src/parsers.ts](./src/parsers.ts): output parsers and peek event extraction.
- [src/process-result.ts](./src/process-result.ts): compact and verbose result shaping.
- [src/peek.ts](./src/peek.ts): peek validation and response helpers.

## Runtime State

Process records live only in the current Node.js server process.

Consequences:

- A PID returned by `run` is only valid while the same MCP server process is alive.
- Restarting the MCP server loses all tracked process records.
- `cleanup_processes` only removes records from memory; it does not delete files.
- Each `run` call starts a new child process.

## Security Notes

- Child processes are spawned with argument arrays rather than shell-concatenated prompt strings.
- Custom CLI environment variables reject relative paths.
- `peek` excludes raw tool output and raw command output.
- Verbose results include the prompt, so avoid sending secrets in prompts.
- External CLI sandboxing, network access, file permissions, and approval behavior are controlled by the selected CLI, not by this server.

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run unit tests:

```bash
npm run test:unit
```

Run the full test suite:

```bash
npm test
```

Check package contents before publishing:

```bash
npm_config_cache="/private/tmp/agent-bridge-mcp-npm-cache" npm pack --dry-run
```

## Documentation

Additional project documentation:

- [docs/index.md](./docs/index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/mcp-tool-contracts.md](./docs/mcp-tool-contracts.md)
- [docs/api-contracts.md](./docs/api-contracts.md)
- [docs/development-guide.md](./docs/development-guide.md)
- [docs/data-models.md](./docs/data-models.md)

## License

MIT. See [LICENSE](./LICENSE).
