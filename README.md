# origin-power-media-gen

多 agent 媒体生成插件 monorepo：一套核心逻辑，覆盖所有主流 coding agent。

| Agent | 接入方式 | 包 |
|---|---|---|
| Pi | 原生扩展（内嵌图片、`/origin-power-media-gen` 命令） | [pi-origin-power-media-gen](https://www.npmjs.com/package/pi-origin-power-media-gen) |
| Codex / Claude Code / Cursor / Windsurf / Zed / Gemini CLI | 通用 MCP server | `origin-power-media-gen-mcp` |

平台：Origin Power MaaS（`http://api.dev.origin-power.com`）

## 包结构

- `packages/core` — 共享 MaaS API 客户端（鉴权 / 模型校验 / 异步任务轮询 / 产物下载）
- `packages/mcp-server` — 通用 MCP server（5 个工具，stdio）
- `packages/pi-extension` — Pi 原生扩展

## 快速接入 MCP agent

```bash
claude mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
codex mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
```

环境变量：`MEDIA_GEN_API_KEY`（兼容旧名 `YUANLI_API_KEY` / `AGW_API_KEY`）等，详见各包 README。
