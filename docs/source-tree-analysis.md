# agent-bridge-mcp - 源码树分析

**日期：** 2026-05-14

## 总览

本项目是单体 TypeScript MCP server。源码集中在 `src/`，测试集中在 `src/__tests__/`，运行时文档位于 `docs/`。构建产物输出到 `dist/`，但 `dist/` 不应作为源码手工修改。

## 目录结构

```text
agent-bridge-mcp/
├── src/
│   ├── app/
│   │   └── mcp.ts                  # MCP server、tool 注册、handler 分发
│   ├── bin/
│   │   └── agent-bridge-mcp.ts           # 唯一 bin 入口
│   ├── __tests__/
│   │   ├── utils/                  # MCP 测试客户端与 mock CLI 工具
│   │   ├── mcp-contract.test.ts    # stdio MCP 契约测试
│   │   ├── cli-builder.test.ts     # CLI 参数构造测试
│   │   ├── process-management.test.ts
│   │   ├── parsers.test.ts
│   │   └── *.test.ts               # 其他边界、错误、wait、peek 测试
│   ├── cli-builder.ts              # run 参数到 CLI 命令的适配层
│   ├── cli-utils.ts                # CLI 路径解析与 doctor 状态
│   ├── model-catalog.ts            # 模型列表、别名、动态模型说明
│   ├── parsers.ts                  # 多 CLI 输出解析与 peek 事件提取
│   ├── peek.ts                     # peek 参数校验和响应结构辅助
│   ├── process-result.ts           # compact / verbose 结果整形
│   ├── process-service.ts          # 进程生命周期管理与注册表集成
│   ├── process-registry.ts         # 本地进程注册表与日志路径
│   ├── wait-config.ts              # wait 逻辑预算与单次观察窗口配置
│   └── server.ts                   # server 导出与非测试环境自启动
├── docs/
│   ├── architecture.md
│   ├── mcp-tool-contracts.md
│   └── *.md                        # 生成的 AI 项目文档
├── _bmad/                          # BMAD 配置与脚本
├── _bmad-output/                   # BMAD 生成上下文与规划产物
├── .agents/                        # Codex/BMAD skills
├── .claude/                        # Claude skills
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.config.unit.ts
├── server.json
└── README.md
```

## 关键目录

### `src/app/`

**用途：** MCP server 边界。  
**包含：** `ClaudeCodeServer`、tool schema、handler、MCP 错误映射、stdio transport 启动。  
**入口：** `src/app/mcp.ts` 中的 `runMcpServer()`。

### `src/bin/`

**用途：** npm bin 入口。  
**包含：** `agent-bridge-mcp.ts`。  
**注意：** `package.json` 只能暴露 `agent-bridge-mcp`，不要新增 `ai-cli` 或其他人类 CLI。

### `src/__tests__/`

**用途：** 单元测试、契约测试和 mock CLI。  
**包含：** MCP stdio client、Claude/OpenCode/Antigravity/mock 工具、进程管理测试、输出解析测试、参数构造测试。  
**注意：** 外部 CLI 行为应使用 mock，不依赖真实 CLI 登录态。

### `docs/`

**用途：** 项目架构与 AI 上下文文档。  
**包含：** 原有架构/契约说明，以及本工作流生成的项目总览、源码树、开发指南、模块清单、API 契约、数据模型和索引。

### `_bmad/`、`.agents/`、`.claude/`

**用途：** BMAD 与 agent 工作流配置。  
**注意：** 这些目录支撑开发/文档流程，不参与 npm 包运行时逻辑。

## 入口点

- **MCP server 启动入口：** `src/app/mcp.ts` 的 `runMcpServer()`。
- **包导出入口：** `src/server.ts`。
- **bin 入口：** `src/bin/agent-bridge-mcp.ts`。
- **构建产物入口：** `dist/server.js` 与 `dist/bin/agent-bridge-mcp.js`。

## 文件组织模式

- 运行时代码按职责拆分为小模块，避免大而泛的工具文件。
- MCP tool schema 与 handler 集中在 `src/app/mcp.ts`。
- CLI 参数构造集中在 `src/cli-builder.ts`。
- 进程生命周期集中在 `src/process-service.ts`。
- 输出解析集中在 `src/parsers.ts`。
- 测试按行为边界命名，例如 `mcp-contract.test.ts`、`cli-builder.test.ts`、`process-management.test.ts`。

## 关键文件类型

### TypeScript 源码

- **模式：** `src/**/*.ts`
- **用途：** MCP server、CLI 适配、进程管理、输出解析。
- **示例：** `src/app/mcp.ts`、`src/process-service.ts`、`src/cli-builder.ts`

### TypeScript 测试

- **模式：** `src/__tests__/**/*.test.ts`
- **用途：** 验证 tool 契约、参数构造、错误映射、输出解析、peek 行为。
- **示例：** `src/__tests__/mcp-contract.test.ts`

### 配置文件

- **模式：** `package.json`、`tsconfig.json`、`vitest.config.ts`、`server.json`
- **用途：** 包元数据、构建、测试、MCP server registry 元数据。

### 文档文件

- **模式：** `README.md`、`docs/**/*.md`
- **用途：** 使用说明、架构说明、MCP 契约和 AI 项目上下文。

## 资产位置

未发现运行时图片、音频、静态资源或 UI 资产。本项目是 MCP server，不包含前端资源。

## 配置文件

- `package.json`：包名、bin、files、脚本、依赖和 Node engines。
- `tsconfig.json`：TypeScript NodeNext / ESM 构建配置。
- `vitest.config.ts`：完整测试配置。
- `vitest.config.unit.ts`：单元测试配置，排除部分更慢或集成型测试。
- `server.json`：MCP server registry 元数据。
- `_bmad/bmm/config.yaml`：BMAD 工作流配置。

## 开发注意事项

- `dist/` 是构建输出，不要手工修改。
- 所有相对源码导入必须保留 `.js` 后缀。
- 不要新增人类 CLI 文件；调整持久化注册表语义时必须同步 MCP 契约、文档和测试。
- 修改 MCP tool 契约时，需要同步 `src/app/mcp.ts`、`docs/mcp-tool-contracts.md` 和契约测试。

---

_Generated using BMAD Method `document-project` workflow_
