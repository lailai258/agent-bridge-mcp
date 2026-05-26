# agent-bridge-mcp - 项目总览

**日期：** 2026-05-14  
**类型：** TypeScript / Node.js MCP-only 后台进程编排服务  
**架构：** 单体仓库，MCP stdio server + 内存进程管理 + 本地进程注册表 + 多 CLI 适配层

## 执行摘要

`agent-bridge-mcp` 是一个只暴露 MCP server 能力的 Node.js 项目。它不直接调用模型 API，而是通过本机已安装并登录的 Claude、Codex、Gemini、Forge、OpenCode、Antigravity CLI 启动后台任务，并用 MCP tools 提供统一的运行、查询、等待、短窗口观察、终止、清理、诊断和模型发现能力。

项目核心边界是 MCP tool 契约，不是人类交互式 CLI。包内唯一二进制入口是 `agent-bridge-mcp`，指向构建产物 `dist/bin/agent-bridge-mcp.js`。

## 项目分类

- **仓库类型：** 单体项目
- **项目类型：** 后端 / MCP service
- **主要语言：** TypeScript
- **运行平台：** Node.js `^20.19.0 || >=22.12.0`
- **模块系统：** ESM + TypeScript NodeNext
- **架构模式：** 分层适配器架构

## 技术栈摘要

| 类别 | 技术 | 版本 | 用途 |
| --- | --- | --- | --- |
| Runtime | Node.js | `^20.19.0 || >=22.12.0` | 执行 MCP stdio server 和子进程管理 |
| Language | TypeScript | `^5.8.3` | 强类型源码 |
| Module | ESM / NodeNext | 项目配置 | 保持 Node 原生 ESM 行为 |
| MCP SDK | `@modelcontextprotocol/sdk` | `^1.29.0` | 注册 MCP server 与 tools |
| Schema | `zod` | `^3.24.4` | 当前依赖保留，项目输入校验主要在代码中手写 |
| Test | Vitest | `^4.1.3` | 单元测试和 MCP stdio 契约测试 |
| Dev Runner | `tsx` | `^4.19.4` | 开发模式启动 TypeScript server |

## 核心能力

- 通过 `run` 启动 Claude、Codex、Gemini、Forge、OpenCode、Antigravity CLI 后台任务，并立即返回 PID。
- 使用内存 `Map` 跟踪运行中进程句柄、状态、stdout、stderr、模型、工作目录、启动时间和退出码，并将进程元数据写入本地注册表。
- 通过 `get_result` 和 `wait` 返回 compact 或 verbose 结果。
- 通过 `peek` 在短观察窗口内提取自然语言消息和可选的规范化工具调用事件。
- 通过 `doctor` 检查 CLI 二进制路径解析和可执行性，不检查登录态或模型权限。
- 通过 `models` 暴露标准模型、别名、Antigravity 入口和 OpenCode 动态模型格式。

## 架构亮点

- `src/app/mcp.ts` 是 MCP 边界：注册 tools、声明 schema、分发 handler、映射 MCP 错误。
- `src/process-service.ts` 是运行时状态边界：负责启动进程、等待、peek、kill 和 cleanup。
- `src/cli-builder.ts` 是 CLI 参数构造边界：把 MCP `run` 参数转换成不同 CLI 的命令参数。
- `src/parsers.ts` 和 `src/process-result.ts` 共同处理外部 CLI 输出解析和响应裁剪。
- `src/model-catalog.ts` 集中维护模型列表、别名、Antigravity 入口和 OpenCode 动态模型说明。
- 项目不使用数据库；server 重启后可从本地注册表恢复已记录 PID 的基础状态和日志内容。

## 开发概览

### 前置条件

- Node.js 满足 `package.json` 的 `engines` 要求。
- 本地按需安装并登录 Claude、Codex、Gemini、Forge、OpenCode、Antigravity CLI。
- 使用 npm 安装依赖。

### 快速开始

```bash
npm install
npm run build
npm run dev
```

构建后启动：

```bash
npm start
```

### 关键命令

- **安装：** `npm install`
- **开发启动：** `npm run dev`
- **构建：** `npm run build`
- **单元测试：** `npm run test:unit`
- **完整测试：** `npm test`
- **发布清单 dry-run：** `npm_config_cache="/private/tmp/agent-bridge-mcp-npm-cache" npm pack --dry-run`

## 仓库结构摘要

- `src/app/`：MCP server 类与 tool handler。
- `src/bin/`：唯一二进制入口。
- `src/__tests__/`：Vitest 测试与 MCP stdio 契约测试。
- `docs/`：架构、契约和本次生成的 AI 项目文档。
- `_bmad/`、`.agents/`、`.claude/`：BMAD 与 agent 工作流配置，不属于运行时代码。

## 文档地图

- [index.md](./index.md)：AI 检索入口。
- [architecture.md](./architecture.md)：详细架构。
- [mcp-tool-contracts.md](./mcp-tool-contracts.md)：MCP 工具契约。
- [source-tree-analysis.md](./source-tree-analysis.md)：源码树说明。
- [development-guide.md](./development-guide.md)：开发、测试与发布流程。
- [component-inventory.md](./component-inventory.md)：主要模块清单。
- [api-contracts.md](./api-contracts.md)：MCP tools 作为 API 的契约说明。
- [data-models.md](./data-models.md)：运行时数据模型与持久化边界。

---

_Generated using BMAD Method `document-project` workflow_
