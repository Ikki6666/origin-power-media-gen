# origin-power-media-gen（ZCode）

ZCode 媒体生成插件：文生图、图片编辑、视频（4-15 秒）、音乐生成（WAV），基于 Origin Power MaaS 平台。

无 MCP server：插件自带 CLI（`scripts/media-gen.mjs`，vendor 自父 monorepo 的 `packages/core`）。skill 教 agent 何时以及如何调用，SessionStart hook 在会话开始时注入插件根路径与配置状态。

## 安装

1. ZCode → Plugin Marketplace → Add → Add Plugin Marketplace，粘贴包含 `marketplace.json` 的目录（本仓库的 `adapters/zcode/`）。
2. Personal → `origin-power-media-gen-zcode` → `origin-power-media-gen` → Install。
3. 设置 API Key 环境变量后重启会话：

   ```bash
   export MEDIA_GEN_API_KEY=...
   ```

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `MEDIA_GEN_API_KEY` | 鉴权 Key（回退 `YUANLI_API_KEY` → `AGW_API_KEY`） | — |
| `MEDIA_GEN_BASE_URL` | 网关地址 | `http://api.origin-power.com` |
| `MEDIA_GEN_MEDIA_DIR` | 产物根目录 | `~/.media-gen` |
| `MEDIA_GEN_MODELS` | 模型白名单覆盖（逗号分隔） | `Qwen-Image-2.1,minimax-h3,MiniMax-Music3` |

## CLI

`node <插件根>/scripts/media-gen.mjs <子命令>`：

| 子命令 | 说明 |
|---|---|
| `image "<提示词>"` | 文生图，一步完成（创建+轮询+下载），典型 10-60 秒 |
| `edit "<编辑指令>" --images <p1,p2>` | 图片编辑（1-4 张，本地路径自动转 Base64） |
| `music "<歌词>" --style "<风格>"` | 音乐生成；歌词逐字演唱不代写，风格必填 |
| `video "<提示词>"` | 视频：默认只提交返回 task_id；`--wait` 同步等待并下载（1-5 分钟） |
| `status <task_id> [--wait] [--cancel]` | 查询 / 等待（成功自动下载）/ 取消 |
| `models` | 列出当前 Key 可用且在白名单内的模型 |

`--json` 输出机器可读 JSON。产物按类型存放在 `MEDIA_GEN_MEDIA_DIR` 下的 `images/`、`videos/`、`musics/`。退出码：0 成功；1 业务失败（stderr 带原因）；2 用法错误。

## 维护

`scripts/core/` 是父 monorepo `packages/core` 的 vendored 副本——core 变更时保持同步（`diff -r packages/core/src adapters/zcode/origin-power-media-gen/scripts/core/src`）。
