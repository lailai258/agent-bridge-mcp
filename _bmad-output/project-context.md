---
project_name: 'agent-bridge-mcp'
user_name: 'kelus'
date: '2026-05-14'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns', 'usage_guidelines']
existing_patterns_found: 13
status: 'complete'
rule_count: 70
optimized_for_llm: true
---

# Project Context for AI Agents

_本文件记录 AI 代理在本项目中实现代码时必须遵守的关键规则与模式，重点提醒那些不显而易见但容易出错的项目约束。_

---

## Technology Stack & Versions

- Node.js: `^20.19.0 || >=22.12.0`，不要使用低于该范围的运行时能力假设。
- TypeScript: `^5.8.3`，项目使用 ESM 与 NodeNext；不要改成 CommonJS。
- `package.json` 必须保持 `"type": "module"`。
- `tsconfig.json` 关键配置必须保持：`target: ES2022`、`module: NodeNext`、`moduleResolution: NodeNext`、`strict: true`、`rootDir: ./src`、`outDir: ./dist`。
- 运行依赖目前只应是 `@modelcontextprotocol/sdk ^1.29.0` 与 `zod ^3.24.4`；不要为小型工具逻辑新增运行依赖。
- 开发依赖保持轻量：`@types/node ^22.15.17`、`tsx ^4.19.4`、`typescript ^5.8.3`、`vitest ^4.1.3`。
- 构建命令是 `npm run build`，直接执行 `tsc`。
- 单元测试命令是 `npm run test:unit`，会先构建再运行 `vitest.config.unit.ts`。
- 完整测试命令是 `npm test`，会先构建再运行默认 Vitest 配置。
- 包发布入口只有 `agent-bridge-mcp -> dist/bin/agent-bridge-mcp.js`。

## Critical Implementation Rules

### Language-Specific Rules

- 所有源码保持 TypeScript ESM；相对导入必须写编译后的 `.js` 后缀，例如 `./cli-builder.js`、`../app/mcp.js`。
- Node 内置模块优先使用 `node:` 前缀导入，例如 `node:fs`、`node:path`、`node:child_process`。
- 类型导入使用 `import type`，避免运行时引入无用符号。
- 不要引入 CommonJS；只有读取 `package.json` 版本这类 ESM JSON 兼容场景可继续使用 `createRequire(import.meta.url)`。
- 参数校验失败统一抛普通 `Error`，在 MCP handler 边界映射为 `McpError(ErrorCode.InvalidParams, ...)`。
- 启动进程失败、内部执行异常在 MCP handler 边界映射为 `ErrorCode.InternalError`。
- 路径解析使用 `node:path` 的 `resolve` / `isAbsolute` / `join`，不要手写路径拼接。
- 外部 CLI 启动必须使用 `spawn(..., { shell: false })` 或当前模块已有的安全参数结构，不要把用户 prompt 拼接进 shell 字符串。
- `reasoning_effort`、`prompt`、`prompt_file`、`workFolder` 等输入规则应集中保持在 `src/cli-builder.ts` 和 `src/peek.ts` 的验证函数中，不要在多个模块复制校验逻辑。
- 解析外部 CLI 输出时要容忍非 JSON、空 stdout、stderr 混入和部分行损坏；解析失败应降级返回原始 stdout/stderr，而不是让 `get_result` 崩溃。

### Framework-Specific Rules

- 项目是 MCP-only server；不要新增人类 CLI 子命令、交互式终端 CLI 或文件持久化进程状态服务。
- `src/bin/agent-bridge-mcp.ts` 是唯一二进制入口，只负责启动 MCP stdio server。
- `src/app/mcp.ts` 是 MCP tool 注册与 handler 分发边界；新增或修改工具时必须同步维护 tool schema、handler、错误映射和文档契约。
- 当前 MCP tools 必须保持九项：`run`、`list_processes`、`get_result`、`wait`、`peek`、`kill_process`、`cleanup_processes`、`doctor`、`models`。
- 所有 MCP tool 返回值保持 `content: [{ type: 'text', text: JSON.stringify(..., null, 2) }]` 结构。
- `run` 必须立即返回 PID，不等待子进程完成；进程生命周期由后续 `get_result`、`wait`、`peek`、`kill_process`、`cleanup_processes` 管理。
- `ProcessService` 的进程记录只保存在当前 server 内存 `Map` 中；server 重启后不恢复旧 PID。
- CLI 可用性检查只验证二进制可用性与路径解析；`doctor` 不验证登录状态、模型权限或条款接受状态。
- OpenCode 动态模型格式必须保持 `oc-<provider/model>`，并映射为 OpenCode CLI 的 `--model <provider/model>`。
- `peek` 是一次性短观察窗口，不是历史 API；不得返回原始工具输出，工具调用只能返回规范化摘要。

### Testing Rules

- 测试文件放在 `src/__tests__`，命名保持 `*.test.ts`；测试工具放在 `src/__tests__/utils`。
- 单元测试优先使用 Vitest mock：`vi.mock(...)`、`vi.mocked(...)`、`vi.clearAllMocks()`；涉及模块初始化副作用时使用动态 `import(...)`。
- MCP stdio 契约测试使用 `src/__tests__/utils/mcp-client.ts`，通过构建后的 `dist/server.js` 启动真实 server。
- 测试 server 启动时要清空 `VITEST` 环境变量，否则 `src/server.ts` 不会自动运行 `runMcpServer()`。
- 涉及 SIGINT listener 的测试依赖 `src/__tests__/setup-unit.ts` 清理新增 listener；新增 server 实例测试不要留下进程级监听器。
- 外部 CLI 行为必须用 mock CLI 脚本或 mocked `spawn` 覆盖，不要在单元测试中依赖本机真实 Claude/Codex/Gemini/Forge/OpenCode/Antigravity 登录态。
- 修改 MCP tool schema、模型列表、响应形状或 CLI 参数构造时，必须更新对应契约/构造测试，尤其是 `mcp-contract.test.ts`、`cli-builder.test.ts`、`process-management.test.ts`。
- `peek` 相关测试必须断言不泄露原始工具输出或敏感 stdout/stderr，只允许返回自然语言消息和规范化工具调用摘要。
- 完成代码改动后至少运行 `npm run build` 与 `npm run test:unit`；涉及 stdio MCP 契约或构建产物行为时再运行 `npm test`。

