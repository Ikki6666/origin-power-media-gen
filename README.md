# origin-power-media-gen

# origin-power-media-gen

面向 coding agent 的媒体生成插件：一套共享核心，多种轻量分发方式。

Origin Power MaaS 上的能力通过统一 CLI、skill、MCP server 或 Pi 原生扩展暴露给不同 agent 核。

## 工作原理

- `packages/core` 只保留一份 MaaS 客户端逻辑：鉴权、模型校验、任务轮询、产物下载、错误映射。
- `packages/cli` 把它暴露成稳定的 `image / edit / video / music / status / models` 命令面。
- `skills/origin-power-media-gen` 告诉 agent 什么时候触发、怎么选择子命令、怎么处理结果。
- `packages/mcp-server` 为只支持 MCP 的 agent 提供兼容层。
- `packages/pi-extension` 为 Pi 提供原生扩展。
- `scripts/build-plugins.mjs` 把这些内容组装成插件产物。

skill + CLI 是插件主形态；MCP 是兼容层；Pi 是原生扩展。

## 安装

### Codex

在 Codex CLI 里：

```bash
codex plugin marketplace add Ikki6666/origin-power-media-gen
codex plugin add origin-power-media-gen@origin-power
```

装好后重启 Codex，开始新会话。

### Claude Code

```bash
claude plugin marketplace add Ikki6666/origin-power-media-gen
claude plugin install origin-power-media-gen@origin-power
```

装好后重启 Claude Code，开始新会话。

### Zcode

把 `dist/plugins/zcode` 当作插件根目录导入。

装好后重启会话，SessionStart hook 会注入插件根路径。

### Pi

```bash
pi install npm:pi-origin-power-media-gen
```

装好后重启 Pi。

### 其他 MCP agent

```bash
claude mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
codex mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
```

## 使用

安装后直接在 agent 里说：

```text
画一张测试图
把这张图的背景换成海边
生成一段 8 秒视频
给这段歌词谱曲
```

CLI 也可以单独使用：

```bash
node <插件根>/scripts/media-gen.mjs image "画一张测试图"
node <插件根>/scripts/media-gen.mjs edit "把背景换成海边" --images ./cat.png
node <插件根>/scripts/media-gen.mjs video "海边日落" --duration 8
node <插件根>/scripts/media-gen.mjs status <task_id> --wait
node <插件根>/scripts/media-gen.mjs models
```

## 环境变量

```bash
export MEDIA_GEN_API_KEY=...
```

可选：

```bash
export MEDIA_GEN_BASE_URL=http://api.origin-power.com
export MEDIA_GEN_MEDIA_DIR=~/.media-gen
export MEDIA_GEN_MODELS=Qwen-Image-2.1,minimax-h3,MiniMax-Music3
```

## 目录

```text
packages/core            共享 MaaS 客户端
packages/cli             bundled CLI
packages/mcp-server      MCP 兼容层
packages/pi-extension    Pi 原生扩展
skills/origin-power-media-gen  统一 skill 和平台 reference
adapters                 Codex / Zcode 平台 manifest 与静态资源
scripts                  插件构建与结构检查
docs                     架构与发布说明
```

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

更详细的契约和适配规则见 [docs/plugin-architecture.md](docs/plugin-architecture.md)。
