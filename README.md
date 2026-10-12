# origin-power-media-gen

多 agent 媒体生成插件 monorepo：一套媒体生成核心，多种薄分发层。

平台：Origin Power MaaS（`http://api.dev.origin-power.com`）

## 形态

| Agent | 推荐接入 | 包 / 产物 |
|---|---|---|
| Codex | skill + bundled CLI | `dist/plugins/codex` |
| Zcode | skill + bundled CLI + SessionStart hook | `dist/plugins/zcode` |
| Pi | 原生扩展 | [pi-origin-power-media-gen](https://www.npmjs.com/package/pi-origin-power-media-gen) |
| 其他 MCP agent | MCP server | `origin-power-media-gen-mcp` |

skill + CLI 是插件主形态；MCP 是兼容层；Pi 是原生扩展。

## 结构

- `packages/core` — 共享 MaaS API 客户端（鉴权 / 模型校验 / 异步任务轮询 / 产物下载）
- `packages/cli` — bundled CLI，稳定暴露 `image / edit / video / music / status / models`
- `packages/mcp-server` — 通用 MCP server（5 个工具，stdio）
- `packages/pi-extension` — Pi 原生扩展
- `skills/origin-power-media-gen` — 统一 skill 与平台差异 reference
- `adapters` — Codex / Zcode 平台 manifest、hook 和静态资源
- `scripts` — 插件构建与结构检查

## 构建与测试

```bash
npm test
```

这会依次运行 core 单测、CLI smoke test、插件产物构建和插件结构检查。

单独生成插件产物：

```bash
npm run build:plugins
```

产物位置：

- `dist/plugins/codex`
- `dist/plugins/zcode`

## 快速接入 MCP agent

```bash
claude mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
codex mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
```

环境变量：`MEDIA_GEN_API_KEY`（兼容旧名 `YUANLI_API_KEY` / `AGW_API_KEY`）等，详见各包 README 和 [docs/plugin-architecture.md](/Users/ikki/Desktop/origin-power-media-gen/docs/plugin-architecture.md)。
