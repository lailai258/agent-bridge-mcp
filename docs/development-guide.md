# agent-bridge-mcp - 开发指南

**日期：** 2026-05-14

## 前置条件

- Node.js：`^20.19.0 || >=22.12.0`
- npm
- TypeScript / Node ESM 基础环境
- 按需安装并登录本机 AI CLI：
  - Claude CLI
  - Codex CLI
  - Gemini CLI
  - Forge CLI
  - OpenCode CLI
  - Antigravity CLI

本项目只检查 CLI 二进制路径与可执行性，不负责登录、模型权限或条款确认。

## 安装

```bash
npm install
```

## 本地开发

开发模式启动 MCP server：

```bash
npm run dev
```

构建后启动：

```bash
npm run build
npm start
```

通过 bin 入口启动：

```bash
agent-bridge-mcp
```

## MCP 客户端配置

构建后可在 MCP 客户端中配置：

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

如果可执行入口在 `PATH` 中：

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

## 构建

```bash
npm run build
```

构建命令直接运行 `tsc`，输出目录是 `dist/`。

## 测试

单元测试：

```bash
npm run test:unit
```

完整测试：

```bash
npm test
```

发布清单 dry-run：

```bash
npm_config_cache="/private/tmp/agent-bridge-mcp-npm-cache" npm pack --dry-run
```

## 测试策略

- `src/__tests__/mcp-contract.test.ts` 验证 MCP stdio tool 契约和构建产物 server 行为。
- `src/__tests__/cli-builder.test.ts` 验证模型路由、参数构造和输入校验。
- `src/__tests__/process-management.test.ts` 验证后台进程管理、结果查询、peek、kill、cleanup。
- `src/__tests__/parsers.test.ts` 验证各 CLI 输出解析和 peek 事件提取。
- `src/__tests__/cli-utils.test.ts` 验证 CLI 路径解析与环境变量覆盖。
- mock CLI 工具位于 `src/__tests__/utils/`，测试不应依赖真实 CLI 登录态。

## 环境变量

可用以下变量覆盖 CLI 命令名或绝对路径：

- `CLAUDE_CLI_NAME`
- `CODEX_CLI_NAME`
- `GEMINI_CLI_NAME`
- `FORGE_CLI_NAME`
- `OPENCODE_CLI_NAME`
- `ANTIGRAVITY_CLI_NAME`

约束：

- 允许简单命令名，例如 `claude`。
- 允许绝对路径。
- 禁止相对路径，例如 `./claude`、`../bin/codex`、`foo/bar`。

调试日志：

- `MCP_CLAUDE_DEBUG=true` 时输出 debug 日志到 stderr。

## 代码规范

- 保持 TypeScript ESM，不引入 CommonJS。
- 相对源码导入必须带 `.js` 后缀。
- Node 内置模块优先使用 `node:` 前缀。
- 公共类型使用 PascalCase，函数和变量使用 camelCase。
- 注释只用于关键流程、复杂解析或安全边界；新增注释按项目规范使用中文。
- 不新增不必要运行依赖。

## 修改 MCP tool 的流程

1. 修改 `src/app/mcp.ts` 的 tool schema、description 和 handler。
2. 如涉及进程行为，更新 `src/process-service.ts`。
3. 如涉及 CLI 参数，更新 `src/cli-builder.ts`。
4. 如涉及响应解析，更新 `src/parsers.ts` 或 `src/process-result.ts`。
5. 同步更新 `docs/mcp-tool-contracts.md` 和 `docs/api-contracts.md`。
6. 更新 `src/__tests__/mcp-contract.test.ts` 及相关单元测试。
7. 运行 `npm run build` 和 `npm run test:unit`。

## 修改模型列表的流程

1. 更新 `src/model-catalog.ts`。
2. 如有默认 reasoning 行为，更新 `src/cli-builder.ts`。
3. 同步 README 模型说明。
4. 更新 `cli-builder.test.ts` 和 MCP 契约测试。

## 发布注意事项

- `package.json` 的 `bin` 只能暴露 `agent-bridge-mcp`。
- `files` 白名单需要包含实际发布入口和必要文档。
- 发布前建议 dry-run 检查 tarball 内容。
- 不要把已废弃的人类 CLI 文件重新加入发布清单。

## 常见问题排查

### `doctor` 显示 CLI 不可用

- 确认 CLI 已安装。
- 确认 CLI 在 `PATH` 中，或使用对应环境变量配置绝对路径。
- 确认文件具备可执行权限。

### `run` 返回参数错误

- 确认 `workFolder` 存在。
- 确认 `prompt` 与 `prompt_file` 只传一个。
- 确认 `prompt_file` 能被解析并读取。
- 确认 `reasoning_effort` 与模型家族匹配。

### `get_result` 找不到 PID

- 运行中 ChildProcess 句柄只保存在当前 server 内存中。
- server 重启后可从本地注册表恢复已记录 PID 的基础结果，但不能重新附加实时输出流。
- 已执行 `cleanup_processes` 的进程记录会被移除。

---

_Generated using BMAD Method `document-project` workflow_