### Code Quality & Style Rules

- 源码文件使用 kebab-case 或现有短横线命名风格，例如 `cli-builder.ts`、`process-service.ts`、`model-catalog.ts`。
- 公共类型和接口使用 PascalCase，例如 `ProcessService`、`CliDoctorStatus`、`PeekResponse`。
- 函数和变量使用 camelCase；常量集合使用全大写 snake case，例如 `MODEL_ALIASES`、`MAX_PEEK_TIME_SEC`。
- 保持模块职责单一：MCP 注册在 `src/app/mcp.ts`，进程管理在 `src/process-service.ts`，CLI 参数构造在 `src/cli-builder.ts`，模型目录在 `src/model-catalog.ts`，输出解析在 `src/parsers.ts`。
- 不要把外部 CLI 参数构造逻辑散落到 MCP handler 或测试工具里；统一经 `buildCliCommand`。
- 不要把输出解析逻辑写进 `ProcessService` 主流程；新增解析应放在 `src/parsers.ts`，结果整形放在 `src/process-result.ts`。
- 不要增加大而泛的工具模块；优先扩展现有边界清晰的小模块。
- 注释只用于关键流程、复杂解析或安全边界；新增注释按项目要求使用中文。
- 文档与 README 必须保持 MCP-only 表述，不要出现 `ai-cli run/ps/result/...` 这类人类 CLI 使用方式。
- `package.json` 的 `files` 白名单必须与实际发布入口一致；新增可发布源码产物时同步维护 `files`。

### Development Workflow Rules

- 代码变更不要修改 `dist` 作为源码；`dist` 是 `npm run build` 的输出。
- 修改 `src` 中的公开行为后，按影响面同步更新 `README.md`、`docs/architecture.md` 或 `docs/mcp-tool-contracts.md`。
- 修改 MCP tool 契约时，必须同步更新 `src/app/mcp.ts` 的 schema/description、`docs/mcp-tool-contracts.md` 和契约测试。
- 修改模型列表或别名时，必须同步更新 `src/model-catalog.ts`、README 的模型说明和相关测试。
- 修改发布入口或构建产物清单时，必须同步检查 `package.json` 的 `bin` 与 `files`。
- 不要恢复或新增这些非目标文件：`src/app/cli.ts`、`src/bin/ai-cli.ts`、`src/cli-process-service.ts`、`src/cli.ts`、`src/cli-parse.ts`。
- 需要验证发布清单时使用 `npm_config_cache="/private/tmp/agent-bridge-mcp-npm-cache" npm pack --dry-run`，避免默认 npm cache 权限问题。
- 项目当前目录不是 Git 仓库时，不要假设可执行 git 工作流；只基于文件系统完成变更与验证。

### Critical Don't-Miss Rules

- 不要把本项目改回“人类 CLI + MCP”双模式；目标架构明确是 MCP-only。
- 不要为进程状态引入文件持久化、数据库或跨 server 重启恢复；当前语义是内存态 PID 管理。
- 不要让 `run` 等待任务结束；它必须启动后台进程并立即返回 `{ pid, status: 'started', agent, message }`。
- 不要在 `doctor` 中执行真实登录检查、模型权限检查或联网验证；它只检查二进制路径与可执行性。
- 不要把 `prompt` 和 `prompt_file` 同时设为合法；二者必须且只能提供一个。
- 不要允许相对路径形式的自定义 CLI 环境变量值，例如 `./claude` 或 `foo/bar`；只允许简单命令名或绝对路径。
- 不要对 Codex 传 `max` reasoning effort；`max` 只适用于 Claude，Codex 只支持 `low|medium|high|xhigh`。
- 不要给 Gemini、Forge、OpenCode、Antigravity 传 `reasoning_effort`；这些 agent 当前不支持该参数。
- 不要放宽 OpenCode 动态模型校验；`oc-<provider/model>` 不能有前后空白，provider 和 model 都不能为空。
- 不要在 `peek` 返回 tool result 原文、命令 stdout/stderr 或历史累计输出；这会破坏短窗口观察与敏感输出隔离语义。
- 不要假设所有 CLI 都只从 stdout 输出结构化 JSON；Codex 需要合并 stdout/stderr 解析，OpenCode 失败时需要保留原始输出。
- 不要删除 `server.ts` 中的 `if (!process.env.VITEST)` 保护；测试依赖它避免导入时自动启动 server。
- 不要把 `package.json` 增加 `ai-cli` bin；唯一 bin 必须是 `agent-bridge-mcp`。

---

## Usage Guidelines

**For AI Agents:**

- 实现任何代码前先读取本文件。
- 严格遵守所有规则；不确定时选择更保守、更贴近现有代码的方案。
- 如果新增了稳定项目模式或技术栈变化，更新本文件。

**For Humans:**

- 保持本文件精简，只记录 AI 代理容易漏掉的项目特定规则。
- 技术栈、MCP 契约、发布入口或测试边界变化时同步更新。
- 定期清理过时规则，避免占用不必要的 LLM 上下文。

Last Updated: 2026-05-14
